import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  DATA_DIR,
  DB_PATH,
  FILES_DIR,
  ROOT_DIR,
  hashPassword,
  commentRowToModel,
  db,
  deleteDocumentRecursive,
  documentRowToModel,
  fileRowToModel,
  getDocumentById,
  getFolderById,
  getFileById,
  getFileType,
  getNextOrderIndex,
  getResourcePermission,
  getShareLinkById,
  getShareLinkByToken,
  getShareLinkRowById,
  getShareLinkRowByToken,
  getTeamById,
  getTeamInvitationById,
  getTeamMembership,
  getUserById,
  listComments,
  listDiscoverableTeams,
  listDocuments,
  listFiles,
  listFolders,
  listPendingInvitationsForUser,
  listPublicDocuments,
  listPublicFiles,
  listResourcePermissions,
  listShareLinks,
  listTeamInvitations,
  listTeamJoinRequests,
  listTeamMembers,
  listTeamsForUser,
  listTodos,
  mimeTypeForExtension,
  newId,
  normalizeShareVisibility,
  now,
  publicUser,
  getPendingTeamInvitationByCode,
  searchInvitableUsers,
  sanitizeNullable,
  shareLinkRowToModel,
  todoRowToModel,
  verifyPassword,
} from './db.mjs';
import { json, readJsonBody, readRequestBuffer, sendEmpty, text } from './utils.mjs';

const API_PORT = Number(process.env.PORT || process.env.YUQUE_API_PORT || 3001);
const SERVER_HOST = process.env.HOST || process.env.YUQUE_HOST || '0.0.0.0';
const DIST_DIR = path.resolve(process.env.YUQUE_STATIC_DIR || path.join(ROOT_DIR, 'dist'));
const RESOURCE_TYPES = new Set(['document', 'file']);

function getCurrentUserId(req) {
  const raw = req.headers['x-user-id'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return sanitizeNullable(value);
}

function getCurrentUser(req) {
  const userId = getCurrentUserId(req);
  return userId ? getUserById(userId) : null;
}

function requireAuth(req, res) {
  const user = getCurrentUser(req);
  if (!user) {
    json(res, 401, { error: 'Please log in first.' });
    return null;
  }
  return user;
}

function isApprovedTeamMember(userId, teamId) {
  if (!userId || !teamId) return false;
  const membership = getTeamMembership(teamId, userId);
  return membership?.status === 'approved';
}

function isTeamOwner(userId, teamId) {
  if (!userId || !teamId) return false;
  const team = getTeamById(teamId);
  return Boolean(team && team.owner_user_id === userId);
}

function serializeTeamForUser(team, userId) {
  if (!team) return null;

  const isOwner = Boolean(userId && team.owner_user_id === userId);
  const membership = userId ? getTeamMembership(team.id, userId) : null;

  return {
    ...team,
    is_owner: isOwner,
    membership_status: isOwner ? 'approved' : membership?.status ?? team.membership_status ?? null,
  };
}

function hasAvailableTeamSeat(teamId) {
  const team = getTeamById(teamId);
  const approvedCountRow = db
    .prepare("SELECT COUNT(*) AS count FROM team_members WHERE team_id = ? AND status = 'approved'")
    .get(teamId);
  const approvedCount = Number(approvedCountRow?.count ?? 0);
  const memberLimit = Number(team?.member_limit ?? 10);

  return approvedCount < memberLimit;
}

function generateInviteCode() {
  return randomBytes(4).toString('hex').toUpperCase();
}

function approveMembership(teamId, userId) {
  const timestamp = now();
  const existingMembership = getTeamMembership(teamId, userId);

  if (existingMembership) {
    db.prepare('UPDATE team_members SET status = ?, updated_at = ? WHERE id = ?').run('approved', timestamp, existingMembership.id);
    return;
  }

  db.prepare(`
    INSERT INTO team_members (id, team_id, user_id, status, created_at, updated_at)
    VALUES (?, ?, ?, 'approved', ?, ?)
  `).run(newId(), teamId, userId, timestamp, timestamp);
}

function canViewDocument(userId, document) {
  if (!document) return false;
  if (document.user_id === userId) return true;
  const teamId = sanitizeNullable(document.team_id);
  if (!teamId || !userId || !isApprovedTeamMember(userId, teamId)) return false;
  return Boolean(getResourcePermission(teamId, 'document', document.id, userId)?.can_view);
}

function canEditDocument(userId, document) {
  if (!document) return false;
  if (document.user_id === userId) return true;
  const teamId = sanitizeNullable(document.team_id);
  if (!teamId || !userId || !isApprovedTeamMember(userId, teamId)) return false;
  return Boolean(getResourcePermission(teamId, 'document', document.id, userId)?.can_edit);
}

function canDeleteDocument(userId, document) {
  if (!document) return false;
  if (document.user_id === userId) return true;
  const teamId = sanitizeNullable(document.team_id);
  if (!teamId || !userId || !isApprovedTeamMember(userId, teamId)) return false;
  return Boolean(getResourcePermission(teamId, 'document', document.id, userId)?.can_delete);
}

function canViewFile(userId, file) {
  if (!file) return false;
  if (file.user_id === userId) return true;
  const teamId = sanitizeNullable(file.team_id);
  if (!teamId || !userId || !isApprovedTeamMember(userId, teamId)) return false;
  return Boolean(getResourcePermission(teamId, 'file', file.id, userId)?.can_view);
}

function canEditFile(userId, file) {
  if (!file) return false;
  if (file.user_id === userId) return true;
  const teamId = sanitizeNullable(file.team_id);
  if (!teamId || !userId || !isApprovedTeamMember(userId, teamId)) return false;
  return Boolean(getResourcePermission(teamId, 'file', file.id, userId)?.can_edit);
}

function canDeleteFile(userId, file) {
  if (!file) return false;
  if (file.user_id === userId) return true;
  const teamId = sanitizeNullable(file.team_id);
  if (!teamId || !userId || !isApprovedTeamMember(userId, teamId)) return false;
  return Boolean(getResourcePermission(teamId, 'file', file.id, userId)?.can_delete);
}

function canAccessFolder(userId, folder) {
  if (!folder || !userId) return false;
  const teamId = sanitizeNullable(folder.team_id);
  if (!teamId) {
    return folder.user_id === userId;
  }
  return isApprovedTeamMember(userId, teamId);
}

function canManageFolder(userId, folder) {
  if (!folder || !userId) return false;
  const teamId = sanitizeNullable(folder.team_id);
  if (!teamId) {
    return folder.user_id === userId;
  }
  return isTeamOwner(userId, teamId);
}

function collectDescendantFolderIds(rootFolderId) {
  const rows = listFolders();
  const childrenByParentId = new Map();

  rows.forEach((folder) => {
    const parentId = sanitizeNullable(folder.parent_id);
    if (!parentId) {
      return;
    }

    const siblings = childrenByParentId.get(parentId) ?? [];
    siblings.push(folder.id);
    childrenByParentId.set(parentId, siblings);
  });

  const ids = [];
  const stack = [rootFolderId];

  while (stack.length > 0) {
    const currentId = stack.pop();
    if (!currentId || ids.includes(currentId)) {
      continue;
    }

    ids.push(currentId);
    const childIds = childrenByParentId.get(currentId) ?? [];
    childIds.forEach((childId) => stack.push(childId));
  }

  return ids;
}

function listFilesInFolders(folderIds) {
  if (!Array.isArray(folderIds) || folderIds.length === 0) {
    return [];
  }

  const placeholders = folderIds.map(() => '?').join(', ');
  return db.prepare(`SELECT * FROM files WHERE folder_id IN (${placeholders}) ORDER BY created_at DESC`).all(...folderIds);
}

async function deleteFileRecords(files) {
  for (const file of files) {
    const fullPath = path.join(FILES_DIR, ...String(file.storage_path).split('/'));
    if (existsSync(fullPath)) {
      await unlink(fullPath).catch(() => undefined);
    }
  }

  files.forEach((file) => {
    db.prepare('DELETE FROM share_links WHERE file_id = ?').run(file.id);
    db.prepare("DELETE FROM resource_permissions WHERE resource_type = 'file' AND resource_id = ?").run(file.id);
    db.prepare('DELETE FROM files WHERE id = ?').run(file.id);
  });
}

function normalizeRequestedTeamId(rawValue) {
  if (rawValue === '__personal__') {
    return null;
  }
  return sanitizeNullable(rawValue);
}

function buildWorkspaceStorageScope(teamId) {
  if (!teamId) {
    return 'personal';
  }
  return `team-${String(teamId).replace(/[^a-zA-Z0-9_-]/g, '_')}`;
}

function ensureTeamOwner(res, userId, teamId) {
  if (!teamId || !isTeamOwner(userId, teamId)) {
    json(res, 403, { error: 'Only the team owner can manage this team.' });
    return false;
  }
  return true;
}

function canShareResourceToSpace(userId, resource, targetTeamId) {
  if (!userId || !resource || !targetTeamId) {
    return false;
  }

  const resourceTeamId = sanitizeNullable(resource.team_id);
  if (resourceTeamId) {
    return isApprovedTeamMember(userId, targetTeamId);
  }

  return isTeamOwner(userId, targetTeamId);
}

function canCreateShareLink(userId, resourceType, resource, visibility) {
  if (!userId || !resource) {
    return false;
  }

  if (resource.user_id === userId) {
    return true;
  }

  const resourceTeamId = sanitizeNullable(resource.team_id);
  if (!resourceTeamId || visibility !== 'space') {
    return false;
  }

  return resourceType === 'document'
    ? canViewDocument(userId, resource)
    : canViewFile(userId, resource);
}

function resolveSharePayload(link) {
  if (!link) return null;
  if (link.document_id) {
    return {
      type: 'document',
      resource: getDocumentById(link.document_id),
    };
  }
  if (link.file_id) {
    return {
      type: 'file',
      resource: getFileById(link.file_id),
    };
  }
  return null;
}

function canAccessShareLink(userId, link, payload, providedPassword = null) {
  if (!link || !payload?.resource) {
    return { allowed: false, status: 404, message: 'Shared resource not found.' };
  }

  if (link.expires_at && new Date(link.expires_at).getTime() < Date.now()) {
    return { allowed: false, status: 410, message: 'Share link has expired.' };
  }

  const visibility = normalizeShareVisibility(link.visibility);

  if (link.password_hash) {
    const password = typeof providedPassword === 'string' ? providedPassword : '';
    if (!password) {
      return { allowed: false, status: 428, message: 'This share link requires a password.' };
    }

    if (!verifyPassword(password, link.password_hash)) {
      return { allowed: false, status: 403, message: 'The share password is incorrect.' };
    }
  }

  if (visibility === 'link') {
    return { allowed: true };
  }

  if (!userId) {
    return { allowed: false, status: 401, message: 'Please log in first.' };
  }

  if (visibility === 'private') {
    const ownerId = payload.resource.user_id;
    return ownerId === userId
      ? { allowed: true }
      : { allowed: false, status: 403, message: 'You do not have access to this private resource.' };
  }

  if (visibility === 'space') {
    const teamId = sanitizeNullable(link.team_id) || sanitizeNullable(payload.resource.team_id);
    if (!teamId || !isApprovedTeamMember(userId, teamId)) {
      return { allowed: false, status: 403, message: 'You are not a member of this workspace.' };
    }

    return { allowed: true };
  }

  return { allowed: false, status: 403, message: 'Share visibility is invalid.' };
}

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

function isPathWithin(basePath, targetPath) {
  const relative = path.relative(basePath, targetPath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function streamFile(res, filePath, cacheControl = 'no-cache') {
  const fileInfo = await stat(filePath).catch(() => null);
  if (!fileInfo?.isFile()) {
    return false;
  }

  res.writeHead(200, {
    'Content-Type': mimeTypeForExtension(filePath),
    'Cache-Control': cacheControl,
  });
  createReadStream(filePath).pipe(res);
  return true;
}

async function handleFrontend(req, res, url) {
  if (!['GET', 'HEAD'].includes(req.method || 'GET')) {
    text(res, 405, 'Method not allowed.');
    return;
  }

  const requestPath = decodeURIComponent(url.pathname);
  const relativePath = requestPath === '/' ? 'index.html' : requestPath.replace(/^\/+/, '');
  const staticFilePath = path.resolve(DIST_DIR, relativePath);

  if (isPathWithin(DIST_DIR, staticFilePath)) {
    const served = await streamFile(
      res,
      staticFilePath,
      requestPath.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
    );
    if (served) {
      return;
    }
  }

  if (path.extname(requestPath)) {
    text(res, 404, 'Not found.');
    return;
  }

  const indexPath = path.join(DIST_DIR, 'index.html');
  const served = await streamFile(res, indexPath, 'no-cache');
  if (served) {
    return;
  }

  text(res, 200, 'Yuque local API server is running.');
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

  if (req.method === 'GET' && url.pathname === '/api/users') {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const rows = db.prepare('SELECT * FROM users ORDER BY created_at ASC').all();
    json(res, 200, rows.map(publicUser));
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

  if (req.method === 'GET' && url.pathname === '/api/teams') {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const scope = url.searchParams.get('scope');
    if (scope === 'discover') {
      json(res, 200, listDiscoverableTeams(currentUser.id));
      return;
    }

    json(res, 200, listTeamsForUser(currentUser.id));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/teams') {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const body = await readJsonBody(req);
    const name = String(body.name || '').trim();
    if (!name) {
      json(res, 400, { error: 'Team name is required.' });
      return;
    }

    const timestamp = now();
    const teamId = newId();
    const membershipId = newId();

    db.prepare(`
      INSERT INTO teams (id, name, owner_user_id, avatar_url, member_limit, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(teamId, name, currentUser.id, null, 10, timestamp, timestamp);

    db.prepare(`
      INSERT INTO team_members (id, team_id, user_id, status, created_at, updated_at)
      VALUES (?, ?, ?, 'approved', ?, ?)
    `).run(membershipId, teamId, currentUser.id, timestamp, timestamp);

    json(res, 201, {
      ...getTeamById(teamId),
      membership_status: 'approved',
      is_owner: true,
    });
    return;
  }

  if (req.method === 'PATCH' && /^\/api\/teams\/[^/]+$/.test(url.pathname)) {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const teamId = decodeURIComponent(url.pathname.replace('/api/teams/', ''));
    if (!ensureTeamOwner(res, currentUser.id, teamId)) return;

    const existingTeam = getTeamById(teamId);
    if (!existingTeam) {
      json(res, 404, { error: 'Team not found.' });
      return;
    }

    const body = await readJsonBody(req);
    const nextName = body.name !== undefined ? String(body.name || '').trim() : existingTeam.name;
    const nextAvatarUrl = body.avatar_url !== undefined ? sanitizeNullable(body.avatar_url) : existingTeam.avatar_url;
    const nextCreatedAt = body.created_at !== undefined ? String(body.created_at || '').trim() : existingTeam.created_at;
    const nextMemberLimit = body.member_limit !== undefined ? Number(body.member_limit) : Number(existingTeam.member_limit ?? 10);

    if (!nextName) {
      json(res, 400, { error: 'Team name is required.' });
      return;
    }

    if (!nextCreatedAt || Number.isNaN(new Date(nextCreatedAt).getTime())) {
      json(res, 400, { error: 'created_at must be a valid datetime.' });
      return;
    }

    if (!Number.isInteger(nextMemberLimit) || nextMemberLimit < 1) {
      json(res, 400, { error: 'member_limit must be a positive integer.' });
      return;
    }

    const approvedCountRow = db
      .prepare("SELECT COUNT(*) AS count FROM team_members WHERE team_id = ? AND status = 'approved'")
      .get(teamId);
    const approvedCount = Number(approvedCountRow?.count ?? 0);
    if (nextMemberLimit < approvedCount) {
      json(res, 400, { error: 'member_limit cannot be lower than the current approved member count.' });
      return;
    }

    db.prepare(`
      UPDATE teams
      SET name = ?, avatar_url = ?, member_limit = ?, created_at = ?, updated_at = ?
      WHERE id = ?
    `).run(nextName, nextAvatarUrl, nextMemberLimit, nextCreatedAt, now(), teamId);

    json(res, 200, serializeTeamForUser(getTeamById(teamId), currentUser.id));
    return;
  }

  if (req.method === 'GET' && /^\/api\/teams\/[^/]+$/.test(url.pathname)) {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const teamId = decodeURIComponent(url.pathname.replace('/api/teams/', ''));
    const team = getTeamById(teamId);
    if (!team) {
      json(res, 404, { error: 'Team not found.' });
      return;
    }

    if (!(team.owner_user_id === currentUser.id || isApprovedTeamMember(currentUser.id, teamId))) {
      json(res, 403, { error: 'You do not have access to this team.' });
      return;
    }

    json(res, 200, serializeTeamForUser(team, currentUser.id));
    return;
  }

  if (req.method === 'GET' && /^\/api\/teams\/[^/]+\/invite-candidates$/.test(url.pathname)) {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const teamId = decodeURIComponent(url.pathname.replace('/invite-candidates', '').replace('/api/teams/', ''));
    if (!ensureTeamOwner(res, currentUser.id, teamId)) return;

    const query = String(url.searchParams.get('query') || '').trim();
    if (!query) {
      json(res, 200, []);
      return;
    }

    json(res, 200, searchInvitableUsers(teamId, query));
    return;
  }

  if (req.method === 'GET' && /^\/api\/teams\/[^/]+\/invitations$/.test(url.pathname)) {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const teamId = decodeURIComponent(url.pathname.replace('/invitations', '').replace('/api/teams/', ''));
    if (!ensureTeamOwner(res, currentUser.id, teamId)) return;

    json(res, 200, listTeamInvitations(teamId));
    return;
  }

  if (req.method === 'POST' && /^\/api\/teams\/[^/]+\/invitations$/.test(url.pathname)) {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const teamId = decodeURIComponent(url.pathname.replace('/invitations', '').replace('/api/teams/', ''));
    if (!ensureTeamOwner(res, currentUser.id, teamId)) return;

    const team = getTeamById(teamId);
    if (!team) {
      json(res, 404, { error: 'Team not found.' });
      return;
    }

    const body = await readJsonBody(req);
    const inviteType = String(body.invite_type || '').trim();
    const timestamp = now();

    if (inviteType === 'code') {
      db.prepare(`
        UPDATE team_invitations
        SET status = 'revoked', updated_at = ?
        WHERE team_id = ? AND invite_type = 'code' AND status = 'pending'
      `).run(timestamp, teamId);

      let code = '';
      do {
        code = generateInviteCode();
      } while (db.prepare('SELECT id FROM team_invitations WHERE code = ?').get(code));

      const invitationId = newId();
      db.prepare(`
        INSERT INTO team_invitations (
          id, team_id, invite_type, code, invited_email, invited_user_id, status,
          created_by_user_id, accepted_by_user_id, accepted_at, created_at, updated_at
        )
        VALUES (?, ?, 'code', ?, NULL, NULL, 'pending', ?, NULL, NULL, ?, ?)
      `).run(invitationId, teamId, code, currentUser.id, timestamp, timestamp);

      json(res, 201, listTeamInvitations(teamId).find((invite) => invite.id === invitationId) || null);
      return;
    }

    if (inviteType === 'email') {
      const invitedUserId = sanitizeNullable(body.invited_user_id);
      if (!invitedUserId) {
        json(res, 400, { error: 'invited_user_id is required.' });
        return;
      }

      const invitedUser = getUserById(invitedUserId);
      if (!invitedUser) {
        json(res, 404, { error: 'Invited user not found.' });
        return;
      }

      if (invitedUser.id === team.owner_user_id) {
        json(res, 409, { error: 'The team owner does not need an invitation.' });
        return;
      }

      const membership = getTeamMembership(teamId, invitedUser.id);
      if (membership?.status === 'approved') {
        json(res, 409, { error: 'This user is already a team member.' });
        return;
      }

      if (membership?.status === 'pending') {
        json(res, 409, { error: 'This user already has a pending join request.' });
        return;
      }

      const existingInvite = db.prepare(`
        SELECT id
        FROM team_invitations
        WHERE team_id = ?
          AND invite_type = 'email'
          AND invited_user_id = ?
          AND status = 'pending'
      `).get(teamId, invitedUser.id);

      if (existingInvite) {
        json(res, 409, { error: 'This user already has a pending invitation.' });
        return;
      }

      const invitationId = newId();
      db.prepare(`
        INSERT INTO team_invitations (
          id, team_id, invite_type, code, invited_email, invited_user_id, status,
          created_by_user_id, accepted_by_user_id, accepted_at, created_at, updated_at
        )
        VALUES (?, ?, 'email', NULL, ?, ?, 'pending', ?, NULL, NULL, ?, ?)
      `).run(invitationId, teamId, invitedUser.email, invitedUser.id, currentUser.id, timestamp, timestamp);

      json(res, 201, listTeamInvitations(teamId).find((invite) => invite.id === invitationId) || null);
      return;
    }

    json(res, 400, { error: 'invite_type must be code or email.' });
    return;
  }

  if (req.method === 'POST' && /^\/api\/teams\/[^/]+\/invitations\/[^/]+\/revoke$/.test(url.pathname)) {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const segments = url.pathname.split('/');
    const teamId = decodeURIComponent(segments[3]);
    const invitationId = decodeURIComponent(segments[5]);
    if (!ensureTeamOwner(res, currentUser.id, teamId)) return;

    const invitation = getTeamInvitationById(invitationId);
    if (!invitation || invitation.team_id !== teamId) {
      json(res, 404, { error: 'Invitation not found.' });
      return;
    }

    db.prepare(`
      UPDATE team_invitations
      SET status = 'revoked', updated_at = ?
      WHERE id = ?
    `).run(now(), invitationId);

    json(res, 200, { ok: true });
    return;
  }

  if (req.method === 'GET' && /^\/api\/teams\/[^/]+\/members$/.test(url.pathname)) {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const teamId = decodeURIComponent(url.pathname.replace('/members', '').replace('/api/teams/', ''));
    const team = getTeamById(teamId);
    if (!team) {
      json(res, 404, { error: 'Team not found.' });
      return;
    }

    if (!(team.owner_user_id === currentUser.id || isApprovedTeamMember(currentUser.id, teamId))) {
      json(res, 403, { error: 'You do not have access to this team.' });
      return;
    }

    json(res, 200, listTeamMembers(teamId));
    return;
  }

  if (req.method === 'POST' && /^\/api\/teams\/[^/]+\/join-requests$/.test(url.pathname)) {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const teamId = decodeURIComponent(url.pathname.replace('/join-requests', '').replace('/api/teams/', ''));
    const team = getTeamById(teamId);
    if (!team) {
      json(res, 404, { error: 'Team not found.' });
      return;
    }

    const existingMembership = getTeamMembership(teamId, currentUser.id);
    const timestamp = now();

    if (existingMembership?.status === 'approved') {
      json(res, 409, { error: 'You are already a team member.' });
      return;
    }

    if (existingMembership?.status === 'pending') {
      json(res, 409, { error: 'Your join request is still pending.' });
      return;
    }

    if (existingMembership) {
      db.prepare('UPDATE team_members SET status = ?, updated_at = ? WHERE id = ?').run('pending', timestamp, existingMembership.id);
      json(res, 200, { ok: true });
      return;
    }

    db.prepare(`
      INSERT INTO team_members (id, team_id, user_id, status, created_at, updated_at)
      VALUES (?, ?, ?, 'pending', ?, ?)
    `).run(newId(), teamId, currentUser.id, timestamp, timestamp);

    json(res, 201, { ok: true });
    return;
  }

  if (req.method === 'GET' && /^\/api\/teams\/[^/]+\/join-requests$/.test(url.pathname)) {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const teamId = decodeURIComponent(url.pathname.replace('/join-requests', '').replace('/api/teams/', ''));
    if (!ensureTeamOwner(res, currentUser.id, teamId)) return;

    json(res, 200, listTeamJoinRequests(teamId));
    return;
  }

  if (req.method === 'POST' && /^\/api\/teams\/[^/]+\/join-requests\/[^/]+\/approve$/.test(url.pathname)) {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const segments = url.pathname.split('/');
    const teamId = decodeURIComponent(segments[3]);
    const requestId = decodeURIComponent(segments[5]);
    if (!ensureTeamOwner(res, currentUser.id, teamId)) return;

    const membership = db.prepare('SELECT * FROM team_members WHERE id = ? AND team_id = ?').get(requestId, teamId);
    if (!membership) {
      json(res, 404, { error: 'Join request not found.' });
      return;
    }

    const team = getTeamById(teamId);
    const approvedCountRow = db
      .prepare("SELECT COUNT(*) AS count FROM team_members WHERE team_id = ? AND status = 'approved'")
      .get(teamId);
    const approvedCount = Number(approvedCountRow?.count ?? 0);
    const memberLimit = Number(team?.member_limit ?? 10);
    if (approvedCount >= memberLimit) {
      json(res, 409, { error: 'Team member limit reached.' });
      return;
    }

    db.prepare('UPDATE team_members SET status = ?, updated_at = ? WHERE id = ?').run('approved', now(), requestId);
    json(res, 200, { ok: true });
    return;
  }

  if (req.method === 'POST' && /^\/api\/teams\/[^/]+\/join-requests\/[^/]+\/reject$/.test(url.pathname)) {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const segments = url.pathname.split('/');
    const teamId = decodeURIComponent(segments[3]);
    const requestId = decodeURIComponent(segments[5]);
    if (!ensureTeamOwner(res, currentUser.id, teamId)) return;

    const membership = db.prepare('SELECT * FROM team_members WHERE id = ? AND team_id = ?').get(requestId, teamId);
    if (!membership) {
      json(res, 404, { error: 'Join request not found.' });
      return;
    }

    db.prepare('UPDATE team_members SET status = ?, updated_at = ? WHERE id = ?').run('rejected', now(), requestId);
    json(res, 200, { ok: true });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/team-invitations/mine') {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    json(res, 200, listPendingInvitationsForUser(currentUser.id, currentUser.email));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/team-invitations/accept-by-code') {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const body = await readJsonBody(req);
    const code = String(body.code || '').trim().toUpperCase();
    if (!code) {
      json(res, 400, { error: 'Invitation code is required.' });
      return;
    }

    const invitation = getPendingTeamInvitationByCode(code);
    if (!invitation) {
      json(res, 404, { error: 'Invitation code not found or expired.' });
      return;
    }

    const team = getTeamById(invitation.team_id);
    if (!team) {
      json(res, 404, { error: 'Team not found.' });
      return;
    }

    if (team.owner_user_id === currentUser.id || isApprovedTeamMember(currentUser.id, team.id)) {
      json(res, 200, { ok: true, team: serializeTeamForUser(team, currentUser.id) });
      return;
    }

    if (!hasAvailableTeamSeat(team.id)) {
      json(res, 409, { error: 'Team member limit reached.' });
      return;
    }

    approveMembership(team.id, currentUser.id);
    json(res, 200, { ok: true, team: serializeTeamForUser(getTeamById(team.id), currentUser.id) });
    return;
  }

  if (req.method === 'POST' && /^\/api\/team-invitations\/[^/]+\/accept$/.test(url.pathname)) {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const invitationId = decodeURIComponent(url.pathname.split('/')[3]);
    const invitation = getTeamInvitationById(invitationId);
    if (!invitation || invitation.invite_type !== 'email' || invitation.status !== 'pending') {
      json(res, 404, { error: 'Invitation not found.' });
      return;
    }

    if (!(invitation.invited_user_id === currentUser.id || invitation.invited_email === currentUser.email)) {
      json(res, 403, { error: 'You do not have access to this invitation.' });
      return;
    }

    const team = getTeamById(invitation.team_id);
    if (!team) {
      json(res, 404, { error: 'Team not found.' });
      return;
    }

    if (team.owner_user_id === currentUser.id || isApprovedTeamMember(currentUser.id, team.id)) {
      db.prepare(`
        UPDATE team_invitations
        SET status = 'accepted', accepted_by_user_id = ?, accepted_at = ?, updated_at = ?
        WHERE id = ?
      `).run(currentUser.id, now(), now(), invitation.id);

      json(res, 200, { ok: true, team: serializeTeamForUser(team, currentUser.id) });
      return;
    }

    if (!hasAvailableTeamSeat(team.id)) {
      json(res, 409, { error: 'Team member limit reached.' });
      return;
    }

    approveMembership(team.id, currentUser.id);
    db.prepare(`
      UPDATE team_invitations
      SET status = 'accepted', accepted_by_user_id = ?, accepted_at = ?, updated_at = ?
      WHERE id = ?
    `).run(currentUser.id, now(), now(), invitation.id);

    json(res, 200, { ok: true, team: serializeTeamForUser(getTeamById(team.id), currentUser.id) });
    return;
  }

  if (req.method === 'POST' && /^\/api\/team-invitations\/[^/]+\/reject$/.test(url.pathname)) {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const invitationId = decodeURIComponent(url.pathname.split('/')[3]);
    const invitation = getTeamInvitationById(invitationId);
    if (!invitation || invitation.invite_type !== 'email' || invitation.status !== 'pending') {
      json(res, 404, { error: 'Invitation not found.' });
      return;
    }

    if (!(invitation.invited_user_id === currentUser.id || invitation.invited_email === currentUser.email)) {
      json(res, 403, { error: 'You do not have access to this invitation.' });
      return;
    }

    db.prepare(`
      UPDATE team_invitations
      SET status = 'declined', updated_at = ?
      WHERE id = ?
    `).run(now(), invitation.id);

    json(res, 200, { ok: true });
    return;
  }

  if (req.method === 'GET' && /^\/api\/teams\/[^/]+\/resource-permissions$/.test(url.pathname)) {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const teamId = decodeURIComponent(url.pathname.replace('/resource-permissions', '').replace('/api/teams/', ''));
    if (!ensureTeamOwner(res, currentUser.id, teamId)) return;

    const resourceType = String(url.searchParams.get('resourceType') || '').trim();
    const resourceId = String(url.searchParams.get('resourceId') || '').trim();
    if (!RESOURCE_TYPES.has(resourceType) || !resourceId) {
      json(res, 400, { error: 'resourceType and resourceId are required.' });
      return;
    }

    json(res, 200, listResourcePermissions(teamId, resourceType, resourceId, String(url.searchParams.get('query') || '')));
    return;
  }

  if (req.method === 'PUT' && /^\/api\/teams\/[^/]+\/resource-permissions\/batch$/.test(url.pathname)) {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const teamId = decodeURIComponent(url.pathname.replace('/resource-permissions/batch', '').replace('/api/teams/', ''));
    if (!ensureTeamOwner(res, currentUser.id, teamId)) return;

    const body = await readJsonBody(req);
    const resourceType = String(body.resource_type || '').trim();
    const resourceId = String(body.resource_id || '').trim();
    const entries = Array.isArray(body.entries) ? body.entries : [];

    if (!RESOURCE_TYPES.has(resourceType) || !resourceId) {
      json(res, 400, { error: 'resource_type and resource_id are required.' });
      return;
    }

    const timestamp = now();
    db.prepare('DELETE FROM resource_permissions WHERE team_id = ? AND resource_type = ? AND resource_id = ?').run(teamId, resourceType, resourceId);

    const insert = db.prepare(`
      INSERT INTO resource_permissions (
        id, team_id, resource_type, resource_id, member_user_id, can_view, can_edit, can_delete, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const entry of entries) {
      const memberUserId = sanitizeNullable(entry.member_user_id);
      if (!memberUserId) continue;

      const membership = getTeamMembership(teamId, memberUserId);
      if (!membership || membership.status !== 'approved') continue;

      const canView = Number(Boolean(entry.can_view));
      const canEdit = Number(Boolean(entry.can_edit));
      const canDelete = Number(Boolean(entry.can_delete));
      if (!canView && !canEdit && !canDelete) continue;

      insert.run(newId(), teamId, resourceType, resourceId, memberUserId, canView, canEdit, canDelete, timestamp, timestamp);
    }

    json(res, 200, listResourcePermissions(teamId, resourceType, resourceId));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/public/documents') {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const requestedTeamId = normalizeRequestedTeamId(url.searchParams.get('teamId'));
    if (requestedTeamId && !isTeamOwner(currentUser.id, requestedTeamId) && !isApprovedTeamMember(currentUser.id, requestedTeamId)) {
      json(res, 403, { error: 'You do not have access to this workspace.' });
      return;
    }

    json(res, 200, listPublicDocuments(requestedTeamId));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/public/files') {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const requestedTeamId = normalizeRequestedTeamId(url.searchParams.get('teamId'));
    if (requestedTeamId && !isTeamOwner(currentUser.id, requestedTeamId) && !isApprovedTeamMember(currentUser.id, requestedTeamId)) {
      json(res, 403, { error: 'You do not have access to this workspace.' });
      return;
    }

    json(res, 200, listPublicFiles(requestedTeamId));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/documents') {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const documents = listDocuments(url.searchParams.get('includeDeleted') === 'true').filter((document) =>
      canViewDocument(currentUser.id, document),
    );
    json(res, 200, documents);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/documents/starred') {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const rows = db.prepare('SELECT * FROM documents WHERE is_starred = 1 AND is_deleted = 0 ORDER BY updated_at DESC').all();
    json(res, 200, rows.map(documentRowToModel).filter((document) => canViewDocument(currentUser.id, document)));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/documents/trash') {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const rows = db.prepare('SELECT * FROM documents WHERE is_deleted = 1 ORDER BY updated_at DESC').all();
    json(res, 200, rows.map(documentRowToModel).filter((document) => canViewDocument(currentUser.id, document)));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/documents/recent') {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const limit = Number(url.searchParams.get('limit') || 10);
    const rows = db.prepare('SELECT * FROM documents WHERE is_deleted = 0 ORDER BY updated_at DESC LIMIT ?').all(limit);
    json(res, 200, rows.map(documentRowToModel).filter((document) => canViewDocument(currentUser.id, document)));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/documents/search') {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const query = `%${String(url.searchParams.get('q') || '').trim()}%`;
    const rows = db.prepare(`
      SELECT * FROM documents
      WHERE is_deleted = 0 AND (title LIKE ? OR content LIKE ?)
      ORDER BY updated_at DESC
    `).all(query, query);
    json(res, 200, rows.map(documentRowToModel).filter((document) => canViewDocument(currentUser.id, document)));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/documents') {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const body = await readJsonBody(req);
    const timestamp = now();
    const id = newId();
    const parentId = sanitizeNullable(body.parent_id);
    const teamId = sanitizeNullable(body.team_id);
    const parentDocument = parentId ? getDocumentById(parentId) : null;
    const orderIndex = body.order_index ?? getNextOrderIndex('documents', 'parent_id', parentId);

    if (teamId && !isTeamOwner(currentUser.id, teamId)) {
      json(res, 403, { error: 'Only the team owner can create documents directly in this team.' });
      return;
    }

    if (parentId && !parentDocument) {
      json(res, 404, { error: 'Parent document not found.' });
      return;
    }

    if (parentDocument && parentDocument.icon !== 'folder') {
      json(res, 400, { error: 'Parent document must be a folder.' });
      return;
    }

    if (parentDocument && !canEditDocument(currentUser.id, parentDocument)) {
      json(res, 403, { error: 'You do not have permission to use this parent folder.' });
      return;
    }

    if (parentDocument && sanitizeNullable(parentDocument.team_id) !== teamId) {
      json(res, 400, { error: 'Document team must match the parent folder team.' });
      return;
    }

    db.prepare(`
      INSERT INTO documents (id, title, content, parent_id, icon, created_at, updated_at, user_id, team_id, is_starred, order_index, is_deleted)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      body.title || 'Untitled',
      body.content || '<p></p>',
      parentId,
      body.icon || 'file',
      timestamp,
      timestamp,
      currentUser.id,
      teamId,
      Number(Boolean(body.is_starred)),
      orderIndex,
      Number(Boolean(body.is_deleted)),
    );

    json(res, 201, getDocumentById(id));
    return;
  }

  if (req.method === 'GET' && /^\/api\/documents\/[^/]+$/.test(url.pathname)) {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const document = getDocumentById(decodeURIComponent(url.pathname.replace('/api/documents/', '')));
    if (!document) {
      json(res, 404, { error: 'Document not found.' });
      return;
    }
    if (!canViewDocument(currentUser.id, document)) {
      json(res, 403, { error: 'You do not have permission to view this document.' });
      return;
    }
    json(res, 200, document);
    return;
  }

  if (req.method === 'PATCH' && /^\/api\/documents\/[^/]+$/.test(url.pathname)) {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const id = decodeURIComponent(url.pathname.replace('/api/documents/', ''));
    const existing = getDocumentById(id);
    if (!existing) {
      json(res, 404, { error: 'Document not found.' });
      return;
    }
    if (!canEditDocument(currentUser.id, existing)) {
      json(res, 403, { error: 'You do not have permission to edit this document.' });
      return;
    }

    const body = await readJsonBody(req);
    const nextTeamId =
      body.team_id !== undefined
        ? sanitizeNullable(body.team_id)
        : existing.team_id;
    const nextParentId =
      body.parent_id !== undefined
        ? sanitizeNullable(body.parent_id)
        : existing.parent_id;
    const nextParentDocument = nextParentId ? getDocumentById(nextParentId) : null;

    if (body.team_id !== undefined && existing.user_id !== currentUser.id) {
      json(res, 403, { error: 'Only the owner can change the document team.' });
      return;
    }

    if (nextTeamId && existing.user_id === currentUser.id && !isTeamOwner(currentUser.id, nextTeamId)) {
      json(res, 403, { error: 'Only the team owner can assign a document to this team.' });
      return;
    }

    if (nextParentId && !nextParentDocument) {
      json(res, 404, { error: 'Parent document not found.' });
      return;
    }

    if (nextParentDocument && nextParentDocument.id === existing.id) {
      json(res, 400, { error: 'A document cannot be its own parent.' });
      return;
    }

    if (nextParentDocument && nextParentDocument.icon !== 'folder') {
      json(res, 400, { error: 'Parent document must be a folder.' });
      return;
    }

    if (nextParentDocument && !canEditDocument(currentUser.id, nextParentDocument)) {
      json(res, 403, { error: 'You do not have permission to use this parent folder.' });
      return;
    }

    if (nextParentDocument && sanitizeNullable(nextParentDocument.team_id) !== nextTeamId) {
      json(res, 400, { error: 'Document team must match the parent folder team.' });
      return;
    }

    db.prepare(`
      UPDATE documents
      SET title = ?, content = ?, parent_id = ?, icon = ?, user_id = ?, team_id = ?, is_starred = ?, order_index = ?, is_deleted = ?, updated_at = ?
      WHERE id = ?
    `).run(
      body.title ?? existing.title,
      body.content ?? existing.content,
      nextParentId,
      body.icon ?? existing.icon,
      existing.user_id,
      nextTeamId,
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
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const id = decodeURIComponent(url.pathname.replace('/api/documents/', ''));
    const existing = getDocumentById(id);
    if (!existing) {
      json(res, 404, { error: 'Document not found.' });
      return;
    }
    if (!canDeleteDocument(currentUser.id, existing)) {
      json(res, 403, { error: 'You do not have permission to delete this document.' });
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
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const documentId = url.searchParams.get('documentId');
    if (!documentId) {
      json(res, 400, { error: 'documentId is required.' });
      return;
    }
    const document = getDocumentById(documentId);
    if (!document || !canViewDocument(currentUser.id, document)) {
      json(res, 403, { error: 'You do not have permission to view comments for this document.' });
      return;
    }
    json(res, 200, listComments(documentId));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/comments') {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const body = await readJsonBody(req);
    const document = getDocumentById(body.document_id);
    if (!document || !canEditDocument(currentUser.id, document)) {
      json(res, 403, { error: 'You do not have permission to add comments to this document.' });
      return;
    }
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
      currentUser.id,
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
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const id = decodeURIComponent(url.pathname.replace('/api/comments/', ''));
    const body = await readJsonBody(req);
    const existingComment = db.prepare('SELECT * FROM comments WHERE id = ?').get(id);
    if (!existingComment) {
      json(res, 404, { error: 'Comment not found.' });
      return;
    }
    const document = getDocumentById(existingComment.document_id);
    if (!document || !canEditDocument(currentUser.id, document)) {
      json(res, 403, { error: 'You do not have permission to edit comments for this document.' });
      return;
    }
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
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const id = decodeURIComponent(url.pathname.replace('/api/comments/', ''));
    const existingComment = db.prepare('SELECT * FROM comments WHERE id = ?').get(id);
    if (!existingComment) {
      json(res, 404, { error: 'Comment not found.' });
      return;
    }
    const document = getDocumentById(existingComment.document_id);
    if (!document || !canEditDocument(currentUser.id, document)) {
      json(res, 403, { error: 'You do not have permission to delete comments for this document.' });
      return;
    }
    db.prepare('DELETE FROM comments WHERE parent_id = ?').run(id);
    db.prepare('DELETE FROM comments WHERE id = ?').run(id);
    sendEmpty(res);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/todos') {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const documentId = url.searchParams.get('documentId');
    if (!documentId) {
      json(res, 400, { error: 'documentId is required.' });
      return;
    }
    const document = getDocumentById(documentId);
    if (!document || !canViewDocument(currentUser.id, document)) {
      json(res, 403, { error: 'You do not have permission to view todos for this document.' });
      return;
    }
    json(res, 200, listTodos(documentId));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/todos') {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const body = await readJsonBody(req);
    const document = getDocumentById(body.document_id);
    if (!document || !canEditDocument(currentUser.id, document)) {
      json(res, 403, { error: 'You do not have permission to add todos to this document.' });
      return;
    }
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
      currentUser.id,
      orderIndex,
    );

    json(res, 201, todoRowToModel(db.prepare('SELECT * FROM todos WHERE id = ?').get(id)));
    return;
  }

  if (req.method === 'GET' && /^\/api\/todos\/[^/]+$/.test(url.pathname)) {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const id = decodeURIComponent(url.pathname.replace('/api/todos/', ''));
    const todo = db.prepare('SELECT * FROM todos WHERE id = ?').get(id);
    if (!todo) {
      json(res, 404, { error: 'Todo not found.' });
      return;
    }
    const document = getDocumentById(todo.document_id);
    if (!document || !canViewDocument(currentUser.id, document)) {
      json(res, 403, { error: 'You do not have permission to view this todo.' });
      return;
    }
    json(res, 200, todoRowToModel(todo));
    return;
  }

  if (req.method === 'PATCH' && /^\/api\/todos\/[^/]+$/.test(url.pathname)) {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const id = decodeURIComponent(url.pathname.replace('/api/todos/', ''));
    const existing = db.prepare('SELECT * FROM todos WHERE id = ?').get(id);
    if (!existing) {
      json(res, 404, { error: 'Todo not found.' });
      return;
    }
    const document = getDocumentById(existing.document_id);
    if (!document || !canEditDocument(currentUser.id, document)) {
      json(res, 403, { error: 'You do not have permission to edit this todo.' });
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
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const id = decodeURIComponent(url.pathname.replace('/api/todos/', ''));
    const existing = db.prepare('SELECT * FROM todos WHERE id = ?').get(id);
    if (!existing) {
      json(res, 404, { error: 'Todo not found.' });
      return;
    }
    const document = getDocumentById(existing.document_id);
    if (!document || !canEditDocument(currentUser.id, document)) {
      json(res, 403, { error: 'You do not have permission to delete this todo.' });
      return;
    }
    db.prepare('DELETE FROM todos WHERE id = ?').run(id);
    sendEmpty(res);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/folders') {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const requestedTeamId = normalizeRequestedTeamId(url.searchParams.get('teamId'));
    const hasWorkspaceFilter = url.searchParams.has('teamId');
    const rows = db.prepare('SELECT * FROM folders ORDER BY order_index, created_at').all();
    json(
      res,
      200,
      rows.filter((folder) => {
        if (!canAccessFolder(currentUser.id, folder)) {
          return false;
        }

        if (!hasWorkspaceFilter) {
          return true;
        }

        return sanitizeNullable(folder.team_id) === requestedTeamId;
      }),
    );
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/folders') {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const body = await readJsonBody(req);
    const timestamp = now();
    const id = newId();
    const parentId = sanitizeNullable(body.parent_id);
    const teamId = sanitizeNullable(body.team_id);
    const parentFolder = parentId ? getFolderById(parentId) : null;

    if (teamId && !isTeamOwner(currentUser.id, teamId)) {
      json(res, 403, { error: 'Only the team owner can create folders directly in this team.' });
      return;
    }

    if (parentId && !parentFolder) {
      json(res, 404, { error: 'Parent folder not found.' });
      return;
    }

    if (parentFolder && !canAccessFolder(currentUser.id, parentFolder)) {
      json(res, 403, { error: 'You do not have permission to use this folder.' });
      return;
    }

    if (parentFolder && sanitizeNullable(parentFolder.team_id) !== teamId) {
      json(res, 400, { error: 'Folder team must match the parent folder team.' });
      return;
    }

    const orderIndex = body.order_index ?? getNextOrderIndex('folders', 'parent_id', parentId);

    db.prepare(`
      INSERT INTO folders (id, name, parent_id, icon, created_at, updated_at, user_id, team_id, order_index)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      body.name || 'New Folder',
      parentId,
      body.icon || 'folder',
      timestamp,
      timestamp,
      currentUser.id,
      teamId,
      orderIndex,
    );

    json(res, 201, db.prepare('SELECT * FROM folders WHERE id = ?').get(id));
    return;
  }

  if (req.method === 'DELETE' && /^\/api\/folders\/[^/]+$/.test(url.pathname)) {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const id = decodeURIComponent(url.pathname.replace('/api/folders/', ''));
    const folder = getFolderById(id);
    if (!folder) {
      json(res, 404, { error: 'Folder not found.' });
      return;
    }

    if (!canManageFolder(currentUser.id, folder)) {
      json(res, 403, { error: 'You do not have permission to delete this folder.' });
      return;
    }

    const folderIds = collectDescendantFolderIds(id);
    const files = listFilesInFolders(folderIds);

    await deleteFileRecords(files);

    folderIds
      .slice()
      .reverse()
      .forEach((folderId) => {
        db.prepare('DELETE FROM folders WHERE id = ?').run(folderId);
      });

    sendEmpty(res);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/files') {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const requestedTeamId = normalizeRequestedTeamId(url.searchParams.get('teamId'));
    const hasWorkspaceFilter = url.searchParams.has('teamId');
    const matchesRequestedWorkspace = (file) =>
      !hasWorkspaceFilter || sanitizeNullable(file.team_id) === requestedTeamId;

    if (url.searchParams.get('scope') === 'all') {
      const rows = db.prepare('SELECT * FROM files ORDER BY created_at DESC').all();
      json(
        res,
        200,
        rows
          .map(fileRowToModel)
          .filter((file) => file && canViewFile(currentUser.id, file) && matchesRequestedWorkspace(file)),
      );
      return;
    }

    const folderId = sanitizeNullable(url.searchParams.get('folderId'));
    json(
      res,
      200,
      listFiles(folderId).filter((file) => canViewFile(currentUser.id, file) && matchesRequestedWorkspace(file)),
    );
    return;
  }

  if (req.method === 'GET' && /^\/api\/files\/[^/]+$/.test(url.pathname)) {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const id = decodeURIComponent(url.pathname.replace('/api/files/', ''));
    const file = getFileById(id);
    if (!file) {
      json(res, 404, { error: 'File not found.' });
      return;
    }
    if (!canViewFile(currentUser.id, file)) {
      json(res, 403, { error: 'You do not have permission to view this file.' });
      return;
    }
    json(res, 200, file);
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/files/upload') {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const name = String(url.searchParams.get('name') || 'file.bin');
    const mimeType = String(url.searchParams.get('mimeType') || 'application/octet-stream');
    const folderId = sanitizeNullable(url.searchParams.get('folderId'));
    const teamId = normalizeRequestedTeamId(url.searchParams.get('teamId'));
    const folder = folderId ? getFolderById(folderId) : null;
    const fileType = getFileType(name, mimeType);
    const dateFolder = new Date().toISOString().slice(0, 10);
    const storedFileName = `${Date.now()}-${newId()}${path.extname(name)}`;
    const workspaceScope = buildWorkspaceStorageScope(teamId);
    const relativePath = path.posix.join(workspaceScope, dateFolder, fileType, storedFileName);
    const fullPath = path.join(FILES_DIR, ...relativePath.split('/'));

    if (teamId && !isTeamOwner(currentUser.id, teamId)) {
      json(res, 403, { error: 'Only the team owner can upload files directly in this team.' });
      return;
    }

    if (folderId && !folder) {
      json(res, 404, { error: 'Folder not found.' });
      return;
    }

    if (folder && !canAccessFolder(currentUser.id, folder)) {
      json(res, 403, { error: 'You do not have permission to use this folder.' });
      return;
    }

    if (folder && sanitizeNullable(folder.team_id) !== teamId) {
      json(res, 400, { error: 'Upload workspace must match the target folder team.' });
      return;
    }

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
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const body = await readJsonBody(req);
    const timestamp = now();
    const id = newId();
    const fileType = body.type || getFileType(body.name || '', '');
    const fileUrl = body.url || `/uploads/${body.storage_path}`;
    const folderId = sanitizeNullable(body.folder_id);
    const teamId = sanitizeNullable(body.team_id);
    const folder = folderId ? getFolderById(folderId) : null;

    if (teamId && !isTeamOwner(currentUser.id, teamId)) {
      json(res, 403, { error: 'Only the team owner can create files directly in this team.' });
      return;
    }

    if (folderId && !folder) {
      json(res, 404, { error: 'Folder not found.' });
      return;
    }

    if (folder && !canAccessFolder(currentUser.id, folder)) {
      json(res, 403, { error: 'You do not have permission to use this folder.' });
      return;
    }

    if (folder && sanitizeNullable(folder.team_id) !== teamId) {
      json(res, 400, { error: 'File team must match the target folder team.' });
      return;
    }

    db.prepare(`
      INSERT INTO files (id, name, type, size, url, thumbnail_url, storage_path, folder_id, created_at, updated_at, user_id, team_id, is_starred)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      body.name,
      fileType,
      Number(body.size || 0),
      fileUrl,
      body.thumbnail_url ?? (fileType === 'image' ? fileUrl : null),
      body.storage_path,
      folderId,
      timestamp,
      timestamp,
      currentUser.id,
      teamId,
      Number(Boolean(body.is_starred)),
    );

    json(res, 201, getFileById(id));
    return;
  }

  if (req.method === 'PATCH' && /^\/api\/files\/[^/]+$/.test(url.pathname)) {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const id = decodeURIComponent(url.pathname.replace('/api/files/', ''));
    const existing = getFileById(id);
    if (!existing) {
      json(res, 404, { error: 'File not found.' });
      return;
    }
    if (!canEditFile(currentUser.id, existing)) {
      json(res, 403, { error: 'You do not have permission to edit this file.' });
      return;
    }

    const body = await readJsonBody(req);
    const nextFolderId =
      body.folder_id !== undefined
        ? sanitizeNullable(body.folder_id)
        : existing.folder_id;
    const nextTeamId =
      body.team_id !== undefined
        ? sanitizeNullable(body.team_id)
        : existing.team_id;
    const nextFolder = nextFolderId ? getFolderById(nextFolderId) : null;

    if (body.team_id !== undefined && existing.user_id !== currentUser.id) {
      json(res, 403, { error: 'Only the owner can change the file team.' });
      return;
    }

    if (nextTeamId && existing.user_id === currentUser.id && !isTeamOwner(currentUser.id, nextTeamId)) {
      json(res, 403, { error: 'Only the team owner can assign a file to this team.' });
      return;
    }

    if (nextFolderId && !nextFolder) {
      json(res, 404, { error: 'Folder not found.' });
      return;
    }

    if (nextFolder && !canAccessFolder(currentUser.id, nextFolder)) {
      json(res, 403, { error: 'You do not have permission to use this folder.' });
      return;
    }

    if (nextFolder && sanitizeNullable(nextFolder.team_id) !== nextTeamId) {
      json(res, 400, { error: 'File team must match the target folder team.' });
      return;
    }

    db.prepare(`
      UPDATE files
      SET name = ?, folder_id = ?, team_id = ?, is_starred = ?, updated_at = ?
      WHERE id = ?
    `).run(
      body.name ?? existing.name,
      nextFolderId,
      nextTeamId,
      body.is_starred !== undefined ? Number(Boolean(body.is_starred)) : Number(existing.is_starred),
      now(),
      id,
    );

    json(res, 200, getFileById(id));
    return;
  }

  if (req.method === 'DELETE' && /^\/api\/files\/[^/]+$/.test(url.pathname)) {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const id = decodeURIComponent(url.pathname.replace('/api/files/', ''));
    const file = getFileById(id);
    if (!file) {
      json(res, 404, { error: 'File not found.' });
      return;
    }
    if (!canDeleteFile(currentUser.id, file)) {
      json(res, 403, { error: 'You do not have permission to delete this file.' });
      return;
    }

    await deleteFileRecords([file]);
    sendEmpty(res);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/share-links') {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const documentId = sanitizeNullable(url.searchParams.get('documentId'));
    const fileId = sanitizeNullable(url.searchParams.get('fileId'));
    let rows = listShareLinks(documentId);

    if (fileId) {
      rows = db.prepare('SELECT * FROM share_links WHERE file_id = ? ORDER BY created_at DESC').all(fileId).map(shareLinkRowToModel);
    }

    const filtered = rows.filter((row) => row.user_id === currentUser.id);

    json(res, 200, filtered);
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/share-links') {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const body = await readJsonBody(req);
    const timestamp = now();
    const documentId = sanitizeNullable(body.document_id);
    const fileId = sanitizeNullable(body.file_id);
    const visibility = normalizeShareVisibility(body.visibility || 'link');
    const requestedTeamId = sanitizeNullable(body.team_id);
    const password = String(body.password || '').trim();

    if (!documentId && !fileId) {
      json(res, 400, { error: 'document_id or file_id is required.' });
      return;
    }

    if (documentId && fileId) {
      json(res, 400, { error: 'Only one resource can be shared at a time.' });
      return;
    }

    if (!['private', 'space', 'link'].includes(visibility)) {
      json(res, 400, { error: 'Share visibility is invalid.' });
      return;
    }

    const resourceType = documentId ? 'document' : 'file';
    const resource = documentId ? getDocumentById(documentId) : getFileById(fileId);
    if (!resource) {
      json(res, 404, { error: 'Shared resource not found.' });
      return;
    }

    if (!canCreateShareLink(currentUser.id, resourceType, resource, visibility)) {
      json(res, 403, { error: 'You do not have permission to create this share.' });
      return;
    }

    let teamId = null;

    if (visibility === 'space') {
      teamId = requestedTeamId;
      if (!teamId) {
        json(res, 400, { error: 'A workspace must be selected for space sharing.' });
        return;
      }

      if (!canShareResourceToSpace(currentUser.id, resource, teamId)) {
        json(res, 403, { error: 'You cannot share this resource to the selected workspace.' });
        return;
      }

      const existingSpaceShare = documentId
        ? db.prepare(`
            SELECT * FROM share_links
            WHERE document_id = ? AND team_id = ? AND user_id = ? AND visibility IN ('space', 'team')
            ORDER BY created_at DESC
            LIMIT 1
          `).get(documentId, teamId, currentUser.id)
        : db.prepare(`
            SELECT * FROM share_links
            WHERE file_id = ? AND team_id = ? AND user_id = ? AND visibility IN ('space', 'team')
            ORDER BY created_at DESC
            LIMIT 1
          `).get(fileId, teamId, currentUser.id);

      if (existingSpaceShare) {
        json(res, 200, shareLinkRowToModel(existingSpaceShare));
        return;
      }
    }

    const id = newId();
    const shareToken = newId().replace(/-/g, '');

    db.prepare(`
      INSERT INTO share_links (id, document_id, file_id, team_id, share_token, visibility, expires_at, created_at, user_id, password_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      documentId,
      fileId,
      teamId,
      shareToken,
      visibility,
      sanitizeNullable(body.expires_at),
      timestamp,
      currentUser.id,
      visibility === 'link' && password ? hashPassword(password) : null,
    );

    json(res, 201, getShareLinkById(id));
    return;
  }

  if (req.method === 'GET' && /^\/api\/share-links\/token\/[^/]+$/.test(url.pathname)) {
    const token = decodeURIComponent(url.pathname.replace('/api/share-links/token/', ''));
    const link = getShareLinkByToken(token);
    if (!link) {
      json(res, 404, { error: 'Share link not found.' });
      return;
    }

    json(res, 200, link);
    return;
  }

  if ((req.method === 'GET' || req.method === 'POST') && /^\/api\/share-links\/token\/[^/]+\/content$/.test(url.pathname)) {
    const token = decodeURIComponent(url.pathname.replace('/api/share-links/token/', '').replace('/content', ''));
    const rawLink = getShareLinkRowByToken(token);
    if (!rawLink) {
      json(res, 404, { error: 'Share link not found.' });
      return;
    }

    const body = req.method === 'POST' ? await readJsonBody(req) : null;
    const payload = resolveSharePayload(rawLink);
    const access = canAccessShareLink(getCurrentUserId(req), rawLink, payload, sanitizeNullable(body?.password));
    if (!access.allowed) {
      json(res, access.status, { error: access.message });
      return;
    }

    const link = shareLinkRowToModel(rawLink);
    json(res, 200, {
      link,
      document: payload?.type === 'document' ? payload.resource : null,
      file: payload?.type === 'file' ? payload.resource : null,
      team: link.team_id ? getTeamById(link.team_id) : null,
    });
    return;
  }

  if (req.method === 'DELETE' && /^\/api\/share-links\/[^/]+$/.test(url.pathname)) {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const id = decodeURIComponent(url.pathname.replace('/api/share-links/', ''));
    const existing = getShareLinkRowById(id);
    if (!existing) {
      json(res, 404, { error: 'Share link not found.' });
      return;
    }

    const payload = resolveSharePayload(existing);
    if (existing.user_id !== currentUser.id) {
      json(res, 403, { error: 'Only the share creator can delete this share.' });
      return;
    }

    db.prepare('DELETE FROM share_links WHERE id = ?').run(id);
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

    await handleFrontend(req, res, url);
  } catch (error) {
    console.error(error);
    json(res, 500, { error: error instanceof Error ? error.message : 'Internal server error.' });
  }
});

server.listen(API_PORT, SERVER_HOST, () => {
  console.log(`Yuque local API server listening on http://${SERVER_HOST}:${API_PORT}`);
  console.log(`Local access: http://127.0.0.1:${API_PORT}`);
  console.log(`Static assets: ${DIST_DIR}`);
  console.log(`SQLite database: ${DB_PATH}`);
  console.log(`File storage root: ${FILES_DIR}`);
  console.log(`Data directory: ${DATA_DIR}`);
});
