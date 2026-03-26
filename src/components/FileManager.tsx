import { useState, useRef, useCallback, useEffect } from 'react';
import {
  FolderOpen,
  FileText,
  Image,
  Video,
  File,
  Upload,
  Download,
  Trash2,
  Share2,
  X,
  ChevronRight,
  ChevronDown,
  FileArchive,
  Music,
  Eye,
  Copy,
  MoreVertical,
  Search,
  Grid,
  List,
  CloudUpload,
  FolderPlus,
  FolderEdit,
  ArrowLeft,
  Link,
  Lock,
  Users,
  Globe,
} from 'lucide-react';
import { storageService, fileService, folderService, shareService } from '../lib';
import { demoFileStore } from '../lib/demoFileStore';
import type { UploadProgress } from '../lib/types';

export interface FileItem {
  id: string;
  name: string;
  type: 'image' | 'video' | 'pdf' | 'document' | 'archive' | 'audio' | 'other';
  size: number;
  url: string;
  thumbnail?: string;
  uploadedAt: Date;
  folderId?: string;
  storagePath?: string;
  blobKey?: string;
}

export interface FolderItem {
  id: string;
  name: string;
  parentId?: string;
  createdAt: Date;
}

interface FileManagerProps {
  onFileSelect?: (file: FileItem) => void;
  initialFolderId?: string;
}

// Demo mode flag - set to false when backend is configured
const USE_DEMO_MODE = false;

interface StoredFileItem extends Omit<FileItem, 'uploadedAt'> {
  uploadedAt: string;
}

interface StoredFolderItem extends Omit<FolderItem, 'createdAt'> {
  createdAt: string;
}

const getDefaultFiles = (): FileItem[] => [
  {
    id: '1',
    name: '璁捐绋縱2.0.png',
    type: 'image',
    size: 2457600,
    url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800',
    thumbnail: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=200',
    uploadedAt: new Date(Date.now() - 86400000),
  },
  {
    id: '2',
    name: '浜у搧浠嬬粛瑙嗛.mp4',
    type: 'video',
    size: 52428800,
    url: 'https://www.w3schools.com/html/mov_bbb.mp4',
    uploadedAt: new Date(Date.now() - 172800000),
  },
  {
    id: '3',
    name: '鎶€鏈枃妗?pdf',
    type: 'pdf',
    size: 1048576,
    url: 'https://www.w3.org/WAI/WCAG21/Techniques/pdf/img/table-word.pdf',
    uploadedAt: new Date(Date.now() - 259200000),
  },
];

const getDefaultFolders = (): FolderItem[] => [
  { id: 'folder-1', name: '璁捐璧勬簮', createdAt: new Date(Date.now() - 86400000) },
  { id: 'folder-2', name: '鏂囨。璧勬枡', createdAt: new Date(Date.now() - 172800000) },
  { id: 'folder-3', name: '瑙嗛绱犳潗', createdAt: new Date(Date.now() - 259200000) },
];

const isDataUrl = (url?: string): boolean => Boolean(url?.startsWith('data:'));

const loadStoredFiles = (): FileItem[] => {
  const saved = localStorage.getItem('yuque_files');
  if (!saved) {
    return getDefaultFiles();
  }

  try {
    return (JSON.parse(saved) as StoredFileItem[]).map((file) => ({
      ...file,
      url: file.url || '',
      uploadedAt: new Date(file.uploadedAt),
    }));
  } catch (error) {
    console.error('Failed to parse saved file metadata:', error);
    localStorage.removeItem('yuque_files');
    return getDefaultFiles();
  }
};

const loadStoredFolders = (): FolderItem[] => {
  const saved = localStorage.getItem('yuque_folders');
  if (!saved) {
    return getDefaultFolders();
  }

  try {
    return (JSON.parse(saved) as StoredFolderItem[]).map((folder) => ({
      ...folder,
      createdAt: new Date(folder.createdAt),
    }));
  } catch (error) {
    console.error('Failed to parse saved folder metadata:', error);
    localStorage.removeItem('yuque_folders');
    return getDefaultFolders();
  }
};

const serializeFiles = (files: FileItem[]): StoredFileItem[] =>
  files.map((file) => ({
    id: file.id,
    name: file.name,
    type: file.type,
    size: file.size,
    url: file.blobKey ? '' : file.url,
    thumbnail: file.blobKey ? undefined : file.thumbnail,
    uploadedAt: file.uploadedAt.toISOString(),
    folderId: file.folderId,
    storagePath: file.storagePath,
    blobKey: file.blobKey,
  }));

const getFileIcon = (type: FileItem['type']) => {
  switch (type) {
    case 'image':
      return <Image className="w-5 h-5 text-green-500" />;
    case 'video':
      return <Video className="w-5 h-5 text-purple-500" />;
    case 'pdf':
      return <FileText className="w-5 h-5 text-red-500" />;
    case 'document':
      return <FileText className="w-5 h-5 text-blue-500" />;
    case 'archive':
      return <FileArchive className="w-5 h-5 text-yellow-500" />;
    case 'audio':
      return <Music className="w-5 h-5 text-pink-500" />;
    default:
      return <File className="w-5 h-5 text-gray-500" />;
  }
};

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
};

const formatDate = (date: Date): string => {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return '今天';
  if (days === 1) return '昨天';
  if (days < 7) return `${days}天前`;
  return date.toLocaleDateString('zh-CN');
};

export default function FileManager({ onFileSelect, initialFolderId }: FileManagerProps) {
  useState<FileItem[]>(() => {
    const saved = localStorage.getItem('yuque_files');
    if (saved) {
      return JSON.parse(saved).map((f: FileItem) => ({
        ...f,
        uploadedAt: new Date(f.uploadedAt),
      }));
    }
    return [
      {
        id: '1',
        name: '设计稿v2.0.png',
        type: 'image',
        size: 2457600,
        url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800',
        thumbnail: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=200',
        uploadedAt: new Date(Date.now() - 86400000),
      },
      {
        id: '2',
        name: '产品介绍视频.mp4',
        type: 'video',
        size: 52428800,
        url: 'https://www.w3schools.com/html/mov_bbb.mp4',
        uploadedAt: new Date(Date.now() - 172800000),
      },
      {
        id: '3',
        name: '技术文档.pdf',
        type: 'pdf',
        size: 1048576,
        url: 'https://www.w3.org/WAI/WCAG21/Techniques/pdf/img/table-word.pdf',
        uploadedAt: new Date(Date.now() - 259200000),
      },
    ];
  });

  useState<FolderItem[]>(() => {
    const saved = localStorage.getItem('yuque_folders');
    if (saved) {
      return JSON.parse(saved).map((f: FolderItem) => ({
        ...f,
        createdAt: new Date(f.createdAt),
      }));
    }
    return [
      { id: 'folder-1', name: '设计资源', createdAt: new Date(Date.now() - 86400000) },
      { id: 'folder-2', name: '文档资料', createdAt: new Date(Date.now() - 172800000) },
      { id: 'folder-3', name: '视频素材', createdAt: new Date(Date.now() - 259200000) },
    ];
  });

  const [files, setFiles] = useState<FileItem[]>([]);
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(initialFolderId || null);
  const [breadcrumbs, setBreadcrumbs] = useState<FolderItem[]>([]);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; file: FileItem } | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareLink, setShareLink] = useState('');
  const [shareVisibility, setShareVisibility] = useState<'private' | 'team' | 'public'>('private');
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const initialFilesRef = useRef<FileItem[]>([]);
  const objectUrlsRef = useRef<Set<string>>(new Set());

  // Load files from backend when in production mode
  useEffect(() => {
    if (!USE_DEMO_MODE) {
      void loadFiles();
      void loadFolders();
    }
  }, [currentFolderId]);

  useEffect(() => {
    return () => {
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      objectUrlsRef.current.clear();
    };
  }, []);

  const loadFiles = async () => {
    const backendFiles = await fileService.getByFolder(currentFolderId);
    setFiles(backendFiles.map(f => ({
      id: f.id,
      name: f.name,
      type: f.type,
      size: f.size,
      url: f.url,
      thumbnail: f.thumbnail_url || undefined,
      uploadedAt: new Date(f.created_at),
      folderId: f.folder_id || undefined,
      storagePath: f.storage_path,
    })));
  };

  const loadFolders = async () => {
    const backendFolders = await folderService.getAll();
    setFolders(backendFolders.map((folder) => ({
      id: folder.id,
      name: folder.name,
      parentId: folder.parent_id || undefined,
      createdAt: new Date(folder.created_at),
    })));
  };

  const createObjectUrl = useCallback((blob: Blob) => {
    const url = URL.createObjectURL(blob);
    objectUrlsRef.current.add(url);
    return url;
  }, []);

  const revokeObjectUrl = useCallback((url?: string) => {
    if (!url || !url.startsWith('blob:')) {
      return;
    }

    URL.revokeObjectURL(url);
    objectUrlsRef.current.delete(url);
  }, []);

  const saveToStorage = useCallback((newFiles: FileItem[]) => {
    if (!USE_DEMO_MODE) {
      return;
    }
    try {
      localStorage.setItem('yuque_files', JSON.stringify(serializeFiles(newFiles)));
    } catch (error) {
      console.error('Failed to persist file metadata:', error);
    }
  }, []);

  const saveFoldersToStorage = useCallback((newFolders: FolderItem[]) => {
    if (!USE_DEMO_MODE) {
      return;
    }
    localStorage.setItem('yuque_folders', JSON.stringify(newFolders));
  }, []);

  useEffect(() => {
    if (!USE_DEMO_MODE) {
      return;
    }

    let cancelled = false;

    const hydrateDemoFiles = async () => {
      const sourceFiles = initialFilesRef.current;
      let hasChanges = false;

      const hydratedFiles = await Promise.all(sourceFiles.map(async (file) => {
        if (!file.blobKey && !isDataUrl(file.url)) {
          return file;
        }

        try {
          let blobKey = file.blobKey;
          let blob: Blob | null = null;

          if (blobKey) {
            blob = await demoFileStore.getBlob(blobKey);
          } else if (isDataUrl(file.url)) {
            const response = await fetch(file.url);
            blob = await response.blob();
            blobKey = file.id;
            await demoFileStore.putBlob(blobKey, blob);
            hasChanges = true;
          }

          if (!blob || !blobKey) {
            return file;
          }

          const objectUrl = createObjectUrl(blob);
          hasChanges = true;

          return {
            ...file,
            url: objectUrl,
            thumbnail: file.type === 'image' ? objectUrl : file.thumbnail,
            blobKey,
          };
        } catch (error) {
          console.error(`Failed to hydrate demo file "${file.name}":`, error);
          return file;
        }
      }));

      if (cancelled) {
        hydratedFiles.forEach((file) => revokeObjectUrl(file.url));
        return;
      }

      if (!hasChanges) {
        return;
      }

      setFiles(hydratedFiles);
      saveToStorage(hydratedFiles);
    };

    void hydrateDemoFiles();

    return () => {
      cancelled = true;
    };
  }, [createObjectUrl, revokeObjectUrl, saveToStorage]);

  const navigateToFolder = (folderId: string | null) => {
    if (folderId === null) {
      setBreadcrumbs([]);
    } else {
      const folder = folders.find(f => f.id === folderId);
      if (folder) {
        setBreadcrumbs(prev => [...prev, folder]);
      }
    }
    setCurrentFolderId(folderId);
  };

  const navigateToBreadcrumb = (index: number) => {
    if (index === -1) {
      setBreadcrumbs([]);
      setCurrentFolderId(null);
    } else {
      setBreadcrumbs(prev => {
        const updated = prev.slice(0, index + 1);
        setCurrentFolderId(updated[index].id);
        return updated;
      });
    }
  };

  const createNewFolder = async () => {
    if (!newFolderName.trim()) return;
    const createdFolder = await folderService.create({
      name: newFolderName.trim(),
      parent_id: currentFolderId || null,
      icon: 'folder',
    });

    if (createdFolder) {
      setFolders(prev => [...prev, {
        id: createdFolder.id,
        name: createdFolder.name,
        parentId: createdFolder.parent_id || undefined,
        createdAt: new Date(createdFolder.created_at),
      }]);
    }

    setNewFolderName('');
    setShowNewFolderModal(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFiles = e.target.files;
    if (!uploadedFiles?.length) return;

    setUploading(true);
    setUploadProgress(0);

    const newFiles: FileItem[] = [];

    for (let i = 0; i < uploadedFiles.length; i++) {
      const file = uploadedFiles[i];

      // Validate file
      const validation = storageService.validateFile(file);
      if (!validation.valid) {
        alert(validation.error);
        continue;
      }

      if (USE_DEMO_MODE) {
        const fileId = Date.now().toString() + Math.random().toString(36).substr(2, 9);

        try {
          await demoFileStore.putBlob(fileId, file);
        } catch (error) {
          console.error(`Failed to cache demo file "${file.name}":`, error);
          alert('演示模式下保存文件失败，请重试。');
          continue;
        }

        const fileType = storageService.getFileType(file.name);
        const isImage = file.type.startsWith('image/');
        const objectUrl = createObjectUrl(file);

        newFiles.push({
          id: fileId,
          name: file.name,
          type: fileType,
          size: file.size,
          url: objectUrl,
          thumbnail: isImage ? objectUrl : undefined,
          uploadedAt: new Date(),
          folderId: currentFolderId || undefined,
          blobKey: fileId,
        });
      } else {
        // Production mode: upload to Supabase Storage
        const result = await storageService.uploadFile(file, {
          folderId: currentFolderId || undefined,
          onProgress: (progress: UploadProgress) => {
            setUploadProgress(progress.progress);
          },
        });

        if (result.error) {
          alert(`上传失败: ${result.error}`);
          continue;
        }

        const fileType = storageService.getFileType(file.name);

        // Save file record to database
        const fileRecord = await fileService.create({
          name: file.name,
          type: fileType,
          size: file.size,
          url: result.url,
          storage_path: result.path,
          folder_id: currentFolderId,
        });

        if (fileRecord) {
          newFiles.push({
            id: fileRecord.id,
            name: fileRecord.name,
            type: fileRecord.type,
            size: fileRecord.size,
            url: fileRecord.url,
            uploadedAt: new Date(fileRecord.created_at),
            folderId: fileRecord.folder_id || undefined,
            storagePath: fileRecord.storage_path,
          });
        }
      }

      setUploadProgress(Math.round(((i + 1) / uploadedFiles.length) * 100));
    }

    setFiles(prev => {
      const updated = [...prev, ...newFiles];
      saveToStorage(updated);
      return updated;
    });

    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDelete = async (fileId: string) => {
    const file = files.find(f => f.id === fileId);

    // Delete from storage
    if (USE_DEMO_MODE && file?.blobKey) {
      await demoFileStore.deleteBlob(file.blobKey);
      revokeObjectUrl(file.url);
      if (file.thumbnail && file.thumbnail !== file.url) {
        revokeObjectUrl(file.thumbnail);
      }
    } else if (!USE_DEMO_MODE && file?.storagePath) {
      await storageService.deleteFile(file.storagePath);
      await fileService.delete(fileId);
    }

    setFiles(prev => {
      const updated = prev.filter(f => f.id !== fileId);
      saveToStorage(updated);
      return updated;
    });
    setContextMenu(null);
  };

  const handleDownload = (file: FileItem) => {
    if (USE_DEMO_MODE || file.url.startsWith('data:')) {
      storageService.downloadFile(file.url, file.name);
    } else {
      const link = document.createElement('a');
      link.href = file.url;
      link.download = file.name;
      link.click();
    }
  };

  const handleShare = async (file: FileItem) => {
    if (navigator.share && file.url) {
      navigator.share({
        title: file.name,
        url: file.url,
      });
    } else {
      // Generate shareable link
      const link = `${window.location.origin}/share/${file.id}`;
      setShareLink(link);
      setShowShareModal(true);
    }
    setContextMenu(null);
  };

  const copyShareLink = () => {
    navigator.clipboard.writeText(shareLink);
    alert('分享链接已复制到剪贴板');
    setShowShareModal(false);
  };

  const filteredFiles = files.filter(file =>
    (!currentFolderId || file.folderId === currentFolderId) &&
    file.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const currentFolders = folders.filter(f => f.parentId === currentFolderId);

  const groupedFiles = {
    image: filteredFiles.filter(f => f.type === 'image'),
    video: filteredFiles.filter(f => f.type === 'video'),
    pdf: filteredFiles.filter(f => f.type === 'pdf'),
    other: filteredFiles.filter(f => !['image', 'video', 'pdf'].includes(f.type)),
  };

  return (
    <div className="h-full flex flex-col bg-white">
      {/* 工具栏 */}
      <div className="px-4 py-3 border-b border-yuque-border flex items-center gap-3">
        {/* Breadcrumbs */}
        <div className="flex items-center gap-1 text-sm">
          <button
            onClick={() => navigateToBreadcrumb(-1)}
            className="px-2 py-1 hover:bg-gray-100 rounded flex items-center gap-1"
          >
            <FolderOpen className="w-4 h-4" />
            全部文件
          </button>
          {breadcrumbs.map((folder, index) => (
            <div key={folder.id} className="flex items-center">
              <ChevronRight className="w-4 h-4 text-gray-400" />
              <button
                onClick={() => navigateToBreadcrumb(index)}
                className={`px-2 py-1 rounded ${
                  index === breadcrumbs.length - 1 ? 'bg-gray-100 font-medium' : 'hover:bg-gray-100'
                }`}
              >
                {folder.name}
              </button>
            </div>
          ))}
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setViewMode('grid')}
            className={`p-2 rounded-md transition-colors ${viewMode === 'grid' ? 'bg-white shadow-sm' : 'hover:bg-gray-200'}`}
          >
            <Grid className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`p-2 rounded-md transition-colors ${viewMode === 'list' ? 'bg-white shadow-sm' : 'hover:bg-gray-200'}`}
          >
            <List className="w-4 h-4" />
          </button>
        </div>

        <button
          onClick={() => setShowNewFolderModal(true)}
          className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50 transition-colors"
        >
          <FolderPlus className="w-4 h-4" />
          新建文件夹
        </button>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileUpload}
          className="hidden"
          accept="image/*,video/*,.pdf,.doc,.docx,.txt,.zip,.rar,.mp3,.wav"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-2 px-4 py-2 bg-yuque-primary text-white rounded-lg text-sm font-medium hover:bg-blue-600 transition-colors"
        >
          <Upload className="w-4 h-4" />
          上传
        </button>
      </div>

      {/* 上传进度 */}
      {uploading && (
        <div className="px-4 py-3 bg-blue-50 border-b border-blue-100 flex items-center gap-3">
          <CloudUpload className="w-5 h-5 text-yuque-primary animate-pulse" />
          <div className="flex-1">
            <div className="h-2 bg-blue-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-yuque-primary transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
          <span className="text-sm text-blue-600">{uploadProgress}%</span>
        </div>
      )}

      {/* 文件列表 */}
      <div className="flex-1 overflow-y-auto p-4">
        {filteredFiles.length === 0 && currentFolders.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <FolderOpen className="w-16 h-16 mb-4" />
            <p className="text-lg font-medium">暂无文件</p>
            <p className="text-sm mt-1">点击上方「上传」按钮添加文件</p>
          </div>
        ) : (
          <>
            {/* 文件夹列表 */}
            {currentFolders.length > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-medium text-gray-500 mb-3 flex items-center gap-2">
                  <FolderOpen className="w-4 h-4" /> 文件夹 ({currentFolders.length})
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  {currentFolders.map((folder) => (
                    <div
                      key={folder.id}
                      onClick={() => navigateToFolder(folder.id)}
                      className="flex flex-col items-center p-4 bg-gray-50 hover:bg-gray-100 rounded-xl cursor-pointer transition-colors group"
                    >
                      <FolderOpen className="w-10 h-10 text-yellow-500 mb-2 group-hover:scale-110 transition-transform" />
                      <span className="text-sm text-gray-700 truncate w-full text-center">{folder.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 文件列表 */}
            {filteredFiles.length > 0 && (
              <div className="space-y-6">
                {/* 图片 */}
                {groupedFiles.image.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-500 mb-3 flex items-center gap-2">
                      <Image className="w-4 h-4" /> 图片 ({groupedFiles.image.length})
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                      {groupedFiles.image.map((file) => (
                        <FileCard
                          key={file.id}
                          file={file}
                          onClick={() => setSelectedFile(file)}
                          onContextMenu={(e) => setContextMenu({ x: e.clientX, y: e.clientY, file })}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* 视频 */}
                {groupedFiles.video.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-500 mb-3 flex items-center gap-2">
                      <Video className="w-4 h-4" /> 视频 ({groupedFiles.video.length})
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {groupedFiles.video.map((file) => (
                        <FileCard
                          key={file.id}
                          file={file}
                          onClick={() => setSelectedFile(file)}
                          onContextMenu={(e) => setContextMenu({ x: e.clientX, y: e.clientY, file })}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* PDF */}
                {groupedFiles.pdf.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-500 mb-3 flex items-center gap-2">
                      <FileText className="w-4 h-4 text-red-500" /> PDF文档 ({groupedFiles.pdf.length})
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {groupedFiles.pdf.map((file) => (
                        <FileCard
                          key={file.id}
                          file={file}
                          onClick={() => setSelectedFile(file)}
                          onContextMenu={(e) => setContextMenu({ x: e.clientX, y: e.clientY, file })}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* 其他文件 */}
                {groupedFiles.other.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-500 mb-3 flex items-center gap-2">
                      <File className="w-4 h-4" /> 其他文件 ({groupedFiles.other.length})
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      {groupedFiles.other.map((file) => (
                        <FileCard
                          key={file.id}
                          file={file}
                          onClick={() => setSelectedFile(file)}
                          onContextMenu={(e) => setContextMenu({ x: e.clientX, y: e.clientY, file })}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* 右键菜单 */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setContextMenu(null)} />
          <div
            className="fixed z-50 bg-white rounded-lg shadow-dropdown py-2 min-w-[180px] animate-scale-in"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              onClick={() => {
                setSelectedFile(contextMenu.file);
                setContextMenu(null);
              }}
              className="w-full px-4 py-2 text-sm text-left hover:bg-gray-50 flex items-center gap-3"
            >
              <Eye className="w-4 h-4 text-gray-400" />
              预览
            </button>
            <button
              onClick={() => handleDownload(contextMenu.file)}
              className="w-full px-4 py-2 text-sm text-left hover:bg-gray-50 flex items-center gap-3"
            >
              <Download className="w-4 h-4 text-gray-400" />
              下载
            </button>
            <button
              onClick={() => handleShare(contextMenu.file)}
              className="w-full px-4 py-2 text-sm text-left hover:bg-gray-50 flex items-center gap-3"
            >
              <Share2 className="w-4 h-4 text-gray-400" />
              分享
            </button>
            <button
              onClick={() => {
                navigator.clipboard.writeText(contextMenu.file.url);
                alert('链接已复制到剪贴板');
                setContextMenu(null);
              }}
              className="w-full px-4 py-2 text-sm text-left hover:bg-gray-50 flex items-center gap-3"
            >
              <Copy className="w-4 h-4 text-gray-400" />
              复制链接
            </button>
            <div className="h-px bg-gray-200 my-2" />
            <button
              onClick={() => handleDelete(contextMenu.file.id)}
              className="w-full px-4 py-2 text-sm text-left hover:bg-gray-50 flex items-center gap-3 text-red-500"
            >
              <Trash2 className="w-4 h-4" />
              删除
            </button>
          </div>
        </>
      )}

      {/* 预览模态框 */}
      {selectedFile && (
        <FilePreview
          file={selectedFile}
          onClose={() => setSelectedFile(null)}
          onDownload={handleDownload}
          onShare={() => {
            handleShare(selectedFile);
            setShowShareModal(true);
          }}
        />
      )}

      {/* 分享模态框 */}
      {showShareModal && (
        <ShareModal
          link={shareLink}
          visibility={shareVisibility}
          onVisibilityChange={setShareVisibility}
          onCopy={copyShareLink}
          onClose={() => setShowShareModal(false)}
        />
      )}

      {/* 新建文件夹模态框 */}
      {showNewFolderModal && (
        <NewFolderModal
          name={newFolderName}
          onNameChange={setNewFolderName}
          onConfirm={createNewFolder}
          onCancel={() => setShowNewFolderModal(false)}
        />
      )}
    </div>
  );
}

interface FileCardProps {
  file: FileItem;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

function FileCard({ file, onClick, onContextMenu }: FileCardProps) {
  return (
    <div
      onClick={onClick}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu(e);
      }}
      className="group bg-white border border-gray-200 rounded-xl overflow-hidden hover:shadow-md hover:border-yuque-primary/30 transition-all cursor-pointer"
    >
      <div className="aspect-square bg-gray-100 relative overflow-hidden">
        {file.thumbnail || (file.type === 'image' && file.url) ? (
          <img
            src={file.thumbnail || file.url}
            alt={file.name}
            className="w-full h-full object-cover"
          />
        ) : file.type === 'video' ? (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-100 to-purple-200">
            <Video className="w-12 h-12 text-purple-400" />
          </div>
        ) : file.type === 'pdf' ? (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-red-100 to-red-200">
            <FileText className="w-12 h-12 text-red-400" />
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            {getFileIcon(file.type)}
          </div>
        )}
        {file.type === 'video' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="w-14 h-14 bg-white/90 rounded-full flex items-center justify-center">
              <div className="w-0 h-0 border-t-8 border-t-transparent border-l-12 border-l-yuque-primary border-b-8 border-b-transparent ml-1" />
            </div>
          </div>
        )}
      </div>
      <div className="p-3">
        <div className="font-medium text-sm text-gray-900 truncate" title={file.name}>
          {file.name}
        </div>
        <div className="text-xs text-gray-500 mt-1">
          {formatFileSize(file.size)}
        </div>
      </div>
    </div>
  );
}

interface FilePreviewProps {
  file: FileItem;
  onClose: () => void;
  onDownload: (file: FileItem) => void;
  onShare: () => void;
}

function FilePreview({ file, onClose, onDownload, onShare }: FilePreviewProps) {
  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0" />
      <div
        className="relative bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute top-0 left-0 right-0 z-10 bg-gradient-to-b from-black/60 to-transparent p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {getFileIcon(file.type)}
            <div className="text-white">
              <div className="font-medium">{file.name}</div>
              <div className="text-sm opacity-80">{formatFileSize(file.size)}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onDownload(file)}
              className="p-2 bg-white/20 hover:bg-white/30 rounded-lg text-white transition-colors"
            >
              <Download className="w-5 h-5" />
            </button>
            <button
              onClick={onShare}
              className="p-2 bg-white/20 hover:bg-white/30 rounded-lg text-white transition-colors"
            >
              <Share2 className="w-5 h-5" />
            </button>
            <button
              onClick={onClose}
              className="p-2 bg-white/20 hover:bg-white/30 rounded-lg text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="pt-14 bg-gray-900">
          {file.type === 'image' && (
            <img
              src={file.url}
              alt={file.name}
              className="max-w-full max-h-[calc(90vh-3.5rem)] mx-auto object-contain"
            />
          )}
          {file.type === 'video' && (
            <video
              src={file.url}
              controls
              autoPlay
              className="max-w-full max-h-[calc(90vh-3.5rem)] mx-auto"
            />
          )}
          {file.type === 'pdf' && (
            <iframe
              src={file.url}
              className="w-full h-[calc(90vh-3.5rem)]"
              title={file.name}
            />
          )}
          {!['image', 'video', 'pdf'].includes(file.type) && (
            <div className="p-8 bg-white h-[calc(90vh-3.5rem)] flex items-center justify-center">
              <div className="text-center">
                {getFileIcon(file.type)}
                <p className="text-lg mt-4">暂不支持预览此文件格式</p>
                <p className="text-sm text-gray-500 mt-2">点击下载查看</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface ShareModalProps {
  link: string;
  visibility: 'private' | 'team' | 'public';
  onVisibilityChange: (v: 'private' | 'team' | 'public') => void;
  onCopy: () => void;
  onClose: () => void;
}

function ShareModal({ link, visibility, onVisibilityChange, onCopy, onClose }: ShareModalProps) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold">分享文件</h3>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">分享权限</label>
          <div className="space-y-2">
            {[
              { value: 'private', label: '私有', desc: '只有自己可以访问', icon: Lock },
              { value: 'team', label: '团队', desc: '团队成员可以访问', icon: Users },
              { value: 'public', label: '公开', desc: '互联网上所有人都可以访问', icon: Globe },
            ].map((item) => (
              <label
                key={item.value}
                className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer border transition-colors ${
                  visibility === item.value
                    ? 'border-yuque-primary bg-blue-50'
                    : 'border-gray-200 hover:bg-gray-50'
                }`}
              >
                <input
                  type="radio"
                  name="visibility"
                  value={item.value}
                  checked={visibility === item.value}
                  onChange={() => onVisibilityChange(item.value as typeof visibility)}
                  className="sr-only"
                />
                <item.icon className="w-5 h-5 text-gray-500" />
                <div className="flex-1">
                  <div className="font-medium text-gray-900">{item.label}</div>
                  <div className="text-sm text-gray-500">{item.desc}</div>
                </div>
                {visibility === item.value && (
                  <div className="w-5 h-5 bg-yuque-primary rounded-full flex items-center justify-center">
                    <div className="w-2 h-2 bg-white rounded-full" />
                  </div>
                )}
              </label>
            ))}
          </div>
        </div>

        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">分享链接</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={link}
              readOnly
              className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50"
            />
            <button
              onClick={onCopy}
              className="px-4 py-2 bg-yuque-primary text-white rounded-lg text-sm hover:bg-blue-600 transition-colors"
            >
              复制
            </button>
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50 transition-colors"
        >
          关闭
        </button>
      </div>
    </div>
  );
}

interface NewFolderModalProps {
  name: string;
  onNameChange: (v: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

function NewFolderModal({ name, onNameChange, onConfirm, onCancel }: NewFolderModalProps) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onCancel}>
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold mb-4">新建文件夹</h3>
        <input
          type="text"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onConfirm()}
          placeholder="请输入文件夹名称"
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-yuque-primary focus:ring-2 focus:ring-yuque-primary/20 mb-4"
          autoFocus
        />
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50 transition-colors"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2 bg-yuque-primary text-white rounded-lg text-sm hover:bg-blue-600 transition-colors"
          >
            创建
          </button>
        </div>
      </div>
    </div>
  );
}
