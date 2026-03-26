import { supabase, STORAGE_CONFIG, getFileTypeFromExtension, type FileType } from './supabase';
import type { UploadProgress } from './types';

export interface UploadOptions {
  bucketName?: string;
  folderId?: string;
  onProgress?: (progress: UploadProgress) => void;
}

export const storageService = {
  // Upload file to Supabase Storage
  async uploadFile(
    file: File,
    options: UploadOptions = {}
  ): Promise<{ url: string; path: string; error?: string }> {
    const {
      bucketName = STORAGE_CONFIG.BUCKET_NAME,
      folderId,
      onProgress,
    } = options;

    // Generate unique filename
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 8);
    const ext = file.name.split('.').pop() || '';
    const filename = `${timestamp}_${randomStr}.${ext}`;

    // Build storage path with configurable prefix
    let storagePath = `${STORAGE_CONFIG.PATH_PREFIX}`;
    if (folderId) {
      storagePath += `${folderId}/`;
    }
    storagePath += filename;

    // Report progress
    onProgress?.({ progress: 0, status: 'uploading' });

    try {
      const { data, error } = await supabase.storage
        .from(bucketName)
        .upload(storagePath, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (error) {
        console.error('Upload error:', error);
        onProgress?.({ progress: 0, status: 'error', error: error.message });
        return { url: '', path: '', error: error.message };
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from(bucketName)
        .getPublicUrl(data.path);

      onProgress?.({ progress: 100, status: 'complete' });

      return {
        url: urlData.publicUrl,
        path: data.path,
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Upload failed';
      onProgress?.({ progress: 0, status: 'error', error: errorMsg });
      return { url: '', path: '', error: errorMsg };
    }
  },

  // Upload multiple files
  async uploadMultiple(
    files: File[],
    options: UploadOptions = {}
  ): Promise<Array<{ url: string; path: string; file: File; error?: string }>> {
    const results: Array<{ url: string; path: string; file: File; error?: string }> = [];

    for (const file of files) {
      const result = await this.uploadFile(file, options);
      results.push({ ...result, file });
    }

    return results;
  },

  // Delete file from storage
  async deleteFile(storagePath: string, bucketName?: string): Promise<boolean> {
    const { error } = await supabase.storage
      .from(bucketName || STORAGE_CONFIG.BUCKET_NAME)
      .remove([storagePath]);

    if (error) {
      console.error('Delete error:', error);
      return false;
    }
    return true;
  },

  // Get file type
  getFileType(filename: string): FileType {
    return getFileTypeFromExtension(filename);
  },

  // Get file icon based on type
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

  // Validate file
  validateFile(file: File): { valid: boolean; error?: string } {
    // Check file size
    if (file.size > STORAGE_CONFIG.MAX_FILE_SIZE) {
      return {
        valid: false,
        error: `文件大小超过限制 (最大 ${STORAGE_CONFIG.MAX_FILE_SIZE / 1024 / 1024}MB)`,
      };
    }

    // Check file type
    const allowedTypes = [
      ...STORAGE_CONFIG.ALLOWED_IMAGE_TYPES,
      ...STORAGE_CONFIG.ALLOWED_VIDEO_TYPES,
      ...STORAGE_CONFIG.ALLOWED_DOCUMENT_TYPES,
      ...STORAGE_CONFIG.ALLOWED_ARCHIVE_TYPES,
      ...STORAGE_CONFIG.ALLOWED_AUDIO_TYPES,
    ];

    if (!allowedTypes.includes(file.type)) {
      return {
        valid: false,
        error: '不支持的文件类型',
      };
    }

    return { valid: true };
  },

  // Download file
  downloadFile(url: string, filename: string): void {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  },
};
