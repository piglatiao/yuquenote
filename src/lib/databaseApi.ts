import { apiRequest, toJsonRequest } from './api';
import type {
  FileRecord,
  Folder,
  PublicDocumentSummary,
  PublicFileSummary,
  ResourcePermission,
  ShareLink,
  SharedResourcePayload,
  Team,
  TeamInvitation,
  TeamMember,
  User,
} from './types';

export const folderService = {
  async getAll(): Promise<Folder[]> {
    return apiRequest<Folder[]>('/folders');
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

  async delete(): Promise<boolean> {
    return false;
  },
};

export const fileService = {
  async getAll(): Promise<FileRecord[]> {
    return apiRequest<FileRecord[]>('/files?scope=all');
  },

  async getById(id: string): Promise<FileRecord | null> {
    try {
      return await apiRequest<FileRecord>(`/files/${id}`);
    } catch {
      return null;
    }
  },

  async getByFolder(folderId: string | null): Promise<FileRecord[]> {
    const suffix = folderId ? `?folderId=${encodeURIComponent(folderId)}` : '';
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
  async createShareLink(
    docId?: string,
    fileId?: string,
    visibility: 'private' | 'team' | 'public' = 'private',
    teamId?: string | null,
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

  async getSharedResource(shareToken: string): Promise<SharedResourcePayload> {
    return apiRequest<SharedResourcePayload>(`/share-links/token/${encodeURIComponent(shareToken)}/content`);
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
  async getDocuments(): Promise<PublicDocumentSummary[]> {
    return apiRequest<PublicDocumentSummary[]>('/public/documents');
  },

  async getFiles(): Promise<PublicFileSummary[]> {
    return apiRequest<PublicFileSummary[]>('/public/files');
  },
};
