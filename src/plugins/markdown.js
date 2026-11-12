import { marked } from 'marked';
import DOMPurify from 'dompurify';
import katex from 'katex';
marked.use({ extensions: [
 { name: 'displayMath', level: 'block', start: (s) => s.indexOf('$$'), tokenizer(src) { const m = /^\$\$\s*\n?([\s\S]+?)\$\$(?:\n|$)/.exec(src); if (m) return { type: 'displayMath', raw: m[0], text: m[1] }; }, renderer: (t) => katex.renderToString(t.text, { displayMode: true, throwOnError: false, trust: false, maxExpand: 1000 }) },
 { name: 'inlineMath', level: 'inline', start: (s) => s.indexOf('$'), tokenizer(src) { const m = /^\$([^$\n]+?)\$(?!\$)/.exec(src); if (m) return { type: 'inlineMath', raw: m[0], text: m[1] }; }, renderer: (t) => katex.renderToString(t.text, { throwOnError: false, trust: false, maxExpand: 1000 }) }
] });
const q = (id) => document.getElementById(id); const sdk = window.underoot;
let current = { path: 'notes.md', hash: null, content: '' }; let dirty = false; let working = false;
const status = (text) => { q('status').textContent = text; };
function render() {
 const tex = /\.tex$/i.test(q('path').value); q('convert').textContent = tex ? '一键转为 Markdown 新文件' : '一键转为 TeX 新文件';
 if (tex) { q('preview').textContent = '这是 TeX 源文件。点击「一键转为 Markdown」生成可实时预览的新文档，或返回主编辑器编译 PDF。'; return; }
 q('preview').innerHTML = DOMPurify.sanitize(marked.parse(q('source').value), { USE_PROFILES: { html: true, mathMl: true, svg: true }, FORBID_TAGS: ['style','iframe','object','form','input','button'], FORBID_ATTR: ['src','srcset','href','xlink:href','id','name'] });
}
async function files(selected) { const result = await sdk.documents.list(); q('files').replaceChildren(...result.files.map((path) => { const option = document.createElement('option'); option.value = path; option.textContent = path; return option; })); if (selected) q('files').value = selected; }
function display(doc) { current = doc; dirty = false; q('path').value = doc.path; q('source').value = doc.content; render(); status(`${doc.path} · ${doc.hash ? '已载入' : '新建草稿'}`); }
async function task(fn) { if (working) return; working = true; q('save').disabled = q('convert').disabled = true; try { await fn(); } catch (err) { status(err.message); } finally { working = false; q('save').disabled = q('convert').disabled = false; } }
q('source').oninput = () => { dirty = true; render(); status('草稿未保存 · 预览已更新'); };
q('path').oninput = () => { dirty = true; render(); };
q('open').onclick = () => task(async () => display(await sdk.documents.read(q('files').value)));
q('new').onclick = () => { if (dirty) { status('请先保存草稿，或点「打开 / 丢弃草稿」再新建'); return; } display({ path: 'notes.md', hash: null, content: '# 研究笔记\n\n在这里开始写作。\n\n$$E = mc^2$$\n' }); dirty = true; };
q('save').onclick = () => task(async () => {
 const name = q('path').value.trim();
 const result = await sdk.documents.write({ path: name, content: q('source').value, hash: name === current.path ? current.hash : null });
 display(result); await files(result.path); status('已保存到项目，原版本可在历史中追溯');
});
q('convert').onclick = () => task(async () => {
 const from = /\.tex$/i.test(q('path').value) ? 'tex' : 'markdown';
 status('正在本地转换…');
 const result = await sdk.documents.convert({ from, content: q('source').value });
 const name = q('path').value.replace(/\.(md|markdown|tex)$/i, '') + '.converted.' + result.extension;
 const saved = await sdk.documents.write({ path: name, content: result.content, hash: null });
 display(saved); await files(name); status('已生成新文件；原文保留。复杂模板与宏请人工核对。');
});
function wrap(before, after = '') { const el = q('source'); el.setRangeText(before + el.value.slice(el.selectionStart, el.selectionEnd) + after, el.selectionStart, el.selectionEnd, 'end'); el.dispatchEvent(new Event('input')); el.focus(); }
q('bold').onclick = () => wrap('**', '**'); q('heading').onclick = () => wrap('\n## ');
q('source').onkeydown = (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); q('save').click(); } };
task(async () => { const context = await sdk.ready; await files(); const name = [...q('files').options].map((o) => o.value).find((p) => /\.(md|markdown)$/i.test(p)) || q('files').value; if (name) { q('files').value = name; display(await sdk.documents.read(name)); } else display(current); if (!['owner','editor'].includes(context.project?.role)) { q('source').readOnly = true; q('save').hidden = q('convert').hidden = q('new').hidden = true; } });
