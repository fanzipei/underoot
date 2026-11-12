/* underoot Extension SDK v1. Runs only inside the host's sandboxed plugin frame. */
(() => {
  const params = new URLSearchParams(location.hash.slice(1));
  const channel = params.get('channel'); const parentOrigin = params.get('parentOrigin');
  const pending = new Map(); let sequence = 0; let context = null; let initialized;
  const ready = new Promise((resolve) => { initialized = resolve; });
  window.addEventListener('message', (event) => {
    if (event.source !== parent || event.origin !== parentOrigin || event.data?.channel !== channel) return;
    if (event.data.type === 'underoot:init') { context = Object.freeze(event.data.context || {}); initialized(context); return; }
    if (event.data.type !== 'underoot:response') return;
    const request = pending.get(event.data.id); if (!request) return;
    clearTimeout(request.timer); pending.delete(event.data.id);
    if (event.data.error) request.reject(new Error(event.data.error)); else request.resolve(event.data.result);
  });
  async function request(method, args = {}) {
    await ready;
    const id = String(++sequence);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('插件请求超时')); }, 120000);
      pending.set(id, { resolve, reject, timer });
      parent.postMessage({ type: 'underoot:request', channel, id, method, args }, parentOrigin);
    });
  }
  window.underoot = Object.freeze({
    apiVersion: 1, ready, get context() { return context; },
    getProject: () => request('project.read'), getSelection: () => request('selection.read'),
    getPdfSelection: () => request('pdf.read'), complete: (input) => request('ai.complete', input),
    propose: (suggestion) => request('suggestions.propose', suggestion), getComments: () => request('comments.list'),
    addComment: (comment) => request('comments.add', comment), notify: (message) => request('ui.notify', { message }),
    documents: Object.freeze({ list: () => request('documents.read'), read: (path) => request('documents.read', { path }),
      write: (document) => request('documents.write', document), convert: (document) => request('documents.convert', document) }),
    storage: Object.freeze({ get: async (key) => (await request('storage.get', { key })).value,
      set: (key, value) => request('storage.set', { key, value }) }),
  });
})();
