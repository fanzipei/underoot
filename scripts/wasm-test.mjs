/** Execute the shipped browser pdfTeX binary, using only the bundled TeX tree. */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import './build-tex-runtime.mjs';
const root = fileURLToPath(new URL('../public/wasm/', import.meta.url));
const index = JSON.parse(fs.readFileSync(path.join(root, 'texlive-index.json')));
const pending = []; let ready;
const started = new Promise((r) => ready = r);
class XHR {
 open(_method, url) { this.url = url; }
 getResponseHeader() { return this.name; }
 send() {
  this.name = this.url.split('/').pop();
  const format = this.url.split('/').at(-2); const extension = { 3: '.tfm', 26: '.tex', 6: '.bib', 7: '.bst' }[format] || '';
  const rel = this.name.endsWith('.wasm') ? 'pdftex/swiftlatexpdftex.wasm' : this.name === 'swiftlatexpdftex.fmt' ? 'pdftex/swiftlatexpdftex.fmt' : index[this.name] || index[this.name + extension];
  if (!rel) { this.status = 404; return; }
  const buffer = fs.readFileSync(path.join(root, rel)); this.status = 200;
  this.response = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength); this.onload?.();
 }
}
const context = { console: { log() {}, error() {} }, XMLHttpRequest: XHR, WebAssembly, TextDecoder, TextEncoder, setTimeout, clearTimeout, performance,
 URL, location: { href: 'http://localhost/wasm/pdftex/swiftlatexpdftex.js' }, navigator: { userAgent: 'underoot-test' }, importScripts() {},
 Uint8Array, Int8Array, Int16Array, Uint16Array, Int32Array, Uint32Array, Float32Array, Float64Array, ArrayBuffer };
context.self = context;
context.postMessage = (data) => { if (!data.cmd && data.result === 'ok') ready(); else if (data.cmd === 'compile') pending.shift()?.(data); };
vm.runInNewContext(fs.readFileSync(path.join(root, 'pdftex/swiftlatexpdftex.js'), 'utf8'), context, { filename: 'swiftlatexpdftex.js' });
const timer = setTimeout(() => { console.error('WASM test timed out'); process.exit(1); }, 60000);
try {
 await started;
 const send = (data) => context.onmessage({ data });
 const compile = () => new Promise((resolve) => { pending.push(resolve); send({ cmd: 'compilelatex' }); });
 send({ cmd: 'writefile', url: 'main.tex', src: '\\documentclass{article}\n\\usepackage{amsmath,amssymb}\n\\begin{document}Hello browser $E=mc^2$\\input{section.tex}\\end{document}' });
 send({ cmd: 'writefile', url: 'section.tex', src: '\\section{Live preview} Nested source works.' });
 let result = await compile();
 assert.equal(result.status, 0, result.log); assert.equal(Buffer.from(result.pdf).subarray(0,5).toString(), '%PDF-');
 console.log('✓ Bundled WASM generates real PDF with math, packages and multi-file input');
 const before = Buffer.from(result.pdf);
 send({ cmd: 'writefile', url: 'section.tex', src: '\\section{Changed manuscript} Recompiled locally.' });
 result = await compile(); assert.equal(result.status, 0, result.log); assert.ok(!before.equals(Buffer.from(result.pdf)));
 console.log('✓ Reused WASM engine recompiles edits into a changed PDF');
 send({ cmd: 'writefile', url: 'main.tex', src: '\\documentclass{article}\\begin{document}\\unknownunderootcommand\\end{document}' });
 result = await compile(); assert.notEqual(result.status, 0); assert.match(result.log, /Undefined control sequence/);
 console.log('✓ Invalid TeX returns a genuine compiler error');
} finally { clearTimeout(timer); }
