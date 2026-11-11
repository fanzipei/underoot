import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import express from 'express';
import AdmZip from 'adm-zip';
import { BIN_DIR, projectDir, which, resolveInside } from './paths.js';
import { requireAuth } from './auth.js';
import { diagnoseOptionClash, diagnoseImproperAlpha } from './latex-fixes.js';

const IS_WIN = os.platform() === 'win32';
const EXE = IS_WIN ? '.exe' : '';
const DEFAULT_TIMEOUT = Number(process.env.LATEXSTUDIO_TIMEOUT || 240000);

let engineCache = null;
let engineCacheAt = 0;

function localTectonic() {
  const p = path.join(BIN_DIR, `tectonic${EXE}`);
  return fs.existsSync(p) ? p : null;
}

/**
 * 用户级 TeX Live 常装在非 PATH 目录（无 sudo 时很常见），这里补查常见位置。
 * 返回 { binDirs, tools } —— binDirs 会注入编译子进程的 PATH。
 */
function discoverTexlive() {
  const home = os.homedir();
  const arch = process.arch === 'x64' ? 'x86_64-linux' : `${process.arch}-linux`;
  const candidates = [
    // 可通过 LATEXSTUDIO_TEXLIVE_BIN 指定（多个用路径分隔符分隔）
    ...(process.env.LATEXSTUDIO_TEXLIVE_BIN || '').split(path.delimiter).filter(Boolean),
    path.join(home, '.texlive', '2026', 'bin', arch),
    path.join(home, '.texlive', '2025', 'bin', arch),
    path.join(home, '.texlive', '2024', 'bin', arch),
    path.join(home, '.TinyTeX', 'bin', arch),
    path.join(home, 'texlive', 'bin', arch),
    '/usr/local/texlive/2026/bin/x86_64-linux',
    '/usr/local/texlive/2025/bin/x86_64-linux',
  ];
  const binDirs = candidates.filter((d) => {
    try { return fs.existsSync(path.join(d, `pdflatex${EXE}`)); } catch { return false; }
  });
  const tools = new Map();
  for (const dir of binDirs) {
    for (const name of ['latexmk', 'pdflatex', 'xelatex', 'lualatex']) {
      if (!tools.has(name)) {
        const p = path.join(dir, `${name}${EXE}`);
        if (fs.existsSync(p)) tools.set(name, p);
      }
    }
  }
  return { binDirs, tools };
}

/** 人类可读的引擎标签 */
export function engineLabel(id) {
  return {
    latexmk: 'pdfLaTeX (latexmk)',
    pdflatex: 'pdfLaTeX',
    xelatex: 'XeLaTeX',
    lualatex: 'LuaLaTeX',
    tectonic: 'Tectonic (XeTeX)',
  }[id] || id;
}

export function detectEngines() {
  if (engineCache && Date.now() - engineCacheAt < 15000) return engineCache;
  const { binDirs, tools } = discoverTexlive();
  const list = [];
  for (const name of ['latexmk', 'xelatex', 'lualatex', 'pdflatex']) {
    const p = which(name) || tools.get(name);
    if (p) list.push({ id: name, name: engineLabel(name), path: p, kind: p.startsWith(os.homedir()) ? 'user' : 'system' });
  }
  const tec = localTectonic() || which('tectonic');
  if (tec) list.push({ id: 'tectonic', name: engineLabel('tectonic'), path: tec, kind: localTectonic() ? 'bundled' : 'system' });
  engineCache = { engines: list, binDirs, platform: os.platform() };
  engineCacheAt = Date.now();
  return engineCache;
}

/**
 * 选引擎：projectEngine（项目设置，可能是 'auto'）> 环境变量 > 默认优先级。
 * 指定了但不可用时不静默回退，由调用方给出明确错误。
 */
export function pickEngine(preferred) {
  const { engines } = detectEngines();
  const preference = String(preferred || '').trim();
  const forced = preference && preference !== 'auto' ? preference : (process.env.LATEX_ENGINE || '').trim();
  if (forced && forced !== 'auto') {
    return engines.find((e) => e.id === forced) || null;
  }
  return engines.find((e) => e.id === 'latexmk')
    || engines.find((e) => e.id === 'xelatex')
    || engines.find((e) => e.id === 'tectonic')
    || engines.find((e) => e.id === 'lualatex')
    || engines.find((e) => e.id === 'pdflatex')
    || null;
}

/** 需要注入到编译子进程 PATH 的目录 */
export function enginePathDirs() {
  return detectEngines().binDirs || [];
}

function run(cmd, args, cwd, timeout = DEFAULT_TIMEOUT) {
  return new Promise((resolve) => {
    const started = Date.now();
    const extraDirs = enginePathDirs();
    const child = spawn(cmd, args, {
      cwd,
      windowsHide: true,
      env: {
        ...process.env,
        // 用户级 TeX Live 不在系统 PATH 时，latexmk 依赖的 pdflatex/kpsewhich 仍需可见
        ...(extraDirs.length ? { PATH: `${extraDirs.join(path.delimiter)}${path.delimiter}${process.env.PATH || ''}` } : {}),
        max_print_line: '10000',
      },
    });
    let out = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try { child.kill('SIGKILL'); } catch { /* ignore */ }
    }, timeout);
    const push = (buf) => {
      out += buf.toString('utf8');
      if (out.length > 400000) out = out.slice(-400000);
    };
    child.stdout.on('data', push);
    child.stderr.on('data', push);
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ code: -1, out: out + `\n${err.message}`, ms: Date.now() - started, timedOut });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, out, ms: Date.now() - started, timedOut });
    });
  });
}

/** 从日志中提取结构化错误 / 警告 */
export function parseLog(log) {
  const errors = [];
  const warnings = [];
  const lines = String(log || '').split(/\r?\n/);
  const pushUnique = (arr, item) => {
    if (!arr.some((x) => x.line === item.line && x.message === item.message)) arr.push(item);
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // file:line: message （-file-line-error）
    let m = line.match(/^(?:\.\/)?([^\s:()]+\.(?:tex|sty|cls|bib|ltx)):(\d+):\s*(.+)$/);
    if (m && !/^Underfull|^Overfull/.test(m[3])) {
      const isWarn = /^(LaTeX|Package|Class)\s+\w*\s*Warning/i.test(m[3]) || /^Warning/i.test(m[3]);
      const message = m[3].trim();
      const detail = lines.slice(i + 1, i + 3).join(' ').trim();
      const diagnosis = isWarn ? null : diagnoseOptionClash(message) || diagnoseImproperAlpha(message, detail);
      pushUnique(isWarn ? warnings : errors, {
        file: m[1], line: Number(m[2]), message, type: isWarn ? 'warning' : 'error',
        ...(diagnosis || {}),
      });
      continue;
    }
    // ! message  （后面常有 l.NN）
    m = line.match(/^!\s*(.+)$/);
    if (m) {
      let lineNo = null;
      let msg = m[1].trim();
      for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
        const lm = lines[j].match(/^l\.(\d+)/);
        if (lm) { lineNo = Number(lm[1]); break; }
      }
      const detail = lines.slice(i + 1, i + 3).join(' ').trim();
      const diagnosis = diagnoseOptionClash(msg) || diagnoseImproperAlpha(msg, detail);
      pushUnique(errors, {
        file: null, line: lineNo, message: msg, detail, type: 'error',
        ...(diagnosis || {}),
      });
      continue;
    }
    m = line.match(/^(?:LaTeX|Package|Class)\s+(?:\w+\s+)?Warning:\s*(.+)$/);
    if (m) pushUnique(warnings, { file: null, line: null, message: m[1].trim(), type: 'warning' });
  }
  return { errors: errors.slice(0, 60), warnings: warnings.slice(0, 60) };
}

const locks = new Map();
export const isCompiling = (projectId) => locks.has(projectId);

/** 根据项目源文件内容生成指纹，用于多人协作时复用编译结果 */
const SKIP_HASH = new Set(['.aux', '.log', '.out', '.toc', '.fls', '.fdb_latexmk', '.nav', '.snm', '.vrb', '.bcf', '.blg', '.synctex', '.pdf', '.xdv', '.dvi', '.bbl', '.lof', '.lot', '.idx', '.ind', '.ilg', '.glo', '.gls', '.spl', '.loa', '.acn', '.acr']);

export function hashProject(dir) {
  const hash = crypto.createHash('sha256');
  const files = [];
  const walk = (cur, rel) => {
    let entries = [];
    try { entries = fs.readdirSync(cur, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.latexmkrc') continue;
      const r = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(path.join(cur, entry.name), r);
      else {
        const ext = path.extname(entry.name).toLowerCase();
        if (SKIP_HASH.has(ext) || entry.name.endsWith('.run.xml') || entry.name.endsWith('.synctex.gz')) continue;
        files.push({ rel: r, full: path.join(cur, entry.name) });
      }
    }
  };
  walk(dir, '');
  files.sort((a, b) => a.rel.localeCompare(b.rel));
  for (const f of files) {
    hash.update(f.rel).update('\0');
    try {
      const buf = fs.readFileSync(f.full);
      if (buf.length > 4 * 1024 * 1024) {
        hash.update(String(buf.length)).update(buf.subarray(0, 65536));
      } else {
        hash.update(buf);
      }
    } catch { /* ignore */ }
    hash.update('\0');
  }
  return hash.digest('hex');
}

export async function compileProject({ projectId, mainFile, engine: engineId = null, timeout = DEFAULT_TIMEOUT }) {
  const dir = projectDir(projectId);
  const main = resolveInside(dir, mainFile);
  if (!fs.existsSync(main)) {
    return { ok: false, engine: null, ms: 0, log: `找不到主文件：${mainFile}`, errors: [{ file: mainFile, line: null, message: '主文件不存在', type: 'error' }], warnings: [] };
  }
  const engine = pickEngine(engineId);
  if (!engine) {
    const available = detectEngines().engines.map((e) => e.id).join('、') || '无';
    const label = engineId && engineId !== 'auto' ? `指定的编译器「${engineLabel(engineId)}」不可用` : '未检测到 LaTeX 编译器';
    return {
      ok: false,
      engine: null,
      ms: 0,
      needsSetup: true,
      log: `${label}。\n\n当前可用：${available}。\n请在项目「⋯ → 编译引擎」中改用其它引擎，或安装 TeX Live 后重启服务。`,
      errors: [{ file: null, line: null, message: label, type: 'error' }],
      warnings: [],
    };
  }

  const relMain = path.relative(dir, main).replace(/\\/g, '/');
  const base = path.basename(relMain, path.extname(relMain));
  const pdfPath = path.join(dir, `${base}.pdf`);

  const key = projectId;
  const prev = locks.get(key) || Promise.resolve();
  let release;
  const gate = new Promise((r) => { release = r; });
  const chained = prev.then(() => gate);
  locks.set(key, chained);

  await prev.catch(() => {});

  let args;
  if (engine.id === 'latexmk') {
    args = ['-pdf', '-interaction=nonstopmode', '-file-line-error', '-synctex=1', '-halt-on-error', '-no-shell-escape', relMain];
  } else if (engine.id === 'tectonic') {
    args = ['--keep-logs', '--outdir', '.', '--chatter', 'minimal', relMain];
  } else {
    args = ['-interaction=nonstopmode', '-file-line-error', '-synctex=1', '-no-shell-escape', relMain];
  }

  const passes = engine.id === 'latexmk' || engine.id === 'tectonic' ? 1 : 2;
  let allOut = '';
  let totalMs = 0;
  let lastCode = 0;

  for (let p = 0; p < passes; p++) {
    const r = await run(engine.path, args, dir, timeout);
    allOut += r.out;
    totalMs += r.ms;
    lastCode = r.code;
    if (r.timedOut) {
      allOut += `\n[超时] 编译超过 ${Math.round(timeout / 1000)} 秒被终止。\n`;
      break;
    }
    if (r.code !== 0 && engine.id !== 'tectonic') {
      if (p === 0) break;
    }
  }

  release();
  if (locks.get(key) === chained) locks.delete(key);

  const logPath = path.join(dir, `${base}.log`);
  let logText = allOut;
  if (fs.existsSync(logPath)) {
    const fileLog = fs.readFileSync(logPath, 'utf8');
    if (fileLog.trim().length > allOut.trim().length) logText = fileLog;
  }

  const ok = fs.existsSync(pdfPath) && lastCode === 0;
  const parsed = parseLog(logText);

  if (!ok && parsed.errors.length === 0) {
    parsed.errors.push({ file: relMain, line: null, message: allOut.trim().split(/\r?\n/).filter(Boolean).pop() || '编译失败', type: 'error' });
  }

  return {
    ok,
    engine: engine.id,
    enginePath: engine.path,
    ms: totalMs,
    log: logText,
    errors: ok ? [] : parsed.errors,
    warnings: parsed.warnings,
    pdf: ok ? `${base}.pdf` : null,
  };
}

export const systemRouter = express.Router();
systemRouter.use(requireAuth);

systemRouter.get('/engines', (req, res) => {
  const { engines } = detectEngines();
  const active = pickEngine();
  res.json({
    engines,
    active: active ? active.id : null,
    canInstall: !engines.some((e) => e.id === 'tectonic'),
    platform: os.platform(),
    note: '项目可在「⋯ → 编译引擎」中单独选择；pdfLaTeX 的排版与 Overleaf 默认设置一致。',
  });
});

systemRouter.post('/install-tectonic', requireAuth, async (req, res) => {
  try {
    const release = await fetch('https://api.github.com/repos/tectonic-typesetting/tectonic/releases/latest', {
      headers: { 'User-Agent': 'latexstudio' },
    }).then((r) => r.json());
    const platform = os.platform();
    const arch = os.arch();
    const pick = (release.assets || []).find((a) => {
      const n = a.name;
      if (platform === 'win32') return /windows-msvc\.zip$/.test(n);
      if (platform === 'darwin') return arch === 'arm64' ? /aarch64-apple-darwin\.tar\.gz$/.test(n) : /x86_64-apple-darwin\.tar\.gz$/.test(n);
      return arch === 'arm64' ? /aarch64-unknown-linux-musl\.tar\.gz$/.test(n) : /x86_64-unknown-linux-(musl|gnu)\.tar\.gz$/.test(n);
    });
    if (!pick) return res.status(500).json({ error: '未找到适配当前系统的编译器安装包' });

    const buf = Buffer.from(await fetch(pick.browser_download_url, { headers: { 'User-Agent': 'latexstudio' } }).then((r) => r.arrayBuffer()));
    if (pick.name.endsWith('.zip')) {
      const zip = new AdmZip(buf);
      zip.extractAllTo(BIN_DIR, true);
    } else {
      const tmp = path.join(BIN_DIR, 'tectonic.tar.gz');
      fs.writeFileSync(tmp, buf);
      await run('tar', ['-xzf', tmp, '-C', BIN_DIR], BIN_DIR, 60000);
      fs.unlinkSync(tmp);
    }
    const bin = path.join(BIN_DIR, `tectonic${EXE}`);
    if (fs.existsSync(bin)) fs.chmodSync(bin, 0o755);
    engineCache = null;
    res.json({ ok: true, engines: detectEngines().engines });
  } catch (err) {
    res.status(500).json({ error: `下载失败：${err.message}` });
  }
});
