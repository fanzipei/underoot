/**
 * 项目导入：ZIP 解包 + GitHub 仓库下载。
 *
 * 供 POST /api/projects/import 与 POST /api/projects/from-github 共用。
 * 设计要点：
 *  - 所有来自不可信来源的路径都经过 normalizeRelPath / resolveInside；
 *  - 对解压后总量、单文件大小、条目数设上限，避免 zip bomb 打满内存/磁盘；
 *  - GitHub 下载做域名白名单 + 手动跟随重定向（逐跳校验），防 SSRF。
 */
import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { isTextFile, normalizeRelPath, resolveInside } from './paths.js';

export const IMPORT_LIMITS = {
  maxZipBytes: 30 * 1024 * 1024,       // 压缩包本身（与 multer 一致）
  maxEntries: 3000,                     // ZIP 内文件数
  maxTotalBytes: 80 * 1024 * 1024,      // 解压后总字节
  maxEntryBytes: 12 * 1024 * 1024,      // 单个文件
  maxVersionBytes: 2 * 1024 * 1024,     // 写版本快照的文本上限
  githubTimeoutMs: 20_000,
};

export function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

const STRIP_TOP_DIRS = new Set(['__MACOSX']);
const SKIP_FILES = new Set(['.ds_store', 'thumbs.db', 'desktop.ini']);

/**
 * 把 ZIP 内容解到 dir，返回 { files, mainFile, skipped, totalBytes }。
 * files: [{ rel, content }]，content 为 UTF-8 文本（二进制为 null）。
 */
export function unpackZipTo(dir, buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) throw httpError(400, '不是有效的 ZIP 文件');
  if (buffer.length > IMPORT_LIMITS.maxZipBytes) {
    throw httpError(413, `压缩包不能超过 ${Math.round(IMPORT_LIMITS.maxZipBytes / 1024 / 1024)} MB`);
  }
  // PK\x03\x04（本地文件头），也兼容空归档 PK\x05\x06
  const magic = buffer.readUInt32LE(0);
  if (magic !== 0x04034b50 && magic !== 0x06054b50) throw httpError(400, '不是有效的 ZIP 文件');

  let zip;
  try {
    zip = new AdmZip(buffer);
  } catch {
    throw httpError(400, 'ZIP 文件损坏，无法解析');
  }

  let entries;
  try {
    entries = zip.getEntries();
  } catch {
    throw httpError(400, 'ZIP 文件损坏，无法读取目录');
  }
  if (!entries.length) throw httpError(400, 'ZIP 文件是空的');
  if (entries.length > IMPORT_LIMITS.maxEntries) {
    throw httpError(413, `压缩包内文件数超过上限（${IMPORT_LIMITS.maxEntries} 个）`);
  }

  // 1) 归一化条目名，过滤目录 / 符号链接 / 元数据，收集待写文件
  let skipped = 0;
  const candidates = [];
  for (const entry of entries) {
    if (entry.isDirectory) continue;
    // Unix 外置属性高 16 位是文件模式，0xA000 表示符号链接
    const unixMode = ((entry.header?.attr || 0) >>> 16) & 0xf000;
    if (unixMode === 0xa000) continue;
    let rel = String(entry.entryName || '').replace(/\\/g, '/').replace(/^\/+/, '');
    // 丢掉 Windows 盘符前缀，如 C:/foo
    rel = rel.replace(/^[A-Za-z]:/, '');
    if (!rel) continue;
    const segs = rel.split('/');
    if (segs.some((s) => STRIP_TOP_DIRS.has(s.toUpperCase()))) continue;
    if (SKIP_FILES.has(segs[segs.length - 1].toLowerCase())) continue;
    // 跳过 .git 目录内容（GitHub 归档一般不含，防御性处理）
    if (segs.some((s) => s.toLowerCase() === '.git')) continue;
    // 原始名里就带 .. 的条目一律拒绝（部分解压库会自行规范化，不能依赖它）
    if (segs.includes('..')) {
      skipped += 1;
      continue;
    }
    candidates.push({ entry, rel, segs });
  }
  if (!candidates.length) throw httpError(400, '压缩包内没有可导入的文件');

  // 2) 通用「单一顶层目录」剥离：GitHub archive / Overleaf 导出常见形态。
  //    只在「嵌套文件都归属唯一顶层目录，且根级文件很少」时剥离；
  //    本平台导出的 ZIP 是「根 main.tex + 子目录」混合结构，不能被误剥。
  const nested = candidates.filter((c) => c.segs.length > 1);
  const roots = new Set(nested.map((c) => c.segs[0]));
  const rootFiles = candidates.length - nested.length;
  const stripRoot = roots.size === 1 && nested.length > 0
    && (rootFiles === 0 || (rootFiles <= 1 && nested.length >= 2))
    ? [...roots][0] : null;
  const normalized = [];
  for (const c of candidates) {
    const raw = stripRoot && c.segs[0] === stripRoot ? c.segs.slice(1).join('/') : c.rel;
    let rel;
    try {
      rel = normalizeRelPath(raw);
    } catch {
      skipped += 1;      // 含 .. 的路径直接跳过，不写入
      continue;
    }
    normalized.push({ entry: c.entry, rel });
  }
  if (!normalized.length) throw httpError(400, '压缩包内没有合法文件路径');

  // 3) 体积预检（解压前），防 zip bomb
  let total = 0;
  for (const item of normalized) {
    const size = Number(item.entry.header?.size || 0);
    if (size > IMPORT_LIMITS.maxEntryBytes) {
      throw httpError(413, `文件 ${item.rel.slice(0, 60)} 超过单文件大小上限`);
    }
    total += size;
    if (total > IMPORT_LIMITS.maxTotalBytes) {
      throw httpError(413, `解压后内容超过 ${Math.round(IMPORT_LIMITS.maxTotalBytes / 1024 / 1024)} MB 上限`);
    }
  }

  // 4) 落盘（实际解压大小再累计一次，不信任 header 声明）
  const files = [];
  let actualTotal = 0;
  for (const item of normalized) {
    let data;
    try {
      data = item.entry.getData();
    } catch {
      skipped += 1;
      continue;
    }
    if (data.length > IMPORT_LIMITS.maxEntryBytes) {
      throw httpError(413, `文件 ${item.rel.slice(0, 60)} 超过单文件大小上限`);
    }
    actualTotal += data.length;
    if (actualTotal > IMPORT_LIMITS.maxTotalBytes) {
      throw httpError(413, `解压后内容超过 ${Math.round(IMPORT_LIMITS.maxTotalBytes / 1024 / 1024)} MB 上限`);
    }
    const target = resolveInside(dir, item.rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, data);
    const text = isTextFile(item.rel) && data.length <= IMPORT_LIMITS.maxVersionBytes
      ? data.toString('utf8')
      : null;
    files.push({ rel: item.rel, content: text });
  }
  if (!files.length) throw httpError(400, '压缩包解压失败或内容为空');

  return { files, mainFile: pickMainFile(files), skipped, totalBytes: total };
}

/** 主文件识别：优先根 main.tex → 含 \documentclass 的浅层 .tex → 任意 .tex */
export function pickMainFile(files) {
  const tex = files.filter((f) => f.rel.toLowerCase().endsWith('.tex'));
  if (!tex.length) return null;
  const depth = (f) => f.rel.split('/').length;
  const byShallow = (a, b) => depth(a) - depth(b) || a.rel.localeCompare(b.rel, 'en');

  const exact = tex.find((f) => f.rel.toLowerCase() === 'main.tex');
  if (exact) return exact.rel;

  const withClass = tex.filter((f) => f.content && /\\documentclass\b/.test(f.content));
  if (withClass.length) return withClass.sort(byShallow)[0].rel;

  const namedMain = tex.filter((f) => /(^|\/)main[^/]*\.tex$/i.test(f.rel));
  if (namedMain.length) return namedMain.sort(byShallow)[0].rel;

  return tex.sort(byShallow)[0].rel;
}

/* ------------------------------------------------------------------ */
/* GitHub                                                              */
/* ------------------------------------------------------------------ */

const GH_HOSTS = new Set([
  'github.com', 'www.github.com', 'api.github.com', 'codeload.github.com',
  'raw.githubusercontent.com', 'objects.githubusercontent.com',
]);
const NAME_RE = /^[A-Za-z0-9._-]+$/;

function assertGithubHost(raw) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    throw httpError(400, '链接格式不正确');
  }
  if (u.protocol !== 'https:') throw httpError(400, '仅支持 https 链接');
  if (u.port || u.username || u.password) throw httpError(400, '链接格式不正确');
  if (!GH_HOSTS.has(u.hostname.toLowerCase())) throw httpError(400, '仅支持 github.com 仓库链接');
  return u;
}

/**
 * 解析用户输入，返回 { owner, repo, ref, name, directUrl }
 * 支持：
 *   owner/repo
 *   https://github.com/owner/repo[.git]
 *   https://github.com/owner/repo/tree/<branch>[/subdir]
 *   https://github.com/owner/repo/archive/refs/heads/<branch>.zip
 *   https://codeload.github.com/owner/repo/zip/refs/heads/<branch>
 */
export function parseGithubInput(input) {
  let raw = String(input || '').trim();
  if (!raw) throw httpError(400, '请填写 GitHub 仓库链接');
  // 简写 owner/repo 与 SSH 形式
  if (/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(raw)) raw = `https://github.com/${raw}`;
  else if (/^git@github\.com:/i.test(raw)) raw = `https://github.com/${raw.replace(/^git@github\.com:/i, '')}`;
  const u = assertGithubHost(raw);
  const host = u.hostname.toLowerCase();
  const parts = u.pathname.split('/').filter(Boolean).map((s) => {
    try { return decodeURIComponent(s); } catch { return s; }
  });
  if (parts.length < 2 || !NAME_RE.test(parts[0]) || !NAME_RE.test(parts[1].replace(/\.git$/i, ''))) {
    throw httpError(400, '无法从链接中识别 owner/repo');
  }
  const owner = parts[0];
  const repo = parts[1].replace(/\.git$/i, '');

  // 直接可用的归档下载链接
  if (host === 'codeload.github.com'
      || (host === 'github.com' && parts[2] === 'archive')
      || (host === 'api.github.com' && parts[0] === 'repos' && parts.includes('zipball'))) {
    return { owner, repo, ref: null, name: repo, directUrl: u.toString() };
  }
  if (host !== 'github.com' && host !== 'www.github.com') {
    throw httpError(400, '请填写仓库主页链接，而不是其它 GitHub 页面');
  }

  // /tree/<branch>/... 与 /blob/<branch>/... 取分支名，导入整个仓库
  let ref = null;
  if ((parts[2] === 'tree' || parts[2] === 'blob') && parts[3]) ref = parts[3];
  return {
    owner, repo, ref,
    name: ref ? `${repo}-${ref.replace(/[^A-Za-z0-9._-]/g, '-')}` : repo,
    directUrl: null,
  };
}

function ghHeaders() {
  const headers = { 'User-Agent': 'latexstudio', Accept: 'application/vnd.github+json' };
  const token = process.env.LATEXSTUDIO_GITHUB_TOKEN || process.env.GITHUB_TOKEN || '';
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

/** 手动跟随重定向，逐跳校验域名白名单，且限制响应体积 */
async function fetchGuarded(startUrl, { accept = 'application/zip', maxBytes = IMPORT_LIMITS.maxZipBytes } = {}) {
  let url = startUrl;
  for (let hop = 0; hop <= 4; hop += 1) {
    const u = assertGithubHost(url);
    let resp;
    try {
      resp = await fetch(u.toString(), {
        redirect: 'manual',
        signal: AbortSignal.timeout(IMPORT_LIMITS.githubTimeoutMs),
        headers: { ...ghHeaders(), Accept: accept },
      });
    } catch (err) {
      const why = err?.name === 'TimeoutError' ? '连接超时' : '网络不可达';
      throw httpError(502, `无法连接 GitHub（${why}）。可手动下载仓库 ZIP 后从「ZIP 文件」导入`);
    }
    if ([301, 302, 303, 307, 308].includes(resp.status)) {
      const loc = resp.headers.get('location');
      if (!loc) throw httpError(502, 'GitHub 返回了无效的重定向');
      url = new URL(loc, u).toString();   // 下一轮会重新校验白名单
      continue;
    }
    if (!resp.ok) {
      if (resp.status === 404) throw httpError(404, '仓库或分支不存在；私有仓库请配置 LATEXSTUDIO_GITHUB_TOKEN');
      if (resp.status === 403 || resp.status === 429) throw httpError(429, 'GitHub API 触发限流，请稍后重试或配置 Token');
      throw httpError(502, `GitHub 返回 HTTP ${resp.status}`);
    }
    const declared = Number(resp.headers.get('content-length') || 0);
    if (declared > maxBytes) {
      throw httpError(413, `仓库压缩包超过 ${Math.round(maxBytes / 1024 / 1024)} MB，请手动下载后用 ZIP 导入`);
    }
    const chunks = [];
    let size = 0;
    for await (const chunk of resp.body) {
      size += chunk.length;
      if (size > maxBytes) {
        throw httpError(413, `仓库压缩包超过 ${Math.round(maxBytes / 1024 / 1024)} MB，请手动下载后用 ZIP 导入`);
      }
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
  throw httpError(502, 'GitHub 重定向次数过多');
}

/** 查询默认分支；失败时返回 null，由调用方回退到 main / master 试探 */
async function resolveDefaultBranch(owner, repo) {
  try {
    const buf = await fetchGuarded(`https://api.github.com/repos/${owner}/${repo}`, {
      accept: 'application/vnd.github+json', maxBytes: 256 * 1024,
    });
    const data = JSON.parse(buf.toString('utf8'));
    return typeof data?.default_branch === 'string' ? data.default_branch : null;
  } catch {
    return null;
  }
}

/** 返回 { buffer, name } */
export async function downloadGithubZip(parsed) {
  const { owner, repo } = parsed;
  let url = parsed.directUrl;
  if (!url) {
    const refs = [];
    if (parsed.ref) refs.push(parsed.ref);
    else {
      const def = await resolveDefaultBranch(owner, repo);
      if (def) refs.push(def);
    }
    refs.push('main', 'master');
    const seen = new Set();
    let lastErr = null;
    for (const ref of refs) {
      if (!ref || seen.has(ref)) continue;
      seen.add(ref);
      const candidate = `https://codeload.github.com/${owner}/${repo}/zip/refs/heads/${encodeURIComponent(ref).replace(/%2F/g, '/')}`;
      try {
        url = candidate;
        const buffer = await fetchGuarded(candidate, { accept: 'application/zip' });
        return { buffer, name: parsed.name };
      } catch (err) {
        if (err.status === 413 || err.status === 429) throw err;
        lastErr = err;
      }
    }
    throw lastErr || httpError(404, '找不到仓库的默认分支');
  }
  const buffer = await fetchGuarded(url, { accept: 'application/zip' });
  return { buffer, name: parsed.name };
}

