import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { inspectExtensionZip } from '../server/extension-packages.js';

const [folder, ...options] = process.argv.slice(2);
if (!folder) throw new Error('用法：node scripts/pack-extension.mjs <插件目录> [--check] [--out plugin.zip]');
const root = path.resolve(folder);
if (!fs.statSync(root).isDirectory()) throw new Error('插件路径必须是目录');
const zip = new AdmZip();
function walk(directory, prefix = '') {
  for (const file of fs.readdirSync(directory, { withFileTypes: true })) {
    if (file.name.startsWith('.') || file.name === 'node_modules') throw new Error('不要把隐藏配置、凭据或 node_modules 打包；请先构建到独立发布目录');
    if (file.isSymbolicLink()) throw new Error('插件包不能包含符号链接');
    const rel = prefix + file.name;
    if (file.isDirectory()) walk(path.join(directory, file.name), rel + '/');
    else zip.addFile(rel, fs.readFileSync(path.join(directory, file.name)));
  }
}
walk(root);
const buffer = zip.toBuffer(); const pack = inspectExtensionZip(buffer);
if (options.includes('--check')) console.log(`有效插件：${pack.manifest.id} v${pack.manifest.version} · API ${pack.manifest.apiVersion} · ${pack.files.length} 个文件`);
else {
  const index = options.indexOf('--out');
  const output = path.resolve(index >= 0 ? options[index + 1] : `${pack.manifest.id}-${pack.manifest.version}.zip`);
  fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, buffer);
  console.log(`已打包 ${pack.manifest.id} → ${output}`);
}
