import { supabase } from './supabase';
import type { Document } from './types';

// Demo mode flag
const USE_DEMO_MODE = true;

// Local storage keys
const DOCUMENTS_KEY = 'yuque_documents';

// Demo data
const DEMO_DOCUMENTS: Document[] = [
  {
    id: 'doc-1',
    title: '欢迎使用语雀笔记',
    content: '<h1>欢迎使用语雀笔记</h1><p>这是一个精致的<strong>富文本编辑器</strong>，支持丰富的编辑功能。</p><h2>主要特性</h2><ul><li>支持多种文本格式</li><li>支持代码块</li><li>支持任务列表</li></ul>',
    parent_id: null,
    icon: 'folder',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    user_id: 'demo-user-1',
    is_starred: true,
    order_index: 0,
    is_deleted: false,
  },
  {
    id: 'doc-1-1',
    title: '快速入门指南',
    content: '<h2>快速入门</h2><p>开始使用语雀笔记的步骤：</p><ol><li>创建新文档</li><li>编写内容</li><li>保存文档</li></ol>',
    parent_id: 'doc-1',
    icon: 'file',
    created_at: new Date(Date.now() - 86400000).toISOString(),
    updated_at: new Date(Date.now() - 3600000).toISOString(),
    user_id: 'demo-user-1',
    is_starred: false,
    order_index: 0,
    is_deleted: false,
  },
  {
    id: 'doc-2',
    title: '产品设计',
    content: '<h1>产品设计文档</h1><p>这里记录产品设计相关的内容。</p>',
    parent_id: null,
    icon: 'folder',
    created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
    updated_at: new Date(Date.now() - 86400000).toISOString(),
    user_id: 'demo-user-1',
    is_starred: false,
    order_index: 1,
    is_deleted: false,
  },
  {
    id: 'doc-2-1',
    title: '交互设计规范',
    content: '<h2>交互设计规范</h2><p>详细的交互设计指南...</p>',
    parent_id: 'doc-2',
    icon: 'file',
    created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
    updated_at: new Date(Date.now() - 86400000).toISOString(),
    user_id: 'demo-user-1',
    is_starred: false,
    order_index: 0,
    is_deleted: false,
  },
  {
    id: 'doc-3',
    title: '技术文档',
    content: '<h1>技术文档</h1><p>技术相关的文档和笔记。</p>',
    parent_id: null,
    icon: 'folder',
    created_at: new Date(Date.now() - 86400000 * 3).toISOString(),
    updated_at: new Date(Date.now() - 86400000 * 2).toISOString(),
    user_id: 'demo-user-1',
    is_starred: false,
    order_index: 2,
    is_deleted: false,
  },
  {
    id: 'doc-3-1',
    title: 'API 接口文档',
    content: '<h2>API 接口文档</h2><p>RESTful API 设计规范...</p>',
    parent_id: 'doc-3',
    icon: 'file',
    created_at: new Date(Date.now() - 86400000 * 3).toISOString(),
    updated_at: new Date(Date.now() - 86400000 * 2).toISOString(),
    user_id: 'demo-user-1',
    is_starred: false,
    order_index: 0,
    is_deleted: false,
  },
];

// Initialize demo data
const initDemoData = () => {
  if (!localStorage.getItem(DOCUMENTS_KEY)) {
    localStorage.setItem(DOCUMENTS_KEY, JSON.stringify(DEMO_DOCUMENTS));
  }
};

export interface DocTreeItem {
  id: string;
  title: string;
  icon: 'file' | 'folder' | 'star' | null;
  children: DocTreeItem[];
  parent_id: string | null;
  is_starred: boolean;
  is_deleted: boolean;
  updated_at: string;
  expanded?: boolean;
}

export const documentService = {
  // Initialize demo data
  init() {
    if (USE_DEMO_MODE) {
      initDemoData();
    }
  },

  // Get all documents (including deleted for trash)
  async getAll(includeDeleted = false): Promise<Document[]> {
    if (USE_DEMO_MODE) {
      initDemoData();
      const docs: Document[] = JSON.parse(localStorage.getItem(DOCUMENTS_KEY) || '[]');
      return includeDeleted ? docs : docs.filter(d => !d.is_deleted);
    }

    let query = supabase.from('documents').select('*').order('order_index');

    if (!includeDeleted) {
      query = query.eq('is_deleted', false);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching documents:', error);
      return [];
    }

    return data || [];
  },

  // Get document tree structure
  async getTree(): Promise<DocTreeItem[]> {
    const docs = await this.getAll();

    const buildTree = (parentId: string | null): DocTreeItem[] => {
      return docs
        .filter(d => d.parent_id === parentId)
        .sort((a, b) => a.order_index - b.order_index)
        .map(doc => ({
          id: doc.id,
          title: doc.title,
          icon: doc.icon || 'file',
          children: buildTree(doc.id),
          parent_id: doc.parent_id,
          is_starred: doc.is_starred,
          is_deleted: doc.is_deleted,
          updated_at: doc.updated_at,
        }));
    };

    return buildTree(null);
  },

  // Get document by ID
  async getById(id: string): Promise<Document | null> {
    if (USE_DEMO_MODE) {
      initDemoData();
      const docs: Document[] = JSON.parse(localStorage.getItem(DOCUMENTS_KEY) || '[]');
      return docs.find(d => d.id === id) || null;
    }

    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching document:', error);
      return null;
    }

    return data;
  },

  // Create new document
  async create(doc: Partial<Document>): Promise<Document | null> {
    if (USE_DEMO_MODE) {
      initDemoData();
      const docs: Document[] = JSON.parse(localStorage.getItem(DOCUMENTS_KEY) || '[]');

      const newDoc: Document = {
        id: `doc-${Date.now()}`,
        title: doc.title || '新建文档',
        content: doc.content || '<p></p>',
        parent_id: doc.parent_id || null,
        icon: doc.icon || 'file',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        user_id: doc.user_id || 'demo-user-1',
        is_starred: false,
        order_index: docs.filter(d => d.parent_id === doc.parent_id).length,
        is_deleted: false,
      };

      docs.push(newDoc);
      localStorage.setItem(DOCUMENTS_KEY, JSON.stringify(docs));
      return newDoc;
    }

    const { data, error } = await supabase
      .from('documents')
      .insert([{
        ...doc,
        order_index: doc.order_index || 0,
        is_starred: false,
        is_deleted: false,
      }])
      .select()
      .single();

    if (error) {
      console.error('Error creating document:', error);
      return null;
    }

    return data;
  },

  // Update document
  async update(id: string, updates: Partial<Document>): Promise<Document | null> {
    if (USE_DEMO_MODE) {
      const docs: Document[] = JSON.parse(localStorage.getItem(DOCUMENTS_KEY) || '[]');
      const index = docs.findIndex(d => d.id === id);

      if (index !== -1) {
        docs[index] = {
          ...docs[index],
          ...updates,
          updated_at: new Date().toISOString(),
        };
        localStorage.setItem(DOCUMENTS_KEY, JSON.stringify(docs));
        return docs[index];
      }
      return null;
    }

    const { data, error } = await supabase
      .from('documents')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating document:', error);
      return null;
    }

    return data;
  },

  // Soft delete document (move to trash)
  async softDelete(id: string): Promise<boolean> {
    return (await this.update(id, { is_deleted: true })) !== null;
  },

  // Restore document from trash
  async restore(id: string): Promise<boolean> {
    return (await this.update(id, { is_deleted: false })) !== null;
  },

  // Permanently delete document
  async permanentDelete(id: string): Promise<boolean> {
    if (USE_DEMO_MODE) {
      const docs: Document[] = JSON.parse(localStorage.getItem(DOCUMENTS_KEY) || '[]');
      const filtered = docs.filter(d => d.id !== id && d.parent_id !== id);
      localStorage.setItem(DOCUMENTS_KEY, JSON.stringify(filtered));
      return true;
    }

    // Delete child documents first
    const children = await this.getAll();
    const childIds = children.filter(d => d.parent_id === id).map(d => d.id);

    for (const childId of childIds) {
      await this.permanentDelete(childId);
    }

    const { error } = await supabase.from('documents').delete().eq('id', id);

    if (error) {
      console.error('Error deleting document:', error);
      return false;
    }

    return true;
  },

  // Search documents
  async search(query: string): Promise<Document[]> {
    if (USE_DEMO_MODE) {
      initDemoData();
      const docs: Document[] = JSON.parse(localStorage.getItem(DOCUMENTS_KEY) || '[]');
      const lowerQuery = query.toLowerCase();

      return docs.filter(d =>
        !d.is_deleted &&
        (d.title.toLowerCase().includes(lowerQuery) ||
         d.content.toLowerCase().includes(lowerQuery))
      );
    }

    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('is_deleted', false)
      .or(`title.ilike.%${query}%,content.ilike.%${query}%`);

    if (error) {
      console.error('Error searching documents:', error);
      return [];
    }

    return data || [];
  },

  // Get starred documents
  async getStarred(): Promise<Document[]> {
    if (USE_DEMO_MODE) {
      initDemoData();
      const docs: Document[] = JSON.parse(localStorage.getItem(DOCUMENTS_KEY) || '[]');
      return docs.filter(d => d.is_starred && !d.is_deleted);
    }

    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('is_starred', true)
      .eq('is_deleted', false);

    if (error) {
      console.error('Error fetching starred documents:', error);
      return [];
    }

    return data || [];
  },

  // Toggle star
  async toggleStar(id: string): Promise<boolean> {
    const doc = await this.getById(id);
    if (!doc) return false;

    const result = await this.update(id, { is_starred: !doc.is_starred });
    return result !== null;
  },

  // Move document to folder
  async moveToFolder(id: string, newParentId: string | null): Promise<boolean> {
    return (await this.update(id, { parent_id: newParentId })) !== null;
  },

  // Get recent documents
  async getRecent(limit = 10): Promise<Document[]> {
    const docs = await this.getAll();
    return docs
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      .slice(0, limit);
  },

  // Get trash documents
  async getTrash(): Promise<Document[]> {
    if (USE_DEMO_MODE) {
      initDemoData();
      const docs: Document[] = JSON.parse(localStorage.getItem(DOCUMENTS_KEY) || '[]');
      return docs.filter(d => d.is_deleted);
    }

    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('is_deleted', true);

    if (error) {
      console.error('Error fetching trash:', error);
      return [];
    }

    return data || [];
  },

  // Empty trash
  async emptyTrash(): Promise<boolean> {
    const trash = await this.getTrash();

    for (const doc of trash) {
      await this.permanentDelete(doc.id);
    }

    return true;
  },

  // Duplicate document
  async duplicate(id: string): Promise<Document | null> {
    const doc = await this.getById(id);
    if (!doc) return null;

    return this.create({
      title: `${doc.title} (副本)`,
      content: doc.content,
      parent_id: doc.parent_id,
      icon: doc.icon,
    });
  },
};
