import { supabase } from './supabase';
import type { Document, FileRecord, Folder, ShareLink } from './types';

// Document Service
export const documentService = {
  // Get all documents
  async getAll(): Promise<Document[]> {
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .order('order_index');

    if (error) {
      console.error('Error fetching documents:', error);
      return [];
    }
    return data || [];
  },

  // Get document by ID
  async getById(id: string): Promise<Document | null> {
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
    const { data, error } = await supabase
      .from('documents')
      .insert([doc])
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

  // Delete document
  async delete(id: string): Promise<boolean> {
    const { error } = await supabase
      .from('documents')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting document:', error);
      return false;
    }
    return true;
  },

  // Search documents
  async search(query: string): Promise<Document[]> {
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .ilike('title', `%${query}%`);

    if (error) {
      console.error('Error searching documents:', error);
      return [];
    }
    return data || [];
  },

  // Get starred documents
  async getStarred(): Promise<Document[]> {
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('is_starred', true);

    if (error) {
      console.error('Error fetching starred documents:', error);
      return [];
    }
    return data || [];
  },

  // Toggle star
  async toggleStar(id: string, isStarred: boolean): Promise<boolean> {
    const { error } = await supabase
      .from('documents')
      .update({ is_starred: isStarred, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      console.error('Error toggling star:', error);
      return false;
    }
    return true;
  },
};

// Folder Service
export const folderService = {
  // Get all folders
  async getAll(): Promise<Folder[]> {
    const { data, error } = await supabase
      .from('folders')
      .select('*')
      .order('order_index');

    if (error) {
      console.error('Error fetching folders:', error);
      return [];
    }
    return data || [];
  },

  // Create folder
  async create(folder: Partial<Folder>): Promise<Folder | null> {
    const { data, error } = await supabase
      .from('folders')
      .insert([folder])
      .select()
      .single();

    if (error) {
      console.error('Error creating folder:', error);
      return null;
    }
    return data;
  },

  // Update folder
  async update(id: string, updates: Partial<Folder>): Promise<Folder | null> {
    const { data, error } = await supabase
      .from('folders')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating folder:', error);
      return null;
    }
    return data;
  },

  // Delete folder
  async delete(id: string): Promise<boolean> {
    const { error } = await supabase
      .from('folders')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting folder:', error);
      return false;
    }
    return true;
  },
};

// File Service
export const fileService = {
  // Get all files
  async getAll(): Promise<FileRecord[]> {
    const { data, error } = await supabase
      .from('files')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching files:', error);
      return [];
    }
    return data || [];
  },

  // Get files by folder
  async getByFolder(folderId: string | null): Promise<FileRecord[]> {
    const query = supabase
      .from('files')
      .select('*')
      .order('created_at', { ascending: false });

    if (folderId) {
      query.eq('folder_id', folderId);
    } else {
      query.is('folder_id', null);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching files:', error);
      return [];
    }
    return data || [];
  },

  // Create file record
  async create(file: Partial<FileRecord>): Promise<FileRecord | null> {
    const { data, error } = await supabase
      .from('files')
      .insert([file])
      .select()
      .single();

    if (error) {
      console.error('Error creating file record:', error);
      return null;
    }
    return data;
  },

  // Delete file record
  async delete(id: string): Promise<boolean> {
    const { error } = await supabase
      .from('files')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting file:', error);
      return false;
    }
    return true;
  },
};

// Share Service
export const shareService = {
  // Create share link
  async createShareLink(docId?: string, fileId?: string, visibility: 'private' | 'team' | 'public' = 'private'): Promise<ShareLink | null> {
    const shareToken = Math.random().toString(36).substring(2) + Date.now().toString(36);

    const { data, error } = await supabase
      .from('share_links')
      .insert([{
        document_id: docId,
        file_id: fileId,
        share_token: shareToken,
        visibility,
      }])
      .select()
      .single();

    if (error) {
      console.error('Error creating share link:', error);
      return null;
    }
    return data;
  },

  // Get share link
  async getShareLink(shareToken: string): Promise<ShareLink | null> {
    const { data, error } = await supabase
      .from('share_links')
      .select('*')
      .eq('share_token', shareToken)
      .single();

    if (error) {
      console.error('Error fetching share link:', error);
      return null;
    }
    return data;
  },
};
