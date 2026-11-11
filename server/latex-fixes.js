/**
 * LaTeX 常见编译错误的静态检测与自动修复。
 *
 * 1) 宏包选项冲突（Option clash）：文档类里 \RequirePackage[prologue]{xcolor}，
 *    主 .tex 又 \usepackage[table]{xcolor}。解法是在 \documentclass 之前用
 *    \PassOptionsToPackage{<并集>}{<pkg>} 预先声明所有选项。
 *
 * 2) unicode-math 下的粗体希腊字母：acmart 等文档类在 XeLaTeX/Tectonic 下用
 *    LibertinusMath（unicode-math），\boldsymbol{\Phi} / \bm{\Phi} 会报
 *    `Improper alphabetic constant`（\mitPhi），必须改用 \symbf{\Phi}。
 *    为不破坏 pdfLaTeX，会在导言区加 \providecommand 兜底回退到 \boldsymbol。
 */
import fs from 'node:fs';
import path from 'node:path';
import { projectDir, resolveInside, normalizeRelPath } from './paths.js';

const SCAN_EXT = new Set(['.tex', '.cls', '.sty', '.ltx']);
const MAX_SCAN_FILES = 120;
const MAX_SCAN_BYTES = 2 * 1024 * 1024;
const MAX_DEPTH = 6;
const SKIP_DIRS = new Set(['.git', '__MACOSX', 'node_modules', '.latexmkrc']);

/** 去掉行内未转义的 % 注释 */
function stripComment(line) {
  for (let i = 0; i < line.length; i += 1) {
    if (line[i] !== '%') continue;
    let slashes = 0;
    for (let j = i - 1; j >= 0 && line[j] === '\\'; j -= 1) slashes += 1;
    if (slashes % 2 === 0) return line.slice(0, i);
  }
  return line;
}

/** 递归收集项目内可扫描的 LaTeX 源文件 */
function collectSources(dir) {
  const out = [];
  const walk = (cur, rel, depth) => {
    if (depth > MAX_DEPTH || out.length >= MAX_SCAN_FILES) return;
    let entries = [];
    try { entries = fs.readdirSync(cur, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (out.length >= MAX_SCAN_FILES) break;
      const r = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;
        walk(path.join(cur, entry.name), r, depth + 1);
      } else if (SCAN_EXT.has(path.extname(entry.name).toLowerCase())) {
        try {
          const st = fs.statSync(path.join(cur, entry.name));
          if (st.size > MAX_SCAN_BYTES) continue;
          out.push({ rel: r, text: fs.readFileSync(path.join(cur, entry.name), 'utf8') });
        } catch { /* ignore */ }
      }
    }
  };
  walk(dir, '', 0);
  return out;
}

const LOAD_RE = /\\(?:usepackage|RequirePackage)(?:\[([^\]]*)\])?\s*\{([^}]+)\}/g;
const PASS_RE = /\\PassOptionsToPackage\{([^}]*)\}\{([^}]+)\}/g;

/**
 * 扫描项目，返回 { clashes, scanned }。
 * clashes: [{ pkg, options: string[], sites: [{file,line,options}], hint }]
 */
export function detectClashes(dir, mainFile) {
  const sources = collectSources(dir);
  const loads = new Map();   // pkg -> [{ file, line, options: string[] }]
  const declared = new Map(); // pkg -> Set(已用 \PassOptionsToPackage 预声明的选项)

  const mainRel = mainFile ? String(mainFile).replace(/\\/g, '/').replace(/^\/+/, '') : null;
  for (const src of sources) {
    let lines = src.text.split(/\r?\n/);
    // 主文件可能有拼接的重复文档；LaTeX 只编译到第一个 \end{document}
    if (src.rel === mainRel) {
      const end = lines.findIndex((l) => /\\end\s*\{document\}/.test(stripComment(l)));
      if (end >= 0) lines = lines.slice(0, end + 1);
    }
    lines.forEach((raw, idx) => {
      const line = stripComment(raw);
      LOAD_RE.lastIndex = 0;
      let m;
      while ((m = LOAD_RE.exec(line)) !== null) {
        const options = (m[1] || '').split(',').map((s) => s.trim()).filter(Boolean);
        const pkgs = m[2].split(',').map((s) => s.trim()).filter(Boolean);
        for (const pkg of pkgs) {
          if (!/^[A-Za-z0-9._-]+$/.test(pkg)) continue;
          if (!loads.has(pkg)) loads.set(pkg, []);
          loads.get(pkg).push({ file: src.rel, line: idx + 1, options });
        }
      }
      PASS_RE.lastIndex = 0;
      while ((m = PASS_RE.exec(line)) !== null) {
        const options = m[1].split(',').map((s) => s.trim()).filter(Boolean);
        for (const pkg of m[2].split(',').map((s) => s.trim()).filter(Boolean)) {
          if (!declared.has(pkg)) declared.set(pkg, new Set());
          options.forEach((o) => declared.get(pkg).add(o));
        }
      }
    });
  }

  const clashes = [];
  for (const [pkg, sites] of loads) {
    if (sites.length < 2) continue;
    // 只有「出现过不同的选项集合，且至少一次带选项」才可能 clash。
    // 重复的无选项 \usepackage 是合法的，不应误报。
    const signatures = new Set(sites.map((s) => s.options.slice().sort().join(',')));
    const anyWithOptions = sites.some((s) => s.options.length > 0);
    if (signatures.size < 2 || !anyWithOptions) continue;
    const union = [...new Set(sites.flatMap((s) => s.options))].sort();
    if (!union.length) continue;
    // 已用 \PassOptionsToPackage 声明了全部选项 → 冲突已消除，不再报告
    const pre = declared.get(pkg);
    if (pre && union.every((o) => pre.has(o))) continue;
    const mainRel = mainFile ? String(mainFile).replace(/\\/g, '/').replace(/^\/+/, '') : null;
    // 同一「非主文件」内部的多次加载通常是 .cls/.sty 的条件分支（不会同时执行），
    // 例如 acmart.cls 里按开关分情况 \RequirePackage{libertine}。这类不报、也不改主文件。
    if (sites.every((s) => s.file === sites[0].file && s.file !== mainRel)) continue;
    const main = mainFile ? path.basename(mainFile) : null;
    clashes.push({
      pkg,
      options: union,
      sites,
      hint: `\`${pkg}\` 被以不同选项重复加载（${sites.map((s) => s.options.length ? `[${s.options.join(',')}]` : '无选项').join(' / ')}）。`
        + `在 \\documentclass 之前加 \\PassOptionsToPackage{${union.join(',')}}{${pkg}} 即可消除冲突。`,
      fixable: Boolean(main),
      main,
    });
  }
  // 稳定排序：主文件里的冲突优先
  clashes.sort((a, b) => {
    const am = a.sites.some((s) => s.file === a.main) ? 0 : 1;
    const bm = b.sites.some((s) => s.file === b.main) ? 0 : 1;
    return am - bm || a.pkg.localeCompare(b.pkg);
  });
  return { clashes, scanned: sources.length };
}

const DOCUMENTCLASS_RE = /\\documentclass(?:\[[^\]]*\])?\s*\{[^}]+\}/;

/**
 * 在主文件 \documentclass 前插入 \PassOptionsToPackage，返回新的主文件内容。
 * 幂等：已存在对应包的声明则跳过。不改用户原有的 \usepackage 行。
 */
export function buildFixedMain(text, clashes) {
  const marker = '% LaTeXStudio: 预先声明宏包选项，避免 Option clash（可安全删除）';
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);

  // 逐行找「真正未注释」的 \documentclass（注释里常提到它）。
  const findDocLine = (rows) => {
    for (let i = 0; i < rows.length; i += 1) {
      if (DOCUMENTCLASS_RE.test(stripComment(rows[i]))) return i;
    }
    return -1;
  };
  // 收集 \documentclass 之前、未注释行里已声明的选项
  const collectDeclared = (rows, upto) => {
    const map = new Map();
    for (let i = 0; i < upto; i += 1) {
      const clean = stripComment(rows[i]);
      PASS_RE.lastIndex = 0;
      let pm;
      while ((pm = PASS_RE.exec(clean)) !== null) {
        for (const pkg of pm[2].split(',').map((s) => s.trim()).filter(Boolean)) {
          if (!map.has(pkg)) map.set(pkg, new Set());
          pm[1].split(',').map((s) => s.trim()).filter(Boolean).forEach((o) => map.get(pkg).add(o));
        }
      }
    }
    return map;
  };
  const missingFor = (declared, clash) => clash.options.filter((o) => !(declared.get(clash.pkg) || new Set()).has(o));
  const buildLine = (clash, options) => `\\PassOptionsToPackage{${options.join(',')}}{${clash.pkg}}`;

  const docLine = findDocLine(lines);
  if (docLine < 0) return { content: text, added: [] };

  // 幂等：有效范围内已完整声明则原样返回（不重写文件、不重复记版本）
  const effective = collectDeclared(lines, docLine);
  if (clashes.every((c) => missingFor(effective, c).length === 0)) {
    return { content: text, added: [] };
  }

  // 需要修复：清掉所有此前自动插入的块（可能落在拼接文档的第二份前而无效），
  // 再统一插到第一个 \documentclass 之前。
  const cleaned = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].includes(marker)) {
      while (i + 1 < lines.length && /^\\PassOptionsToPackage\{/.test(lines[i + 1].trim())) i += 1;
      continue;
    }
    cleaned.push(lines[i]);
  }
  const newDocLine = findDocLine(cleaned);
  if (newDocLine < 0) return { content: text, added: [] };
  // 用户自己写的 \PassOptionsToPackage 保留，只补缺失项
  const userDeclared = collectDeclared(cleaned, newDocLine);
  const linesToAdd = [];
  for (const clash of clashes) {
    const missing = missingFor(userDeclared, clash);
    if (missing.length) linesToAdd.push(buildLine(clash, missing));
  }
  if (!linesToAdd.length) return { content: cleaned.join(eol), added: [] };
  cleaned.splice(newDocLine, 0, marker, ...linesToAdd);
  return { content: cleaned.join(eol), added: linesToAdd };
}

/**
 * 对已存在的项目执行检测 + 修复。
 * 返回 { clashes, fixed, added, content }；fixed=false 表示无需修复或不可修复。
 */
export function fixProjectClashes({ projectId, mainFile, write = true, onWrite }) {
  const dir = projectDir(projectId);
  const rel = normalizeRelPath(mainFile);
  const full = resolveInside(dir, rel);
  if (!fs.existsSync(full)) return { clashes: [], fixed: false, added: [], content: null };

  const { clashes } = detectClashes(dir, rel);
  if (!clashes.length) return { clashes: [], fixed: false, added: [], content: null };

  const before = fs.readFileSync(full, 'utf8');
  const { content, added } = buildFixedMain(before, clashes);
  if (!added.length || content === before) {
    return { clashes, fixed: false, added: [], content: before };
  }
  if (write) {
    fs.writeFileSync(full, content, 'utf8');
    if (onWrite) onWrite(rel, content);
  }
  return { clashes, fixed: true, added, content };
}

/**
 * parseLog 用的诊断：把 `! LaTeX Error: Option clash for package X.` 转成带建议的错误对象。
 */
export function diagnoseOptionClash(message) {
  const m = String(message || '').match(/Option clash for package\s+([^\s.]+)/i);
  if (!m) return null;
  const pkg = m[1].replace(/\.$/, '');
  return {
    code: 'option-clash',
    package: pkg,
    hint: `\`${pkg}\` 被以不同选项重复加载（常见于文档类/模板已加载该宏包）。`
      + `在 \\documentclass 前加 \\PassOptionsToPackage{<所有选项>}{${pkg}}，或删掉重复 \\usepackage 的方括号选项。`
      + '本编辑器提供「一键修复」。',
  };
}

/* ------------------------------------------------------------------ */
/* unicode-math 下的粗体希腊字母                                        */
/* ------------------------------------------------------------------ */

/** 会被 unicode-math 重定义为 \mitXxx / \mupXxx 的希腊字母命令 */
const GREEK_RE = /\\(?:alpha|beta|gamma|delta|epsilon|varepsilon|zeta|eta|theta|vartheta|iota|kappa|lambda|mu|nu|xi|pi|varpi|rho|varrho|sigma|varsigma|tau|upsilon|phi|varphi|chi|psi|omega|Gamma|Delta|Theta|Lambda|Xi|Pi|Sigma|Upsilon|Phi|Psi|Omega)\b/;
// 匹配 \boldsymbol{\Phi} / \bm{\Phi}（组内可能还有其它内容，只替换命中的部分）
const BOLD_GREEK_RE = /\\(?:boldsymbol|bm)\s*\{([^{}]*)\}/g;
const SYMBF_SHIM = '\\providecommand{\\symbf}[1]{\\boldsymbol{#1}} % LaTeXStudio: 兼容非 unicode-math 引擎';

/** parseLog 用的诊断：Improper alphabetic constant（\mitPhi 等） */
export function diagnoseImproperAlpha(message, detail = '') {
  const text = `${message || ''} ${detail || ''}`;
  if (!/Improper alphabetic constant/i.test(text) && !/\\mit[A-Z]/.test(text)) return null;
  return {
    code: 'unicode-math-bold',
    hint: '文档类启用了 unicode-math（如 acmart + LibertinusMath），'
      + '\\boldsymbol{\\Phi} / \\bm{\\Phi} 这类粗体希腊字母会触发此错误。'
      + '请改用 \\symbf{\\Phi}；本编辑器提供「一键修复」（会自动加 \\providecommand 兜底，兼容 pdfLaTeX）。',
  };
}

/**
 * 静态检测主文件里不兼容的粗体希腊字母。
 * 返回 { issues: [{ line, command, greek }], shimNeeded }
 */
export function detectBoldGreek(text) {
  const issues = [];
  const lines = String(text || '').split(/\r?\n/);
  lines.forEach((raw, idx) => {
    const line = stripComment(raw);
    BOLD_GREEK_RE.lastIndex = 0;
    let m;
    while ((m = BOLD_GREEK_RE.exec(line)) !== null) {
      const g = m[1].match(GREEK_RE);
      if (g) issues.push({ line: idx + 1, command: m[0].slice(0, m[0].indexOf('{')), greek: g[0] });
    }
  });
  const shimNeeded = !/\\providecommand\s*\{\\symbf\}/.test(String(text || ''));
  return { issues, shimNeeded };
}

/**
 * 把 \boldsymbol{\Phi} / \bm{\Phi} 改成 \symbf{\Phi}，并在导言区加 \providecommand 兜底。
 * 幂等；只改主 .tex。返回 { content, changed, replaced, shimAdded }
 */
export function buildFixedBoldGreek(text) {
  const { issues, shimNeeded } = detectBoldGreek(text);
  if (!issues.length) return { content: text, changed: false, replaced: 0, shimAdded: false };

  let replaced = 0;
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = String(text).split(/\r?\n/).map((line) => {
    // 只改未注释的部分，保留注释原文
    const cut = stripComment(line);
    if (cut === line) {
      return line.replace(BOLD_GREEK_RE, (match, inner) => {
        if (!GREEK_RE.test(inner)) return match;
        replaced += 1;
        return `\\symbf{${inner}}`;
      });
    }
    const comment = line.slice(cut.length);
    return cut.replace(BOLD_GREEK_RE, (match, inner) => {
      if (!GREEK_RE.test(inner)) return match;
      replaced += 1;
      return `\\symbf{${inner}}`;
    }) + comment;
  });
  let content = lines.join(eol);

  let shimAdded = false;
  if (shimNeeded) {
    // 插到 \begin{document} 之前（导言区末尾），避免在 \documentclass 之前引用未加载的宏包
    const lines = content.split(/\r?\n/);
    const eol = content.includes('\r\n') ? '\r\n' : '\n';
    let at = -1;
    for (let i = 0; i < lines.length; i += 1) {
      if (/\\begin\s*\{document\}/.test(stripComment(lines[i]))) { at = i; break; }
    }
    if (at >= 0) {
      lines.splice(at, 0, SYMBF_SHIM);
      content = lines.join(eol);
      shimAdded = true;
    }
  }
  return { content, changed: replaced > 0 || shimAdded, replaced, shimAdded };
}
