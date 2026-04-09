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
  status?: 'active' | 'dissolved';
  dissolved_at?: string | null;
  retention_until?: string | null;
  created_at: string;
  updated_at: string;
  membership_status?: 'pending' | 'approved' | 'rejected' | null;
  is_owner?: boolean;
}

export interface TeamMember {
  id: string;
  team_id: string;
  user_id: string;
  status: 'pending' | 'approved' | 'rejected' | 'left' | 'removed';
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
  visibility: 'private' | 'space' | 'link' | 'team' | 'public';
  expires_at: string | null;
  created_at: string;
  user_id: string | null;
  has_password?: boolean;
}

export interface SharedResourcePayload {
  link: ShareLink;
  document?: Document | null;
  file?: FileRecord | null;
  team?: Team | null;
}

export interface ShareSaveResult {
  ok: boolean;
  document?: Document | null;
  file?: FileRecord | null;
}

export interface PublicDocumentSummary extends Document {
  share_token: string;
  share_link_id?: string;
  share_user_id?: string | null;
  share_created_at?: string;
  shared_team_id?: string | null;
  shared_team_name?: string | null;
  share_visibility?: ShareLink['visibility'];
  has_password?: boolean;
}

export interface PublicFileSummary extends FileRecord {
  share_token: string;
  share_link_id?: string;
  share_user_id?: string | null;
  share_created_at?: string;
  shared_team_id?: string | null;
  shared_team_name?: string | null;
  share_visibility?: ShareLink['visibility'];
  has_password?: boolean;
}

export interface UserNotification {
  id: string;
  user_id: string;
  team_id: string | null;
  actor_user_id: string | null;
  type: 'team_announcement' | 'team_member_left' | 'team_member_removed' | 'team_dissolved';
  title: string;
  content: string;
  action_url: string | null;
  is_read: boolean;
  created_at: string;
  updated_at: string;
  actor_user?: User;
  team?: Team;
}

export interface TeamRecyclePayload {
  team: Team;
  retention_until: string | null;
  documents: Document[];
  folders: Folder[];
  files: FileRecord[];
}

export type MusicSourceType = 'qq_music' | 'netease_music';

export type MusicSourceLoginMode = 'wechat' | 'qq' | 'phone';

export interface MusicSourceConfig {
  cookie?: string | null;
  quality?: 'm4a' | '128' | '320';
  login_mode?: MusicSourceLoginMode | null;
  phone?: string | null;
  country_code?: string | null;
  account_name?: string | null;
}

export interface MusicSource {
  id: string;
  user_id: string;
  type: MusicSourceType;
  name: string;
  config: MusicSourceConfig;
  is_enabled: boolean;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface MusicLyricLine {
  time: number;
  text: string;
  translation?: string;
}

export interface MusicTrack {
  id: string;
  source_id: string;
  source_type: MusicSource['type'];
  source_name?: string;
  provider_track_id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  cover_url: string | null;
  stream_url?: string | null;
  resolved_at?: string | null;
  quality?: MusicSourceConfig['quality'];
  lyric_lines?: MusicLyricLine[];
}

export interface MusicPlayerState {
  user_id: string;
  active_source_id: string | null;
  queue: MusicTrack[];
  current_index: number;
  current_time: number;
  volume: number;
  is_muted: boolean;
  is_expanded: boolean;
  is_playing: boolean;
  created_at: string;
  updated_at: string;
}

export interface MusicSearchPayload {
  keyword: string;
  source: MusicSource;
  tracks: MusicTrack[];
}

export interface MusicCollectionPlaylistSummary {
  id: string;
  title: string;
  cover_url: string | null;
  song_count: number;
  kind: 'liked_songs' | 'created' | 'collected';
}

export interface MusicCollectionsPayload {
  source: MusicSource;
  uin: string;
  nickname: string | null;
  avatar_url: string | null;
  liked_songs_playlist: MusicCollectionPlaylistSummary | null;
  liked_tracks: MusicTrack[];
  created_playlists: MusicCollectionPlaylistSummary[];
  collected_playlists: MusicCollectionPlaylistSummary[];
}

export interface MusicCollectionPlaylistDetailPayload {
  source: MusicSource;
  playlist: MusicCollectionPlaylistSummary;
  tracks: MusicTrack[];
}

export interface MusicLoginSession {
  id: string;
  provider: 'qq_music';
  login_mode: 'wechat' | 'qq';
  status: 'pending' | 'scanned' | 'authorized' | 'expired' | 'failed';
  qr_image_data_url: string | null;
  cookie: string | null;
  message: string | null;
  created_at: string;
  updated_at: string;
}

export interface MusicPhoneLoginResult {
  provider: 'netease_music';
  cookie: string;
  phone: string;
  country_code: string;
  account_name: string | null;
}

export interface MusicCaptchaSendResult {
  provider: 'netease_music';
  phone: string;
  country_code: string;
  message: string | null;
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
