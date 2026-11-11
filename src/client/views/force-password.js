import { api } from '../api.js';
import { icon, escapeHtml } from '../ui.js';

/** 管理员初始密码 / 被重置过密码的账号，登录后先强制改密 */
export function renderForcePassword(root, { user, onDone, onLogout }) {
  let busy = false;

  root.innerHTML = `<div class="auth-wrap narrow">
    <section class="auth-panel full">
      <div class="auth-card">
        <div class="wx-head">
          <span class="wx-badge">${icon('key')}</span>
          <div>
            <h2>请修改密码</h2>
            <p class="sub">${escapeHtml(user.email)} 当前使用的是初始密码或管理员重置的密码</p>
          </div>
        </div>
        <div id="fp-error"></div>
        <form class="auth-form" id="fp-form">
          <div class="field">
            <label for="fp-current">当前密码</label>
            <input class="input" id="fp-current" type="password" autocomplete="current-password" required />
          </div>
          <div class="field">
            <label for="fp-next">新密码</label>
            <input class="input" id="fp-next" type="password" placeholder="8–64 位，至少 3 个不同字符" autocomplete="new-password" required />
          </div>
          <div class="field">
            <label for="fp-confirm">确认新密码</label>
            <input class="input" id="fp-confirm" type="password" autocomplete="new-password" required />
          </div>
          <button class="btn btn-primary btn-block" type="submit" id="fp-submit">保存并进入</button>
        </form>
        <button class="btn btn-ghost btn-block" id="fp-logout" style="margin-top:10px">退出登录</button>
      </div>
    </section>
  </div>`;

  const errorBox = root.querySelector('#fp-error');
  root.querySelector('#fp-logout').onclick = onLogout;
  root.querySelector('#fp-current').focus();

  root.querySelector('#fp-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (busy) return;
    const current = root.querySelector('#fp-current').value;
    const next = root.querySelector('#fp-next').value;
    const confirm = root.querySelector('#fp-confirm').value;
    errorBox.innerHTML = '';
    if (next !== confirm) {
      errorBox.innerHTML = '<div class="auth-error">两次输入的新密码不一致</div>';
      return;
    }
    busy = true;
    const submit = root.querySelector('#fp-submit');
    submit.disabled = true;
    submit.innerHTML = '<span class="spinner"></span>';
    try {
      const data = await api.post('/api/auth/password', { current, next });
      onDone(data.user);
    } catch (err) {
      errorBox.innerHTML = `<div class="auth-error">${escapeHtml(err.message)}</div>`;
      busy = false;
      submit.disabled = false;
      submit.textContent = '保存并进入';
    }
  });
}
