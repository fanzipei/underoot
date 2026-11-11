import { db, getComment, listComments } from './db.js';
import { failure } from './project-history.js';
import { broadcastProject } from './collab.js';
import crypto from 'node:crypto';

export function notifyDiscussion(projectId, commentId, actorId, text) {
  const comment = getComment(projectId, commentId);
  if (!comment) return;
  const recipients = new Set([comment.authorId, comment.assigneeId, ...comment.replies.map((r) => r.authorId)]);
  const members = db.prepare('SELECT u.id,u.email FROM users u JOIN members m ON m.user_id=u.id WHERE m.project_id=?').all(projectId);
  for (const member of members) if (String(text).toLowerCase().includes('@' + member.email.toLowerCase())) recipients.add(member.id);
  const insert = db.prepare('INSERT INTO notifications(id,user_id,project_id,comment_id,message,created_at) VALUES(?,?,?,?,?,?)');
  for (const member of members) {
    if (member.id === actorId || !recipients.has(member.id)) continue;
    insert.run(crypto.randomUUID(), member.id, projectId, commentId, String(text).slice(0, 220), Date.now());
  }
}
export function updateDiscussion(projectId, id, body, actor, role) {
  const row = getComment(projectId, id);
  if (!row) throw failure(404, '评论不存在');
  if (body.expectedUpdatedAt != null && Number(body.expectedUpdatedAt) !== row.updatedAt) throw failure(409, '评论已由其他成员更新，请刷新后重试');
  const values = [];
  const clauses = [];
  if (Object.hasOwn(body, 'resolved')) {
    if (typeof body.resolved !== 'boolean') throw failure(400, 'resolved 必须是布尔值');
    clauses.push('resolved=?'); values.push(body.resolved ? 1 : 0);
  }
  if (Object.hasOwn(body, 'body')) {
    if (row.authorId !== actor.id && role !== 'owner') throw failure(403, '仅作者或所有者可修改评论内容');
    const text = String(body.body || '').trim();
    if (!text || text.length > 8000) throw failure(400, '评论内容需为 1–8000 个字符');
    clauses.push('body=?'); values.push(text);
  }
  if (Object.hasOwn(body, 'assigneeId')) {
    if (body.assigneeId && !db.prepare('SELECT 1 FROM members WHERE project_id=? AND user_id=?').get(projectId, body.assigneeId)) throw failure(400, '只能指派当前项目成员');
    clauses.push('assignee_id=?'); values.push(body.assigneeId || null);
  }
  if (Object.hasOwn(body, 'priority')) {
    if (!['normal', 'high'].includes(body.priority)) throw failure(400, '优先级不合法');
    clauses.push('priority=?'); values.push(body.priority);
  }
  if (!clauses.length) throw failure(400, '未提供可修改的评论字段');
  db.prepare(`UPDATE comments SET ${clauses.join(',')},updated_at=? WHERE id=? AND project_id=?`).run(...values, Date.now(), id, projectId);
  const updated = getComment(projectId, id);
  notifyDiscussion(projectId, id, actor.id, body.body || (updated.assigneeId ? '评论已指派，请查看处理' : '评论状态已更新'));
  broadcastProject(projectId, { type: 'comment:changed', action: 'updated', comment: updated });
  return updated;
}
export function editReply(projectId, commentId, replyId, body, actorId, role, remove = false) {
  const reply = db.prepare('SELECT r.* FROM comment_replies r JOIN comments c ON c.id=r.comment_id WHERE r.id=? AND c.id=? AND c.project_id=?').get(replyId, commentId, projectId);
  if (!reply) throw failure(404, '回复不存在');
  if (reply.author_id !== actorId && role !== 'owner') throw failure(403, '仅作者或所有者可修改回复');
  if (remove) db.prepare('DELETE FROM comment_replies WHERE id=?').run(replyId);
  else {
    const text = String(body.body || '').trim();
    if (!text || text.length > 8000) throw failure(400, '回复需为 1–8000 个字符');
    if (body.expectedUpdatedAt != null && Number(body.expectedUpdatedAt) !== (reply.updated_at || reply.created_at)) throw failure(409, '回复已变化，请刷新');
    db.prepare('UPDATE comment_replies SET body=?,updated_at=? WHERE id=?').run(text, Date.now(), replyId);
  }
  db.prepare('UPDATE comments SET updated_at=? WHERE id=?').run(Date.now(), commentId);
  broadcastProject(projectId, { type: 'comment:changed', action: 'reply-updated', comment: getComment(projectId, commentId) });
  return { ok: true };
}
