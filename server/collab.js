import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { WebSocketServer } from 'ws';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { DATA_DIR, projectDir, resolveInside, isTextFile } from './paths.js';
import { memberRole, touchProject, recordVersion } from './db.js';
import { userFromRequest } from './auth.js';

const MSG_SYNC = 0;
const MSG_AWARENESS = 1;
const MSG_QUERY_AWARENESS = 3;

const docs = new Map(); // key -> room
const projectClients = new Map(); // projectId -> Set<WebSocket>，纯事件通道
let wss = null;

/** 向某个项目的所有在线成员广播 JSON 事件（编译开始 / 编译结果 / 文件变更） */
export function broadcastProject(projectId, payload) {
  const clients = projectClients.get(projectId);
  if (!clients || !clients.size) return;
  const raw = JSON.stringify(payload);
  for (const conn of clients) {
    if (conn.readyState !== 1) continue;
    // 成员可能刚被移除，广播时再做一次权限校验
    if (!memberRole(projectId, conn.user?.id)) {
      try { conn.close(1008, 'access revoked'); } catch { /* ignore */ }
      continue;
    }
    try { conn.send(raw); } catch { /* ignore */ }
  }
}

/** 移除成员或删除项目时，立即断开指定用户（或全部用户）的在线连接 */
export function revokeProjectAccess(projectId, userId = null) {
  const shouldRevoke = (conn) => userId == null || conn.user?.id === userId;
  for (const room of docs.values()) {
    if (room.projectId !== projectId) continue;
    for (const conn of room.conns) {
      if (!shouldRevoke(conn)) continue;
      try { conn.close(1008, 'access revoked'); } catch { /* ignore */ }
    }
  }
  const clients = projectClients.get(projectId);
  if (clients) {
    for (const conn of clients) {
      if (!shouldRevoke(conn)) continue;
      try { conn.close(1008, 'access revoked'); } catch { /* ignore */ }
    }
  }
}

function roomKey(projectId, relPath) {
  return `${projectId}::${relPath}`;
}

const STATE_DIR = path.join(DATA_DIR, 'yjs');

/**
 * 每个文件持久化 Y.Doc 的完整状态（保留 clientID 与操作历史）。
 * 若只在内存中重建文档，服务重启或最后一个协作者断开后，服务端会用新的
 * clientID 重新插入一遍文本；客户端重连时两份 insert 会被 CRDT 合并，
 * 导致整篇内容翻倍。
 */
function stateFile(projectId, relPath) {
  const safe = crypto.createHash('sha1').update(relPath).digest('hex');
  return path.join(STATE_DIR, projectId, `${safe}.bin`);
}

function loadState(file, doc) {
  try {
    if (!fs.existsSync(file)) return false;
    Y.applyUpdate(doc, new Uint8Array(fs.readFileSync(file)), 'persistence');
    return true;
  } catch {
    return false;
  }
}

function persistState(file, doc) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, Buffer.from(Y.encodeStateAsUpdate(doc)));
    fs.renameSync(tmp, file);
  } catch (err) {
    console.error('[collab] 协同状态保存失败', file, err.message);
  }
}

function loadText(projectId, relPath) {
  try {
    return fs.readFileSync(resolveInside(projectDir(projectId), relPath), 'utf8');
  } catch {
    return '';
  }
}

function flush(room) {
  try {
    const target = resolveInside(projectDir(room.projectId), room.path);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const text = room.doc.getText('content').toString();
    fs.writeFileSync(target, text, 'utf8');
    persistState(room.stateFile, room.doc);
    touchProject(room.projectId);
    recordVersion({
      projectId: room.projectId,
      path: room.path,
      content: text,
      authorId: room.lastAuthorId || null,
    });
  } catch (err) {
    console.error('[collab] 保存失败', room.projectId, room.path, err.message);
  }
}

function getRoom(projectId, relPath) {
  const key = roomKey(projectId, relPath);
  let room = docs.get(key);
  if (room) return room;

  const doc = new Y.Doc();
  const ytext = doc.getText('content');
  const diskText = loadText(projectId, relPath);
  const statePath = stateFile(projectId, relPath);

  // 优先恢复带 clientID 的协同状态；若与磁盘内容不一致（例如无活跃连接时
  // 通过 REST/上传改过文件），丢弃旧状态并以磁盘文本为准重新初始化。
  const restored = loadState(statePath, doc);
  if (!restored || ytext.toString() !== diskText) {
    if (restored) {
      ytext.delete(0, ytext.length);
      try { fs.unlinkSync(statePath); } catch { /* ignore */ }
    }
    if (diskText) ytext.insert(0, diskText);
  }

  room = {
    key,
    doc,
    ytext,
    stateFile: statePath,
    projectId,
    path: relPath,
    awareness: null,
    conns: new Set(),
    saveTimer: null,
    dirty: false,
    lastAuthorId: null,
  };
  room.awareness = new awarenessProtocol.Awareness(doc);

  doc.on('update', (update, origin) => {
    if (origin && typeof origin === 'object' && origin.user?.id) room.lastAuthorId = origin.user.id;
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MSG_SYNC);
    syncProtocol.writeUpdate(encoder, update);
    const message = encoding.toUint8Array(encoder);
    for (const conn of room.conns) {
      if (conn === origin) continue;
      send(conn, message);
    }
    room.dirty = true;
    if (room.saveTimer) return;
    room.saveTimer = setTimeout(() => {
      room.saveTimer = null;
      if (room.dirty) {
        room.dirty = false;
        flush(room);
      }
    }, 700);
  });

  room.awareness.on('update', ({ added, updated, removed }, origin) => {
    const changed = [...added, ...updated, ...removed];
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MSG_AWARENESS);
    encoding.writeVarUint8Array(
      encoder,
      awarenessProtocol.encodeAwarenessUpdate(room.awareness, changed),
    );
    const message = encoding.toUint8Array(encoder);
    for (const conn of room.conns) send(conn, message);
  });

  docs.set(key, room);
  return room;
}

function send(conn, message) {
  if (conn.readyState !== 1) return;
  try { conn.send(message); } catch { /* ignore */ }
}

/** 从 awareness update 中解析出 clientID 列表，用于连接断开时清理光标 */
function extractAwarenessIds(updateBytes) {
  try {
    const dec = decoding.createDecoder(updateBytes);
    const count = decoding.readVarUint(dec);
    const ids = [];
    for (let i = 0; i < count; i++) {
      const id = decoding.readVarUint(dec);
      decoding.readVarUint(dec); // clock
      decoding.readVarString(dec); // state json
      ids.push(id);
    }
    return ids;
  } catch {
    return [];
  }
}

/** 外部（REST 上传/覆盖）修改文件后，同步进协同文档 */
export function syncExternalWrite(projectId, relPath, content) {
  const room = docs.get(roomKey(projectId, relPath));
  if (!room) return;
  const current = room.ytext.toString();
  if (current === content) return;
  room.doc.transact(() => {
    room.ytext.delete(0, current.length);
    room.ytext.insert(0, content);
  }, 'external');
}

export function closeProjectDocs(projectId) {
  for (const [key, room] of docs) {
    if (room.projectId !== projectId) continue;
    if (room.saveTimer) clearTimeout(room.saveTimer);
    try { flush(room); } catch { /* ignore */ }
    try { room.doc.destroy(); } catch { /* ignore */ }
    docs.delete(key);
  }
  try { fs.rmSync(path.join(STATE_DIR, projectId), { recursive: true, force: true }); } catch { /* ignore */ }
}

export function flushAll() {
  for (const room of docs.values()) {
    if (room.saveTimer) clearTimeout(room.saveTimer);
    try { flush(room); } catch { /* ignore */ }
  }
}

/** 编译前把某个项目所有活跃协作文档立即写入磁盘 */
export function flushProject(projectId) {
  for (const room of docs.values()) {
    if (room.projectId !== projectId) continue;
    if (room.saveTimer) {
      clearTimeout(room.saveTimer);
      room.saveTimer = null;
    }
    try { flush(room); } catch { /* ignore */ }
  }
}

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

export function attachCollab(server) {
  wss = new WebSocketServer({ noServer: true, maxPayload: 8 * 1024 * 1024 });

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, 'http://localhost');
    const isCollab = url.pathname.startsWith('/collab/');
    const isEvents = url.pathname.startsWith('/events/');
    if (!isCollab && !isEvents) {
      socket.destroy();
      return;
    }
    const fakeReq = {
      cookies: parseCookies(req.headers.cookie),
      headers: req.headers,
      query: Object.fromEntries(url.searchParams),
    };
    const user = userFromRequest(fakeReq);
    if (!user) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    // 项目事件通道（编译状态广播）
    if (isEvents) {
      const projectId = url.pathname.slice('/events/'.length);
      if (!/^[A-Za-z0-9-]+$/.test(projectId) || !memberRole(projectId, user.id)) {
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        ws.isEventClient = true;
        ws.projectId = projectId;
        ws.user = user;
        wss.emit('connection', ws, req);
      });
      return;
    }

    let roomName = '';
    try {
      roomName = decodeURIComponent(url.pathname.slice('/collab/'.length));
    } catch {
      socket.destroy();
      return;
    }
    const sep = roomName.indexOf('::');
    if (sep < 0) { socket.destroy(); return; }
    const projectId = roomName.slice(0, sep);
    const relPath = roomName.slice(sep + 2);
    const role = memberRole(projectId, user.id);
    if (!role) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }
    if (!isTextFile(relPath)) { socket.destroy(); return; }

    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.user = user;
      ws.role = role;
      ws.projectId = projectId;
      ws.relPath = relPath;
      wss.emit('connection', ws, req);
    });
  });

  wss.on('connection', (conn) => {
    if (conn.isEventClient) {
      let set = projectClients.get(conn.projectId);
      if (!set) {
        set = new Set();
        projectClients.set(conn.projectId, set);
      }
      set.add(conn);
      send(conn, JSON.stringify({ type: 'hello', projectId: conn.projectId }));
      conn.on('close', () => {
        set.delete(conn);
        if (!set.size) projectClients.delete(conn.projectId);
      });
      conn.on('error', () => {});
      return;
    }

    const room = getRoom(conn.projectId, conn.relPath);
    room.conns.add(conn);
    conn.room = room;
    conn.awarenessIds = new Set();

    // 1. 发送 sync step1
    {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MSG_SYNC);
      syncProtocol.writeSyncStep1(encoder, room.doc);
      send(conn, encoding.toUint8Array(encoder));
    }
    // 2. 发送已有 awareness 状态
    const states = room.awareness.getStates();
    if (states.size > 0) {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MSG_AWARENESS);
      encoding.writeVarUint8Array(
        encoder,
        awarenessProtocol.encodeAwarenessUpdate(room.awareness, Array.from(states.keys())),
      );
      send(conn, encoding.toUint8Array(encoder));
    }

    conn.on('message', (data) => {
      // 每次协同消息都重新校验成员关系：被移除的成员即使连接尚未超时也不能继续编辑
      if (!memberRole(conn.projectId, conn.user?.id)) {
        try { conn.close(1008, 'access revoked'); } catch { /* ignore */ }
        return;
      }
      const decoder = decoding.createDecoder(new Uint8Array(data));
      const type = decoding.readVarUint(decoder);
      switch (type) {
        case MSG_SYNC: {
          const encoder = encoding.createEncoder();
          encoding.writeVarUint(encoder, MSG_SYNC);
          syncProtocol.readSyncMessage(decoder, encoder, room.doc, conn);
          if (encoding.length(encoder) > 1) send(conn, encoding.toUint8Array(encoder));
          break;
        }
        case MSG_AWARENESS: {
          const bytes = decoding.readVarUint8Array(decoder);
          for (const id of extractAwarenessIds(bytes)) conn.awarenessIds.add(id);
          awarenessProtocol.applyAwarenessUpdate(room.awareness, bytes, conn);
          break;
        }
        case MSG_QUERY_AWARENESS: {
          const encoder = encoding.createEncoder();
          encoding.writeVarUint(encoder, MSG_AWARENESS);
          encoding.writeVarUint8Array(
            encoder,
            awarenessProtocol.encodeAwarenessUpdate(room.awareness, Array.from(room.awareness.getStates().keys())),
          );
          send(conn, encoding.toUint8Array(encoder));
          break;
        }
        default:
          break;
      }
    });

    conn.on('close', () => {
      room.conns.delete(conn);
      if (conn.awarenessIds.size) {
        awarenessProtocol.removeAwarenessStates(room.awareness, Array.from(conn.awarenessIds), null);
      }
      if (room.conns.size === 0) {
        if (room.saveTimer) clearTimeout(room.saveTimer);
        flush(room);
        room.awareness.destroy();
        docs.delete(room.key);
      }
    });

    conn.on('error', () => {});
  });

  return wss;
}
