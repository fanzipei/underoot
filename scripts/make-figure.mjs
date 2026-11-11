/**
 * 生成模板使用的示例插图（PNG + JPG）。
 * 仅在需要重新生成模板配图时使用，仓库里已经附带生成好的图片。
 * 依赖 puppeteer-core：npm i -D puppeteer-core，并保证本机装有 Chrome。
 * 用法：node scripts/make-figure.mjs [--root <项目根目录>]
 * 产出：server/templates/<模板>/figure.png、figure.jpg
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const rootArg = process.argv.indexOf('--root');
const root = rootArg > -1
  ? path.resolve(process.argv[rootArg + 1])
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const W = 1120;
const H = 460;

function linePath(points) {
  return points.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join(' ');
}

// 左：训练曲线（两条），右：方法对比柱状图
const left = { x0: 70, y0: 60, w: 440, h: 300 };
const right = { x0: 640, y0: 60, w: 400, h: 300 };

const train = [];
const dev = [];
for (let i = 0; i <= 20; i += 1) {
  const t = i / 20;
  train.push([left.x0 + t * left.w, left.y0 + left.h - (0.92 * Math.exp(-3.1 * t) + 0.06) * left.h]);
  dev.push([left.x0 + t * left.w, left.y0 + left.h - (0.80 * Math.exp(-2.4 * t) + 0.14 + 0.02 * Math.sin(i)) * left.h]);
}

const bars = [
  { label: 'Baseline', value: 0.712, color: '#94a3b8' },
  { label: 'Ours', value: 0.864, color: '#2563eb' },
  { label: 'Ours+', value: 0.891, color: '#0f766e' },
];

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#ffffff"/>
  <g font-family="Helvetica, Arial, sans-serif" font-size="13" fill="#334155">
    <!-- 左图 -->
    <text x="${left.x0}" y="34" font-size="15" font-weight="600" fill="#0f172a">(a) Training convergence</text>
    ${[0, 0.25, 0.5, 0.75, 1].map((g, i) => {
      const y = left.y0 + left.h - g * left.h;
      return `<line x1="${left.x0}" y1="${y}" x2="${left.x0 + left.w}" y2="${y}" stroke="#e2e8f0" stroke-width="1"/>
        <text x="${left.x0 - 10}" y="${y + 4}" text-anchor="end" font-size="11" fill="#94a3b8">${rel(g)}</text>`;
    }).join('')}
    <line x1="${left.x0}" y1="${left.y0 + left.h}" x2="${left.x0 + left.w}" y2="${left.y0 + left.h}" stroke="#cbd5e1" stroke-width="1.5"/>
    <line x1="${left.x0}" y1="${left.y0}" x2="${left.x0}" y2="${left.y0 + left.h}" stroke="#cbd5e1" stroke-width="1.5"/>
    <path d="${linePath(train)}" fill="none" stroke="#2563eb" stroke-width="2.6"/>
    <path d="${linePath(dev)}" fill="none" stroke="#f97316" stroke-width="2.6" stroke-dasharray="6 4"/>
    <text x="${left.x0 + left.w / 2}" y="${left.y0 + left.h + 34}" text-anchor="middle" font-size="12">Epoch</text>
    <text x="${left.x0 + 14}" y="${left.y0 + 18}" font-size="12" fill="#2563eb">train</text>
    <text x="${left.x0 + 70}" y="${left.y0 + 18}" font-size="12" fill="#f97316">dev</text>
    <!-- 右图 -->
    <text x="${right.x0 - 40}" y="34" font-size="15" font-weight="600" fill="#0f172a">(b) Accuracy by method</text>
    ${[0, 0.3, 0.6, 0.9].map((g) => {
      const y = right.y0 + right.h - g * right.h;
      return `<line x1="${right.x0 - 40}" y1="${y}" x2="${right.x0 + right.w}" y2="${y}" stroke="#e2e8f0" stroke-width="1"/>
        <text x="${right.x0 - 50}" y="${y + 4}" text-anchor="end" font-size="11" fill="#94a3b8">${g.toFixed(1)}</text>`;
    }).join('')}
    ${bars.map((b, i) => {
      const bw = 74;
      const x = right.x0 + 26 + i * 118;
      const h = b.value * right.h;
      return `<rect x="${x}" y="${right.y0 + right.h - h}" width="${bw}" height="${h}" fill="${b.color}" rx="3"/>
        <text x="${x + bw / 2}" y="${right.y0 + right.h - h - 8}" text-anchor="middle" font-size="12" fill="#0f172a">${b.value.toFixed(3)}</text>
        <text x="${x + bw / 2}" y="${right.y0 + right.h + 22}" text-anchor="middle" font-size="12">${b.label}</text>`;
    }).join('')}
    <line x1="${right.x0 - 40}" y1="${right.y0 + right.h}" x2="${right.x0 + right.w}" y2="${right.y0 + right.h}" stroke="#cbd5e1" stroke-width="1.5"/>
  </g>
</svg>`;

function rel(v) {
  return v.toFixed(2);
}

const targets = ['acm', 'ieee', 'aaai', 'neurips', 'graphics'].map((id) =>
  path.join(root, 'server', 'templates', id)
);

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--no-sandbox', '--no-proxy-server'],
});
const page = await browser.newPage();
await page.setViewport({ width: W, height: H, deviceScaleFactor: 2 });
await page.setContent(`<html><body style="margin:0">${svg}</body></html>`, { waitUntil: 'load' });

for (const dir of targets) {
  if (!fs.existsSync(dir)) continue;
  await page.screenshot({ path: path.join(dir, 'figure.png'), type: 'png' });
  await page.screenshot({ path: path.join(dir, 'figure.jpg'), type: 'jpeg', quality: 92 });
  console.log('figure ->', path.relative(root, dir));
}
await browser.close();
