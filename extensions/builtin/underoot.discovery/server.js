import { db, listProjectsForUser } from '../../../server/db.js';
import { sourceFiles, failure } from '../../../server/project-history.js';
import { flushProject } from '../../../server/collab.js';
export function searchWorkspace(req, res) {
  const query = String(req.query.q || '').trim();
  if (query.length < 2 || query.length > 200) throw failure(400, '搜索词需为 2–200 个字符');
  const needle = query.toLocaleLowerCase();
  const type = String(req.query.type || 'all');
  const projects = listProjectsForUser(req.user.id).slice(0, 200).filter((p) => !req.query.project || p.id === req.query.project);
  const results = [];
  let scanned = 0;
  let truncated = false;
  for (const project of projects) {
    flushProject(project.id);
    if (['all', 'name'].includes(type) && project.name.toLocaleLowerCase().includes(needle)) results.push({ projectId: project.id, projectName: project.name, kind: 'project', path: project.main_file, line: 1, snippet: project.name });
    if (['all', 'tex', 'bib'].includes(type)) {
      let files;
      try { files = sourceFiles(project); } catch { truncated = true; continue; }
      for (const file of files) {
        if (!/\.(tex|bib|md|txt)$/i.test(file.path) || (type !== 'all' && !file.path.endsWith('.' + type)) || file.buffer.length > 1024 * 1024) continue;
        scanned += file.buffer.length;
        if (scanned > 12 * 1024 * 1024) { truncated = true; break; }
        const lines = file.buffer.toString('utf8').split(/\r?\n/);
        for (let i = 0; i < lines.length; i++) {
          const at = lines[i].toLocaleLowerCase().indexOf(needle);
          if (at < 0) continue;
          results.push({ projectId: project.id, projectName: project.name, kind: 'source', path: file.path, line: i + 1, snippet: lines[i].slice(Math.max(0, at - 70), at + query.length + 130) });
          if (results.length >= 80) { truncated = true; break; }
        }
        if (results.length >= 80) break;
      }
    }
    if (['all', 'comments'].includes(type)) {
      const matches = db.prepare(`SELECT DISTINCT c.id,c.body,c.path,c.page FROM comments c LEFT JOIN comment_replies r ON r.comment_id=c.id
        WHERE c.project_id=? AND (instr(lower(c.body),?)>0 OR instr(lower(r.body),?)>0) LIMIT 15`).all(project.id, needle, needle);
      for (const comment of matches) results.push({ projectId: project.id, projectName: project.name, kind: 'comment', commentId: comment.id,
        path: comment.path || project.main_file, line: 1, snippet: comment.body.slice(0, 200) });
    }
    if (results.length >= 80 || scanned > 12 * 1024 * 1024) break;
  }
  res.json({ results: results.slice(0, 80), truncated });
}
