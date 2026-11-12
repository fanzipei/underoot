import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const CHUNK_CHARS = 16000;
export const MAX_PAPER_CHARS = 4000000;
export const hash = (text) => crypto.createHash('sha256').update(text).digest('hex');
const fail = (message) => { throw Object.assign(new Error(message), { status: 413 }); };
export function expandPaper(root, main) {
 const base = fs.realpathSync(root); const active = new Set(); const files = new Set(); const warnings = new Set(); let bytes = 0;
 const safe = (rel) => {
  if (path.isAbsolute(rel) || /(^|[/\\])\.\.([/\\]|$)|\x00/.test(rel)) throw Object.assign(new Error('论文引用路径越界'), { status: 400 });
  const full = path.resolve(base, rel);
  if (!full.startsWith(base + path.sep)) throw Object.assign(new Error('论文引用路径越界'), { status: 400 });
  if (!fs.existsSync(full)) return null;
  if (!fs.realpathSync(full).startsWith(base + path.sep)) throw Object.assign(new Error('论文引用符号链接越界'), { status: 400 });
  return full;
 };
 const expand = (rel, depth = 0) => {
  const full = safe(rel);
  if (!full) { warnings.add(`未找到引用文件：${rel}`); return `\\input{${rel}}`; }
  if (active.has(full)) { warnings.add(`已跳过循环引用：${rel}`); return ''; }
  if (depth > 40 || (!files.has(full) && files.size >= 1000)) fail('引用层数超过 40 或源码文件超过 1000，请检查循环或重复引用');
  const stat = fs.statSync(full); if (!stat.isFile() || stat.size > 8000000) fail('单个源码文件超过 8 MB 或不是普通文件');
  const text = fs.readFileSync(full, 'utf8'); bytes += text.length;
  if (bytes > MAX_PAPER_CHARS) fail('展开稿件超过 400 万字符资源上限，请按独立论文分项目处理');
  files.add(path.relative(base, full).replaceAll('\\','/')); active.add(full);
  // Do not interpret commented commands or code listings as live includes.
  const pieces = text.split(/(\\begin\{(?:verbatim\*?|lstlisting|minted)\}[\s\S]*?\\end\{(?:verbatim\*?|lstlisting|minted)\})/g);
  const result = pieces.map((piece, i) => i % 2 ? piece : piece.replace(/(?<!\\)%[^\n]*/g, '').replace(/\\(?:(?:input|include)\s*\{([^}\n]+)\}|input(?![A-Za-z@])\s+([^\s{}%]+))/g, (whole, braced, bare) => {
   const name=(braced||bare).trim();
   if (name.includes('\\') || name.includes('#')) { warnings.add(`动态引用需人工检查：${name}`); return whole; }
   const names = /\.tex$/i.test(name) ? [name] : [name,name+'.tex'];
   const candidates=[...names.map((n)=>path.posix.join(path.posix.dirname(rel.replaceAll('\\','/')),n)),...names];
   const target=candidates.find((n)=>safe(n))||names.at(-1);
   return '\n' + expand(target, depth + 1) + '\n';
  })).join('');
  active.delete(full);
  if (result.length > MAX_PAPER_CHARS) fail('展开稿件超过 400 万字符资源上限');
  return result;
 };
 if (!safe(main)) throw Object.assign(new Error('论文主文件不存在'), { status: 400 });
 const source = expand(main);
 return { source, files: [...files], warnings: [...warnings] };
}
export function plainText(text) {
 return String(text).replace(/(?<!\\)%[^\n]*/g, '').replace(/\\(?:begin|end)\{[^}]+\}(?:\[[^\]]*\])?/g, ' ')
  .replace(/\\(?:label|includegraphics|bibliography|bibliographystyle|input|include)(?:\[[^\]]*\])?\{[^}]*\}/g, '')
  .replace(/\\(?:textbf|textit|emph|texttt|underline)\{([^{}]*)\}/g, '$1')
  .replace(/\\(?:cite\w*|ref|eqref)\{([^{}]*)\}/g, '[$1]')
  .replace(/\$\$[\s\S]*?\$\$|\$[^$]*\$|\\\[[\s\S]*?\\\]/g, ' [公式见原稿] ')
  .replace(/\\[a-zA-Z@]+\*?(?:\[[^\]]*\])?/g, ' ').replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();
}
export function splitPaper(source, max = CHUNK_CHARS) {
 if (!Number.isInteger(max) || max < 1000 || max > 20000) throw new Error('分块上限需为 1000–20000 字符');
 if (source.length > MAX_PAPER_CHARS) fail('展开稿件超过 400 万字符资源上限');
 const headings = [...source.matchAll(/\\(?:chapter|(?:sub){0,2}section)\*?(?:\[[^\]]*\])?\{([^}\n]+)\}/g)];
 const ranges = [{ from: 0, title: '研究概述', section: 's0' }, ...headings.map((m,i) => ({ from: m.index, title: plainText(m[1]) || '章节', section: 's'+(i+1) }))];
 const chunks = [];
 for (let r = 0; r < ranges.length; r++) {
  const range = ranges[r]; const end = ranges[r+1]?.from ?? source.length; let from = range.from;
  while (from < end) {
   let to = Math.min(end, from + max);
   if (to < end) {
    const window = source.slice(from, to); const paragraph = window.lastIndexOf('\n\n'); const line = window.lastIndexOf('\n');
    let cut = paragraph > max/2 ? paragraph+2 : line > max/2 ? line+1 : max;
    // Prefer not to cut an ordinary equation/figure/table environment. Very
    // large environments are transported as marked continuations, never erased.
    const open = [...window.matchAll(/\\(begin|end)\{([^}]+)\}/g)]; const stack = [];
    for (const m of open) if (m[1] === 'begin') stack.push(m.index); else stack.pop();
    if (stack.length && stack[0] > max/2) cut = Math.min(cut, stack[0]);
    to = from + cut;
    if (to > from && /[\uD800-\uDBFF]/.test(source[to-1])) to--;
   }
   const text = source.slice(from, to);
   chunks.push({ id: `c${String(chunks.length+1).padStart(4,'0')}`, section: range.section, title: range.title, from, to, chars: text.length, continuation: from !== range.from || to !== end, text });
   from = to;
  }
 }
 return chunks;
}
export function paperPlan(source, extra = {}) {
 const chunks = splitPaper(source);
 let groups = chunks.length; let reductionCalls = 0;
 while (groups > 8) { groups = Math.ceil(groups/8); reductionCalls += groups; }
 return { version: 1, digest: hash(source), chars: source.length, chunkChars: CHUNK_CHARS, chunkCount: chunks.length,
  sectionCount: new Set(chunks.map((c) => c.section)).size, modelCalls: chunks.length + reductionCalls + 1,
  ...extra, chunks };
}
export function extractSummary(text, limit = 1100) {
 const plain = plainText(text); if (plain.length <= limit) return plain;
 const sentences = plain.match(/[^。！？.!?]+[。！？.!?]*(?:\s+|$)/g) || [plain];
 const scored = sentences.map((s,i) => ({ s: s.trim(), i, score: (i===0?4:0)+(i===sentences.length-1?5:0)+(/result|conclu|limitation|method|accuracy|improv|结果|结论|方法|局限|贡献|发现|\d/i.test(s)?3:0) }));
 let remaining = limit; const selected = []; const seen = new Set();
 for (const candidate of scored.sort((a,b) => b.score-a.score || a.i-b.i)) {
  if (!candidate.s || seen.has(candidate.s)) continue;
  const excerpt = candidate.s.length > 600 ? candidate.s.slice(0,380)+' … '+candidate.s.slice(-180) : candidate.s;
  if (excerpt.length > remaining) continue;
  seen.add(candidate.s); selected.push({ i:candidate.i, text:excerpt }); remaining -= excerpt.length+1;
 }
 return selected.length ? selected.sort((a,b) => a.i-b.i).map((s) => s.text).join(' ') : plain.slice(0,Math.max(1,Math.floor((limit-3)/2)))+' … '+plain.slice(-Math.max(1,Math.floor((limit-3)/2)));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
 const args = process.argv.slice(2); const value = (key) => args[args.indexOf(key)+1];
 if (!args.includes('--root') || !args.includes('--main')) throw new Error('用法：node chunk-paper.mjs --root <论文目录> --main main.tex [--out plan.json]');
 const expanded = expandPaper(path.resolve(value('--root')), value('--main'));
 const plan = paperPlan(expanded.source, { files: expanded.files, warnings: expanded.warnings });
 const output = JSON.stringify(plan, null, 2);
 if (args.includes('--out')) fs.writeFileSync(value('--out'), output); else console.log(output);
}
