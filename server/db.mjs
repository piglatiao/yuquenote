import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const ROOT_DIR = path.resolve(__dirname, '..');
export const DATA_DIR = path.join(ROOT_DIR, 'data');
export const FILES_DIR = path.join(DATA_DIR, 'files');
export const DB_PATH = path.join(DATA_DIR, 'app.db');

await mkdir(FILES_DIR, { recursive: true });

export const db = new DatabaseSync(DB_PATH);

function hasColumn(tableName, columnName) {
  return db.prepare(`PRAGMA table_info(${tableName})`).all().some((column) => column.name === columnName);
}

function ensureColumn(tableName, columnName, definition) {
  if (!hasColumn(tableName, columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

function nowIso() {
  return new Date().toISOString();
}

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, passwordHash) {
  const [salt, hash] = passwordHash.split(':');
  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function sanitizeNullable(value) {
  if (value === undefined || value === null || value === '' || value === 'null' || value === 'undefined') {
    return null;
  }
  return value;
}

export function parseJsonOrDefault(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

export function publicUser(userRow) {
  if (!userRow) {
    return null;
  }

  return {
    id: userRow.id,
    email: userRow.email,
    nickname: userRow.nickname,
    avatar_url: userRow.avatar_url,
    created_at: userRow.created_at,
    updated_at: userRow.updated_at,
  };
}

export function documentRowToModel(row) {
  return {
    ...row,
    is_starred: Boolean(row.is_starred),
    is_deleted: Boolean(row.is_deleted),
  };
}

export function todoRowToModel(row) {
  return {
    ...row,
    tags: parseJsonOrDefault(row.tags, []),
  };
}

export function commentRowToModel(row) {
  return {
    id: row.id,
    document_id: row.document_id,
    parent_id: row.parent_id,
    content: row.content,
    created_at: row.created_at,
    updated_at: row.updated_at,
    user_id: row.user_id,
    user: row.user_ref_id
      ? {
          id: row.user_ref_id,
          email: row.user_email,
          nickname: row.user_nickname,
          avatar_url: row.user_avatar_url,
          created_at: row.user_created_at,
          updated_at: row.user_updated_at,
        }
      : undefined,
  };
}

export function teamRowToModel(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    owner_user_id: row.owner_user_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    membership_status: row.membership_status ?? null,
    is_owner: Boolean(row.is_owner),
  };
}

export function teamMemberRowToModel(row) {
  return {
    id: row.id,
    team_id: row.team_id,
    user_id: row.user_id,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
    user: row.member_ref_id
      ? {
          id: row.member_ref_id,
          email: row.member_email,
          nickname: row.member_nickname,
          avatar_url: row.member_avatar_url,
          created_at: row.member_created_at,
          updated_at: row.member_updated_at,
        }
      : undefined,
  };
}

export function resourcePermissionRowToModel(row) {
  return {
    id: row.id,
    team_id: row.team_id,
    resource_type: row.resource_type,
    resource_id: row.resource_id,
    member_user_id: row.member_user_id,
    can_view: Boolean(row.can_view),
    can_edit: Boolean(row.can_edit),
    can_delete: Boolean(row.can_delete),
    created_at: row.created_at,
    updated_at: row.updated_at,
    user: row.member_ref_id
      ? {
          id: row.member_ref_id,
          email: row.member_email,
          nickname: row.member_nickname,
          avatar_url: row.member_avatar_url,
          created_at: row.member_created_at,
          updated_at: row.member_updated_at,
        }
      : undefined,
  };
}

export function getFileType(filename, mimeType = '') {
  const ext = path.extname(filename).toLowerCase();
  if (mimeType.startsWith('image/') || ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp'].includes(ext)) {
    return 'image';
  }
  if (mimeType.startsWith('video/') || ['.mp4', '.webm', '.mov', '.avi', '.mkv'].includes(ext)) {
    return 'video';
  }
  if (mimeType === 'application/pdf' || ext === '.pdf') {
    return 'pdf';
  }
  if (mimeType.startsWith('audio/') || ['.mp3', '.wav', '.ogg', '.flac', '.aac'].includes(ext)) {
    return 'audio';
  }
  if (['.zip', '.rar', '.7z', '.tar', '.gz'].includes(ext)) {
    return 'archive';
  }
  if (['.doc', '.docx', '.txt', '.md', '.rtf'].includes(ext)) {
    return 'document';
  }
  return 'other';
}

export function mimeTypeForExtension(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mov': 'video/quicktime',
    '.avi': 'video/x-msvideo',
    '.pdf': 'application/pdf',
    '.txt': 'text/plain; charset=utf-8',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.zip': 'application/zip',
    '.rar': 'application/vnd.rar',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
  };
  return map[ext] || 'application/octet-stream';
}

export function getNextOrderIndex(tableName, parentColumn, parentId) {
  const row = parentId
    ? db.prepare(`SELECT COALESCE(MAX(order_index), -1) AS max_order FROM ${tableName} WHERE ${parentColumn} = ?`).get(parentId)
    : db.prepare(`SELECT COALESCE(MAX(order_index), -1) AS max_order FROM ${tableName} WHERE ${parentColumn} IS NULL`).get();

  return Number(row?.max_order ?? -1) + 1;
}

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    nickname TEXT NOT NULL,
    avatar_url TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    parent_id TEXT,
    icon TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    user_id TEXT,
    is_starred INTEGER NOT NULL DEFAULT 0,
    order_index INTEGER NOT NULL DEFAULT 0,
    is_deleted INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL,
    parent_id TEXT,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    user_id TEXT
  );

  CREATE TABLE IF NOT EXISTS todos (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL,
    content TEXT NOT NULL,
    status TEXT NOT NULL,
    priority TEXT NOT NULL,
    due_date TEXT,
    tags TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    user_id TEXT,
    order_index INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS folders (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    parent_id TEXT,
    icon TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    user_id TEXT,
    order_index INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    size INTEGER NOT NULL,
    url TEXT NOT NULL,
    thumbnail_url TEXT,
    storage_path TEXT NOT NULL,
    folder_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    user_id TEXT
  );

  CREATE TABLE IF NOT EXISTS share_links (
    id TEXT PRIMARY KEY,
    document_id TEXT,
    file_id TEXT,
    share_token TEXT NOT NULL UNIQUE,
    visibility TEXT NOT NULL,
    expires_at TEXT,
    created_at TEXT NOT NULL,
    user_id TEXT
  );

  CREATE TABLE IF NOT EXISTS teams (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    owner_user_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS team_members (
    id TEXT PRIMARY KEY,
    team_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(team_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS resource_permissions (
    id TEXT PRIMARY KEY,
    team_id TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id TEXT NOT NULL,
    member_user_id TEXT NOT NULL,
    can_view INTEGER NOT NULL DEFAULT 0,
    can_edit INTEGER NOT NULL DEFAULT 0,
    can_delete INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(team_id, resource_type, resource_id, member_user_id)
  );
`);

ensureColumn('documents', 'team_id', 'TEXT');
ensureColumn('files', 'team_id', 'TEXT');
ensureColumn('share_links', 'team_id', 'TEXT');

const existingUser = db.prepare('SELECT * FROM users WHERE email = ?').get('demo@example.com');
if (!existingUser) {
  const timestamp = nowIso();
  db.prepare(`
    INSERT INTO users (id, email, password_hash, nickname, avatar_url, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run('demo-user-1', 'demo@example.com', hashPassword('123456'), 'Demo User', null, timestamp, timestamp);
}

const secondUser = db.prepare('SELECT * FROM users WHERE email = ?').get('team@example.com');
if (!secondUser) {
  const timestamp = nowIso();
  db.prepare(`
    INSERT INTO users (id, email, password_hash, nickname, avatar_url, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run('demo-user-2', 'team@example.com', hashPassword('123456'), 'Team Member', null, timestamp, timestamp);
}

const documentCount = db.prepare('SELECT COUNT(*) AS count FROM documents').get().count;
if (!documentCount) {
  const timestamp = nowIso();
  db.prepare(`
    INSERT INTO documents (id, title, content, parent_id, icon, created_at, updated_at, user_id, is_starred, order_index, is_deleted)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'doc-1',
    'Welcome',
    '<h1>Welcome to Yuque Notes</h1><p>This installation stores notes in SQLite and uploaded files on disk.</p>',
    null,
    'folder',
    timestamp,
    timestamp,
    'demo-user-1',
    1,
    0,
    0,
  );

  db.prepare(`
    INSERT INTO documents (id, title, content, parent_id, icon, created_at, updated_at, user_id, is_starred, order_index, is_deleted)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'doc-1-1',
    'Quick Start',
    '<h2>Quick Start</h2><ol><li>Login with demo@example.com / 123456</li><li>Create a note</li><li>Upload files into the file manager</li></ol>',
    'doc-1',
    'file',
    timestamp,
    timestamp,
    'demo-user-1',
    0,
    0,
    0,
  );

  db.prepare(`
    INSERT INTO comments (id, document_id, parent_id, content, created_at, updated_at, user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run('comment-1', 'doc-1', null, 'Persistent local storage is enabled.', timestamp, timestamp, 'demo-user-1');

  db.prepare(`
    INSERT INTO todos (id, document_id, content, status, priority, due_date, tags, created_at, updated_at, user_id, order_index)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run('todo-1', 'doc-1', 'Verify persistence after reload', 'pending', 'high', null, JSON.stringify(['storage']), timestamp, timestamp, 'demo-user-1', 0);

  db.prepare(`
    INSERT INTO folders (id, name, parent_id, icon, created_at, updated_at, user_id, order_index)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run('folder-1', 'Uploads', null, 'folder', timestamp, timestamp, 'demo-user-1', 0);
}

export function listDocuments(includeDeleted) {
  const rows = includeDeleted
    ? db.prepare('SELECT * FROM documents ORDER BY parent_id, order_index, created_at').all()
    : db.prepare('SELECT * FROM documents WHERE is_deleted = 0 ORDER BY parent_id, order_index, created_at').all();
  return rows.map(documentRowToModel);
}

export function getUserById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

export function getDocumentById(id) {
  const row = db.prepare('SELECT * FROM documents WHERE id = ?').get(id);
  return row ? documentRowToModel(row) : null;
}

export function listComments(documentId) {
  const rows = db.prepare(`
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
    WHERE c.document_id = ?
    ORDER BY c.created_at ASC
  `).all(documentId);
  return rows.map(commentRowToModel);
}

export function listTodos(documentId) {
  return db.prepare('SELECT * FROM todos WHERE document_id = ? ORDER BY order_index, created_at').all(documentId).map(todoRowToModel);
}

export function listFolders() {
  return db.prepare('SELECT * FROM folders ORDER BY order_index, created_at').all();
}

export function listFiles(folderId) {
  const rows = folderId
    ? db.prepare('SELECT * FROM files WHERE folder_id = ? ORDER BY created_at DESC').all(folderId)
    : db.prepare('SELECT * FROM files WHERE folder_id IS NULL ORDER BY created_at DESC').all();
  return rows;
}

export function listShareLinks(documentId) {
  const rows = documentId
    ? db.prepare('SELECT * FROM share_links WHERE document_id = ? ORDER BY created_at DESC').all(documentId)
    : db.prepare('SELECT * FROM share_links ORDER BY created_at DESC').all();
  return rows;
}

export function getFileById(id) {
  return db.prepare('SELECT * FROM files WHERE id = ?').get(id) || null;
}

export function getShareLinkByToken(token) {
  return db.prepare('SELECT * FROM share_links WHERE share_token = ?').get(token) || null;
}

export function getShareLinkById(id) {
  return db.prepare('SELECT * FROM share_links WHERE id = ?').get(id) || null;
}

export function getTeamById(id) {
  return teamRowToModel(db.prepare('SELECT * FROM teams WHERE id = ?').get(id));
}

export function getTeamMembership(teamId, userId) {
  const row = db.prepare('SELECT * FROM team_members WHERE team_id = ? AND user_id = ?').get(teamId, userId);
  return row || null;
}

export function listTeamsForUser(userId) {
  const rows = db.prepare(`
    SELECT
      t.*,
      tm.status AS membership_status,
      CASE WHEN t.owner_user_id = ? THEN 1 ELSE 0 END AS is_owner
    FROM teams t
    LEFT JOIN team_members tm ON tm.team_id = t.id AND tm.user_id = ?
    WHERE t.owner_user_id = ? OR tm.status = 'approved'
    ORDER BY t.created_at DESC
  `).all(userId, userId, userId);

  return rows.map(teamRowToModel);
}

export function listDiscoverableTeams(userId) {
  const rows = db.prepare(`
    SELECT
      t.*,
      tm.status AS membership_status,
      0 AS is_owner
    FROM teams t
    LEFT JOIN team_members tm ON tm.team_id = t.id AND tm.user_id = ?
    WHERE t.owner_user_id <> ?
    ORDER BY t.created_at DESC
  `).all(userId, userId);

  return rows.map(teamRowToModel);
}

export function listTeamMembers(teamId, status = 'approved') {
  const rows = db.prepare(`
    SELECT
      tm.*,
      u.id AS member_ref_id,
      u.email AS member_email,
      u.nickname AS member_nickname,
      u.avatar_url AS member_avatar_url,
      u.created_at AS member_created_at,
      u.updated_at AS member_updated_at
    FROM team_members tm
    INNER JOIN users u ON u.id = tm.user_id
    WHERE tm.team_id = ? AND tm.status = ?
    ORDER BY u.nickname COLLATE NOCASE ASC, u.email COLLATE NOCASE ASC
  `).all(teamId, status);

  return rows.map(teamMemberRowToModel);
}

export function listTeamJoinRequests(teamId) {
  return listTeamMembers(teamId, 'pending');
}

export function listResourcePermissions(teamId, resourceType, resourceId, query = '') {
  const pattern = `%${query.trim()}%`;
  const rows = db.prepare(`
    SELECT
      tm.id,
      tm.team_id,
      tm.user_id,
      tm.status,
      tm.created_at,
      tm.updated_at,
      rp.id AS permission_id,
      rp.resource_type,
      rp.resource_id,
      rp.member_user_id,
      rp.can_view,
      rp.can_edit,
      rp.can_delete,
      rp.created_at AS permission_created_at,
      rp.updated_at AS permission_updated_at,
      u.id AS member_ref_id,
      u.email AS member_email,
      u.nickname AS member_nickname,
      u.avatar_url AS member_avatar_url,
      u.created_at AS member_created_at,
      u.updated_at AS member_updated_at
    FROM team_members tm
    INNER JOIN users u ON u.id = tm.user_id
    LEFT JOIN resource_permissions rp
      ON rp.team_id = tm.team_id
      AND rp.resource_type = ?
      AND rp.resource_id = ?
      AND rp.member_user_id = tm.user_id
    WHERE tm.team_id = ?
      AND tm.status = 'approved'
      AND (u.nickname LIKE ? OR u.email LIKE ?)
    ORDER BY u.nickname COLLATE NOCASE ASC, u.email COLLATE NOCASE ASC
  `).all(resourceType, resourceId, teamId, pattern, pattern);

  return rows.map((row) =>
    resourcePermissionRowToModel({
      id: row.permission_id || `virtual-${teamId}-${resourceType}-${resourceId}-${row.user_id}`,
      team_id: teamId,
      resource_type: resourceType,
      resource_id: resourceId,
      member_user_id: row.user_id,
      can_view: row.can_view ?? 0,
      can_edit: row.can_edit ?? 0,
      can_delete: row.can_delete ?? 0,
      created_at: row.permission_created_at || row.created_at,
      updated_at: row.permission_updated_at || row.updated_at,
      member_ref_id: row.member_ref_id,
      member_email: row.member_email,
      member_nickname: row.member_nickname,
      member_avatar_url: row.member_avatar_url,
      member_created_at: row.member_created_at,
      member_updated_at: row.member_updated_at,
    }),
  );
}

export function getResourcePermission(teamId, resourceType, resourceId, memberUserId) {
  const row = db.prepare(`
    SELECT
      rp.*,
      u.id AS member_ref_id,
      u.email AS member_email,
      u.nickname AS member_nickname,
      u.avatar_url AS member_avatar_url,
      u.created_at AS member_created_at,
      u.updated_at AS member_updated_at
    FROM resource_permissions rp
    LEFT JOIN users u ON u.id = rp.member_user_id
    WHERE rp.team_id = ? AND rp.resource_type = ? AND rp.resource_id = ? AND rp.member_user_id = ?
  `).get(teamId, resourceType, resourceId, memberUserId);

  return row ? resourcePermissionRowToModel(row) : null;
}

export function listPublicDocuments() {
  const rows = db.prepare(`
    SELECT d.*, sl.share_token
    FROM documents d
    INNER JOIN share_links sl ON sl.document_id = d.id
    WHERE sl.visibility = 'public' AND d.is_deleted = 0
    ORDER BY d.updated_at DESC
  `).all();

  return rows.map((row) => ({
    ...documentRowToModel(row),
    share_token: row.share_token,
  }));
}

export function listPublicFiles() {
  const rows = db.prepare(`
    SELECT f.*, sl.share_token
    FROM files f
    INNER JOIN share_links sl ON sl.file_id = f.id
    WHERE sl.visibility = 'public'
    ORDER BY f.updated_at DESC
  `).all();

  return rows;
}

export function deleteDocumentRecursive(id) {
  const childRows = db.prepare('SELECT id FROM documents WHERE parent_id = ?').all(id);
  for (const child of childRows) {
    deleteDocumentRecursive(child.id);
  }
  db.prepare('DELETE FROM documents WHERE id = ?').run(id);
}

export function newId() {
  return randomUUID();
}

export function now() {
  return nowIso();
}
