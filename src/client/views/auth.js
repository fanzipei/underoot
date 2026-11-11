import { api } from '../api.js';
import { icon, escapeHtml } from '../ui.js';

export function renderAuth(root, { onSuccess, initialMode = 'login', preset = {}, notice = '' } = {}) {
  // 注意：切换标签会重新渲染整个视图，mode 必须由调用方传入，
  // 否则递归调用会把状态重置为 login，导致「注册」按钮看起来毫无反应。
  const mode = initialMode === 'register' ? 'register' : 'login';
  let busy = false;
  let pending = null;
  let config = null;

  const go = (payload, message) => {
    pending = { email: payload.email, message };
    paint();
  };

  root.innerHTML = `
    <div class="auth-wrap">
      <section class="auth-hero">
        <div class="auth-brand">
          <span class="mark" aria-label="underoot"><svg width="24" height="24" viewBox="0 0 32 32" aria-hidden="true"><path d="M5 17l4-2 5 10 6-18h8" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" /></svg></span><span>underoot</span>
        </div>
        <div class="auth-showcase">
          <div class="code-peek">
            <div class="bar">
              <span class="dot"></span><span class="dot"></span><span class="dot"></span>
              <span class="fname">main.tex</span>
            </div>
            <pre><span class="cl"><span class="kw">\\documentclass</span>{article}</span><span class="cl"><span class="kw">\\begin</span>{document}</span><span class="cl">  <span class="kw">\\section</span>{Introduction}</span><span class="cl">  Hello, <span class="kw">\\LaTeX</span>!</span><span class="cl"><span class="kw">\\end</span>{document}</span></pre>
          </div>
          <div class="peek-status"><span class="ok-dot"></span>编译成功<span class="sep">·</span>1 页</div>
        </div>
      </section>

      <section class="auth-panel">
        <div class="auth-card" id="auth-card"></div>
      </section>
    </div>`;

  const card = root.querySelector('#auth-card');

  function paint() {
    if (pending) {
      card.innerHTML = `
        <div class="auth-state">
          <span class="state-icon ok">${icon('clock')}</span>
          <h2>注册申请已提交</h2>
          <p class="sub">账号 <b>${escapeHtml(pending.email)}</b> 正在等待管理员审批。</p>
          <div class="auth-state-note">${escapeHtml(pending.message || '审批通过后即可用这个邮箱和密码登录。')}</div>
          <button class="btn btn-block" id="back-login">返回登录</button>
        </div>`;
      card.querySelector('#back-login').onclick = () => { pending = null; paint(); };
      return;
    }

    card.innerHTML = `
      <h2>${mode === 'login' ? '登录' : '创建账号'}</h2>
      <div class="auth-tabs">
        <button type="button" data-mode="login" class="${mode === 'login' ? 'active' : ''}">登录</button>
        <button type="button" data-mode="register" class="${mode === 'register' ? 'active' : ''}">注册</button>
      </div>
      <div id="auth-error">${notice ? `<div class="auth-notice">${escapeHtml(notice)}</div>` : ''}</div>
      <form class="auth-form" id="auth-form">
        ${mode === 'register' ? `
        <div class="field">
          <label for="name">昵称</label>
          <input class="input" id="name" name="name" placeholder="例如：张三" autocomplete="nickname" value="${escapeHtml(preset.name || '')}" />
        </div>` : ''}
        <div class="field">
          <label for="email">邮箱</label>
          <input class="input" id="email" name="email" type="email" placeholder="you@example.com" autocomplete="username" required value="${escapeHtml(preset.email || '')}" />
        </div>
        <div class="field">
          <label for="password">密码</label>
          <input class="input" id="password" name="password" type="password" placeholder="8–64 位，至少 3 个不同字符" autocomplete="${mode === 'register' ? 'new-password' : 'current-password'}" required value="${escapeHtml(preset.password || '')}" />
        </div>
        <button class="btn btn-primary" type="submit" id="auth-submit">
          ${mode === 'login' ? '登录' : '提交注册申请'}
        </button>
      </form>`;

    const errorBox = card.querySelector('#auth-error');
    const submit = card.querySelector('#auth-submit');

    card.querySelectorAll('[data-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const nextMode = btn.dataset.mode;
        if (mode === nextMode) return;
        renderAuth(root, {
          onSuccess,
          initialMode: nextMode,
          notice: '',
          // 保留已输入的内容，避免切换标签后要重新填写
          preset: {
            name: card.querySelector('#name')?.value || preset.name || '',
            email: card.querySelector('#email')?.value || preset.email || '',
            password: card.querySelector('#password')?.value || '',
          },
        });
      });
    });

    const showError = (msg) => {
      errorBox.innerHTML = msg ? `<div class="auth-error">${escapeHtml(msg)}</div>` : '';
    };

    card.querySelector('#auth-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (busy) return;
      busy = true;
      submit.disabled = true;
      submit.innerHTML = '<span class="spinner"></span>';
      showError('');
      const form = new FormData(e.target);
      const payload = {
        email: String(form.get('email') || '').trim(),
        password: String(form.get('password') || ''),
      };
      if (mode === 'register') payload.name = String(form.get('name') || '').trim();
      try {
        const data = await api.post(`/api/auth/${mode}`, payload);
        if (data.pending) {
          go({ email: payload.email }, data.message);
          return;
        }
        onSuccess(data.user);
      } catch (err) {
        showError(err.message);
        busy = false;
        submit.disabled = false;
        submit.textContent = mode === 'login' ? '登录' : '提交注册申请';
      }
    });

    card.querySelector('#email').focus();
  }

  paint();
}
