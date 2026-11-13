const jsonHeaders = { 'Content-Type': 'application/json' };

async function request(path, options = {}) {
  const isForm = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const res = await fetch(path, {
    credentials: 'same-origin',
    ...options,
    headers: {
      ...(options.body && !isForm ? jsonHeaders : {}),
      ...(options.headers || {}),
    },
  });
  const isJson = (res.headers.get('content-type') || '').includes('application/json');
  const data = isJson ? await res.json().catch(() => ({})) : null;
  if (!res.ok) {
    const error = new Error(data?.error || `请求失败 (${res.status})`);
    error.status = res.status;
    throw error;
  }
  return data;
}

export const api = {
  get: (p, options) => request(p, options),
  post: (p, body) => request(p, { method: 'POST', body: JSON.stringify(body ?? {}) }),
  put: (p, body) => request(p, { method: 'PUT', body: JSON.stringify(body ?? {}) }),
  patch: (p, body) => request(p, { method: 'PATCH', body: JSON.stringify(body ?? {}) }),
  del: (p) => request(p, { method: 'DELETE' }),
  upload: (p, formData) => request(p, { method: 'POST', body: formData, headers: {} }),
};
