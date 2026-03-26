import { createServer } from 'node:http';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  DATA_DIR,
  DB_PATH,
  FILES_DIR,
  hashPassword,
  commentRowToModel,
  db,
  deleteDocumentRecursive,
  documentRowToModel,
  getDocumentById,
  getFileType,
  getNextOrderIndex,
  getUserById,
  listComments,
  listDocuments,
  listFiles,
  listFolders,
  listShareLinks,
  listTodos,
  mimeTypeForExtension,
  newId,
  now,
  publicUser,
  sanitizeNullable,
  todoRowToModel,
  verifyPassword,
} from './db.mjs';
import { json, readJsonBody, readRequestBuffer, sendEmpty, text } from './utils.mjs';

const API_PORT = Number(process.env.YUQUE_API_PORT || 3001);

async function handleUploads(res, url) {
  const relativePath = decodeURIComponent(url.pathname.replace('/uploads/', ''));
  const fullPath = path.join(FILES_DIR, ...relativePath.split('/'));

  if (!fullPath.startsWith(FILES_DIR) || !existsSync(fullPath)) {
    json(res, 404, { error: 'File not found.' });
    return;
  }

  const fileStat = await stat(fullPath);
  res.writeHead(200, {
    'Content-Type': mimeTypeForExtension(fullPath),
    'Content-Length': fileStat.size,
    'Cache-Control': 'no-cache',
    'Access-Control-Allow-Origin': '*',
  });
  createReadStream(fullPath).pipe(res);
}

async function handleApi(req, res, url) {
  if (req.method === 'OPTIONS') {
    sendEmpty(res);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/health') {
    json(res, 200, { ok: true });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/login') {
    const body = await readJsonBody(req);
    const userRow = db.prepare('SELECT * FROM users WHERE email = ?').get(body.email);
    if (!userRow || !verifyPassword(body.password || '', userRow.password_hash)) {
      json(res, 401, { error: 'Invalid email or password.' });
      return;
    }
    json(res, 200, { user: publicUser(userRow) });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/register') {
    const body = await readJsonBody(req);
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const nickname = String(body.nickname || '').trim();

    if (!email || !password || !nickname) {
      json(res, 400, { error: 'Email, password, and nickname are required.' });
      return;
    }

    if (password.length < 6) {
      json(res, 400, { error: 'Password must be at least 6 characters.' });
      return;
    }

    const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existingUser) {
      json(res, 409, { error: 'Email is already registered.' });
      return;
    }

    const timestamp = now();
    const id = newId();
    db.prepare(`
      INSERT INTO users (id, email, password_hash, nickname, avatar_url, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, email, hashPassword(password), nickname, null, timestamp, timestamp);

    json(res, 201, { user: publicUser(getUserById(id)) });
    return;
  }

  if (req.method === 'GET' && /^\/api\/users\/[^/]+$/.test(url.pathname)) {
    const userId = decodeURIComponent(url.pathname.replace('/api/users/', ''));
    const user = getUserById(userId);
    if (!user) {
      json(res, 404, { error: 'User not found.' });
      return;
    }
    json(res, 200, publicUser(user));
    return;
  }

  if (req.method === 'PATCH' && /^\/api\/users\/[^/]+$/.test(url.pathname)) {
    const userId = decodeURIComponent(url.pathname.replace('/api/users/', ''));
    const body = await readJsonBody(req);
    const existing = getUserById(userId);
    if (!existing) {
      json(res, 404, { error: 'User not found.' });
      return;
    }

    db.prepare('UPDATE users SET nickname = ?, avatar_url = ?, updated_at = ? WHERE id = ?').run(
      body.nickname ?? existing.nickname,
      body.avatar_url ?? existing.avatar_url,
      now(),
      userId,
    );

    json(res, 200, { user: publicUser(getUserById(userId)) });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/documents') {
    json(res, 200, listDocuments(url.searchParams.get('includeDeleted') === 'true'));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/documents/starred') {
    const rows = db.prepare('SELECT * FROM documents WHERE is_starred = 1 AND is_deleted = 0 ORDER BY updated_at DESC').all();
    json(res, 200, rows.map(documentRowToModel));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/documents/trash') {
    const rows = db.prepare('SELECT * FROM documents WHERE is_deleted = 1 ORDER BY updated_at DESC').all();
    json(res, 200, rows.map(documentRowToModel));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/documents/recent') {
    const limit = Number(url.searchParams.get('limit') || 10);
    const rows = db.prepare('SELECT * FROM documents WHERE is_deleted = 0 ORDER BY updated_at DESC LIMIT ?').all(limit);
    json(res, 200, rows.map(documentRowToModel));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/documents/search') {
    const query = `%${String(url.searchParams.get('q') || '').trim()}%`;
    const rows = db.prepare(`
      SELECT * FROM documents
      WHERE is_deleted = 0 AND (title LIKE ? OR content LIKE ?)
      ORDER BY updated_at DESC
    `).all(query, query);
    json(res, 200, rows.map(documentRowToModel));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/documents') {
    const body = await readJsonBody(req);
    const timestamp = now();
    const id = newId();
    const parentId = sanitizeNullable(body.parent_id);
    const orderIndex = body.order_index ?? getNextOrderIndex('documents', 'parent_id', parentId);

    db.prepare(`
      INSERT INTO documents (id, title, content, parent_id, icon, created_at, updated_at, user_id, is_starred, order_index, is_deleted)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      body.title || 'Untitled',
      body.content || '<p></p>',
      parentId,
      body.icon || 'file',
      timestamp,
      timestamp,
      sanitizeNullable(body.user_id) || 'demo-user-1',
      Number(Boolean(body.is_starred)),
      orderIndex,
      Number(Boolean(body.is_deleted)),
    );

    json(res, 201, getDocumentById(id));
    return;
  }

  if (req.method === 'GET' && /^\/api\/documents\/[^/]+$/.test(url.pathname)) {
    const document = getDocumentById(decodeURIComponent(url.pathname.replace('/api/documents/', '')));
    if (!document) {
      json(res, 404, { error: 'Document not found.' });
      return;
    }
    json(res, 200, document);
    return;
  }

  if (req.method === 'PATCH' && /^\/api\/documents\/[^/]+$/.test(url.pathname)) {
    const id = decodeURIComponent(url.pathname.replace('/api/documents/', ''));
    const existing = getDocumentById(id);
    if (!existing) {
      json(res, 404, { error: 'Document not found.' });
      return;
    }

    const body = await readJsonBody(req);
    db.prepare(`
      UPDATE documents
      SET title = ?, content = ?, parent_id = ?, icon = ?, user_id = ?, is_starred = ?, order_index = ?, is_deleted = ?, updated_at = ?
      WHERE id = ?
    `).run(
      body.title ?? existing.title,
      body.content ?? existing.content,
      body.parent_id !== undefined ? sanitizeNullable(body.parent_id) : existing.parent_id,
      body.icon ?? existing.icon,
      body.user_id !== undefined ? sanitizeNullable(body.user_id) : existing.user_id,
      body.is_starred !== undefined ? Number(Boolean(body.is_starred)) : Number(existing.is_starred),
      body.order_index ?? existing.order_index,
      body.is_deleted !== undefined ? Number(Boolean(body.is_deleted)) : Number(existing.is_deleted),
      now(),
      id,
    );

    json(res, 200, getDocumentById(id));
    return;
  }

  if (req.method === 'DELETE' && /^\/api\/documents\/[^/]+$/.test(url.pathname)) {
    const id = decodeURIComponent(url.pathname.replace('/api/documents/', ''));
    const existing = getDocumentById(id);
    if (!existing) {
      json(res, 404, { error: 'Document not found.' });
      return;
    }

    if (url.searchParams.get('permanent') === 'true') {
      deleteDocumentRecursive(id);
    } else {
      db.prepare('UPDATE documents SET is_deleted = 1, updated_at = ? WHERE id = ?').run(now(), id);
    }

    sendEmpty(res);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/comments') {
    const documentId = url.searchParams.get('documentId');
    if (!documentId) {
      json(res, 400, { error: 'documentId is required.' });
      return;
    }
    json(res, 200, listComments(documentId));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/comments') {
    const body = await readJsonBody(req);
    const timestamp = now();
    const id = newId();

    db.prepare(`
      INSERT INTO comments (id, document_id, parent_id, content, created_at, updated_at, user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      body.document_id,
      sanitizeNullable(body.parent_id),
      body.content || '',
      timestamp,
      timestamp,
      sanitizeNullable(body.user_id) || 'demo-user-1',
    );

    const created = db.prepare(`
      SELECT
        c.*,
        u.id AS user_ref_id,
        u.email AS user_email,
        u.nickname AS user_nickname,
        u.avatar_url AS user_avatar_url,
        u.created_at AS user_created_at,
        u.updated_at AS user_updated_at
      FROM comments c
      LEFT JOIN users u ON u.id = c.user_id
      WHERE c.id = ?
    `).get(id);

    json(res, 201, commentRowToModel(created));
    return;
  }

  if (req.method === 'PATCH' && /^\/api\/comments\/[^/]+$/.test(url.pathname)) {
    const id = decodeURIComponent(url.pathname.replace('/api/comments/', ''));
    const body = await readJsonBody(req);
    db.prepare('UPDATE comments SET content = ?, updated_at = ? WHERE id = ?').run(body.content || '', now(), id);
    const updated = db.prepare(`
      SELECT
        c.*,
        u.id AS user_ref_id,
        u.email AS user_email,
        u.nickname AS user_nickname,
        u.avatar_url AS user_avatar_url,
        u.created_at AS user_created_at,
        u.updated_at AS user_updated_at
      FROM comments c
      LEFT JOIN users u ON u.id = c.user_id
      WHERE c.id = ?
    `).get(id);
    json(res, 200, commentRowToModel(updated));
    return;
  }

  if (req.method === 'DELETE' && /^\/api\/comments\/[^/]+$/.test(url.pathname)) {
    const id = decodeURIComponent(url.pathname.replace('/api/comments/', ''));
    db.prepare('DELETE FROM comments WHERE parent_id = ?').run(id);
    db.prepare('DELETE FROM comments WHERE id = ?').run(id);
    sendEmpty(res);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/todos') {
    const documentId = url.searchParams.get('documentId');
    if (!documentId) {
      json(res, 400, { error: 'documentId is required.' });
      return;
    }
    json(res, 200, listTodos(documentId));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/todos') {
    const body = await readJsonBody(req);
    const timestamp = now();
    const id = newId();
    const orderIndex = body.order_index ?? getNextOrderIndex('todos', 'document_id', body.document_id);

    db.prepare(`
      INSERT INTO todos (id, document_id, content, status, priority, due_date, tags, created_at, updated_at, user_id, order_index)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      body.document_id,
      body.content || '',
      body.status || 'pending',
      body.priority || 'medium',
      sanitizeNullable(body.due_date),
      JSON.stringify(Array.isArray(body.tags) ? body.tags : []),
      timestamp,
      timestamp,
      sanitizeNullable(body.user_id) || 'demo-user-1',
      orderIndex,
    );

    json(res, 201, todoRowToModel(db.prepare('SELECT * FROM todos WHERE id = ?').get(id)));
    return;
  }

  if (req.method === 'GET' && /^\/api\/todos\/[^/]+$/.test(url.pathname)) {
    const id = decodeURIComponent(url.pathname.replace('/api/todos/', ''));
    const todo = db.prepare('SELECT * FROM todos WHERE id = ?').get(id);
    if (!todo) {
      json(res, 404, { error: 'Todo not found.' });
      return;
    }
    json(res, 200, todoRowToModel(todo));
    return;
  }

  if (req.method === 'PATCH' && /^\/api\/todos\/[^/]+$/.test(url.pathname)) {
    const id = decodeURIComponent(url.pathname.replace('/api/todos/', ''));
    const existing = db.prepare('SELECT * FROM todos WHERE id = ?').get(id);
    if (!existing) {
      json(res, 404, { error: 'Todo not found.' });
      return;
    }

    const body = await readJsonBody(req);
    db.prepare(`
      UPDATE todos
      SET content = ?, status = ?, priority = ?, due_date = ?, tags = ?, updated_at = ?, user_id = ?, order_index = ?
      WHERE id = ?
    `).run(
      body.content ?? existing.content,
      body.status ?? existing.status,
      body.priority ?? existing.priority,
      body.due_date !== undefined ? sanitizeNullable(body.due_date) : existing.due_date,
      body.tags !== undefined ? JSON.stringify(Array.isArray(body.tags) ? body.tags : []) : existing.tags,
      now(),
      body.user_id !== undefined ? sanitizeNullable(body.user_id) : existing.user_id,
      body.order_index ?? existing.order_index,
      id,
    );

    json(res, 200, todoRowToModel(db.prepare('SELECT * FROM todos WHERE id = ?').get(id)));
    return;
  }

  if (req.method === 'DELETE' && /^\/api\/todos\/[^/]+$/.test(url.pathname)) {
    db.prepare('DELETE FROM todos WHERE id = ?').run(decodeURIComponent(url.pathname.replace('/api/todos/', '')));
    sendEmpty(res);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/folders') {
    json(res, 200, listFolders());
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/folders') {
    const body = await readJsonBody(req);
    const timestamp = now();
    const id = newId();
    const parentId = sanitizeNullable(body.parent_id);
    const orderIndex = body.order_index ?? getNextOrderIndex('folders', 'parent_id', parentId);

    db.prepare(`
      INSERT INTO folders (id, name, parent_id, icon, created_at, updated_at, user_id, order_index)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      body.name || 'New Folder',
      parentId,
      body.icon || 'folder',
      timestamp,
      timestamp,
      sanitizeNullable(body.user_id) || 'demo-user-1',
      orderIndex,
    );

    json(res, 201, db.prepare('SELECT * FROM folders WHERE id = ?').get(id));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/files') {
    if (url.searchParams.get('scope') === 'all') {
      json(res, 200, db.prepare('SELECT * FROM files ORDER BY created_at DESC').all());
      return;
    }

    json(res, 200, listFiles(sanitizeNullable(url.searchParams.get('folderId'))));
    return;
  }

  if (req.method === 'GET' && /^\/api\/files\/[^/]+$/.test(url.pathname)) {
    const id = decodeURIComponent(url.pathname.replace('/api/files/', ''));
    const file = db.prepare('SELECT * FROM files WHERE id = ?').get(id);
    if (!file) {
      json(res, 404, { error: 'File not found.' });
      return;
    }
    json(res, 200, file);
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/files/upload') {
    const name = String(url.searchParams.get('name') || 'file.bin');
    const mimeType = String(url.searchParams.get('mimeType') || 'application/octet-stream');
    const fileType = getFileType(name, mimeType);
    const dateFolder = new Date().toISOString().slice(0, 10);
    const storedFileName = `${Date.now()}-${newId()}${path.extname(name)}`;
    const relativePath = path.posix.join(dateFolder, fileType, storedFileName);
    const fullPath = path.join(FILES_DIR, ...relativePath.split('/'));

    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, await readRequestBuffer(req));

    const publicPath = `/uploads/${relativePath}`;
    json(res, 200, {
      url: publicPath,
      path: relativePath,
      thumbnailUrl: fileType === 'image' ? publicPath : null,
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/files') {
    const body = await readJsonBody(req);
    const timestamp = now();
    const id = newId();
    const fileType = body.type || getFileType(body.name || '', '');
    const fileUrl = body.url || `/uploads/${body.storage_path}`;

    db.prepare(`
      INSERT INTO files (id, name, type, size, url, thumbnail_url, storage_path, folder_id, created_at, updated_at, user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      body.name,
      fileType,
      Number(body.size || 0),
      fileUrl,
      body.thumbnail_url ?? (fileType === 'image' ? fileUrl : null),
      body.storage_path,
      sanitizeNullable(body.folder_id),
      timestamp,
      timestamp,
      sanitizeNullable(body.user_id) || 'demo-user-1',
    );

    json(res, 201, db.prepare('SELECT * FROM files WHERE id = ?').get(id));
    return;
  }

  if (req.method === 'PATCH' && /^\/api\/files\/[^/]+$/.test(url.pathname)) {
    const id = decodeURIComponent(url.pathname.replace('/api/files/', ''));
    const existing = db.prepare('SELECT * FROM files WHERE id = ?').get(id);
    if (!existing) {
      json(res, 404, { error: 'File not found.' });
      return;
    }

    const body = await readJsonBody(req);
    db.prepare(`
      UPDATE files
      SET name = ?, folder_id = ?, updated_at = ?
      WHERE id = ?
    `).run(
      body.name ?? existing.name,
      body.folder_id !== undefined ? sanitizeNullable(body.folder_id) : existing.folder_id,
      now(),
      id,
    );

    json(res, 200, db.prepare('SELECT * FROM files WHERE id = ?').get(id));
    return;
  }

  if (req.method === 'DELETE' && /^\/api\/files\/[^/]+$/.test(url.pathname)) {
    const id = decodeURIComponent(url.pathname.replace('/api/files/', ''));
    const file = db.prepare('SELECT * FROM files WHERE id = ?').get(id);
    if (!file) {
      json(res, 404, { error: 'File not found.' });
      return;
    }

    const fullPath = path.join(FILES_DIR, ...String(file.storage_path).split('/'));
    if (existsSync(fullPath)) {
      await unlink(fullPath).catch(() => undefined);
    }
    db.prepare('DELETE FROM files WHERE id = ?').run(id);
    sendEmpty(res);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/share-links') {
    json(res, 200, listShareLinks(sanitizeNullable(url.searchParams.get('documentId'))));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/share-links') {
    const body = await readJsonBody(req);
    const timestamp = now();
    const id = newId();
    const shareToken = newId().replace(/-/g, '');

    db.prepare(`
      INSERT INTO share_links (id, document_id, file_id, share_token, visibility, expires_at, created_at, user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      sanitizeNullable(body.document_id),
      sanitizeNullable(body.file_id),
      shareToken,
      body.visibility || 'private',
      sanitizeNullable(body.expires_at),
      timestamp,
      sanitizeNullable(body.user_id) || 'demo-user-1',
    );

    json(res, 201, db.prepare('SELECT * FROM share_links WHERE id = ?').get(id));
    return;
  }

  if (req.method === 'GET' && /^\/api\/share-links\/token\/[^/]+$/.test(url.pathname)) {
    const token = decodeURIComponent(url.pathname.replace('/api/share-links/token/', ''));
    const link = db.prepare('SELECT * FROM share_links WHERE share_token = ?').get(token);
    if (!link) {
      json(res, 404, { error: 'Share link not found.' });
      return;
    }
    json(res, 200, link);
    return;
  }

  if (req.method === 'DELETE' && /^\/api\/share-links\/[^/]+$/.test(url.pathname)) {
    db.prepare('DELETE FROM share_links WHERE id = ?').run(decodeURIComponent(url.pathname.replace('/api/share-links/', '')));
    sendEmpty(res);
    return;
  }

  json(res, 501, { error: 'Route not implemented yet.' });
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);

    if (url.pathname.startsWith('/uploads/')) {
      await handleUploads(res, url);
      return;
    }

    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
      return;
    }

    text(res, 200, 'Yuque local API server is running.');
  } catch (error) {
    console.error(error);
    json(res, 500, { error: error instanceof Error ? error.message : 'Internal server error.' });
  }
});

server.listen(API_PORT, () => {
  console.log(`Yuque local API server listening on http://127.0.0.1:${API_PORT}`);
  console.log(`SQLite database: ${DB_PATH}`);
  console.log(`File storage root: ${FILES_DIR}`);
  console.log(`Data directory: ${DATA_DIR}`);
});
