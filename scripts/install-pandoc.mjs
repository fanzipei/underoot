import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import AdmZip from 'adm-zip';
const win = process.platform === 'win32';
if ((!win && process.platform !== 'linux') || process.arch !== 'x64') throw new Error('请为此平台手动安装 Pandoc 3.13+ 到 PATH');
const name = win ? 'pandoc-3.13-windows-x86_64.zip' : 'pandoc-3.13-linux-amd64.tar.gz';
const hash = win ? '23e1f2e978a3df80db8bf65c9c59534f41a23140480cfb4f783a882ab7dc6a4e' : '38aa33b325a2bc96a4c39409631212db55702f564250bcdbead180b3bf646389';
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'underoot-pandoc-'));
try {
 const response = await fetch(`https://github.com/jgm/pandoc/releases/download/3.13/${name}`);
 if (!response.ok) throw new Error(`Pandoc download: HTTP ${response.status}`);
 const buffer = Buffer.from(await response.arrayBuffer());
 if (crypto.createHash('sha256').update(buffer).digest('hex') !== hash) throw new Error('Pandoc SHA-256 校验失败');
 const bin = new URL('../bin/', import.meta.url); fs.mkdirSync(bin, { recursive: true });
 if (win) {
  const zip = new AdmZip(buffer); const entry = zip.getEntries().find((f) => /\/pandoc.exe$/.test(f.entryName));
  if (!entry) throw new Error('Pandoc executable missing');
  fs.writeFileSync(new URL('pandoc.exe', bin), entry.getData());
 } else {
  const archive = path.join(temp, name); fs.writeFileSync(archive, buffer);
  execFileSync('tar', ['-xzf', archive, '-C', temp, 'pandoc-3.13/bin/pandoc']);
  fs.copyFileSync(path.join(temp, 'pandoc-3.13/bin/pandoc'), new URL('pandoc', bin));
  fs.chmodSync(new URL('pandoc', bin), 0o755);
 }
 console.log('Pandoc 3.13 installed; upstream SHA-256 verified. GPL-2.0+: https://github.com/jgm/pandoc');
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
