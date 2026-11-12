import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import AdmZip from 'adm-zip';
const root = fileURLToPath(new URL('../public/wasm/', import.meta.url));
const zip = new AdmZip(path.join(root, 'texlive-runtime.zip'));
const index = Object.create(null);
for (const entry of zip.getEntries().filter((e) => !e.isDirectory).sort((a,b) => a.entryName.localeCompare(b.entryName))) {
 const rel = entry.entryName;
 if (rel.startsWith('/') || rel.includes('..') || rel.includes('\\')) throw new Error('Unsafe TeX runtime archive');
 const full = path.join(root, 'texlive', rel);
 fs.mkdirSync(path.dirname(full), { recursive: true }); fs.writeFileSync(full, entry.getData());
 const name = path.posix.basename(rel);
 if (!index[name] || rel.startsWith('tex/latex/base/')) index[name] = 'texlive/' + rel;
}
fs.writeFileSync(path.join(root, 'texlive-index.json'), JSON.stringify(index));
