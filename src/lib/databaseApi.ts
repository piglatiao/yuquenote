import { apiRequest, toJsonRequest } from './api';
import type { FileRecord, Folder, ShareLink } from './types';

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
  ): Promise<ShareLink | null> {
    try {
      return await apiRequest<ShareLink>(
        '/share-links',
        toJsonRequest(
          {
            document_id: docId || null,
            file_id: fileId || null,
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

  async getShareLink(shareToken: string): Promise<ShareLink | null> {
    try {
      return await apiRequest<ShareLink>(`/share-links/token/${encodeURIComponent(shareToken)}`);
    } catch {
      return null;
    }
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
