import AdmZip from 'adm-zip';
import crypto from 'node:crypto';
import path from 'node:path';

export const EXTENSION_PERMISSIONS = {
  'project.read': '读取当前项目的 LaTeX / BibTeX 源码',
  'selection.read': '读取当前源码选区',
  'pdf.read': '读取用户圈选的 PDF 文字和截图',
  'ai.invoke': '请求调用配置的大模型（需要逐次确认，可能产生费用）',
  'suggestions.propose': '提出待作者审阅的修改建议，不能直接改稿',
  'comments.read': '读取当前项目评论与回复',
  'comments.write': '以当前用户身份添加评论',
  'storage': '保存该用户在此插件中的设置',
  'documents.read': '读取当前项目的 Markdown / TeX 文档',
  'documents.write': '经作者逐次确认后保存文档（版本冲突保护）',
  'documents.convert': '使用本地 Pandoc 转换 Markdown / TeX，不调用模型',
};
const bad = (message) => Object.assign(new Error(message), { status: 400 });
export const packageDigest = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
export function extensionPath(value) {
  if (typeof value !== 'string' || !value || value.length > 180 || /[\\:\x00-\x1f]/.test(value) || value.startsWith('/')
    || value.split('/').some((part) => !part || part === '.' || part === '..' || part.startsWith('.') || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))
    || !/\.(html|js|mjs|css|json|svg|png|jpe?g|webp|md|txt|woff2?)$/i.test(value)) throw bad('插件包含不支持或不安全的文件路径');
  return value;
}
export function validateManifest(value, { builtin = false } = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw bad('插件清单必须是 JSON 对象');
  const id = String(value.id || '');
  if (!/^[a-z][a-z0-9-]{1,39}\.[a-z][a-z0-9.-]{1,79}$/.test(id) || id.includes('..') || id.endsWith('.')) throw bad('插件 id 需采用 publisher.name 格式（小写字母、数字、连字符）');
  if (!builtin && id.startsWith('underoot.')) throw bad('underoot.* 为内置插件保留命名空间');
  if (value.apiVersion !== 1) throw bad('目前仅支持插件 API v1');
  if (!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*)?$/.test(value.version || '')) throw bad('插件版本需为语义化版本，如 1.0.0');
  if (typeof value.name !== 'string' || !value.name.trim() || value.name.length > 80) throw bad('插件名称需为 1–80 个字符');
  const runtime = builtin && value.runtime !== 'iframe' ? 'builtin' : 'iframe';
  if (!builtin && value.runtime && value.runtime !== 'iframe') throw bad('第三方插件仅支持 iframe 运行时，不执行服务器代码');
  const permissions = value.permissions || [];
  if (!Array.isArray(permissions) || permissions.length > 12 || permissions.some((permission) => !Object.hasOwn(EXTENSION_PERMISSIONS, permission))) throw bad('插件包含未支持的权限');
  const commands = value.contributes?.commands;
  if (!Array.isArray(commands) || !commands.length || commands.length > 12) throw bad('插件需贡献 1–12 条命令');
  const seen = new Set();
  const entry = builtin ? String(value.entry || '') : extensionPath(value.entry);
  if (!builtin && !entry.endsWith('.html')) throw bad('第三方插件入口必须是 .html');
  const cleaned = commands.map((command) => {
    if (typeof command.id !== 'string' || !command.id.startsWith(id + '.') || !/^[a-zA-Z0-9.-]+$/.test(command.id) || seen.has(command.id)) throw bad('命令 id 需使用插件 id 前缀，且不能重复');
    seen.add(command.id);
    if (typeof command.title !== 'string' || !command.title.trim() || command.title.length > 80) throw bad('命令需提供可读标题');
    if (!['editor', 'workspace', 'all'].includes(command.when || 'editor')) throw bad('命令 when 只能是 editor / workspace / all');
    if (!builtin && command.handler) throw bad('第三方插件不能注册内置特权处理器');
    return { id: command.id, title: command.title, when: command.when || 'editor', ...(builtin ? { handler: String(command.handler || '') } : {}) };
  });
  return { id, name: value.name.trim(), version: value.version, apiVersion: 1, runtime, entry,
    description: String(value.description || '').slice(0, 500), author: String(value.author || '').slice(0, 100),
    license: String(value.license || '').slice(0, 80), permissions: [...new Set(permissions)].sort(), contributes: { commands: cleaned } };
}

export function inspectExtensionZip(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length > 10 * 1024 * 1024 || buffer.length < 4 || buffer.readUInt32LE(0) !== 0x04034b50) throw bad('请上传不超过 10 MB 的有效插件 ZIP');
  let entries;
  try { entries = new AdmZip(buffer).getEntries(); } catch { throw bad('插件 ZIP 已损坏'); }
  if (!entries.length || entries.length > 200) throw bad('插件包最多 200 个条目');
  const raw = entries.filter((entry) => !entry.isDirectory);
  const rootManifest = raw.some((entry) => entry.entryName === 'underoot-plugin.json');
  const roots = new Set(raw.map((entry) => entry.entryName.split('/')[0]));
  const prefix = !rootManifest && roots.size === 1 ? [...roots][0] + '/' : '';
  const files = []; const seen = new Set(); let total = 0;
  for (const entry of raw) {
    const name = entry.entryName;
    if (name.includes('\\') || name.split('/').some((part) => part === '..') || /^(\/|[A-Za-z]:)/.test(name)) throw bad('插件 ZIP 不允许路径穿越');
    if ((((entry.header.attr || 0) >>> 16) & 0xf000) === 0xa000) throw bad('插件 ZIP 不允许符号链接');
    const rel = extensionPath(prefix ? name.slice(prefix.length) : name);
    if (seen.has(rel.toLowerCase())) throw bad('插件 ZIP 包含重复文件路径');
    seen.add(rel.toLowerCase());
    const declared = Number(entry.header.size || 0);
    if (declared > 2 * 1024 * 1024 || total + declared > 15 * 1024 * 1024) throw bad('插件解压体积超限：单文件 2 MB、总计 15 MB');
    let data;
    try { data = entry.getData(); } catch { throw bad('插件 ZIP 文件校验失败'); }
    total += data.length;
    if (data.length > 2 * 1024 * 1024 || total > 15 * 1024 * 1024) throw bad('插件解压体积超限');
    files.push({ path: rel, data });
  }
  const file = files.find((item) => item.path === 'underoot-plugin.json');
  if (!file) throw bad('插件包根目录缺少 underoot-plugin.json');
  let parsed;
  try { parsed = JSON.parse(file.data.toString('utf8')); } catch { throw bad('插件清单 JSON 无效'); }
  const manifest = validateManifest(parsed);
  if (!files.some((item) => item.path === manifest.entry)) throw bad('插件入口文件不存在');
  return { manifest, files, digest: packageDigest(buffer), totalBytes: total };
}
