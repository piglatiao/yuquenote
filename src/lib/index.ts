// Supabase client and configuration
export { supabase, STORAGE_CONFIG, getFileTypeFromMime, getFileTypeFromExtension } from './supabase';
export type { FileType } from './supabase';

// Database types
export type { Document, FileRecord, Folder, ShareLink, Comment, Todo, User, ApiResponse, UploadProgress, AuthState, LoginCredentials, RegisterData } from './types';

// Auth services
export { authService } from './authApi';

// Document services
export { documentService } from './documentsApi';
export type { DocTreeItem } from './documentsApi';

// Comment and Todo services
export { commentService, todoService } from './servicesApi';

// Database services
export { folderService, fileService, shareService } from './databaseApi';

// Storage services
export { storageService } from './storageApi';
export type { UploadOptions } from './storageApi';
