import { searchWorkspace } from '../extensions/builtin/underoot.discovery/server.js';
import { requireExtension } from './extensions.js';
import express from 'express';
import multer from 'multer';
import { db, memberRole, listProjectsForUser } from './db.js';
import { requireAuth, requireAdmin } from './auth.js';
import { sourceFiles, failure, snapshot, history, revision, revisionDiff, createBranch, checkout, mergePreview, mergeBranch } from './project-history.js';
import { aiConfig, saveAiConfig, testAi, review, suggestions, decideSuggestion, literature } from './assistant.js';
import { deriveProject, retarget } from './derive.js';
import { editReply } from './discussions.js';
import { flushProject } from './collab.js';

export const workspaceRouter = express.Router();
workspaceRouter.use(requireAuth);
const handle = (fn) => (req, res, next) => Promise.resolve().then(() => fn(req, res)).catch(next);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024, files: 1 } });

workspaceRouter.get('/ai/status', (_req, res) => res.json(aiConfig()));
workspaceRouter.get('/ai/config', requireAdmin, (_req, res) => res.json(aiConfig(true)));
workspaceRouter.put('/ai/config', requireAdmin, handle(async (req, res) => res.json(await saveAiConfig(req.body || {}, req.user.id))));
workspaceRouter.post('/ai/test', requireAdmin, handle(async (_req, res) => res.json(await testAi())));

workspaceRouter.get('/search', requireExtension('underoot.discovery'), handle(searchWorkspace));

workspaceRouter.get('/notifications', (req, res) => {
  res.json({ notifications: db.prepare(`SELECT n.*,p.name AS project_name FROM notifications n JOIN members m ON m.project_id=n.project_id AND m.user_id=n.user_id
    JOIN projects p ON p.id=n.project_id WHERE n.user_id=? ORDER BY n.created_at DESC LIMIT 80`).all(req.user.id) });
});
workspaceRouter.post('/notifications/read', (req, res) => {
  if (req.body?.id) db.prepare('UPDATE notifications SET is_read=1 WHERE user_id=? AND id=?').run(req.user.id, req.body.id);
  else db.prepare('UPDATE notifications SET is_read=1 WHERE user_id=?').run(req.user.id);
  res.json({ ok: true });
});

workspaceRouter.use('/projects/:id', (req, res, next) => {
  const project = db.prepare('SELECT * FROM projects WHERE id=?').get(req.params.id);
  if (!project) return res.status(404).json({ error: '项目不存在' });
  const role = memberRole(project.id, req.user.id);
  if (!role) return res.status(403).json({ error: '无权访问项目' });
  req.project = project; req.role = role;
  next();
});
const editor = (req, _res, next) => ['owner', 'editor'].includes(req.role) ? next() : next(failure(403, '需要项目编辑权限'));
const reviewer = (req, _res, next) => req.role !== 'viewer' ? next() : next(failure(403, '只读成员不能提交审阅'));
const prefix = '/projects/:id';

workspaceRouter.get(`${prefix}/history`, handle((req, res) => res.json(history(req.project.id))));
workspaceRouter.post(`${prefix}/history`, editor, handle((req, res) => res.json({ revision: snapshot(req.project.id, req.user.id, req.body?.title || '手动检查点', 'checkpoint', true) })));
workspaceRouter.get(`${prefix}/history/:revision/diff`, handle((req, res) => res.json(revisionDiff(req.project.id, req.params.revision, String(req.query.path || '')))));
workspaceRouter.post(`${prefix}/history/:revision/restore`, editor, handle((req, res) => { checkout(req.project.id, req.user.id, req.params.revision); res.json({ ok: true }); }));
workspaceRouter.post(`${prefix}/branches`, editor, handle((req, res) => {
  const source = req.body?.revisionId || snapshot(req.project.id, req.user.id).id;
  const branch = createBranch(req.project.id, req.body?.name, source);
  if (req.body?.checkout !== false) checkout(req.project.id, req.user.id, source, branch.id);
  res.json({ branch });
}));
workspaceRouter.post(`${prefix}/branches/:branch/checkout`, editor, handle((req, res) => {
  const branch = db.prepare('SELECT * FROM project_branches WHERE id=? AND project_id=?').get(req.params.branch, req.project.id);
  if (!branch?.head) throw failure(404, '分支不存在');
  checkout(req.project.id, req.user.id, branch.head, branch.id); res.json({ ok: true });
}));
workspaceRouter.get(`${prefix}/branches/:branch/merge-preview`, editor, handle((req, res) => {
  const plan = mergePreview(req.project.id, req.user.id, req.params.branch);
  const { merged, metadata, ...publicPlan } = plan;
  res.json(publicPlan);
}));
workspaceRouter.post(`${prefix}/branches/:branch/merge`, editor, handle((req, res) => res.json(mergeBranch(req.project.id, req.user.id, req.params.branch, req.body || {}))));

workspaceRouter.get(`${prefix}/suggestions`, (req, res) => res.json({ suggestions: suggestions(req.project.id) }));
const modelRequests = new Map();
workspaceRouter.post(`${prefix}/review`, requireExtension('underoot.assistant'), reviewer, handle(async (req, res) => {
  const body = { ...(req.body || {}) };
  if (body.pdf) {
    const { page, rect } = body.pdf;
    if (!Number.isInteger(page) || page < 1 || page > 5000 || !rect || !['x', 'y', 'w', 'h'].every((k) => Number.isFinite(rect[k]) && rect[k] >= 0 && rect[k] <= 1) || rect.w <= 0 || rect.h <= 0) throw failure(400, 'PDF 圈选范围不合法');
    body.pdf = { page, rect };
  }
  if (body.useAI) {
    const last = modelRequests.get(req.user.id) || 0;
    if (Date.now() - last < 15000) throw failure(429, '模型调用间隔至少 15 秒');
    if (modelRequests.size > 1000) for (const [id, at] of modelRequests) if (Date.now() - at > 60000) modelRequests.delete(id);
    modelRequests.set(req.user.id, Date.now());
  }
  res.json(await review(req.project, body));
}));
workspaceRouter.post(`${prefix}/literature`, requireExtension('underoot.assistant'), reviewer, handle(async (req, res) => res.json(await literature(req.project, req.body || {}))));
workspaceRouter.patch(`${prefix}/suggestions/:suggestion`, editor, handle((req, res) => res.json(decideSuggestion(req.project, req.params.suggestion, req.body?.status, req.user.id))));
workspaceRouter.post(`${prefix}/derive`, requireExtension('underoot.publishing'), editor, handle(async (req, res) => res.json(await deriveProject(req.project, req.user.id, req.body || {}))));
workspaceRouter.post(`${prefix}/template`, requireExtension('underoot.publishing'), editor, (req, res, next) => upload.single('file')(req, res, (error) => error ? next(failure(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400, '模板 ZIP 需小于 30 MB')) : next()),
  handle(async (req, res) => {
    if (!req.file || !req.file.originalname.toLowerCase().endsWith('.zip')) throw failure(400, '请上传模板 ZIP');
    res.json(await retarget(req.project, req.user.id, req.file.buffer, req.body || {}));
  }));
workspaceRouter.patch(`${prefix}/comments/:comment/replies/:reply`, reviewer, handle((req, res) => res.json(editReply(req.project.id, req.params.comment, req.params.reply, req.body || {}, req.user.id, req.role))));
workspaceRouter.delete(`${prefix}/comments/:comment/replies/:reply`, reviewer, handle((req, res) => res.json(editReply(req.project.id, req.params.comment, req.params.reply, {}, req.user.id, req.role, true))));
