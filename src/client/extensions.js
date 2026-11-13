import { api } from './api.js';
import { modal, toast, escapeHtml as e, confirmDialog } from './ui.js';
import { activate as assistant } from '../../extensions/builtin/underoot.assistant/activate.mjs';
import { activate as discovery } from '../../extensions/builtin/underoot.discovery/activate.mjs';
import { activate as publishing } from '../../extensions/builtin/underoot.publishing/activate.mjs';
import { activate as templates } from '../../extensions/builtin/underoot.templates/activate.mjs';
import { activate as vim } from '../../extensions/builtin/underoot.vim/activate.mjs';
import {openTemplateLibrary}from'./template-library.js';

const activators = { 'underoot.assistant': assistant, 'underoot.discovery': discovery, 'underoot.publishing': publishing, 'underoot.templates':templates,'underoot.vim':vim };
export const loadExtensions = async () => (await api.get('/api/extensions')).extensions;
export const enabledExtension = (items, id) => items.some((item) => item.id === id && item.enabled);
export function closeExtensionWindows() { document.querySelectorAll('.extension-window').forEach((window) => window.remove()); }

export function extensionCommands(items, actions, context = {}) {
  const commands = [];
  const host = { actions, registerCommand(command, run) {
    if (command.when !== 'all' && command.when !== (context.project ? 'editor' : 'workspace')) return () => {};
    commands.push({ key: command.id, label: command.title, icon: 'grid', onClick: run });
    return () => {};
  } };
  for (const extension of items.filter((item) => item.enabled)) {
    if (extension.id === 'underoot.publishing' && context.project && !['owner','editor'].includes(context.project.role)) continue;
    if (extension.builtin && extension.runtime !== 'iframe') activators[extension.id]?.(host, extension);
    else for (const command of extension.contributes.commands) host.registerCommand(command, () => openExtension(extension, command, context));
  }
  return commands;
}

export function openExtension(extension, command, context) {
  closeExtensionWindows();
  const windowEl = document.createElement('section');
  windowEl.className = 'extension-window';
  if (['underoot.markdown','research.markdown','underoot.tables','research.tables'].includes(extension.id)) { windowEl.style.width = 'min(1100px, 95vw)'; windowEl.style.height = 'min(780px, 90vh)'; }
  const channel = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
  const fragment = new URLSearchParams({ channel, parentOrigin: location.origin, command: command.id });
  const src = `/extensions/${extension.id}/${extension.version}/${extension.entry}#${fragment}`;
  windowEl.innerHTML = `<div class="extension-window-head"><b>√ ${e(extension.name)}</b><span class="spacer"></span>${context.openProposals ? '<button class="btn btn-sm" data-proposals>查看建议</button>' : ''}<button class="btn btn-sm" data-close aria-label="关闭插件窗口">×</button></div><div class="extension-window-meta">${e(extension.id)} · v${e(extension.version)} · 隔离插件 <details><summary>已声明权限</summary>${extension.permissions.map((permission) => `<div>${e(permission)}</div>`).join('')}</details></div><iframe title="${e(extension.name)}" sandbox="allow-scripts" referrerpolicy="no-referrer" src="${e(src)}"></iframe>`;
  document.body.appendChild(windowEl);
  const frame = windowEl.querySelector('iframe');
  let closed = false; let pending = 0;
  const reply = (id, result, error) => { if (!closed) frame.contentWindow?.postMessage({ type: 'underoot:response', channel, id, result, error }, '*'); };
  const listener = async (event) => {
    if (closed || event.source !== frame.contentWindow || event.data?.type !== 'underoot:request' || event.data.channel !== channel) return;
    const { id, method, args } = event.data;
    if (typeof id !== 'string' || id.length > 80 || pending >= 3) { reply(id, null, '同时最多处理 3 个插件请求'); return; }
    pending++;
    try {
      const body = { method, args, projectId: context.project?.id };
      if (method === 'selection.read' && extension.permissions.includes('selection.read')) body.context = { selection: context.getSelection?.() || null };
      if (method === 'pdf.read' && extension.permissions.includes('pdf.read')) body.context = { pdf: await context.getPdfSelection?.() };
      if (method === 'ai.complete') {
        if (!extension.permissions.includes('ai.invoke')) throw new Error('插件未声明 ai.invoke 权限');
        if (!await confirmDialog({ title: `插件「${extension.name}」请求调用模型`, message: '将把插件提供的选区或研究内容发送到管理员配置的模型服务，可能产生费用。插件无法获取 API Key。', confirmText: '发送并调用模型' })) throw new Error('作者取消了模型调用');
        body.consent = true;
      }
      if (method === 'documents.write') {
        if (!extension.permissions.includes('documents.write')) throw new Error('插件未声明 documents.write 权限');
        if (!await confirmDialog({ title: `插件「${extension.name}」请求保存文档`, message: `文件：${String(args?.path || '')}\n${args?.hash === null ? '创建新文件' : '替换已有文件（保留历史）'}\n\n${String(args?.content || '').slice(0, 3000)}`, confirmText: '确认保存' })) throw new Error('作者取消了文档保存');
        body.consent = true;
      }
      if(method==='publishing.templates.register'){
       if(!extension.permissions.includes('publishing.templates.write'))throw Error('插件未声明模板注册权限');
       if(!await confirmDialog({title:`插件「${extension.name}」请求保存个人模板`,message:`${String(args?.template?.name||'').slice(0,100)} · ${String(args?.template?.kind||'')}\n强调色 ${String(args?.template?.accent||'')}，背景 ${String(args?.template?.background||'')}。仅保存经过校验的视觉参数，不执行插件提供的 LaTeX。`,confirmText:'确认保存模板'}))throw Error('用户取消了模板注册');body.consent=true;
      }
      const { result } = await api.post(`/api/extensions/${extension.id}/rpc`, body);
      if(method==='publishing.templates.extract'&&result.hostPicker){const template=await openTemplateLibrary({kind:args?.kind==='poster'?'poster':'slides'});reply(id,{template});return;}
      if (method === 'ui.notify') toast(`${extension.name}：${result.message}`, 'ok');
      reply(id, result);
    } catch (error) { reply(id, null, error.message); }
    finally { pending--; }
  };
  window.addEventListener('message', listener);
  frame.onload = () => frame.contentWindow?.postMessage({ type: 'underoot:init', channel, context: { apiVersion: 1, command: command.id,
    project: context.project ? { id: context.project.id, name: context.project.name, role: context.project.role } : null } }, '*');
  windowEl.querySelector('[data-close]').onclick = () => windowEl.remove();
  windowEl.querySelector('[data-proposals]')?.addEventListener('click', () => { windowEl.remove(); context.openProposals(); });
  const observer = new MutationObserver(() => {
    if (windowEl.isConnected) return;
    closed = true; window.removeEventListener('message', listener); observer.disconnect();
  });
  observer.observe(document.body, { childList: true });
  const header = windowEl.querySelector('.extension-window-head');
  header.onpointerdown = (event) => {
    if (event.target.closest('button')) return;
    const box = windowEl.getBoundingClientRect(); const x = event.clientX; const y = event.clientY;
    const move = (next) => { windowEl.style.left = `${Math.max(0, Math.min(innerWidth - 160, box.left + next.clientX - x))}px`; windowEl.style.top = `${Math.max(0, Math.min(innerHeight - 60, box.top + next.clientY - y))}px`; windowEl.style.right = 'auto'; };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };
}

export async function openExtensionsManager(user) {
  try {
    const data = await api.get('/api/extensions');
    const admin = user.role === 'admin'; let inspected = null; let picked = null; let changed = false;
    const { root: m, close } = modal({ title: 'underoot 插件中心', subtitle: '本地安装、按权限扩展、共享研究工具 · Extension API v1', wide: true,
      bodyHtml: `${admin ? `<div class="extension-install"><label for="extension-zip">安装插件 ZIP（≤10 MB）</label><input class="input" type="file" id="extension-zip" accept=".zip" /><button class="btn" id="extension-inspect">检查清单和权限</button><div id="extension-preview"></div></div>` : '<p class="src-note">所有成员可使用已启用的插件；只有管理员可安装、启停和卸载。</p>'}
        <p class="src-note">核心保留项目、协作、讨论、版本和凭据。下面的内置功能已作为可独立停用的插件提供；第三方 ZIP 使用隔离窗口和受控宿主 API。</p>
        <div id="extension-list">${data.extensions.map((extension) => `<article class="extension-card"><div><b>${e(extension.name)}</b> <span class="badge">${extension.builtin ? '内置插件' : 'ZIP 插件'}</span><span class="badge">${extension.enabled ? '已启用' : '已停用'}</span></div><div class="src-note">${e(extension.id)} · ${e(extension.version)} · ${e(extension.author)}</div><p>${e(extension.description)}</p><details><summary>权限声明（${extension.permissions.length}）</summary>${extension.permissions.map((p) => `<div>${e(data.permissions[p] || p)}</div>`).join('')}</details><div class="assistant-buttons">${admin ? `<button class="btn btn-sm" data-toggle-extension="${extension.id}" data-enabled="${extension.enabled}">${extension.enabled ? '停用' : '启用'}</button>` : ''}${!extension.builtin && extension.enabled ? `<a class="btn btn-sm" href="/api/extensions/${extension.id}/download">下载 ZIP 分享</a>` : ''}${admin && !extension.builtin ? `<button class="btn btn-sm" data-remove-extension="${extension.id}">卸载</button>` : ''}</div></article>`).join('')}</div>
        <p class="src-note">示例插件：<a href="/api/extensions/examples/tables/download">表格编辑器 ZIP</a> · <a href="/api/extensions/examples/selection-notes/download">选区研究笔记 ZIP（无需模型）</a> · <a href="/api/extensions/examples/ai-claims/download">论证强度 AI 插件 ZIP</a> · <a href="/api/extensions/examples/markdown/download">Markdown 编辑与转换 ZIP</a> · <a href="/api/extensions/examples/template-pack/download">模板扩展与 PDF 提取 ZIP</a>。开发规范和打包工具随 GitHub 仓库分发。</p>`,
      footerHtml: '<button class="btn btn-primary" id="extension-done">完成</button>',
    });
    m.querySelector('#extension-done').onclick = () => { close(); if (changed) location.reload(); };
    const reload = async () => { close(); await openExtensionsManager(user); };
    m.querySelectorAll('[data-toggle-extension]').forEach((button) => { button.onclick = async () => {
      try { await api.patch(`/api/extensions/${button.dataset.toggleExtension}`, { enabled: button.dataset.enabled !== 'true' }); changed = true; close(); location.reload(); }
      catch (error) { toast(error.message, 'err'); }
    }; });
    m.querySelectorAll('[data-remove-extension]').forEach((button) => { button.onclick = async () => {
      if (!await confirmDialog({ title: '卸载插件', message: '将删除此插件的代码与个人插件设置。已经提出的论文建议和评论会保留。', confirmText: '卸载' })) return;
      try { await api.del(`/api/extensions/${button.dataset.removeExtension}`); close(); location.reload(); } catch (error) { toast(error.message, 'err'); }
    }; });
    m.querySelector('#extension-zip')?.addEventListener('change', (event) => { picked = event.target.files[0]; inspected = null; m.querySelector('#extension-preview').innerHTML = ''; });
    m.querySelector('#extension-inspect')?.addEventListener('click', async (event) => {
      if (!picked) { toast('请选择插件 ZIP', 'err'); return; }
      const button = event.currentTarget; button.disabled = true;
      try {
        const form = new FormData(); form.append('file', picked); inspected = await api.upload('/api/extensions/inspect', form);
        m.querySelector('#extension-preview').innerHTML = `<h4>${e(inspected.manifest.name)} · ${e(inspected.manifest.version)}</h4><p>${e(inspected.manifest.description)}</p><p class="src-note">安装后，拥有项目访问权的成员可运行该插件。请审核来源和下列权限；插件没有直接写稿或读取模型密钥的权限。</p><ul>${inspected.permissions.map((p) => `<li>${e(p.description)}</li>`).join('')}</ul><button class="btn btn-primary" id="extension-confirm">确认这些权限并安装</button>`;
        m.querySelector('#extension-confirm').onclick = async (event) => {
          event.currentTarget.disabled = true;
          try {
            const form = new FormData(); form.append('file', picked); form.append('digest', inspected.digest); form.append('confirmed', 'true');
            await api.upload('/api/extensions/install', form); changed = true; toast('插件已安装，在工具箱中可运行', 'ok'); close(); location.reload();
          } catch (error) { toast(error.message, 'err'); event.currentTarget.disabled = false; }
        };
      } catch (error) { toast(error.message, 'err'); }
      finally { button.disabled = false; }
    });
  } catch (error) { toast(error.message, 'err'); }
}
