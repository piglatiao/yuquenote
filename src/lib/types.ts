// Database types for Supabase

export interface User {
  id: string;
  email: string;
  nickname: string;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Document {
  id: string;
  title: string;
  content: string;
  parent_id: string | null;
  icon: 'file' | 'folder' | 'star' | null;
  created_at: string;
  updated_at: string;
  user_id: string | null;
  is_starred: boolean;
  order_index: number;
  is_deleted: boolean;
}

export interface FileRecord {
  id: string;
  name: string;
  type: 'image' | 'video' | 'pdf' | 'document' | 'archive' | 'audio' | 'other';
  size: number;
  url: string;
  thumbnail_url: string | null;
  storage_path: string;
  folder_id: string | null;
  created_at: string;
  updated_at: string;
  user_id: string | null;
}

export interface Folder {
  id: string;
  name: string;
  parent_id: string | null;
  icon: 'folder' | 'star' | null;
  created_at: string;
  updated_at: string;
  user_id: string | null;
  order_index: number;
}

export interface ShareLink {
  id: string;
  document_id: string | null;
  file_id: string | null;
  share_token: string;
  visibility: 'private' | 'team' | 'public';
  expires_at: string | null;
  created_at: string;
  user_id: string | null;
}

export interface Comment {
  id: string;
  document_id: string;
  parent_id: string | null;
  content: string;
  created_at: string;
  updated_at: string;
  user_id: string | null;
  user?: User;
  replies?: Comment[];
}

export interface Todo {
  id: string;
  document_id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  priority: 'low' | 'medium' | 'high';
  due_date: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
  user_id: string | null;
  order_index: number;
}

// API Response types
export interface ApiResponse<T> {
  data?: T;
  error?: string;
}

export interface UploadProgress {
  progress: number;
  status: 'uploading' | 'complete' | 'error';
  error?: string;
}

// Auth types
export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export interface LoginCredentials {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface RegisterData {
  email: string;
  password: string;
  nickname: string;
}
