import { EditorView, keymap, highlightSpecialChars, drawSelection, dropCursor, rectangularSelection, crosshairCursor } from '@codemirror/view';
import { EditorState, Compartment, EditorSelection } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { syntaxHighlighting, HighlightStyle, StreamLanguage, bracketMatching, indentOnInput, foldGutter, foldKeymap } from '@codemirror/language';
import { stex } from '@codemirror/legacy-modes/mode/stex';
import { openGitSync } from '../git-sync.js';
import { BrowserTeX, isBrowserEngine } from '../wasm-compiler.js';
import {openTemplateLibrary}from'../template-library.js';
import { autocompletion, closeBrackets, completionKeymap } from '@codemirror/autocomplete';
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
import { lineNumbers, highlightActiveLineGutter, highlightActiveLine } from '@codemirror/view';
import { tags } from '@lezer/highlight';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { yCollab, ySyncAnnotation } from 'y-codemirror.next';
import { createPdfViewer } from '../pdf-viewer.js';
import { createComments } from './comments.js';
import { createResearchTools, openWorkspaceSearch, openNotifications, openAiSettings } from './research-tools.js';
import { loadExtensions, enabledExtension, extensionCommands, openExtensionsManager, closeExtensionWindows } from '../extensions.js';

import { api } from '../api.js';
import {
  icon, escapeHtml, avatarHtml, toast, modal, confirmDialog, promptDialog, dropdown, timeAgo,
} from '../ui.js';

const IMAGE_EXT = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp'];
const isImage = (p) => IMAGE_EXT.some((e) => p.toLowerCase().endsWith(e));
const isPdf = (p) => p.toLowerCase().endsWith('.pdf');
const baseName = (p) => p.split('/').pop();

/* ---------------- LaTeX 补全 ---------------- */
const COMMANDS = [
  ['\\documentclass', '文档类', '\\documentclass[11pt]{article}'],
  ['\\usepackage', '宏包', '\\usepackage{$0}'],
  ['\\begin', '环境开始', '\\begin{$0}\n\t\n\\end{$0}'],
  ['\\end', '环境结束', '\\end{$0}'],
  ['\\section', '一级标题', '\\section{$0}'],
  ['\\subsection', '二级标题', '\\subsection{$0}'],
  ['\\subsubsection', '三级标题', '\\subsubsection{$0}'],
  ['\\paragraph', '段落标题', '\\paragraph{$0}'],
  ['\\title', '标题', '\\title{$0}'],
  ['\\author', '作者', '\\author{$0}'],
  ['\\date', '日期', '\\date{\\today}'],
  ['\\maketitle', '生成标题', '\\maketitle'],
  ['\\tableofcontents', '目录', '\\tableofcontents'],
  ['\\label', '标签', '\\label{sec:$0}'],
  ['\\ref', '引用', '\\ref{$0}'],
  ['\\eqref', '公式引用', '\\eqref{$0}'],
  ['\\cite', '文献引用', '\\cite{$0}'],
  ['\\bibliography', '参考文献', '\\bibliography{$0}'],
  ['\\bibliographystyle', '文献样式', '\\bibliographystyle{plain}'],
  ['\\includegraphics', '插入图片', '\\includegraphics[width=0.8\\textwidth]{$0}'],
  ['\\caption', '图注', '\\caption{$0}'],
  ['\\textbf', '加粗', '\\textbf{$0}'],
  ['\\textit', '斜体', '\\textit{$0}'],
  ['\\underline', '下划线', '\\underline{$0}'],
  ['\\emph', '强调', '\\emph{$0}'],
  ['\\footnote', '脚注', '\\footnote{$0}'],
  ['\\item', '列表项', '\\item $0'],
  ['\\centering', '居中', '\\centering'],
  ['\\hspace', '水平间距', '\\hspace{$0}'],
  ['\\vspace', '垂直间距', '\\vspace{$0}'],
  ['\\newpage', '换页', '\\newpage'],
  ['\\clearpage', '清空浮动体并换页', '\\clearpage'],
  ['\\frac', '分数', '\\frac{$0}{$1}'],
  ['\\sqrt', '根号', '\\sqrt{$0}'],
  ['\\sum', '求和', '\\sum_{$0}^{$1}'],
  ['\\int', '积分', '\\int_{$0}^{$1}'],
  ['\\mathbb', '黑板体', '\\mathbb{$0}'],
  ['\\mathcal', '花体', '\\mathcal{$0}'],
  ['\\mathbf', '粗体数学', '\\mathbf{$0}'],
  ['\\text', '公式内文字', '\\text{$0}'],
  ['\\times', '乘号', '\\times'],
  ['\\cdot', '点乘', '\\cdot'],
  ['\\alpha', 'α', '\\alpha'],
  ['\\beta', 'β', '\\beta'],
  ['\\gamma', 'γ', '\\gamma'],
  ['\\delta', 'δ', '\\delta'],
  ['\\epsilon', 'ε', '\\epsilon'],
  ['\\lambda', 'λ', '\\lambda'],
  ['\\mu', 'μ', '\\mu'],
  ['\\sigma', 'σ', '\\sigma'],
  ['\\theta', 'θ', '\\theta'],
  ['\\omega', 'ω', '\\omega'],
  ['\\infty', '无穷', '\\infty'],
  ['\\partial', '偏导', '\\partial'],
  ['\\nabla', 'nabla', '\\nabla'],
  ['\\leq', '≤', '\\leq'],
  ['\\geq', '≥', '\\geq'],
  ['\\neq', '≠', '\\neq'],
  ['\\approx', '≈', '\\approx'],
  ['\\rightarrow', '→', '\\rightarrow'],
];

const ENVIRONMENTS = ['equation', 'equation*', 'align', 'align*', 'itemize', 'enumerate', 'figure', 'table', 'tabular', 'abstract', 'center', 'quote', 'verbatim', 'theorem', 'proof'];

function latexCompletions(context) {
  const before = context.matchBefore(/\{[^}]*$/);
  const line = context.state.doc.lineAt(context.pos).text;

  // \ref{ / \cite{ / \label{ 内补全
  if (before) {
    const keyword = line.match(/\\(ref|eqref|pageref|cite|citep|citet|label|begin|end|usepackage|documentclass)\{[^}]*$/);
    if (keyword) {
      const kind = keyword[1];
      const docText = context.state.doc.toString();
      const labels = [...docText.matchAll(/\\label\{([^}]+)\}/g)].map((m) => m[1]);
      const refs = [...docText.matchAll(/\\bibitem\{([^}]+)\}|@\w+\{([^,]+),/g)].map((m) => m[1] || m[2]);
      let options = [];
      if (['ref', 'eqref', 'pageref'].includes(kind)) options = labels;
      else if (['cite', 'citep', 'citet'].includes(kind)) options = refs;
      else if (['begin', 'end'].includes(kind)) options = ENVIRONMENTS;
      if (options.length) {
        return {
          from: before.from + 1,
          options: options.map((o) => ({ label: o, type: 'variable' })),
          validFor: /^[^}]*$/,
        };
      }
    }
    return null;
  }

  const word = context.matchBefore(/\\[a-zA-Z]*/);
  if (!word) return null;
  if (word.from === word.to && !context.explicit) return null;

  const options = COMMANDS.map(([label, detail, apply]) => ({
    label,
    detail,
    type: 'keyword',
    apply: (view, completion, from, to) => {
      const snippet = apply;
      const cursorOffset = snippet.indexOf('$0');
      const text = snippet.replace(/\$0/g, '').replace(/\$1/g, '');
      view.dispatch({
        changes: { from, to, insert: text },
        selection: { anchor: from + (cursorOffset >= 0 ? cursorOffset : text.length) },
      });
    },
  }));
  return { from: word.from, options, validFor: /^\\[a-zA-Z]*$/ };
}

const latexHighlight = HighlightStyle.define([
  { tag: tags.keyword, color: '#1a7f4c', fontWeight: '600' },
  { tag: tags.comment, color: '#9aa5b1', fontStyle: 'italic' },
  { tag: tags.string, color: '#a8550b' },
  { tag: tags.atom, color: '#a8550b' },
  { tag: tags.number, color: '#1f5fa8' },
  { tag: tags.bracket, color: '#5b6b7b' },
  { tag: tags.meta, color: '#6b4fbb' },
  { tag: tags.typeName, color: '#6b4fbb' },
  { tag: tags.variableName, color: '#1f5fa8' },
  { tag: tags.operator, color: '#5b6b7b' },
  { tag: tags.tagName, color: '#1a7f4c' },
]);

const editorTheme = EditorView.theme({
  '&': { height: '100%', fontSize: '13px', backgroundColor: '#ffffff', color: '#1b2530' },
  '.cm-content': { padding: '14px 0 120px', caretColor: '#16794a' },
  '.cm-line': { padding: '0 16px 0 8px' },
  '.cm-gutters': { paddingLeft: '6px' },
  '.cm-tooltip': { border: '1px solid #e4e8ec', borderRadius: '8px', boxShadow: '0 10px 26px rgba(16,24,40,.12)', overflow: 'hidden' },
  '.cm-tooltip.cm-tooltip-autocomplete > ul': { fontFamily: 'var(--mono)', fontSize: '12.5px', maxHeight: '260px' },
  '.cm-tooltip-autocomplete ul li[aria-selected]': { backgroundColor: '#e8f5ee', color: '#12643d' },
  '.cm-completionDetail': { marginLeft: '10px', fontStyle: 'normal', color: '#98a3af', fontSize: '11.5px' },
  '.cm-cursor': { borderLeftColor: '#16794a', borderLeftWidth: '2px' },
  '.cm-panels': { backgroundColor: '#fafbfc', borderColor: '#e4e8ec' },
}, { dark: false });

/* ---------------- 视图 ---------------- */

export async function renderEditor(root, projectId, { user, onExit, onUserUpdate, initialLocation = {} }) {
  root.innerHTML = `<div class="center-fill"><div class="spinner spinner-dark"></div><div>正在打开项目…</div></div>`;

  let project;
  let tree = [];
  let initialIssues = [];
  let engines = [];
  try {
    const data = await api.get(`/api/projects/${projectId}`);
    project = data.project;
    tree = data.tree;
    engines = [...(Array.isArray(data.engines) ? data.engines : []), { id: 'wasm-pdftex', name: '本地 WASM · 自动（中文 / 会议）', kind: 'browser' }, { id:'wasm-xetex',name:'本地 WASM · XeLaTeX',kind:'browser' }];
    initialIssues = Array.isArray(data.issues) && data.issues.length
      ? data.issues
      : (Array.isArray(data.clashes) ? data.clashes.map((c) => ({ title: `宏包选项冲突：${c.pkg}`, hint: c.hint, code: 'option-clash' })) : []);
  } catch (err) {
    root.innerHTML = `<div class="center-fill"><div>项目打不开：${escapeHtml(err.message)}</div>
      <button class="btn" id="back">返回项目列表</button></div>`;
    root.querySelector('#back').onclick = onExit;
    return () => {};
  }

  let wsToken = '';
  try {
    wsToken = (await api.get('/api/auth/ws-token')).token;
  } catch { /* ignore */ }

  const storeKey = `ls.tree.${projectId}`;
  let expanded = new Set(JSON.parse(localStorage.getItem(storeKey) || '[""]'));
  const saveExpanded = () => localStorage.setItem(storeKey, JSON.stringify([...expanded]));

  let tabs = [];
  let activePath = null;
  let docs = new Map(); // path -> {doc, provider, ytext, undo}
  let compiling = false;
  const browserTeX = new BrowserTeX((message)=>{const status=root.querySelector('#wasm-progress');if(status){status.textContent=message;status.hidden=!message;}}); let browserPdf = null;
  let changingEngine = false;
  const canEdit = ['owner', 'editor'].includes(project.role);
  let extensionList = await loadExtensions();
  const assistantEnabled = enabledExtension(extensionList, 'underoot.assistant');
  let compileQueued = false;
  let autoCompile = localStorage.getItem('ls.autocompile') !== '0';
  let currentCompile = null;
  let pdfVisible = localStorage.getItem('ls.pdf') !== '0';

  /* ---------- DOM 骨架 ---------- */
  root.innerHTML = `
    <div class="editor-shell">
      <header class="ed-topbar">
        <button class="ed-back" id="btn-back" title="返回项目列表"><img src="/favicon.svg" width="26" height="26" alt="underoot" /></button>
        <div class="ed-title"><input id="proj-name" value="${escapeHtml(project.name)}" spellcheck="false" /></div>
        <div class="ed-save" id="save-state"><span class="dot"></span><span>已同步</span></div>
        <div class="spacer"></div>
        <div class="ed-crowd" id="crowd"></div>
        <button class="btn btn-ghost btn-icon btn-sm" id="btn-share" title="共享项目">${icon('users')}</button>
        <button class="btn btn-ghost btn-icon btn-sm" id="btn-comments" title="评论">${icon('message')}</button>
        <button class="btn btn-sm" id="btn-assistant" title="修改建议中心">${assistantEnabled ? '助手' : '建议'}</button>
        <button class="btn btn-sm" id="btn-pdf-toggle" title="显示/隐藏 PDF 预览">${icon('file')}</button>
        <label class="ed-engine" for="project-engine"><span>编译器</span>
          <select id="project-engine" aria-label="项目编译器" title="仅设置当前项目；保存后自动重新编译">
            <option value="auto">自动（服务端默认）</option>
            ${engines.map((en) => `<option value="${escapeHtml(en.id)}">${escapeHtml(en.name)}</option>`).join('')}
            ${project.engine && project.engine !== 'auto' && !engines.some((en) => en.id === project.engine)
              ? `<option value="${escapeHtml(project.engine)}" disabled>${escapeHtml(project.engine)}（未安装）</option>` : ''}
          </select>
        </label>
        <button class="btn btn-primary btn-sm" id="btn-compile" style="height:30px;padding:0 12px">${icon('play')}<span>编译</span></button>
        <button class="btn btn-sm" id="btn-wasm-cancel" style="display:none">停止本地编译</button>
        <div id="user-chip" style="cursor:pointer">${avatarHtml(user, 'avatar-sm')}</div>
      </header>

      <div class="ed-main">
        <aside class="side">
          <div class="side-head">
            <span>文件</span>
            <div class="side-actions">
              <button id="btn-new-file" title="新建文件">${icon('plus')}</button>
              <button id="btn-history" title="历史版本">${icon('clock')}</button>
              <button id="btn-extensions" title="插件中心">${icon('grid')}</button>
              <button id="btn-more" title="更多">${icon('more')}</button>
            </div>
          </div>
          <div class="tree" id="tree"></div>
          <div class="side-foot">
            <button class="btn btn-sm" id="btn-upload" title="上传文件">${icon('upload')}上传</button>
            <button class="btn btn-sm" id="btn-download" title="下载项目 ZIP">${icon('download')}</button>
            <button class="btn btn-sm" id="btn-project-history" title="项目完整版本与分支">分支</button>
          </div>
        </aside>

        <div class="pane-editor">
          <div class="tabs" id="tabs"></div>
          <div class="ed-host" id="ed-host"></div>
          <div class="statusbar">
            <span id="wasm-progress" role="status" hidden></span>
            <span id="st-pos">行 1, 列 1</span>
            <span id="st-sel"></span>
            <span id="st-engine"></span>
            <button id="vim-toggle" class="vim-toggle" title="Vim 编辑模式：normal / insert / visual；:w 编译保存" hidden>VIM OFF</button>
            <span style="margin-left:auto" id="st-collab">协同已连接</span>
          </div>
        </div>

        <div class="pane-pdf" id="pane-pdf" style="display:${pdfVisible ? 'flex' : 'none'}">
          <div class="splitter" id="splitter"></div>
          <div class="pdf-head">
            <span class="name" id="pdf-name">预览</span>
            <div class="spacer"></div>
            <span class="pdf-count" id="pdf-count"></span>
            <div class="pdf-zoom" role="group" aria-label="PDF 缩放">
              <button class="btn btn-ghost btn-icon btn-sm" id="pdf-zoom-out" title="缩小">−</button>
              <button class="pdf-zoom-label" id="pdf-zoom-label" title="恢复适应宽度">100%</button>
              <button class="btn btn-ghost btn-icon btn-sm" id="pdf-zoom-in" title="放大">+</button>
            </div>
            <button class="btn btn-ghost btn-icon btn-sm" id="pdf-comment-select" title="圈选 PDF 区域添加评论">${icon('frame')}</button>
            <button class="btn btn-ghost btn-icon btn-sm" id="pdf-refresh" title="重新编译">${icon('refresh')}</button>
            <a class="btn btn-ghost btn-icon btn-sm" id="pdf-download" title="下载 PDF" href="#">${icon('download')}</a>
            <button class="btn btn-ghost btn-icon btn-sm" id="pdf-close" title="关闭预览">${icon('close')}</button>
          </div>
          <div class="pdf-body" id="pdf-body">
            <div class="pdf-empty" id="pdf-empty">
              ${icon('file', 'icon')}
              <div style="font-size:13px">按下「编译」生成 PDF 预览</div>
            </div>
          </div>
        </div>

        <aside class="comments-panel" id="comments-panel"></aside>
        <aside class="assistant-panel" id="assistant-panel"></aside>
      </div>

      <div class="log-panel" id="log-panel" style="display:none">
        <div class="log-head">
          <div class="log-tabs">
            <button data-tab="problems" class="active">问题</button>
            <button data-tab="raw">编译日志</button>
          </div>
          <div class="spacer"></div>
          <button class="btn btn-sm" id="btn-fix-clash" style="display:none">${icon('shield')}一键修复</button>
          <button class="btn btn-sm" id="btn-wasm-server" style="display:none">切换服务器编译</button>
          <span id="log-summary" style="font-size:11.5px;color:var(--muted)"></span>
          <button class="btn btn-ghost btn-icon btn-sm" id="log-close" title="关闭">${icon('close')}</button>
        </div>
        <div class="log-body" id="log-body"></div>
      </div>
    </div>
    <input type="file" id="up-input" multiple hidden />
    <input type="file" id="up-folder" webkitdirectory directory multiple hidden />`;

  const els = {
    tree: root.querySelector('#tree'),
    tabs: root.querySelector('#tabs'),
    host: root.querySelector('#ed-host'),
    saveState: root.querySelector('#save-state'),
    crowd: root.querySelector('#crowd'),
    pdfBody: root.querySelector('#pdf-body'),
    panePdf: root.querySelector('#pane-pdf'),
    logPanel: root.querySelector('#log-panel'),
    logBody: root.querySelector('#log-body'),
    logSummary: root.querySelector('#log-summary'),
    compileBtn: root.querySelector('#btn-compile'),
    engineSelect: root.querySelector('#project-engine'),
    stPos: root.querySelector('#st-pos'),
    stSel: root.querySelector('#st-sel'),
    stEngine: root.querySelector('#st-engine'),
    stCollab: root.querySelector('#st-collab'),
    pdfName: root.querySelector('#pdf-name'),
    pdfEmpty: root.querySelector('#pdf-empty'),
    pdfCount: root.querySelector('#pdf-count'),
    pdfZoomLabel: root.querySelector('#pdf-zoom-label'),
    pdfDownload: root.querySelector('#pdf-download'),
  };

  /* ---------- PDF 画布渲染（不使用浏览器 PDF 插件界面） ---------- */
  let comments = null;
  let research = null;
  const pdfViewer = createPdfViewer(els.pdfBody, {
    emptyEl: els.pdfEmpty,
    onState: ({ zoom, pageCount }) => {
      if (els.pdfZoomLabel) els.pdfZoomLabel.textContent = `${Math.round(zoom * 100)}%`;
      if (els.pdfCount) els.pdfCount.textContent = pageCount ? `${pageCount} 页` : '';
    },
    onPagesRendered: () => comments?.repaintPdf(),
  });
  let binaryViewer = null;

  /* ---------- CodeMirror ---------- */
  const collabComp = new Compartment();
  const langComp = new Compartment();
  const commentComp = new Compartment();
  const vimComp=new Compartment();let vimEnabled=false;let vimModule;
  let onDocChange = () => {};

  const view = new EditorView({
    parent: els.host,
    state: EditorState.create({
      doc: '',
      extensions: [
        vimComp.of([]),
        EditorState.readOnly.of(!canEdit),
        EditorView.editable.of(canEdit),
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightSpecialChars(),
        history(),
        foldGutter(),
        drawSelection(),
        dropCursor(),
        EditorState.allowMultipleSelections.of(true),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        autocompletion({ override: [latexCompletions], activateOnTyping: true, icons: false }),
        rectangularSelection(),
        crosshairCursor(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        keymap.of([...searchKeymap, ...completionKeymap, ...foldKeymap, ...historyKeymap, ...defaultKeymap, indentWithTab]),
        editorTheme,
        syntaxHighlighting(latexHighlight),
        langComp.of(StreamLanguage.define(stex)),
        collabComp.of([]),
        commentComp.of([]),
        EditorView.updateListener.of((update) => {
          if (update.selectionSet || update.docChanged) updateStatus();
          if (update.docChanged) onDocChange(update);
        }),
        keymap.of([{
          key: 'Mod-s',
          preventDefault: true,
          run: () => { compile(true); return true; },
        }, {
          key: 'Mod-Enter',
          preventDefault: true,
          run: () => { compile(true); return true; },
        }]),
      ],
    }),
  });

  function updateStatus() {
    const sel = view.state.selection.main;
    const line = view.state.doc.lineAt(sel.head);
    els.stPos.textContent = `行 ${line.number}, 列 ${sel.head - line.from + 1}`;
    const selLen = view.state.selection.ranges.reduce((n, r) => n + (r.to - r.from), 0);
    els.stSel.textContent = selLen > 0 ? `已选 ${selLen} 字符` : `${view.state.doc.length} 字符`;
  }

  /* ---------- 协作评论（源码选区 + PDF 圈选） ---------- */
  comments = createComments({
    root, projectId, user, view, pdfViewer,
    role: project.role,
    onPdfRegion: (region) => research?.onPdfRegion(region),
    onOpen: () => research?.close(),
    getActivePath: () => activePath,
    openFile: (p) => openFile(p),
  });
  view.dispatch({ effects: commentComp.reconfigure(comments.extension) });
  research = createResearchTools({ root, project, user, view, pdfViewer, assistantEnabled, getActivePath: () => activePath,
    openFile, compile, onOpen: () => comments?.closePanel() });
  root.querySelector('#btn-assistant').onclick = () => research.open();
  root.querySelector('#btn-project-history').onclick = () => research.openHistory();
  root.querySelector('#btn-extensions').onclick = () => openExtensionsManager(user);
  const extensionContext = { project, openProposals: () => research.open(),
    getSelection: () => { const selection = view.state.selection.main; return /\.(tex|bib)$/i.test(activePath || '') ? { path: activePath, from: selection.from, to: selection.to } : null; },
    getPdfSelection: () => research.getPdfSelection(),
  };
  const extensionActions = { 'assistant.open': () => research.open(), 'discovery.search': openWorkspaceSearch,
    'publishing.slides': () => research.openDerive('slides'), 'publishing.poster': () => research.openDerive('poster'),
    'publishing.template': () => research.openTemplate(),'publishing.templates':()=>openTemplateLibrary(), 'editing.vim':()=>setVim(!vimEnabled) };
  const vimButton=root.querySelector('#vim-toggle');const vimKey=`underoot.vim.${user.id}`;
  async function setVim(value){
   if(value&&(!canEdit||!enabledExtension(extensionList,'underoot.vim'))){toast('需要编辑权限且启用 Vim 插件','err');return;}
   if(value&&!vimModule)vimModule=await import('../vim-mode.js');
   view.dispatch({effects:vimComp.reconfigure(value?vimModule.vimMode(view,()=>compile(true),{undo:()=>docs.get(activePath)?.undo.undo(),redo:()=>docs.get(activePath)?.undo.redo()}):[])});
   vimEnabled=value;if(!value)vimModule?.releaseVim(view);localStorage.setItem(vimKey,value?'1':'0');vimButton.textContent=value?'VIM ON':'VIM OFF';vimButton.setAttribute('aria-pressed',String(value));view.focus();
  }
  vimButton.hidden=!enabledExtension(extensionList,'underoot.vim');vimButton.disabled=!canEdit;vimButton.onclick=()=>setVim(!vimEnabled);
  if(canEdit&&enabledExtension(extensionList,'underoot.vim')&&localStorage.getItem(vimKey)==='1')await setVim(true);

  /* ---------- 文件树 ---------- */
  function fileIcon(name) {
    const ext = name.split('.').pop().toLowerCase();
    if (ext === 'tex') return 'file';
    if (ext === 'bib') return 'log';
    if (['png', 'jpg', 'jpeg', 'gif', 'svg'].includes(ext)) return 'image';
    if (['cls', 'sty'].includes(ext)) return 'settings';
    return 'file';
  }

  function renderTree() {
    const walk = (nodes, depth) => nodes.map((node) => {
      if (node.type === 'dir') {
        const open = expanded.has(node.path);
        return `
          <div class="tree-row" data-dir="${escapeHtml(node.path)}">
            <span class="ico">${icon(open ? 'chevron-down' : 'chevron')}</span>
            <span class="label">${escapeHtml(node.name)}</span>
            <button class="row-menu" data-menu-dir="${escapeHtml(node.path)}">${icon('more')}</button>
          </div>
          ${open ? `<div class="tree-children">${walk(node.children, depth + 1)}</div>` : ''}`;
      }
      const isMain = node.path === project.mainFile;
      return `
        <div class="tree-row ${node.path === activePath ? 'active' : ''}" data-file="${escapeHtml(node.path)}">
          <span class="ico">${icon(fileIcon(node.name))}</span>
          <span class="label" title="${escapeHtml(node.path)}">${escapeHtml(node.name)}</span>
          ${isMain ? '<span class="main-dot" title="主文件"></span>' : ''}
          <button class="row-menu" data-menu-file="${escapeHtml(node.path)}">${icon('more')}</button>
        </div>`;
    }).join('');

    els.tree.innerHTML = tree.length ? walk(tree, 0) : '<div class="tree-empty">还没有文件</div>';

    els.tree.querySelectorAll('[data-file]').forEach((row) => {
      row.addEventListener('click', (e) => {
        if (e.target.closest('.row-menu')) return;
        openFile(row.dataset.file);
      });
    });
    els.tree.querySelectorAll('[data-dir]').forEach((row) => {
      row.addEventListener('click', (e) => {
        if (e.target.closest('.row-menu')) return;
        const p = row.dataset.dir;
        if (expanded.has(p)) expanded.delete(p); else expanded.add(p);
        saveExpanded();
        renderTree();
      });
    });
    els.tree.querySelectorAll('[data-menu-file]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const p = btn.dataset.menuFile;
        dropdown(btn, [
          { key: 'rename', label: '重命名', icon: 'edit', onClick: () => renamePath(p) },
          { key: 'main', label: '设为主文件', icon: 'check', onClick: () => setMainFile(p) },
          { key: 'download', label: '下载文件', icon: 'download', onClick: () => {
            window.location.href = `/api/projects/${projectId}/raw?path=${encodeURIComponent(p)}`;
          } },
          { sep: true },
          { key: 'delete', label: '删除', icon: 'trash', danger: true, onClick: () => deletePath(p) },
        ]);
      });
    });
    els.tree.querySelectorAll('[data-menu-dir]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const p = btn.dataset.menuDir;
        dropdown(btn, [
          { key: 'newfile', label: '在此新建文件', icon: 'plus', onClick: async () => {
            const name = await promptDialog({ title: '新建文件', label: '文件名', placeholder: 'chapter1.tex' });
            if (name) await createPath(`${p}/${name}`, 'file');
          } },
          { key: 'rename', label: '重命名文件夹', icon: 'edit', onClick: () => renamePath(p) },
          { sep: true },
          { key: 'delete', label: '删除文件夹', icon: 'trash', danger: true, onClick: () => deletePath(p) },
        ]);
      });
    });
  }

  async function refreshTree() {
    const data = await api.get(`/api/projects/${projectId}/tree`);
    tree = data.tree;
    project.mainFile = data.mainFile || project.mainFile;
    renderTree();
  }

  function closeAffectedTabs(path) {
    for (const tab of [...tabs].reverse()) {
      if (tab === path || tab.startsWith(path + '/')) closeTab(tab, true);
    }
    renderTabs();
  }

  async function createPath(path, type) {
    try {
      await api.post(`/api/projects/${projectId}/file`, { path, type });
      await refreshTree();
      if (type === 'file') await openFile(path);
      toast('已创建', 'ok');
    } catch (err) { toast(err.message, 'err'); }
  }

  async function renamePath(from) {
    const to = await promptDialog({ title: '重命名', label: '新路径', value: from, selectBasename: true });
    if (!to || to === from) return;
    try {
      await api.post(`/api/projects/${projectId}/rename`, { from, to });
      closeAffectedTabs(from);
      await refreshTree();
      if (findFile(tree, to)?.type === 'file') await openFile(to);
      toast('已重命名', 'ok');
    } catch (err) { toast(err.message, 'err'); }
  }

  async function deletePath(path) {
    const ok = await confirmDialog({
      title: '删除确认',
      message: `确定删除「${path}」吗？该操作不可撤销。`,
      confirmText: '删除',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.del(`/api/projects/${projectId}/file?path=${encodeURIComponent(path)}`);
      closeAffectedTabs(path);
      await refreshTree();
      toast('已删除', 'ok');
    } catch (err) { toast(err.message, 'err'); }
  }

  async function setMainFile(path) {
    try {
      await api.patch(`/api/projects/${projectId}`, { mainFile: path });
      project.mainFile = path;
      renderTree();
      toast(`主文件已设为 ${path}`, 'ok');
    } catch (err) { toast(err.message, 'err'); }
  }

  /* ---------- 文档协同 ---------- */
  function roomUrl() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    return `${proto}://${location.host}/collab`;
  }

  function ensureDoc(path) {
    if (docs.has(path)) return docs.get(path);
    const doc = new Y.Doc();
    const provider = new WebsocketProvider(roomUrl(), `${projectId}::${path}`, doc, {
      params: { token: wsToken, epoch: String(project.epoch || 0) },
      connect: true,
    });
    provider.awareness.setLocalStateField('user', {
      id: user.id, name: user.name, color: user.color,
    });
    const ytext = doc.getText('content');
    const undo = new Y.UndoManager(ytext, { captureTimeout: 400 });
    const entry = { doc, provider, ytext, undo, path };
    docs.set(path, entry);

    provider.on('sync', () => {
      if (path === activePath) setSaveState('saved');
    });
    provider.on('status', (e) => {
      if (path === activePath) {
        els.stCollab.textContent = e.status === 'connected' ? '协同已连接' : '正在重连…';
        els.stCollab.style.color = e.status === 'connected' ? '' : 'var(--warn)';
      }
    });
    provider.awareness.on('change', renderCrowd);
    doc.on('update', (_u, origin) => {
      if (origin === provider) return;
      if (path === activePath) setSaveState('dirty');
    });
    return entry;
  }

  function renderCrowd() {
    const seen = new Map();
    for (const info of docs.values()) {
      for (const state of info.provider.awareness.getStates().values()) {
        if (!state?.user) continue;
        seen.set(state.user.id, state.user);
      }
    }
    const others = [...seen.values()].filter((u) => u.id !== user.id);
    els.crowd.innerHTML = [user, ...others].slice(0, 5).map((u) => avatarHtml(u, 'avatar-sm')).join('');
  }

  let saveTimer = null;
  function setSaveState(state) {
    clearTimeout(saveTimer);
    if (state === 'dirty') {
      els.saveState.className = 'ed-save dirty';
      els.saveState.lastElementChild.textContent = '同步中…';
      saveTimer = setTimeout(() => setSaveState('saved'), 900);
    } else {
      els.saveState.className = 'ed-save saved';
      els.saveState.lastElementChild.textContent = '已同步';
    }
  }

  /* ---------- 打开 / 切换文件 ---------- */
  async function openFile(path) {
    if (!tabs.includes(path)) tabs.push(path);
    activePath = path;
    renderTabs();
    renderTree();
    comments?.onActivePathChange();
    if (binaryViewer) { binaryViewer.destroy(); binaryViewer = null; }

    if (isImage(path) || isPdf(path)) {
      detachCollab();
      const url = `/api/projects/${projectId}/raw?path=${encodeURIComponent(path)}`;
      if (isImage(path)) {
        els.host.innerHTML = `<div class="binary-view"><img src="${url}" alt="${escapeHtml(path)}" /><div>${escapeHtml(path)}</div></div>`;
      } else {
        els.host.innerHTML = '<div class="binary-pdf-host"></div>';
        binaryViewer = createPdfViewer(els.host.querySelector('.binary-pdf-host'));
        binaryViewer.load(url);
      }
      return;
    }

    if (!els.host.contains(view.dom)) {
      els.host.innerHTML = '';
      els.host.appendChild(view.dom);
    }

    try {
      const entry = ensureDoc(path);
      // Search/comment anchors must wait for Yjs content, otherwise the selection
      // is placed in an empty document and the initial sync moves it to line 1.
      if (!entry.provider.synced) await new Promise((resolve, reject) => {
        const onSync = (synced) => {
          if (!synced) return;
          clearTimeout(timeout); entry.provider.off('sync', onSync); resolve();
        };
        const timeout = setTimeout(() => { entry.provider.off('sync', onSync); reject(new Error('协作连接未完成，请刷新重试')); }, 8000);
        entry.provider.on('sync', onSync);
        if (entry.provider.synced) onSync(true);
      });
      if (activePath !== path || !els.host.isConnected) return;
      // y-codemirror 挂载时不会自动导入已有内容，这里先把编辑器内容对齐到 ytext 当前状态，
      // 之后远程同步的增量会由 observer 应用进来。
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: entry.ytext.toString() },
        selection: EditorSelection.cursor(0),
        scrollIntoView: true,
        effects: [
          langComp.reconfigure(StreamLanguage.define(stex)),
          collabComp.reconfigure(yCollab(entry.ytext, entry.provider.awareness, { undoManager: entry.undo })),
        ],
      });
      view.focus();
      setSaveState('saved');
      updateStatus();
      renderCrowd();
    } catch (err) {
      toast(err.message, 'err');
    }
  }

  function detachCollab() {
    view.dispatch({ effects: collabComp.reconfigure([]) });
  }

  function closeTab(path, force = false) {
    const idx = tabs.indexOf(path);
    if (idx < 0) return;
    tabs.splice(idx, 1);
    if (activePath === path && binaryViewer) {
      binaryViewer.destroy();
      binaryViewer = null;
    }
    const entry = docs.get(path);
    if (entry) {
      entry.provider.destroy();
      entry.doc.destroy();
      docs.delete(path);
    }
    if (activePath === path) {
      activePath = null;
      detachCollab();
      const next = tabs[Math.max(0, idx - 1)];
      if (next) openFile(next);
      else {
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: '' } });
        els.host.innerHTML = `<div class="empty-state" style="margin:24px">从左侧选择一个文件开始编辑</div>`;
        activePath = null;
      }
    }
    if (!force) renderTabs();
    renderTree();
    renderCrowd();
  }

  function renderTabs() {
    els.tabs.innerHTML = tabs.map((p) => `
      <div class="tab ${p === activePath ? 'active' : ''}" data-tab="${escapeHtml(p)}">
        <span class="name">${escapeHtml(baseName(p))}</span>
        <span class="close" data-close="${escapeHtml(p)}">${icon('close')}</span>
      </div>`).join('');
    els.tabs.querySelectorAll('[data-tab]').forEach((tab) => {
      tab.addEventListener('click', (e) => {
        if (e.target.closest('[data-close]')) return;
        if (tab.dataset.tab !== activePath) openFile(tab.dataset.tab);
      });
    });
    els.tabs.querySelectorAll('[data-close]').forEach((btn) => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); closeTab(btn.dataset.close); });
    });
  }

  /* ---------- 编译 ---------- */
  function setCompileBusy(busy, label = '编译') {
    const cancel=root.querySelector('#btn-wasm-cancel');
    cancel.style.display=busy&&isBrowserEngine(project.engine)?'':'none';
    cancel.onclick=()=>{compileQueued=false;browserTeX.destroy();};
    els.engineSelect.disabled = !canEdit || busy || changingEngine;
    els.compileBtn.disabled = busy;
    els.compileBtn.innerHTML = busy
      ? '<span class="spinner"></span><span>编译中</span>'
      : `${icon('play')}<span>${label}</span>`;
  }

  /** 统一的编译结果渲染：本地 HTTP 响应与协同广播共用 */
  function engineName(id) {
    if (!id || id === 'auto') return '自动（服务端默认）';
    const hit = engines.find((e) => e.id === id);
    return hit ? hit.name : id;
  }

  function updateEngineStatus() {
    els.engineSelect.value = project.engine || 'auto';
    if (!canEdit) els.engineSelect.disabled = true;
    const label = engineName(project.engine);
    const extra = currentCompile?.engine ? ` · 上次 ${currentCompile.localEngine||engineName(currentCompile.engine)}` : '';
    els.stEngine.textContent = `引擎 ${label}${extra}`;
    els.stEngine.title = '在顶部「编译器」中切换；pdfLaTeX 的排版与 Overleaf 默认一致';
  }

  function applyCompileResult(res, { local = false, manual = false } = {}) {
    currentCompile = res;
    renderLog(res);
    if (res.ok && res.pdf) showPdf(res.pdf);
    if (!res.ok) {
      openLogPanel();
      if (local && !res.needsSetup && res.engine) toast('编译失败，请查看问题列表', 'err');
      if (local && res.needsSetup) { toast('请先安装编译器', 'err'); openEngineHelp(); }
    } else if (local && !manual && !res.cached) {
      toast('编译成功', 'ok');
    }
    updateEngineStatus();
    if (!compiling) setCompileBusy(false);
    hidePdfLoading();
  }

  /* ---------- 项目事件通道（编译结果广播） ---------- */
  let eventWs = null;
  let eventRetry = 0;
  let eventClosed = false;

  function connectEvents() {
    if (eventClosed) return;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const query = wsToken ? `?token=${encodeURIComponent(wsToken)}` : '';
    const ws = new WebSocket(`${proto}://${location.host}/events/${projectId}${query}`);
    eventWs = ws;
    ws.onopen = async () => {
      eventRetry = 0;
      try {
        const data = await api.get(`/api/projects/${projectId}`);
        if (data.project.epoch !== project.epoch || data.project.role !== project.role) location.reload();
      } catch { /* access changes are handled by subsequent requests */ }
    };
    ws.onmessage = (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      research?.handleEvent(msg);
      if (msg.type === 'compile:start') {
        if (!compiling) {
          els.compileBtn.disabled = true;
          els.compileBtn.innerHTML = `<span class="spinner"></span><span>${escapeHtml(msg.by || '协作者')} 编译中</span>`;
        }
      } else if (msg.type === 'compile:result') {
        applyCompileResult(msg.result, { local: false });
      } else if (msg.type === 'file:changed') {
        refreshTree();
      } else if (msg.type === 'project:engine') {
        project.engine = msg.engine;
        updateEngineStatus();
      } else if (msg.type === 'file:deleted' || msg.type === 'file:renamed') {
        closeAffectedTabs(msg.from || msg.path);
        refreshTree();
      } else if (msg.type === 'comment:changed') {
        comments?.handleEvent(msg);
      } else if (msg.type === 'project:reset' || msg.type === 'members:changed') {
        if (msg.type === 'project:reset') location.reload();
        else api.get(`/api/projects/${projectId}`).then((data) => { if (data.project.role !== project.role) location.reload(); }).catch(() => { location.hash = '#/'; });
      } else if (msg.type === 'extensions:changed') {
        loadExtensions().then((items)=>{extensionList=items;vimButton.hidden=!enabledExtension(items,'underoot.vim');if(vimEnabled&&!enabledExtension(items,'underoot.vim'))setVim(false);}).catch(()=>{});
        closeExtensionWindows(); toast('插件配置已更新，刷新页面可更新入口', 'ok');
      }
    };
    ws.onclose = () => {
      if (eventClosed) return;
      eventRetry = Math.min(eventRetry + 1, 6);
      setTimeout(connectEvents, 1000 * eventRetry);
    };
    ws.onerror = () => {};
  }

  async function compile(manual = false) {
    if (!canEdit && !isBrowserEngine(project.engine)) {
      const output = baseName(project.mainFile).replace(/\.[^.]+$/, '') + '.pdf';
      if (findFile(tree, output)) showPdf(`/api/projects/${projectId}/pdf?file=${encodeURIComponent(output)}`);
      return;
    }
    if (compiling) { compileQueued = true; return; }
    compiling = true;
    setCompileBusy(true);
    if (manual && pdfVisible) showPdfLoading();
    try {
      let res;
      if (isBrowserEngine(project.engine)) {
        const payload = await api.get(`/api/workspace/projects/${projectId}/browser-files`);
        if (activePath && docs.has(activePath)) {
          const file = payload.files.find((f) => f.path === activePath);
          if (file) file.content = view.state.doc.toString();
        }
        res = await browserTeX.compile(project.mainFile, payload.files, project.engine);
        if (res.ok) { if (browserPdf) URL.revokeObjectURL(browserPdf); browserPdf = res.pdf; }
      } else res = await api.post(`/api/projects/${projectId}/compile`, {
        mainFile: project.mainFile,
        force: !!manual,
      });
      applyCompileResult(res, { local: true, manual });
    } catch (err) {
      toast(err.message, 'err');
    } finally {
      compiling = false;
      setCompileBusy(false);
      hidePdfLoading();
      if (compileQueued) { compileQueued = false; compile(false); }
    }
  }

  function showPdfLoading() {
    hidePdfLoading();
    const div = document.createElement('div');
    div.className = 'pdf-loading';
    div.id = 'pdf-loading';
    div.innerHTML = '<span class="spinner spinner-dark"></span><span>正在编译…</span>';
    els.pdfBody.appendChild(div);
  }
  function hidePdfLoading() {
    root.querySelector('#pdf-loading')?.remove();
  }

  let lastPdfUrl = null;
  function showPdf(url) {
    if (lastPdfUrl === url) return;
    lastPdfUrl = url;
    pdfViewer.load(url);
    els.pdfName.textContent = 'main.pdf';
    els.pdfDownload.href = url;
    els.pdfDownload.setAttribute('download', 'main.pdf');
  }

  /* ---------- 日志 / 问题 ---------- */
  let logTab = 'problems';
  // 打开项目时静态体检发现的问题（不必等编译失败）
  let knownIssues = Array.isArray(initialIssues) ? initialIssues : [];

  function renderLog(res) {
    const serverButton = root.querySelector('#btn-wasm-server');
    const fallback = engines.find((e) => e.id === 'xelatex') || engines.find((e) => e.kind !== 'browser' && e.id !== 'auto');
    serverButton.style.display = canEdit && !res.ok && isBrowserEngine(res.engine) && fallback ? '' : 'none';
    serverButton.onclick = () => setEngine(fallback.id);
    const problems = [
      ...(res.errors || []).map((e) => ({ ...e, level: 'err' })),
      ...(res.warnings || []).map((w) => ({ ...w, level: 'warn' })),
    ];
    const errCount = (res.errors || []).length;
    const warnCount = (res.warnings || []).length;
    els.logSummary.innerHTML = res.ok
      ? `<span class="badge badge-green">编译成功 ${res.ms} ms</span>${warnCount ? ` <span class="badge badge-amber">${warnCount} 警告</span>` : ''}`
      : `<span class="badge badge-red">${errCount} 个错误</span>${warnCount ? ` <span class="badge badge-amber">${warnCount} 警告</span>` : ''}`;

    const fixableCodes = new Set(['option-clash', 'unicode-math-bold']);
    const fromLog = (res.errors || []).some((e) => fixableCodes.has(e.code));
    const fixBtn = root.querySelector('#btn-fix-clash');
    if (fixBtn) fixBtn.style.display = (fromLog || knownIssues.length) ? '' : 'none';

    // 静态体检有问题但还没编译时，先显示提示（编译结果会覆盖它）
    if (!res.log && knownIssues.length && logTab === 'problems') {
      els.logBody.innerHTML = knownIssues.map((c) => `
        <div class="problem warn">
          <span class="sq"></span>
          <span class="msg"><b>${escapeHtml(c.title || c.pkg || '编译问题')}</b>
            <div class="problem-hint">${escapeHtml(c.hint || '可一键修复。')}</div></span>
        </div>`).join('');
      openLogPanel();
      return;
    }

    if (logTab === 'raw') {
      els.logBody.innerHTML = `<div class="log-raw">${escapeHtml(res.log || '（无日志）')}</div>`;
      return;
    }
    if (!problems.length) {
      els.logBody.innerHTML = `<div class="log-empty">${res.ok ? '没有错误或警告 🎉' : '编译失败，请查看「编译日志」标签页'}</div>`;
      return;
    }
    els.logBody.innerHTML = problems.map((p, i) => `
      <div class="problem ${p.level}" data-problem="${i}">
        <span class="sq"></span>
        <span class="msg"><b>${escapeHtml(p.message)}</b>${p.detail ? `<div style="color:var(--muted);font-size:11.5px">${escapeHtml(p.detail)}</div>` : ''}
          ${p.hint ? `<div class="problem-hint">${escapeHtml(p.hint)}</div>` : ''}</span>
        <span class="loc">${p.file ? escapeHtml(p.file) : ''}${p.line ? `:${p.line}` : ''}</span>
      </div>`).join('');
    els.logBody.querySelectorAll('[data-problem]').forEach((row) => {
      row.onclick = () => {
        const p = problems[Number(row.dataset.problem)];
        gotoProblem(p);
      };
    });
  }

  async function gotoProblem(p) {
    const file = p.file && p.file.endsWith('.tex') ? p.file.replace(/^\.\//, '') : project.mainFile;
    if (file !== activePath) {
      try { await openFile(file); } catch { /* ignore */ }
    }
    if (!p.line) return;
    const lineNo = Math.min(Math.max(1, p.line), view.state.doc.lines);
    const line = view.state.doc.line(lineNo);
    view.dispatch({
      selection: EditorSelection.cursor(line.from + Math.min(line.text.length, Math.max(0, (p.column || 1) - 1))),
      scrollIntoView: true,
    });
    view.focus();
  }

  function openLogPanel() {
    els.logPanel.style.display = 'flex';
  }

  function openEngineHelp() {
    modal({
      title: '需要安装 LaTeX 编译器',
      bodyHtml: `<p style="margin:0 0 10px;color:var(--text-2);font-size:13.5px">
        服务器上还没有可用的 LaTeX 编译器。可以：</p>
        <ol style="margin:0;padding-left:18px;color:var(--text-2);font-size:13px;line-height:1.9">
          <li>回到项目列表 → 点击右上角头像 → 「编译环境」→ 一键安装 Tectonic；</li>
          <li>或安装 TeX Live / MiKTeX，并确保 <code>latexmk</code> 或 <code>xelatex</code> 在 PATH 中；</li>
          <li>安装后重启 <code>npm start</code>。</li>
        </ol>`,
      footerHtml: '<button class="btn btn-primary" data-act="ok">知道了</button>',
      onMount: (backdrop, close) => {
        backdrop.querySelector('[data-act="ok"]').onclick = close;
      },
    });
  }

  /* ---------- 上传 / 下载 ---------- */
  async function uploadFiles(fileList, withRelative) {
    if (!fileList?.length) return;
    const fd = new FormData();
    const paths = [];
    for (const file of fileList) {
      fd.append('files', file, file.name);
      paths.push(withRelative && file.webkitRelativePath ? file.webkitRelativePath : file.name);
    }
    fd.append('paths', JSON.stringify(paths));
    try {
      await api.upload(`/api/projects/${projectId}/upload`, fd);
      await refreshTree();
      toast(`已上传 ${fileList.length} 个文件`, 'ok');
    } catch (err) { toast(err.message, 'err'); }
  }

  /* ---------- 事件绑定 ---------- */
  root.querySelector('#btn-back').onclick = onExit;

  const nameInput = root.querySelector('#proj-name');
  nameInput.addEventListener('change', async () => {
    const name = nameInput.value.trim();
    if (!name) { nameInput.value = project.name; return; }
    try {
      await api.patch(`/api/projects/${projectId}`, { name });
      project.name = name;
      toast('项目名称已更新', 'ok');
    } catch (err) { toast(err.message, 'err'); }
  });
  nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') nameInput.blur(); });

  root.querySelector('#btn-history').onclick = openHistory;
  root.querySelector('#btn-new-file').onclick = async (e) => {
    dropdown(e.currentTarget, [
      { key: 'file', label: '新建文件', icon: 'file', onClick: async () => {
        const name = await promptDialog({ title: '新建文件', label: '文件名（可含路径）', placeholder: 'sections/intro.tex' });
        if (name) await createPath(name, 'file');
      } },
      { key: 'dir', label: '新建文件夹', icon: 'folder', onClick: async () => {
        const name = await promptDialog({ title: '新建文件夹', label: '文件夹名', placeholder: 'figures' });
        if (name) await createPath(name, 'dir');
      } },
      { sep: true },
      { key: 'up', label: '上传文件', icon: 'upload', onClick: () => root.querySelector('#up-input').click() },
      { key: 'updir', label: '上传文件夹', icon: 'folder-open', onClick: () => root.querySelector('#up-folder').click() },
      { key: 'zip', label: '下载项目 ZIP', icon: 'download', onClick: () => {
        window.location.href = `/api/projects/${projectId}/download`;
      } },
    ], { align: 'left' });
  };

  async function setEngine(id) {
    if (changingEngine || id === (project.engine || 'auto')) return;
    changingEngine = true;
    els.engineSelect.disabled = true;
    try {
      const res = await api.patch(`/api/projects/${projectId}`, { engine: id });
      project.engine = res.project.engine;
      updateEngineStatus();
      toast(`已切换到 ${engineName(id)}，正在重新编译`, 'ok');
      await compile(true);
    } catch (err) {
      toast(err.message, 'err');
    } finally {
      changingEngine = false;
      updateEngineStatus();
      els.engineSelect.disabled = !canEdit || compiling;
    }
  }

  els.engineSelect.onchange = () => setEngine(els.engineSelect.value);

  root.querySelector('#btn-more').onclick = async (e) => {
    const anchor = e.currentTarget;
    try { extensionList = await loadExtensions(); } catch (error) { toast(error.message, 'err'); return; }
    const current = project.engine || 'auto';
    const engineItems = engines.length
      ? [
          { meta: { title: '编译引擎', sub: 'pdfLaTeX 与 Overleaf 默认一致' } },
          { key: 'eng-auto', label: `${current === 'auto' ? '✓ ' : ''}自动（服务端默认）`, icon: 'check', onClick: () => setEngine('auto') },
          ...engines.map((en) => ({
            key: `eng-${en.id}`,
            label: `${current === en.id ? '✓ ' : ''}${en.name}`,
            icon: 'terminal',
            onClick: () => setEngine(en.id),
          })),
          { sep: true },
        ]
      : [];
    dropdown(anchor, [
      ...extensionCommands(extensionList, extensionActions, extensionContext),
      { key: 'extensions', label: '插件中心 · 安装与管理', icon: 'grid', onClick: () => openExtensionsManager(user) },
      { key: 'project-history', label: '项目版本与分支', icon: 'clock', onClick: () => research.openHistory() },
      { key: 'notifications', label: '与我有关的讨论', icon: 'message', onClick: openNotifications },
      { sep: true },
      { key: 'compile', label: '重新编译', icon: 'play', onClick: () => compile(true) },
      { key: 'log', label: '查看编译日志', icon: 'terminal', onClick: openLogPanel },
      { key: 'auto', label: `${autoCompile ? '✓ ' : ''}自动编译`, icon: 'check', onClick: () => {
        autoCompile = !autoCompile;
        localStorage.setItem('ls.autocompile', autoCompile ? '1' : '0');
        toast(autoCompile ? '已开启自动编译' : '已关闭自动编译');
      } },
      ...engineItems,
      ...(canEdit ? [{ key: 'git-sync', label: 'GitHub / GitLab 版本同步', icon: 'history', onClick: () => openGitSync(project) }] : []),
      { key: 'zip', label: '下载项目 ZIP', icon: 'download', onClick: () => {
        window.location.href = `/api/projects/${projectId}/download`;
      } },
    ], { align: 'left' });
  };

  root.querySelector('#btn-upload').onclick = () => root.querySelector('#up-input').click();
  root.querySelector('#btn-download').onclick = () => {
    window.location.href = `/api/projects/${projectId}/download`;
  };
  root.querySelector('#up-input').onchange = async (e) => {
    await uploadFiles([...e.target.files], false);
    e.target.value = '';
  };
  root.querySelector('#up-folder').onchange = async (e) => {
    await uploadFiles([...e.target.files], true);
    e.target.value = '';
  };

  els.compileBtn.onclick = () => compile(true);
  root.querySelector('#btn-fix-clash').onclick = async () => {
    const btn = root.querySelector('#btn-fix-clash');
    btn.disabled = true;
    btn.textContent = '修复中…';
    try {
      const res = await api.post(`/api/projects/${projectId}/fix-clashes`);
      knownIssues = [];
      if (res.fixed) {
        toast(res.warning || '已修复，正在重新编译', 'ok');
        // 服务端已同步 Yjs 文档；若当前打开的是主文件，重新取一次内容确保视图同步
        if (activePath === project.mainFile) {
          try { await openFile(project.mainFile); } catch { /* ignore */ }
        }
        await compile(true);
      } else {
        toast('未发现可自动修复的冲突（可能需要手动调整）', 'err');
        btn.style.display = 'none';
      }
    } catch (err) {
      toast(err.message, 'err');
    } finally {
      btn.disabled = false;
      btn.innerHTML = `${icon('shield')}一键修复`;
    }
  };
  root.querySelector('#btn-pdf-toggle').onclick = () => {
    pdfVisible = !pdfVisible;
    localStorage.setItem('ls.pdf', pdfVisible ? '1' : '0');
    els.panePdf.style.display = pdfVisible ? 'flex' : 'none';
    if (pdfVisible && !currentCompile?.ok) compile(false);
  };
  root.querySelector('#pdf-close').onclick = () => {
    pdfVisible = false;
    localStorage.setItem('ls.pdf', '0');
    els.panePdf.style.display = 'none';
  };
  root.querySelector('#pdf-refresh').onclick = () => compile(true);
  root.querySelector('#pdf-zoom-in').onclick = () => pdfViewer.zoomBy(0.15);
  root.querySelector('#pdf-zoom-out').onclick = () => pdfViewer.zoomBy(-0.15);
  root.querySelector('#pdf-zoom-label').onclick = () => pdfViewer.setZoom(1);
  root.querySelector('#pdf-download').onclick = (e) => {
    if (!currentCompile?.ok) { e.preventDefault(); compile(true); }
  };
  root.querySelector('#log-close').onclick = () => { els.logPanel.style.display = 'none'; };
  root.querySelectorAll('.log-tabs button').forEach((btn) => {
    btn.onclick = () => {
      logTab = btn.dataset.tab;
      root.querySelectorAll('.log-tabs button').forEach((b) => b.classList.toggle('active', b === btn));
      if (currentCompile) renderLog(currentCompile);
    };
  });

  root.querySelector('#btn-share').onclick = openShare;
  root.querySelector('#user-chip').onclick = (e) => {
    dropdown(e.currentTarget, [
      { meta: { title: user.name, sub: user.email } },
      { key: 'extensions', label: '插件中心', icon: 'grid', onClick: () => openExtensionsManager(user) },
      { key: 'ai-config', label: 'AI API 配置', icon: 'settings', onClick: () => openAiSettings(user) },
      { key: 'notifications', label: '讨论通知', icon: 'message', onClick: openNotifications },
      { key: 'logout', label: '退出登录', icon: 'logout', danger: true, onClick: async () => {
        await api.post('/api/auth/logout');
        location.hash = '';
        location.reload();
      } },
    ]);
  };

  /* 分割条拖动 */
  const splitter = root.querySelector('#splitter');
  splitter.addEventListener('mousedown', (down) => {
    down.preventDefault();
    const startX = down.clientX;
    const startW = els.panePdf.getBoundingClientRect().width;
    const mainW = els.panePdf.parentElement.getBoundingClientRect().width;
    const onMove = (move) => {
      const w = Math.min(Math.max(240, startW - (move.clientX - startX)), mainW - 320);
      els.panePdf.style.width = `${w}px`;
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      localStorage.setItem('ls.pdfw', els.panePdf.style.width);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  async function openShare() {
    let members = [];
    try { members = (await api.get(`/api/projects/${projectId}/members`)).members; } catch { /* ignore */ }
    const link = `${location.origin}/#/p/${projectId}`;
    const { root: m, close } = modal({
      title: '共享项目',
      subtitle: '按职责共享：编辑者、审阅者、只读成员',
      bodyHtml: `
        ${project.role === 'owner' ? `<div class="field">
          <label>邀请成员</label>
          <div style="display:flex;gap:8px">
            <input class="input" id="invite-email" placeholder="teammate@example.com" />
            <select class="input" id="invite-role" aria-label="邀请成员角色"><option value="editor">编辑者</option><option value="reviewer">审阅者</option><option value="viewer">只读</option></select>
            <button class="btn btn-primary" id="invite-btn">邀请</button>
          </div>
        </div>` : '<p class="src-note">只有所有者可以邀请成员或更改权限。</p>'}
        <p class="src-note">编辑者可改稿；审阅者可评论与提出建议；只读成员仅浏览。修改权限会立即断开旧协作连接。</p>
        <div style="margin-top:6px">
          <div style="font-size:12.5px;font-weight:600;color:var(--text-2);margin-bottom:8px">成员（${members.length}）</div>
          <div id="member-list">
            ${members.map((mem) => `<div style="display:flex;align-items:center;gap:9px;padding:6px 0">
              ${avatarHtml(mem, 'avatar-sm')}
              <div style="flex:1"><div style="font-size:13px">${escapeHtml(mem.name)}</div>
              <div style="font-size:11.5px;color:var(--muted)">${escapeHtml(mem.email)}</div></div>
              ${mem.role !== 'owner' && project.role === 'owner' ? `<select class="input member-role" aria-label="${escapeHtml(mem.name)}的权限" data-member-role="${mem.id}">${[['editor','编辑者'],['reviewer','审阅者'],['viewer','只读']].map(([value,label]) => `<option value="${value}" ${value === mem.role ? 'selected' : ''}>${label}</option>`).join('')}</select>` : `<span class="badge">${({owner:'所有者',editor:'编辑者',reviewer:'审阅者',viewer:'只读'})[mem.role] || mem.role}</span>`}
              ${mem.role !== 'owner' && project.role === 'owner' ? `<button class="btn btn-ghost btn-sm" data-remove="${mem.id}">移除</button>` : ''}
            </div>`).join('')}
          </div>
        </div>
        <div class="field" style="margin-top:14px;margin-bottom:0">
          <label>项目链接（仅已加入的成员可以访问）</label>
          <div style="display:flex;gap:8px">
            <input class="input" value="${escapeHtml(link)}" readonly />
            <button class="btn" id="copy-link">复制</button>
          </div>
        </div>`,
      footerHtml: '<button class="btn" data-act="done">完成</button>',
    });
    m.querySelector('[data-act="done"]').onclick = close;
    m.querySelector('#copy-link').onclick = async () => {
      try { await navigator.clipboard.writeText(link); toast('链接已复制', 'ok'); } catch { toast('复制失败', 'err'); }
    };
    m.querySelector('#invite-btn')?.addEventListener('click', async () => {
      const email = m.querySelector('#invite-email').value.trim();
      if (!email) return;
      try {
        await api.post(`/api/projects/${projectId}/members`, { email, role: m.querySelector('#invite-role').value });
        toast('已添加成员', 'ok');
        close();
        openShare();
      } catch (err) { toast(err.message, 'err'); }
    });
    m.querySelectorAll('[data-member-role]').forEach((select) => { select.onchange = async () => {
      try { await api.patch(`/api/projects/${projectId}/members/${select.dataset.memberRole}`, { role: select.value }); toast('成员权限已更新', 'ok'); }
      catch (error) { toast(error.message, 'err'); }
    }; });
    m.querySelectorAll('[data-remove]').forEach((btn) => {
      btn.onclick = async () => {
        try {
          await api.del(`/api/projects/${projectId}/members/${btn.dataset.remove}`);
          close();
          openShare();
        } catch (err) { toast(err.message, 'err'); }
      };
    });
  }

  /* ---------- 版本历史 ---------- */
  async function openHistory() {
    if (!activePath) { toast('请先打开一个文件', 'err'); return; }
    let versions = [];
    try {
      versions = (await api.get(`/api/projects/${projectId}/versions?path=${encodeURIComponent(activePath)}`)).versions;
    } catch (err) { toast(err.message, 'err'); return; }

    const { root: m, close } = modal({
      title: '历史版本',
      subtitle: `${activePath} · 自动保存快照，每个文件最多保留 40 个`,
      wide: true,
      bodyHtml: `
        <div class="history-wrap">
          <div class="history-list" id="hist-list">
            ${versions.length ? versions.map((v, i) => `
              <button class="history-item ${i === 0 ? 'active' : ''}" data-vid="${v.id}">
                <b>${new Date(v.created_at).toLocaleString('zh-CN')}</b>
                <span>${escapeHtml(v.author || '自动保存')} · ${v.size} 字符</span>
              </button>`).join('') : '<div class="log-empty">暂无历史版本</div>'}
          </div>
          <div class="history-detail">
            <div class="history-meta" id="hist-meta">选择左侧版本查看内容</div>
            <textarea id="hist-preview" class="input" readonly spellcheck="false"></textarea>
          </div>
        </div>`,
      footerHtml: `
        <button class="btn" id="hist-save">保存当前版本</button>
        <button class="btn" data-act="cancel">取消</button>
        <button class="btn btn-primary" id="hist-restore" disabled>恢复此版本</button>`,
    });

    const preview = m.querySelector('#hist-preview');
    const meta = m.querySelector('#hist-meta');
    const restoreBtn = m.querySelector('#hist-restore');
    let selected = null;

    async function selectVersion(vid, btn) {
      try {
        const v = await api.get(`/api/projects/${projectId}/versions/${vid}`);
        preview.value = v.content;
        meta.textContent = `${new Date(v.createdAt).toLocaleString('zh-CN')} · ${v.content.length} 字符`;
        selected = vid;
        restoreBtn.disabled = false;
        m.querySelectorAll('.history-item').forEach((b) => b.classList.toggle('active', b === btn));
      } catch (err) { toast(err.message, 'err'); }
    }

    m.querySelectorAll('.history-item').forEach((btn) => {
      btn.onclick = () => selectVersion(btn.dataset.vid, btn);
    });
    const firstItem = m.querySelector('.history-item');
    if (firstItem) selectVersion(firstItem.dataset.vid, firstItem);

    m.querySelector('[data-act="cancel"]').onclick = close;
    m.querySelector('#hist-save').onclick = async () => {
      try {
        const entry = docs.get(activePath);
        const content = entry
          ? entry.ytext.toString()
          : (await api.get(`/api/projects/${projectId}/file?path=${encodeURIComponent(activePath)}`)).content;
        await api.post(`/api/projects/${projectId}/versions`, { path: activePath, content });
        close();
        toast('已保存当前版本', 'ok');
      } catch (err) { toast(err.message, 'err'); }
    };
    restoreBtn.onclick = async () => {
      if (!selected) return;
      try {
        await api.post(`/api/projects/${projectId}/versions/${selected}/restore`, {});
        close();
        await refreshTree();
        await openFile(activePath);
        toast('版本已恢复', 'ok');
        scheduleCompile();
      } catch (err) { toast(err.message, 'err'); }
    };
  }

  /* 自动编译 */
  const scheduleCompile = (() => {
    let timer = null;
    return () => {
      if (!autoCompile) return;
      clearTimeout(timer);
      timer = setTimeout(() => compile(false), isBrowserEngine(project.engine) ? 650 : 1800);
    };
  })();
  // 只有本地键入触发自动编译；远程同步的改动由项目事件通道统一广播编译结果，避免每人各编译一次
  onDocChange = (update) => {
    if (update.transactions.some((tr) => tr.annotation(ySyncAnnotation))) return;
    scheduleCompile();
    research?.scheduleReview(update);
  };

  const keyHandler = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      compile(true);
    }
  };
  window.addEventListener('keydown', keyHandler);

  /* 恢复侧栏宽度 */
  const savedW = localStorage.getItem('ls.pdfw');
  if (savedW) els.panePdf.style.width = savedW;

  /* 首次加载 */
  renderTabs();
  renderTree();
  renderCrowd();
  connectEvents();
  comments.load();
  updateEngineStatus();
  // 打开项目就发现的宏包选项冲突：提前提示，避免用户先撞上编译失败
  if (knownIssues.length) {
    renderLog({ ok: false, errors: [], warnings: [], ms: 0 });
    toast(`检测到 ${knownIssues.length} 处可修复的编译问题`, 'err');
  }
  const first = project.mainFile && findFile(tree, project.mainFile) ? project.mainFile : firstFile(tree);
  if (first) await openFile(first);
  if (initialLocation.file && findFile(tree, initialLocation.file)) {
    await openFile(initialLocation.file);
    const line = Math.max(1, Math.min(view.state.doc.lines, Number(initialLocation.line) || 1));
    const position = view.state.doc.line(line).from;
    view.dispatch({ selection: { anchor: position }, effects: EditorView.scrollIntoView(position, { y: 'center' }) });
  }
  if (initialLocation.comment) comments.focusThread(initialLocation.comment);
  if (!canEdit) {
    root.querySelector('#proj-name').readOnly = true;
    for (const id of ['btn-new-file', 'btn-upload', 'btn-fix-clash']) root.querySelector('#' + id).disabled = true;
  }

  // 初次编译
  setTimeout(() => {
    if (pdfVisible) compile(false);
  }, 300);

  return () => {
    vimModule?.releaseVim(view);
    browserTeX.destroy(); if (browserPdf) URL.revokeObjectURL(browserPdf);
    window.removeEventListener('keydown', keyHandler);
    eventClosed = true;
    try { comments?.destroy(); } catch { /* ignore */ }
    try { research?.destroy(); } catch { /* ignore */ }
    closeExtensionWindows();
    try { eventWs?.close(); } catch { /* ignore */ }
    try { pdfViewer.destroy(); } catch { /* ignore */ }
    try { binaryViewer?.destroy(); } catch { /* ignore */ }
    for (const entry of docs.values()) {
      try { entry.provider.destroy(); } catch { /* ignore */ }
      try { entry.doc.destroy(); } catch { /* ignore */ }
    }
    docs.clear();
    view.destroy();
  };
}

function findFile(nodes, path) {
  for (const node of nodes) {
    if (node.type === 'file' && node.path === path) return node;
    if (node.type === 'dir') {
      const found = findFile(node.children, path);
      if (found) return found;
    }
  }
  return null;
}

function firstFile(nodes) {
  for (const node of nodes) {
    if (node.type === 'file' && node.name.endsWith('.tex')) return node.path;
    if (node.type === 'dir') {
      const found = firstFile(node.children);
      if (found) return found;
    }
  }
  for (const node of nodes) {
    if (node.type === 'file') return node.path;
  }
  return null;
}
