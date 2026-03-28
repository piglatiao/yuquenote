import { applyStoredUserHeader } from './api';
import { STORAGE_CONFIG, getFileTypeFromExtension, type FileType } from './supabase';
import type { UploadProgress } from './types';

export interface UploadOptions {
  bucketName?: string;
  folderId?: string;
  teamId?: string | null;
  onProgress?: (progress: UploadProgress) => void;
}

export const storageService = {
  async uploadFile(file: File, options: UploadOptions = {}): Promise<{ url: string; path: string; error?: string }> {
    options.onProgress?.({ progress: 0, status: 'uploading' });

    try {
      const params = new URLSearchParams({
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
      });

      if (options.folderId) {
        params.set('folderId', options.folderId);
      }

      if (options.teamId) {
        params.set('teamId', options.teamId);
      }

      const headers = applyStoredUserHeader(new Headers());
      const response = await fetch(`/api/files/upload?${params.toString()}`, {
        method: 'POST',
        headers,
        body: file,
      });

      const payload = await response.json();
      if (!response.ok) {
        options.onProgress?.({ progress: 0, status: 'error', error: payload.error || 'Upload failed.' });
        return { url: '', path: '', error: payload.error || 'Upload failed.' };
      }

      options.onProgress?.({ progress: 100, status: 'complete' });
      return { url: payload.url, path: payload.path };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Upload failed.';
      options.onProgress?.({ progress: 0, status: 'error', error: message });
      return { url: '', path: '', error: message };
    }
  },

  async uploadMultiple(
    files: File[],
    options: UploadOptions = {},
  ): Promise<Array<{ url: string; path: string; file: File; error?: string }>> {
    const results = [];
    for (const file of files) {
      results.push({ ...(await this.uploadFile(file, options)), file });
    }
    return results;
  },

  async deleteFile(_storagePath?: string): Promise<boolean> {
    return true;
  },

  getFileType(filename: string): FileType {
    return getFileTypeFromExtension(filename);
  },

  getFileIcon(type: FileType): string {
    const icons: Record<FileType, string> = {
      image: 'image',
      video: 'video',
      pdf: 'file-text',
      document: 'file-text',
      archive: 'file-archive',
      audio: 'music',
      other: 'file',
    };
    return icons[type];
  },

  validateFile(file: File): { valid: boolean; error?: string } {
    if (file.size > STORAGE_CONFIG.MAX_FILE_SIZE) {
      return {
        valid: false,
        error: `File is too large. Max size: ${STORAGE_CONFIG.MAX_FILE_SIZE / 1024 / 1024}MB`,
      };
    }

    const allowedTypes = [
      ...STORAGE_CONFIG.ALLOWED_IMAGE_TYPES,
      ...STORAGE_CONFIG.ALLOWED_VIDEO_TYPES,
      ...STORAGE_CONFIG.ALLOWED_DOCUMENT_TYPES,
      ...STORAGE_CONFIG.ALLOWED_ARCHIVE_TYPES,
      ...STORAGE_CONFIG.ALLOWED_AUDIO_TYPES,
    ];

    const inferredType = getFileTypeFromExtension(file.name);
    if (file.type && !allowedTypes.includes(file.type) && inferredType === 'other') {
      return { valid: false, error: 'Unsupported file type.' };
    }

    return { valid: true };
  },

  downloadFile(url: string, filename: string): void {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  },
};
