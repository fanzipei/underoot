import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outfile = path.join(root, 'public', 'assets', 'app.js');
const assetsDir = path.dirname(outfile);
fs.mkdirSync(assetsDir, { recursive: true });

// PDF.js 6.x 依赖若干新提案 API（Math.sumPrecise、Uint8Array.prototype.toHex、
// Map.prototype.getOrInsertComputed 等），部分浏览器没实现，会让公式字形丢失、
// 或整份 PDF 报 "xxx is not a function" 打不开。
// 兼容层写在 src/client/pdf-polyfill.js，主线程直接 import，worker 则在复制时注入到文件头部。
const POLYFILL_PATH = path.join(root, 'src', 'client', 'pdf-polyfill.js');

// 已纳入兼容层的新 API 清单。token 用于在 pdfjs 产物里找使用点；
// remove/probe 用于在沙箱里「先删掉该 API、再执行兼容层、最后检查是否补齐」。
// 升级 pdfjs-dist 后如果又出现新的 "xxx is not a function"，把对应 API 补进来即可。
const TRACKED_APIS = [
  { api: 'Math.sumPrecise', token: 'Math.sumPrecise', remove: 'delete Math.sumPrecise', probe: "typeof Math.sumPrecise === 'function'" },
  { api: 'Promise.withResolvers', token: 'Promise.withResolvers', remove: 'delete Promise.withResolvers', probe: "typeof Promise.withResolvers === 'function'" },
  { api: 'Promise.try', token: 'Promise.try', remove: 'delete Promise.try', probe: "typeof Promise.try === 'function'" },
  { api: 'Uint8Array.prototype.toHex', token: '.toHex(', remove: 'delete Uint8Array.prototype.toHex', probe: "typeof Uint8Array.prototype.toHex === 'function'" },
  { api: 'Uint8Array.fromHex', token: '.fromHex(', remove: 'delete Uint8Array.fromHex', probe: "typeof Uint8Array.fromHex === 'function'" },
  { api: 'Uint8Array.prototype.toBase64', token: '.toBase64(', remove: 'delete Uint8Array.prototype.toBase64', probe: "typeof Uint8Array.prototype.toBase64 === 'function'" },
  { api: 'Uint8Array.fromBase64', token: '.fromBase64(', remove: 'delete Uint8Array.fromBase64', probe: "typeof Uint8Array.fromBase64 === 'function'" },
  { api: 'Map.prototype.getOrInsert', token: '.getOrInsert(', remove: 'delete Map.prototype.getOrInsert', probe: "typeof Map.prototype.getOrInsert === 'function'" },
  { api: 'Map.prototype.getOrInsertComputed', token: '.getOrInsertComputed(', remove: 'delete Map.prototype.getOrInsertComputed', probe: "typeof Map.prototype.getOrInsertComputed === 'function'" },
  { api: 'WeakMap.prototype.getOrInsertComputed', token: '.getOrInsertComputed(', remove: 'delete WeakMap.prototype.getOrInsertComputed', probe: "typeof WeakMap.prototype.getOrInsertComputed === 'function'" },
  { api: 'Array.prototype.toSorted', token: '.toSorted(', remove: 'delete Array.prototype.toSorted', probe: "typeof Array.prototype.toSorted === 'function'" },
  { api: 'Array.prototype.toReversed', token: '.toReversed(', remove: 'delete Array.prototype.toReversed', probe: "typeof Array.prototype.toReversed === 'function'" },
  { api: 'Array.prototype.toSpliced', token: '.toSpliced(', remove: 'delete Array.prototype.toSpliced', probe: "typeof Array.prototype.toSpliced === 'function'" },
  { api: 'Array.prototype.findLast', token: '.findLast(', remove: 'delete Array.prototype.findLast', probe: "typeof Array.prototype.findLast === 'function'" },
  { api: 'Array.prototype.findLastIndex', token: '.findLastIndex(', remove: 'delete Array.prototype.findLastIndex', probe: "typeof Array.prototype.findLastIndex === 'function'" },
];

function readWorkerPolyfill() {
  const source = fs.readFileSync(POLYFILL_PATH, 'utf8');
  // 注入到 worker 顶部的前提：文件必须是纯脚本，不能有模块语法
  if (/^\s*(import|export)\s/m.test(source)) {
    throw new Error('src/client/pdf-polyfill.js 必须是纯脚本（不能有 import/export），否则无法注入 worker');
  }
  return `// ---- 由 src/client/pdf-polyfill.js 注入的浏览器兼容层，请勿直接修改本文件 ----\n${source}\n// ---- 兼容层结束 ----\n`;
}

// 功能性校验：在隔离环境里把这些新 API 全部删掉，执行兼容层，再逐个确认已补齐。
// 只有 pdfjs 真正用到的 API 才要求必填，避免为新引擎的 API 无谓地增加补丁。
// 这样升级 pdfjs-dist 时能在构建阶段就发现缺口，而不是等用户打开 PDF 才报错。
function assertCompatCoverage(polyfill) {
  const pdfDir = path.join(root, 'node_modules', 'pdfjs-dist', 'build');
  const sources = ['pdf.worker.mjs', 'pdf.mjs']
    .map((f) => path.join(pdfDir, f))
    .filter((f) => fs.existsSync(f))
    .map((f) => fs.readFileSync(f, 'utf8'));
  if (!sources.length) return;

  const used = TRACKED_APIS.filter(({ token }) => sources.some((s) => s.includes(token)));
  if (!used.length) return;

  // 沙箱里没有 btoa/atob 也无妨：它们只在调用时用到，安装阶段不触碰
  const script = [
    ...used.map(({ remove }) => `try { ${remove}; } catch {}`),
    polyfill,
    `JSON.stringify([${used.map(({ probe }) => probe).join(',')}])`,
  ].join('\n');

  let results;
  try {
    results = JSON.parse(vm.runInNewContext(script, { console }, { timeout: 5000 }));
  } catch (err) {
    throw new Error(`浏览器兼容层执行失败：${err.message}`);
  }

  const missing = used.filter((_, i) => !results[i]).map(({ api }) => api);
  if (missing.length) {
    throw new Error(
      `PDF.js 用到了兼容层尚未实现的新 API：${missing.join('、')}\n`
      + '请在 src/client/pdf-polyfill.js 中补上对应实现（并在文件头部注释里登记）。',
    );
  }
}

// PDF.js 的 worker 与标准字体作为本地静态资源复制，保证离线可用
function copyPdfAssets() {
  const pdfDir = path.join(root, 'node_modules', 'pdfjs-dist');
  const worker = path.join(pdfDir, 'build', 'pdf.worker.min.mjs');
  if (fs.existsSync(worker)) {
    fs.writeFileSync(path.join(assetsDir, 'pdf.worker.min.mjs'), WORKER_POLYFILL + fs.readFileSync(worker, 'utf8'));
  }
  const fontsSrc = path.join(pdfDir, 'standard_fonts');
  if (fs.existsSync(fontsSrc)) copyFolder(fontsSrc, path.join(assetsDir, 'standard_fonts'));
  // CJK 预定义 CMap：XeTeX/Fandol 生成的中文字体需要它们才能正确映射字形
  const cmapsSrc = path.join(pdfDir, 'cmaps');
  if (fs.existsSync(cmapsSrc)) copyFolder(cmapsSrc, path.join(assetsDir, 'cmaps'));
}

function copyFolder(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const file of fs.readdirSync(src)) {
    const from = path.join(src, file);
    if (fs.statSync(from).isDirectory()) copyFolder(from, path.join(dest, file));
    else fs.copyFileSync(from, path.join(dest, file));
  }
}
// 先做一次覆盖率校验，缺实现就直接中断构建
const WORKER_POLYFILL = readWorkerPolyfill();
assertCompatCoverage(WORKER_POLYFILL);
copyPdfAssets();

const watch = process.argv.includes('--watch');

/** @type {import('esbuild').BuildOptions} */
const options = {
  entryPoints: [path.join(root, 'src', 'client', 'main.js')],
  outfile,
  bundle: true,
  format: 'esm',
  target: ['chrome100', 'firefox100', 'safari15'],
  sourcemap: watch,
  minify: !watch,
  logLevel: 'info',
  legalComments: 'none',
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log('[build] watching client sources...');
} else {
  const start = Date.now();
  await esbuild.build(options);
  const kb = (fs.statSync(outfile).size / 1024).toFixed(0);
  console.log(`[build] public/assets/app.js  ${kb} KB  ${Date.now() - start}ms`);
}
