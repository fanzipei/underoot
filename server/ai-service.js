import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import net from 'node:net';
import https from 'node:https';
import http from 'node:http';
import { db, getSetting, setSetting, recordVersion, touchProject } from './db.js';
import { DATA_DIR, projectDir, resolveInside, normalizeRelPath } from './paths.js';
import { sourceFiles, digest, failure, snapshot } from './project-history.js';
import { flushProject, syncExternalWrite, broadcastProject } from './collab.js';

const CONFIG = 'assistant_config_v1';
const encryptionKey = () => crypto.createHash('sha256').update(process.env.LATEXSTUDIO_SECRET || fs.readFileSync(path.join(DATA_DIR, 'secret.key'))).digest();
export function seal(value) {
  if (!value) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const body = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), body].map((v) => v.toString('base64')).join('.');
}
export function unseal(value) {
  if (!value) return '';
  try {
    const [iv, tag, body] = value.split('.').map((v) => Buffer.from(v, 'base64'));
    const cipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), iv);
    cipher.setAuthTag(tag);
    return Buffer.concat([cipher.update(body), cipher.final()]).toString('utf8');
  } catch { throw failure(503, 'API 密钥无法解密，请管理员重新保存配置'); }
}
function privateAddress(address) {
  const value = address.toLowerCase();
  if (net.isIP(value) === 6) {
    // Deny mapped IPv4, local, multicast and non-global IPv6 ranges.
    return !/^[23][0-9a-f]{0,3}:/.test(value);
  }
  const parts = value.split('.').map(Number);
  return parts.length !== 4 || parts[0] === 0 || parts[0] === 10 || parts[0] === 127 || parts[0] >= 224
    || (parts[0] === 169 && parts[1] === 254) || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    || (parts[0] === 192 && parts[1] === 168) || (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127);
}
export async function validateEndpoint(value, { allowQuery = false, allowLocal = process.env.LATEXSTUDIO_AI_ALLOW_LOCAL === '1' } = {}) {
  let url;
  try { url = new URL(value); } catch { throw failure(400, '请填写有效的 API Base URL'); }
  const localAllowed = allowLocal;
  if (url.username || url.password || (!allowQuery && url.search) || url.hash || (!localAllowed && url.protocol !== 'https:')
    || !['https:', 'http:'].includes(url.protocol)) throw failure(400, 'API 地址必须为 HTTPS，且不能含账号、查询参数或片段');
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const records = net.isIP(hostname) ? [{ address: hostname, family: net.isIP(hostname) }]
    : await dns.lookup(hostname, { all: true }).catch(() => { throw failure(400, 'API 域名无法解析'); });
  if (!records.length || (!localAllowed && records.some((r) => privateAddress(r.address)))) throw failure(400, 'API 不允许访问内网地址；本地模型需管理员显式开启 LATEXSTUDIO_AI_ALLOW_LOCAL=1');
  return { url, records };
}

/** Pin validated DNS records and reject redirects; never forward credentials to a redirect. */
export async function remoteJSON(rawUrl, { body, key, timeout = 90000, method, allow404 = false, maxResponse = 2 * 1024 * 1024, allowLocal, signal } = {}) {
  const { url, records } = await validateEndpoint(rawUrl, { allowQuery: true, allowLocal });
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = (url.protocol === 'https:' ? https : http).request(url, {
      method: method || (body ? 'POST' : 'GET'), agent: false, signal,
      lookup: (_host, options, callback) => options.all ? callback(null, records) : callback(null, records[0].address, records[0].family),
      headers: { Accept: 'application/json', 'User-Agent': 'underoot/0.2', ...(key ? { Authorization: `Bearer ${key}` } : {}),
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}) },
    }, (response) => {
      if (allow404 && response.statusCode === 404) { response.resume(); resolve(null); return; }
      if (response.statusCode < 200 || response.statusCode >= 300) {
        response.resume(); reject(failure(response.statusCode === 409 || response.statusCode === 422 ? 409 : 502, `远程服务返回 HTTP ${response.statusCode}，请检查权限、配置或远端分支是否已变化`)); return;
      }
      let size = 0;
      const chunks = [];
      response.on('data', (chunk) => {
        size += chunk.length;
        if (size > maxResponse) req.destroy(failure(502, '服务响应超过大小上限'));
        else chunks.push(chunk);
      });
      response.on('error', () => reject(failure(502, '服务响应中断')));
      response.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
        catch { reject(failure(502, '服务未返回有效 JSON')); }
      });
    });
    req.setTimeout(timeout, () => req.destroy(failure(504, '服务请求超时，请稍后重试')));
    req.on('error', (error) => reject(failure(error.status || 502, error.status ? error.message : '无法连接服务，请检查 API 配置与网络')));
    req.end(payload);
  });
}

export function aiConfig(includeEndpoint = false) {
  const config = JSON.parse(getSetting(CONFIG)?.value || '{}');
  return { configured: !!(config.baseUrl && config.model && config.key), model: config.model || '', vision: !!config.vision,
    tokenLimitField: config.tokenLimitField || 'max_completion_tokens',
    ...(includeEndpoint ? { baseUrl: config.baseUrl || '', hasKey: !!config.key } : {}) };
}
export async function saveAiConfig(body, userId) {
  const previous = JSON.parse(getSetting(CONFIG)?.value || '{}');
  const baseUrl = String(body.baseUrl || '').trim().replace(/\/+$/, '');
  if (baseUrl) await validateEndpoint(baseUrl);
  const model = String(body.model || '').trim();
  if (model.length > 150) throw failure(400, '模型名过长');
  // Changing the endpoint requires entering the key again; never send an old key to a new host.
  let key = baseUrl === previous.baseUrl ? previous.key || '' : '';
  if (body.apiKey === null) key = '';
  else if (typeof body.apiKey === 'string' && body.apiKey.trim()) {
    if (body.apiKey.length > 4096) throw failure(400, 'API Key 过长');
    key = seal(body.apiKey.trim());
  }
  const tokenLimitField=body.tokenLimitField||previous.tokenLimitField||'max_completion_tokens';
  if(!['max_completion_tokens','max_tokens'].includes(tokenLimitField))throw failure(400,'输出 token 参数无效');
  setSetting(CONFIG, JSON.stringify({ baseUrl, model, key, vision: body.vision === true, tokenLimitField }), userId);
  return aiConfig(true);
}
export async function callModel(instruction, input, images = [], options = {}) {
  const config = JSON.parse(getSetting(CONFIG)?.value || '{}');
  if (!aiConfig().configured) throw failure(503, '尚未配置模型 API，请管理员在 AI 配置中填写地址、模型及 API Key');
  const endpoint = config.baseUrl.endsWith('/chat/completions') ? config.baseUrl : config.baseUrl + '/chat/completions';
  const content = [{ type: 'text', text: JSON.stringify(input) }];
  if (config.vision) for (const image of images.slice(0, 4)) content.push({ type: 'image_url', image_url: { url: image, detail: 'auto' } });
  const response = await remoteJSON(endpoint, { key: unseal(config.key), timeout:options.timeout || 90000, signal:options.signal, body: {
    model: config.model,
    ...(options.maxOutputTokens?{[config.tokenLimitField||'max_completion_tokens']:options.maxOutputTokens}:{}),
    messages: [{ role: 'system', content: instruction }, { role: 'user', content: content.length === 1 ? content[0].text : content }],
    stream: false,
  } });
  const text = response.choices?.[0]?.message?.content;
  options.onUsage?.(response.usage||null);
  if (typeof text !== 'string' || text.length > 150000) throw failure(502, '模型没有返回可用文本');
  return text;
}
export async function testAi() { return { ok: !!(await callModel('Reply with OK.', { test: 'connection' })), model: aiConfig().model }; }
