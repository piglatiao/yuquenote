import { apiRequest, toJsonRequest } from './api';
import type { Document } from './types';

export interface DocTreeItem {
  id: string;
  title: string;
  icon: 'file' | 'folder' | 'star' | null;
  children: DocTreeItem[];
  parent_id: string | null;
  team_id?: string | null;
  user_id?: string | null;
  is_starred: boolean;
  is_deleted: boolean;
  updated_at: string;
  expanded?: boolean;
}

function buildTree(documents: Document[], parentId: string | null): DocTreeItem[] {
  return documents
    .filter((doc) => doc.parent_id === parentId)
    .sort((a, b) => a.order_index - b.order_index)
    .map((doc) => ({
      id: doc.id,
      title: doc.title,
      icon: doc.icon || 'file',
      children: buildTree(documents, doc.id),
      parent_id: doc.parent_id,
      team_id: doc.team_id ?? null,
      user_id: doc.user_id ?? null,
      is_starred: doc.is_starred,
      is_deleted: doc.is_deleted,
      updated_at: doc.updated_at,
    }));
}

export const documentService = {
  init() {},

  async getAll(includeDeleted = false): Promise<Document[]> {
    return apiRequest<Document[]>(`/documents?includeDeleted=${includeDeleted}`);
  },

  async getTree(): Promise<DocTreeItem[]> {
    return buildTree(await this.getAll(), null);
  },

  async getById(id: string): Promise<Document | null> {
    try {
      return await apiRequest<Document>(`/documents/${id}`);
    } catch {
      return null;
    }
  },

  async create(doc: Partial<Document>): Promise<Document | null> {
    try {
      return await apiRequest<Document>('/documents', toJsonRequest(doc, { method: 'POST' }));
    } catch {
      return null;
    }
  },

  async update(id: string, updates: Partial<Document>): Promise<Document | null> {
    try {
      return await apiRequest<Document>(`/documents/${id}`, toJsonRequest(updates, { method: 'PATCH' }));
    } catch {
      return null;
    }
  },

  async softDelete(id: string): Promise<boolean> {
    return (await this.update(id, { is_deleted: true })) !== null;
  },

  async restore(id: string): Promise<boolean> {
    return (await this.update(id, { is_deleted: false })) !== null;
  },

  async permanentDelete(id: string): Promise<boolean> {
    try {
      await apiRequest<void>(`/documents/${id}?permanent=true`, { method: 'DELETE' });
      return true;
    } catch {
      return false;
    }
  },

  async search(query: string): Promise<Document[]> {
    return apiRequest<Document[]>(`/documents/search?q=${encodeURIComponent(query)}`);
  },

  async getStarred(): Promise<Document[]> {
    return apiRequest<Document[]>('/documents/starred');
  },

  async toggleStar(id: string): Promise<boolean> {
    const doc = await this.getById(id);
    if (!doc) {
      return false;
    }
    return (await this.update(id, { is_starred: !doc.is_starred })) !== null;
  },

  async moveToFolder(id: string, newParentId: string | null): Promise<boolean> {
    return (await this.update(id, { parent_id: newParentId })) !== null;
  },

  async getRecent(limit = 10): Promise<Document[]> {
    return apiRequest<Document[]>(`/documents/recent?limit=${limit}`);
  },

  async getTrash(): Promise<Document[]> {
    return apiRequest<Document[]>('/documents/trash');
  },

  async emptyTrash(): Promise<boolean> {
    const trash = await this.getTrash();
    await Promise.all(trash.map((doc) => this.permanentDelete(doc.id)));
    return true;
  },

  async duplicate(id: string): Promise<Document | null> {
    const doc = await this.getById(id);
    if (!doc) {
      return null;
    }

    return this.create({
      title: `${doc.title} (Copy)`,
      content: doc.content,
      parent_id: doc.parent_id,
      icon: doc.icon,
      user_id: doc.user_id,
      team_id: doc.team_id ?? null,
    });
  },
};
