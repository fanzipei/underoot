import { api } from './api.js';
import { modal, escapeHtml as e, toast } from './ui.js';
export async function openGitSync(project) {
 try {
  const base = `/api/workspace/projects/${project.id}/git`;
  const config = await api.get(base); let plan;
  const { root, close } = modal({ title: 'GitHub / GitLab 版本同步', wide: true,
   bodyHtml: `<p class="src-note">上传当前论文源码和素材，保留远端其他文件。凭据仅供你在此项目使用，加密保存。先预览，再明确提交；不会自动推送或强制覆盖远端提交。</p>
    <div class="field"><label>服务</label><select class="input" id="git-provider"><option value="github">GitHub</option><option value="gitlab">GitLab / 自建 GitLab</option></select></div>
    <div class="field"><label>HTTPS 仓库 URL</label><input class="input" id="git-url" value="${e(config.url || '')}" placeholder="https://github.com/your-name/paper" /></div>
    <div class="field"><label>分支（先在远端创建分支，空仓库可初始化）</label><input class="input" id="git-branch" value="${e(config.branch || 'main')}" /></div>
    <div class="field"><label>个人访问 Token（${config.configured ? '已保存，留空保留' : '尚未配置'}）</label><input class="input" id="git-token" type="password" autocomplete="new-password" placeholder="GitHub: Contents 读写；GitLab: api" /></div>
    <div class="assistant-buttons"><button class="btn" id="git-save">保存配置</button><button class="btn" id="git-preview">预览提交</button></div><div id="git-plan" class="src-note"></div>
    <div class="field"><label>提交说明</label><input class="input" id="git-message" value="Update manuscript from underoot" /></div><p class="src-note">上次同步：${e(config.lastCommit || '未同步')}。从界面移除凭据不会删除远端仓库。</p>`,
   footerHtml: '<button class="btn" id="git-clear">移除我的凭据</button><button class="btn" id="git-close">关闭</button><button class="btn btn-primary" id="git-push" disabled>确认提交到远端</button>' });
  const q = (id) => root.querySelector('#git-' + id);
  q('provider').value = config.provider || 'github';
  const invalidate = () => { plan = null; q('push').disabled = true; q('plan').textContent = '配置已修改，请先保存，再重新预览。'; };
  ['provider','url','branch','token'].forEach((id) => q(id).addEventListener('input', invalidate));
  const save = async (token) => { await api.put(base, { provider: q('provider').value, url: q('url').value.trim(), branch: q('branch').value.trim(), token }); q('token').value = ''; invalidate(); };
  q('save').onclick = async () => { try { await save(q('token').value); toast('Git 配置已加密保存', 'ok'); } catch (err) { toast(err.message, 'err'); } };
  q('clear').onclick = async () => { try { await save(null); q('plan').textContent = '凭据已移除'; } catch (err) { toast(err.message, 'err'); } };
  q('close').onclick = close;
  q('preview').onclick = async () => {
   q('preview').disabled = true; q('push').disabled = true;
   try { plan = await api.post(base+'/preview', {}); q('plan').innerHTML = `<p>远端 ${e(plan.head || '空仓库')} · ${plan.changes.length} 项变化</p>${plan.changes.map((c) => `<div>${e(c.action)} ${e(c.path)}${c.overwrite ? ' · 首次同步将替换同名文件' : ''}</div>`).join('')}${plan.conflicts.map((p) => `<div>冲突：${e(p)}（先合并远端修改）</div>`).join('')}`; q('push').disabled = !!plan.conflicts.length || !plan.changes.length; }
   catch (err) { toast(err.message, 'err'); } finally { q('preview').disabled = false; }
  };
  q('push').onclick = async () => {
   q('push').disabled = true;
   try { const result = await api.post(base+'/push', { digest: plan.digest, message: q('message').value }); q('plan').textContent = result.unchanged ? '没有需要提交的变化' : `已提交 ${result.count} 个文件：${result.commit}`; toast('Git 同步完成', 'ok'); plan = null; }
   catch (err) { q('plan').textContent = err.message + '；请重新预览。'; }
  };
 } catch (err) { toast(err.message, 'err'); }
}
