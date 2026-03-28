// Database types for Supabase

export interface User {
  id: string;
  email: string;
  nickname: string;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Team {
  id: string;
  name: string;
  owner_user_id: string;
  avatar_url?: string | null;
  member_limit?: number;
  created_at: string;
  updated_at: string;
  membership_status?: 'pending' | 'approved' | 'rejected' | null;
  is_owner?: boolean;
}

export interface TeamMember {
  id: string;
  team_id: string;
  user_id: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  updated_at: string;
  user?: User;
}

export interface TeamInvitation {
  id: string;
  team_id: string;
  invite_type: 'code' | 'email';
  code: string | null;
  invited_email: string | null;
  invited_user_id: string | null;
  status: 'pending' | 'accepted' | 'declined' | 'revoked';
  created_by_user_id: string;
  accepted_by_user_id: string | null;
  accepted_at: string | null;
  created_at: string;
  updated_at: string;
  team?: Team;
  invited_user?: User;
}

export interface ResourcePermission {
  id: string;
  team_id: string;
  resource_type: 'document' | 'file';
  resource_id: string;
  member_user_id: string;
  can_view: boolean;
  can_edit: boolean;
  can_delete: boolean;
  created_at: string;
  updated_at: string;
  user?: User;
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
  team_id?: string | null;
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
  team_id?: string | null;
  is_starred: boolean;
}

export interface Folder {
  id: string;
  name: string;
  parent_id: string | null;
  icon: 'folder' | 'star' | null;
  created_at: string;
  updated_at: string;
  user_id: string | null;
  team_id?: string | null;
  order_index: number;
}

export interface ShareLink {
  id: string;
  document_id: string | null;
  file_id: string | null;
  team_id?: string | null;
  share_token: string;
  visibility: 'private' | 'team' | 'public';
  expires_at: string | null;
  created_at: string;
  user_id: string | null;
}

export interface SharedResourcePayload {
  link: ShareLink;
  document?: Document | null;
  file?: FileRecord | null;
  team?: Team | null;
}

export interface PublicDocumentSummary extends Document {
  share_token: string;
}

export interface PublicFileSummary extends FileRecord {
  share_token: string;
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
