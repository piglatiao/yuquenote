import { createClient } from '@supabase/supabase-js';

// Supabase configuration - can be configured via environment variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://your-project.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'your-anon-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Storage configuration
export const STORAGE_CONFIG = {
  BUCKET_NAME: import.meta.env.VITE_STORAGE_BUCKET || 'yuque-files',
  // Configurable storage path prefix
  PATH_PREFIX: import.meta.env.VITE_STORAGE_PATH_PREFIX || 'files/',
  // Allowed file types
  ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'],
  ALLOWED_VIDEO_TYPES: ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska', 'video/ogg'],
  ALLOWED_DOCUMENT_TYPES: ['application/pdf', 'text/plain', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  ALLOWED_ARCHIVE_TYPES: ['application/zip', 'application/x-rar-compressed', 'application/x-7z-compressed'],
  ALLOWED_AUDIO_TYPES: ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/flac', 'audio/aac'],
  // Max file size (500MB)
  MAX_FILE_SIZE: 500 * 1024 * 1024,
};

export type FileType = 'image' | 'video' | 'pdf' | 'document' | 'archive' | 'audio' | 'other';

export function getFileTypeFromMime(mimeType: string): FileType {
  if (STORAGE_CONFIG.ALLOWED_IMAGE_TYPES.includes(mimeType)) return 'image';
  if (STORAGE_CONFIG.ALLOWED_VIDEO_TYPES.includes(mimeType)) return 'video';
  if (STORAGE_CONFIG.ALLOWED_DOCUMENT_TYPES.includes(mimeType)) return 'pdf';
  if (STORAGE_CONFIG.ALLOWED_ARCHIVE_TYPES.includes(mimeType)) return 'archive';
  if (STORAGE_CONFIG.ALLOWED_AUDIO_TYPES.includes(mimeType)) return 'audio';
  return 'other';
}

export function getFileTypeFromExtension(filename: string): FileType {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) return 'image';
  if (['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(ext)) return 'video';
  if (ext === 'pdf') return 'pdf';
  if (['doc', 'docx', 'txt', 'md', 'rtf'].includes(ext)) return 'document';
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'archive';
  if (['mp3', 'wav', 'ogg', 'flac', 'aac'].includes(ext)) return 'audio';
  return 'other';
}
