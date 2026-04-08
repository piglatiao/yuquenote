import { ApiError, apiRequest, toJsonRequest } from './api';
import type {
  Document,
  FileRecord,
  Folder,
  MusicLoginSession,
  MusicCollectionsPayload,
  MusicPlayerState,
  MusicSearchPayload,
  MusicSource,
  MusicSourceConfig,
  MusicTrack,
  PublicDocumentSummary,
  PublicFileSummary,
  ResourcePermission,
  ShareSaveResult,
  ShareLink,
  SharedResourcePayload,
  Team,
  TeamRecyclePayload,
  TeamInvitation,
  TeamMember,
  UserNotification,
  User,
} from './types';

export const folderService = {
  async getAll(teamId?: string | null): Promise<Folder[]> {
    const params = new URLSearchParams();
    if (teamId !== undefined) {
      params.set('teamId', teamId || '__personal__');
    }
    const suffix = params.size > 0 ? `?${params.toString()}` : '';
    return apiRequest<Folder[]>(`/folders${suffix}`);
  },

  async create(folder: Partial<Folder>): Promise<Folder | null> {
    try {
      return await apiRequest<Folder>('/folders', toJsonRequest(folder, { method: 'POST' }));
    } catch {
      return null;
    }
  },

  async update(): Promise<Folder | null> {
    return null;
  },

  async delete(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      await apiRequest<void>(`/folders/${id}`, { method: 'DELETE' });
      return { success: true };
    } catch (error) {
      const message = error instanceof ApiError ? error.message : '删除文件夹失败';
      if (message === 'Request failed with status 404' || message === 'Request failed with status 501') {
        return { success: false, error: '删除接口暂不可用，请重启后端后再试。' };
      }
      return { success: false, error: message };
    }
  },
};

export const fileService = {
  async getAll(teamId?: string | null): Promise<FileRecord[]> {
    const params = new URLSearchParams({ scope: 'all' });
    if (teamId !== undefined) {
      params.set('teamId', teamId || '__personal__');
    }
    return apiRequest<FileRecord[]>(`/files?${params.toString()}`);
  },

  async getById(id: string): Promise<FileRecord | null> {
    try {
      return await apiRequest<FileRecord>(`/files/${id}`);
    } catch {
      return null;
    }
  },

  async getByFolder(folderId: string | null, teamId?: string | null): Promise<FileRecord[]> {
    const params = new URLSearchParams();
    if (folderId) {
      params.set('folderId', folderId);
    }
    if (teamId !== undefined) {
      params.set('teamId', teamId || '__personal__');
    }
    const suffix = params.size > 0 ? `?${params.toString()}` : '';
    return apiRequest<FileRecord[]>(`/files${suffix}`);
  },

  async create(file: Partial<FileRecord>): Promise<FileRecord | null> {
    try {
      return await apiRequest<FileRecord>('/files', toJsonRequest(file, { method: 'POST' }));
    } catch {
      return null;
    }
  },

  async update(id: string, updates: Partial<FileRecord>): Promise<FileRecord | null> {
    try {
      return await apiRequest<FileRecord>(`/files/${id}`, toJsonRequest(updates, { method: 'PATCH' }));
    } catch {
      return null;
    }
  },

  async delete(id: string): Promise<boolean> {
    try {
      await apiRequest<void>(`/files/${id}`, { method: 'DELETE' });
      return true;
    } catch {
      return false;
    }
  },
};

export const shareService = {
  async listMine(): Promise<ShareLink[]> {
    return apiRequest<ShareLink[]>('/share-links');
  },

  async createShareLink(
    docId?: string,
    fileId?: string,
    visibility: 'private' | 'space' | 'link' | 'team' | 'public' = 'link',
    teamId?: string | null,
    password?: string | null,
  ): Promise<ShareLink | null> {
    try {
      return await apiRequest<ShareLink>(
        '/share-links',
        toJsonRequest(
          {
            document_id: docId || null,
            file_id: fileId || null,
            team_id: teamId || null,
            visibility,
            password: password || null,
          },
          { method: 'POST' },
        ),
      );
    } catch {
      return null;
    }
  },

  async listByDocument(documentId: string): Promise<ShareLink[]> {
    return apiRequest<ShareLink[]>(`/share-links?documentId=${encodeURIComponent(documentId)}`);
  },

  async listByFile(fileId: string): Promise<ShareLink[]> {
    return apiRequest<ShareLink[]>(`/share-links?fileId=${encodeURIComponent(fileId)}`);
  },

  async getShareLink(shareToken: string): Promise<ShareLink | null> {
    try {
      return await apiRequest<ShareLink>(`/share-links/token/${encodeURIComponent(shareToken)}`);
    } catch {
      return null;
    }
  },

  async getSharedResource(shareToken: string, password?: string): Promise<SharedResourcePayload> {
    return apiRequest<SharedResourcePayload>(
      `/share-links/token/${encodeURIComponent(shareToken)}/content`,
      toJsonRequest(
        {
          password: password || null,
        },
        { method: 'POST' },
      ),
    );
  },

  async saveSharedResource(
    shareToken: string,
    options?: {
      password?: string;
      target_document_parent_id?: string | null;
      target_file_folder_id?: string | null;
    },
  ): Promise<ShareSaveResult> {
    return apiRequest<ShareSaveResult>(
      `/share-links/token/${encodeURIComponent(shareToken)}/save`,
      toJsonRequest(
        {
          password: options?.password || null,
          target_document_parent_id: options?.target_document_parent_id || null,
          target_file_folder_id: options?.target_file_folder_id || null,
        },
        { method: 'POST' },
      ),
    );
  },

  async deleteShareLink(id: string): Promise<boolean> {
    try {
      await apiRequest<void>(`/share-links/${id}`, { method: 'DELETE' });
      return true;
    } catch {
      return false;
    }
  },
};

export const teamService = {
  async getMyTeams(): Promise<Team[]> {
    return apiRequest<Team[]>('/teams');
  },

  async getDissolvedTeams(): Promise<Team[]> {
    return apiRequest<Team[]>('/teams/dissolved');
  },

  async getDiscoverableTeams(): Promise<Team[]> {
    return apiRequest<Team[]>('/teams?scope=discover');
  },

  async createTeam(name: string): Promise<Team | null> {
    try {
      return await apiRequest<Team>('/teams', toJsonRequest({ name }, { method: 'POST' }));
    } catch {
      return null;
    }
  },

  async getById(id: string): Promise<Team | null> {
    try {
      return await apiRequest<Team>(`/teams/${id}`);
    } catch {
      return null;
    }
  },

  async updateTeam(
    teamId: string,
    updates: {
      name?: string;
      avatar_url?: string | null;
      created_at?: string;
      member_limit?: number;
    },
  ): Promise<Team | null> {
    try {
      return await apiRequest<Team>(
        `/teams/${encodeURIComponent(teamId)}`,
        toJsonRequest(updates, { method: 'PATCH' }),
      );
    } catch {
      return null;
    }
  },

  async leaveTeam(teamId: string): Promise<boolean> {
    await apiRequest<{ ok: true }>(`/teams/${encodeURIComponent(teamId)}/leave`, { method: 'POST' });
    return true;
  },

  async dissolveTeam(teamId: string): Promise<{ ok: boolean; retention_until: string | null }> {
    return apiRequest<{ ok: boolean; retention_until: string | null }>(`/teams/${encodeURIComponent(teamId)}/dissolve`, {
      method: 'POST',
    });
  },

  async requestToJoin(teamId: string): Promise<boolean> {
    try {
      await apiRequest<{ ok: true }>(`/teams/${encodeURIComponent(teamId)}/join-requests`, { method: 'POST' });
      return true;
    } catch {
      return false;
    }
  },

  async getMembers(teamId: string): Promise<TeamMember[]> {
    return apiRequest<TeamMember[]>(`/teams/${encodeURIComponent(teamId)}/members`);
  },

  async removeMember(teamId: string, memberUserId: string): Promise<boolean> {
    await apiRequest<{ ok: true }>(
      `/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(memberUserId)}/remove`,
      { method: 'POST' },
    );
    return true;
  },

  async getJoinRequests(teamId: string): Promise<TeamMember[]> {
    return apiRequest<TeamMember[]>(`/teams/${encodeURIComponent(teamId)}/join-requests`);
  },

  async getInviteCandidates(teamId: string, query: string): Promise<User[]> {
    if (!query.trim()) {
      return [];
    }

    return apiRequest<User[]>(
      `/teams/${encodeURIComponent(teamId)}/invite-candidates?query=${encodeURIComponent(query.trim())}`,
    );
  },

  async getInvitations(teamId: string): Promise<TeamInvitation[]> {
    return apiRequest<TeamInvitation[]>(`/teams/${encodeURIComponent(teamId)}/invitations`);
  },

  async createEmailInvitation(teamId: string, invitedUserId: string): Promise<TeamInvitation | null> {
    return apiRequest<TeamInvitation>(
      `/teams/${encodeURIComponent(teamId)}/invitations`,
      toJsonRequest(
        {
          invite_type: 'email',
          invited_user_id: invitedUserId,
        },
        { method: 'POST' },
      ),
    );
  },

  async createInviteCode(teamId: string): Promise<TeamInvitation | null> {
    return apiRequest<TeamInvitation>(
      `/teams/${encodeURIComponent(teamId)}/invitations`,
      toJsonRequest(
        {
          invite_type: 'code',
        },
        { method: 'POST' },
      ),
    );
  },

  async revokeInvitation(teamId: string, invitationId: string): Promise<boolean> {
    await apiRequest<{ ok: true }>(
      `/teams/${encodeURIComponent(teamId)}/invitations/${encodeURIComponent(invitationId)}/revoke`,
      { method: 'POST' },
    );
    return true;
  },

  async getMyInvitations(): Promise<TeamInvitation[]> {
    return apiRequest<TeamInvitation[]>('/team-invitations/mine');
  },

  async acceptInvitation(invitationId: string): Promise<Team | null> {
    const response = await apiRequest<{ ok: true; team: Team }>(
      `/team-invitations/${encodeURIComponent(invitationId)}/accept`,
      { method: 'POST' },
    );
    return response.team;
  },

  async rejectInvitation(invitationId: string): Promise<boolean> {
    await apiRequest<{ ok: true }>(`/team-invitations/${encodeURIComponent(invitationId)}/reject`, {
      method: 'POST',
    });
    return true;
  },

  async joinByInviteCode(code: string): Promise<Team | null> {
    const response = await apiRequest<{ ok: true; team: Team }>(
      '/team-invitations/accept-by-code',
      toJsonRequest({ code }, { method: 'POST' }),
    );
    return response.team;
  },

  async approveJoinRequest(teamId: string, requestId: string): Promise<boolean> {
    try {
      await apiRequest<{ ok: true }>(`/teams/${encodeURIComponent(teamId)}/join-requests/${encodeURIComponent(requestId)}/approve`, {
        method: 'POST',
      });
      return true;
    } catch {
      return false;
    }
  },

  async rejectJoinRequest(teamId: string, requestId: string): Promise<boolean> {
    try {
      await apiRequest<{ ok: true }>(`/teams/${encodeURIComponent(teamId)}/join-requests/${encodeURIComponent(requestId)}/reject`, {
        method: 'POST',
      });
      return true;
    } catch {
      return false;
    }
  },

  async sendNotification(teamId: string, payload: { title?: string; content: string }): Promise<boolean> {
    await apiRequest<{ ok: true }>(
      `/teams/${encodeURIComponent(teamId)}/notifications`,
      toJsonRequest(payload, { method: 'POST' }),
    );
    return true;
  },

  async getRecycle(teamId: string): Promise<TeamRecyclePayload> {
    return apiRequest<TeamRecyclePayload>(`/teams/${encodeURIComponent(teamId)}/recycle`);
  },

  async saveRecycleDocument(
    teamId: string,
    documentId: string,
    targetDocumentParentId?: string | null,
  ): Promise<{ ok: boolean; document?: Document | null }> {
    return apiRequest<{ ok: boolean; document?: Document | null }>(
      `/teams/${encodeURIComponent(teamId)}/recycle/documents/${encodeURIComponent(documentId)}/save`,
      toJsonRequest(
        {
          target_document_parent_id: targetDocumentParentId || null,
        },
        { method: 'POST' },
      ),
    );
  },

  async saveRecycleFile(
    teamId: string,
    fileId: string,
    targetFileFolderId?: string | null,
  ): Promise<{ ok: boolean; file?: FileRecord | null }> {
    return apiRequest<{ ok: boolean; file?: FileRecord | null }>(
      `/teams/${encodeURIComponent(teamId)}/recycle/files/${encodeURIComponent(fileId)}/save`,
      toJsonRequest(
        {
          target_file_folder_id: targetFileFolderId || null,
        },
        { method: 'POST' },
      ),
    );
  },
};

export const notificationService = {
  async getMine(): Promise<UserNotification[]> {
    return apiRequest<UserNotification[]>('/notifications/mine');
  },

  async markRead(notificationId: string): Promise<UserNotification> {
    return apiRequest<UserNotification>(`/notifications/${encodeURIComponent(notificationId)}/read`, {
      method: 'PATCH',
    });
  },
};

export const resourcePermissionService = {
  async getForResource(teamId: string, resourceType: 'document' | 'file', resourceId: string, query = ''): Promise<ResourcePermission[]> {
    const params = new URLSearchParams({
      resourceType,
      resourceId,
    });
    if (query.trim()) {
      params.set('query', query.trim());
    }
    return apiRequest<ResourcePermission[]>(`/teams/${encodeURIComponent(teamId)}/resource-permissions?${params.toString()}`);
  },

  async replaceForResource(
    teamId: string,
    resourceType: 'document' | 'file',
    resourceId: string,
    entries: Array<{
      member_user_id: string;
      can_view: boolean;
      can_edit: boolean;
      can_delete: boolean;
    }>,
  ): Promise<ResourcePermission[]> {
    return apiRequest<ResourcePermission[]>(
      `/teams/${encodeURIComponent(teamId)}/resource-permissions/batch`,
      toJsonRequest(
        {
          resource_type: resourceType,
          resource_id: resourceId,
          entries,
        },
        { method: 'PUT' },
      ),
    );
  },
};

export const publicResourceService = {
  async getDocuments(teamId?: string | null): Promise<PublicDocumentSummary[]> {
    const params = new URLSearchParams();
    if (teamId !== undefined) {
      params.set('teamId', teamId ?? '__personal__');
    }
    return apiRequest<PublicDocumentSummary[]>(`/public/documents${params.size ? `?${params.toString()}` : ''}`);
  },

  async getFiles(teamId?: string | null): Promise<PublicFileSummary[]> {
    const params = new URLSearchParams();
    if (teamId !== undefined) {
      params.set('teamId', teamId ?? '__personal__');
    }
    return apiRequest<PublicFileSummary[]>(`/public/files${params.size ? `?${params.toString()}` : ''}`);
  },
};

export const musicService = {
  async getSources(): Promise<MusicSource[]> {
    return apiRequest<MusicSource[]>('/music/sources');
  },

  async createSource(payload: {
    name: string;
    type?: MusicSource['type'];
    config?: MusicSourceConfig;
    is_enabled?: boolean;
    is_default?: boolean;
  }): Promise<MusicSource> {
    return apiRequest<MusicSource>('/music/sources', toJsonRequest(payload, { method: 'POST' }));
  },

  async updateSource(
    sourceId: string,
    payload: {
      name?: string;
      config?: MusicSourceConfig;
      is_enabled?: boolean;
      is_default?: boolean;
    },
  ): Promise<MusicSource> {
    return apiRequest<MusicSource>(`/music/sources/${encodeURIComponent(sourceId)}`, toJsonRequest(payload, { method: 'PATCH' }));
  },

  async deleteSource(sourceId: string): Promise<{ ok: boolean }> {
    return apiRequest<{ ok: boolean }>(`/music/sources/${encodeURIComponent(sourceId)}`, { method: 'DELETE' });
  },

  async search(keyword: string, sourceId?: string | null, page = 1, limit = 20): Promise<MusicSearchPayload> {
    return apiRequest<MusicSearchPayload>(
      '/music/search',
      toJsonRequest(
        {
          keyword,
          source_id: sourceId || null,
          page,
          limit,
        },
        { method: 'POST' },
      ),
    );
  },

  async resolveTrack(track: MusicTrack, sourceId?: string | null): Promise<MusicTrack> {
    const response = await apiRequest<{ track: MusicTrack }>(
      '/music/resolve',
      toJsonRequest(
        {
          source_id: sourceId || track.source_id || null,
          provider_track_id: track.provider_track_id,
          track,
        },
        { method: 'POST' },
      ),
    );

    return response.track;
  },

  async getCollections(sourceId?: string | null): Promise<MusicCollectionsPayload> {
    const params = new URLSearchParams();
    if (sourceId) {
      params.set('sourceId', sourceId);
    }

    return apiRequest<MusicCollectionsPayload>(`/music/collections${params.size ? `?${params.toString()}` : ''}`);
  },

  async getPlayerState(): Promise<MusicPlayerState> {
    return apiRequest<MusicPlayerState>('/music/player-state');
  },

  async updatePlayerState(payload: Partial<MusicPlayerState>): Promise<MusicPlayerState> {
    return apiRequest<MusicPlayerState>('/music/player-state', toJsonRequest(payload, { method: 'PUT' }));
  },

  async createWechatLoginSession(): Promise<MusicLoginSession> {
    return apiRequest<MusicLoginSession>('/music/qq-login/sessions', toJsonRequest({}, { method: 'POST' }));
  },

  async getWechatLoginSessionStatus(sessionId: string): Promise<MusicLoginSession> {
    return apiRequest<MusicLoginSession>(`/music/qq-login/sessions/${encodeURIComponent(sessionId)}/status`);
  },
};
