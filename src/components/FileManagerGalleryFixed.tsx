
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ArrowLeft,
  Download,
  Eye,
  File,
  FileArchive,
  FileText,
  FolderOpen,
  FolderPlus,
  Image,
  MoreHorizontal,
  MoveRight,
  Music,
  Search,
  Share2,
  Star,
  Trash2,
  Upload,
  Video,
  X,
} from 'lucide-react';
import { fileService, folderService, storageService } from '../lib';
import type { FileRecord, Folder } from '../lib';
import ResourceShareModal from './ResourceShareModal';

type FileType = FileRecord['type'];

interface FileManagerProps {
  onFileSelect?: (file: FileItem) => void;
  initialFolderId?: string;
  teamId?: string | null;
  initialPreviewFileId?: string | null;
  onFolderChange?: (folderId: string | null) => void;
  onPreviewFileChange?: (fileId: string | null) => void;
  onInitialPreviewHandled?: () => void;
}

interface FolderItem {
  id: string;
  name: string;
  parentId?: string;
  createdAt: Date;
  teamId?: string | null;
}

interface FileItem {
  id: string;
  name: string;
  type: FileType;
  size: number;
  url: string;
  thumbnail?: string;
  uploadedAt: Date;
  folderId?: string;
  teamId?: string | null;
  isStarred: boolean;
}

interface ActionDialogState {
  title: string;
  message: string;
  tone?: 'default' | 'danger';
  confirmText?: string;
  cancelText?: string;
  showCancel?: boolean;
  onConfirm?: () => void | Promise<void>;
}

const videoThumbnailCache = new Map<string, string>();

const mapFolder = (folder: Folder): FolderItem => ({
  id: folder.id,
  name: folder.name,
  parentId: folder.parent_id || undefined,
  createdAt: new Date(folder.created_at),
  teamId: folder.team_id || null,
});

const mapFile = (file: FileRecord): FileItem => ({
  id: file.id,
  name: file.name,
  type: file.type,
  size: file.size,
  url: file.url,
  thumbnail: file.thumbnail_url || undefined,
  uploadedAt: new Date(file.created_at),
  folderId: file.folder_id || undefined,
  teamId: file.team_id || null,
  isStarred: Boolean(file.is_starred),
});

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
};

const formatTime = (date: Date) =>
  date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

const getFileIcon = (type: FileType) => {
  switch (type) {
    case 'image':
      return <Image className="h-5 w-5 text-emerald-500" />;
    case 'video':
      return <Video className="h-5 w-5 text-indigo-500" />;
    case 'pdf':
      return <FileText className="h-5 w-5 text-rose-500" />;
    case 'document':
      return <FileText className="h-5 w-5 text-sky-500" />;
    case 'archive':
      return <FileArchive className="h-5 w-5 text-amber-500" />;
    case 'audio':
      return <Music className="h-5 w-5 text-fuchsia-500" />;
    default:
      return <File className="h-5 w-5 text-slate-500" />;
  }
};

const isMediaFile = (file: FileItem) => file.type === 'image' || file.type === 'video';

function buildBreadcrumbs(folderId: string | null, folderMap: Map<string, FolderItem>) {
  const breadcrumbs: FolderItem[] = [];
  let current = folderId ? folderMap.get(folderId) : undefined;

  while (current) {
    breadcrumbs.unshift(current);
    current = current.parentId ? folderMap.get(current.parentId) : undefined;
  }

  return breadcrumbs;
}

function buildPathLabel(folderId: string | undefined, folderMap: Map<string, FolderItem>) {
  if (!folderId) {
    return '全部文件';
  }

  const names: string[] = [];
  let current = folderMap.get(folderId);
  while (current) {
    names.unshift(current.name);
    current = current.parentId ? folderMap.get(current.parentId) : undefined;
  }

  return ['全部文件', ...names].join(' / ');
}

export default function FileManagerGalleryFixed({
  onFileSelect,
  initialFolderId,
  teamId = null,
  initialPreviewFileId = null,
  onFolderChange,
  onPreviewFileChange,
  onInitialPreviewHandled,
}: FileManagerProps) {
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [allFiles, setAllFiles] = useState<FileItem[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(initialFolderId ?? null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadTargetFolderId, setUploadTargetFolderId] = useState('');
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [shareFile, setShareFile] = useState<FileItem | null>(null);
  const [movingFiles, setMovingFiles] = useState<FileItem[]>([]);
  const [targetFolderId, setTargetFolderId] = useState('');
  const [selectedMediaIds, setSelectedMediaIds] = useState<string[]>([]);
  const [selectionMode, setSelectionMode] = useState(false);
  const [actionDialog, setActionDialog] = useState<ActionDialogState | null>(null);
  const [supportsFileFavorites, setSupportsFileFavorites] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scopedFolders = useMemo(
    () => folders.filter((folder) => (teamId ? folder.teamId === teamId : !folder.teamId)),
    [folders, teamId],
  );
  const folderMap = useMemo(() => new Map(scopedFolders.map((folder) => [folder.id, folder])), [scopedFolders]);
  const breadcrumbs = useMemo(() => buildBreadcrumbs(currentFolderId, folderMap), [currentFolderId, folderMap]);
  const currentFolder = currentFolderId ? folderMap.get(currentFolderId) || null : null;
  const normalizedQuery = searchQuery.trim().toLowerCase();

  const scopedAllFiles = useMemo(
    () => allFiles.filter((file) => (teamId ? file.teamId === teamId : !file.teamId)),
    [allFiles, teamId],
  );

  const folderOptions = useMemo(
    () =>
      scopedFolders
        .map((folder) => ({ id: folder.id, path: buildPathLabel(folder.id, folderMap) }))
        .sort((a, b) => a.path.localeCompare(b.path, 'zh-CN')),
    [scopedFolders, folderMap],
  );

  const selectedMediaFiles = useMemo(
    () => scopedAllFiles.filter((file) => selectedMediaIds.includes(file.id) && isMediaFile(file)),
    [scopedAllFiles, selectedMediaIds],
  );

  const openInfoDialog = (title: string, message: string) => {
    setActionDialog({
      title,
      message,
      confirmText: '知道了',
      showCancel: false,
    });
  };

  const openConfirmDialog = (dialog: ActionDialogState) => {
    setActionDialog({
      tone: 'default',
      confirmText: '确认',
      cancelText: '取消',
      showCancel: true,
      ...dialog,
    });
  };

  const loadFolders = async () => {
    const data = await folderService.getAll(teamId);
    setFolders(data.map(mapFolder));
  };

  const loadAllFiles = async () => {
    const data = await fileService.getAll(teamId);
    setSupportsFileFavorites(
      data.every((file) => typeof file.is_starred === 'boolean'),
    );
    setAllFiles(data.map(mapFile));
  };

  const refreshFiles = async () => {
    await Promise.all([loadFolders(), loadAllFiles()]);
  };

  const applyUpdatedFile = (updatedRecord: FileRecord) => {
    const updated = mapFile(updatedRecord);

    setAllFiles((prev) => prev.map((file) => (file.id === updated.id ? updated : file)));
    setSelectedFile((prev) => (prev?.id === updated.id ? updated : prev));
    setShareFile((prev) => (prev?.id === updated.id ? updated : prev));
    setMovingFiles((prev) => prev.map((file) => (file.id === updated.id ? updated : file)));
  };

  useEffect(() => {
    setCurrentFolderId(initialFolderId ?? null);
  }, [initialFolderId, teamId]);

  useEffect(() => {
    onFolderChange?.(currentFolderId);
  }, [currentFolderId, onFolderChange]);

  useEffect(() => {
    void Promise.all([loadFolders(), loadAllFiles()]);
  }, [teamId]);

  useEffect(() => {
    if (currentFolderId && !folderMap.has(currentFolderId)) {
      setCurrentFolderId(null);
    }
  }, [currentFolderId, folderMap]);

  useEffect(() => {
    if (!initialPreviewFileId) return;

    const target = scopedAllFiles.find((file) => file.id === initialPreviewFileId);
    if (!target) return;

    setCurrentFolderId(target.folderId || null);
    setSelectedFile(target);
    onFileSelect?.(target);
    onInitialPreviewHandled?.();
  }, [initialPreviewFileId, scopedAllFiles, onFileSelect, onInitialPreviewHandled]);

  useEffect(() => {
    onPreviewFileChange?.(selectedFile?.id ?? null);
  }, [onPreviewFileChange, selectedFile?.id]);
  useEffect(() => {
    const allIds = new Set(scopedAllFiles.map((file) => file.id));
    setSelectedMediaIds((prev) => {
      const next = prev.filter((id) => allIds.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [scopedAllFiles]);

  useEffect(() => {
    if (selectedFile && !scopedAllFiles.some((file) => file.id === selectedFile.id)) {
      setSelectedFile(null);
    }
    if (shareFile && !scopedAllFiles.some((file) => file.id === shareFile.id)) {
      setShareFile(null);
    }
  }, [scopedAllFiles, selectedFile, shareFile]);

  useEffect(() => {
    if (selectedMediaIds.length === 0) {
      setSelectionMode(false);
    }
  }, [selectedMediaIds.length]);

  const currentFolders = useMemo(
    () =>
      scopedFolders.filter((folder) => {
        const sameParent = (folder.parentId || null) === currentFolderId;
        if (!sameParent) return false;
        if (!normalizedQuery) return true;

        const pathLabel = buildPathLabel(folder.id, folderMap).toLowerCase();
        return folder.name.toLowerCase().includes(normalizedQuery) || pathLabel.includes(normalizedQuery);
      }),
    [scopedFolders, currentFolderId, normalizedQuery, folderMap],
  );

  const scopedCurrentFiles = useMemo(
    () => scopedAllFiles.filter((file) => (file.folderId || null) === currentFolderId),
    [scopedAllFiles, currentFolderId],
  );

  const filteredCurrentFiles = useMemo(
    () =>
      scopedCurrentFiles.filter((file) => {
        if (!normalizedQuery) return true;
        const pathLabel = buildPathLabel(file.folderId, folderMap).toLowerCase();
        return file.name.toLowerCase().includes(normalizedQuery) || pathLabel.includes(normalizedQuery);
      }),
    [scopedCurrentFiles, normalizedQuery, folderMap],
  );

  const groupedCurrentFiles = useMemo(
    () => ({
      image: filteredCurrentFiles.filter((file) => file.type === 'image'),
      video: filteredCurrentFiles.filter((file) => file.type === 'video'),
      pdf: filteredCurrentFiles.filter((file) => file.type === 'pdf'),
      other: filteredCurrentFiles.filter((file) => !['image', 'video', 'pdf'].includes(file.type)),
    }),
    [filteredCurrentFiles],
  );

  const homepagePreview = useMemo(() => {
    if (currentFolderId !== null) {
      return { images: [] as FileItem[], videos: [] as FileItem[] };
    }

      const filtered = scopedAllFiles.filter((file) => {
        if (!normalizedQuery) return true;
        const pathLabel = buildPathLabel(file.folderId, folderMap).toLowerCase();
        return file.name.toLowerCase().includes(normalizedQuery) || pathLabel.includes(normalizedQuery);
      });

    return {
      images: filtered.filter((file) => file.type === 'image'),
      videos: filtered.filter((file) => file.type === 'video'),
    };
  }, [scopedAllFiles, currentFolderId, normalizedQuery, folderMap]);

  const hasHomepageMedia = homepagePreview.images.length > 0 || homepagePreview.videos.length > 0;

  const renderPath = (file: FileItem) => buildPathLabel(file.folderId, folderMap);

  const openPreview = (file: FileItem) => {
    setSelectedFile(file);
    onFileSelect?.(file);
  };

  const openUploadModal = () => {
    if (scopedFolders.length === 0) {
      openInfoDialog('暂时无法上传', '请先创建文件夹，再上传文件。');
      return;
    }

    setUploadTargetFolderId(currentFolderId || '');
    setShowUploadModal(true);
  };

  const confirmUploadTarget = () => {
    if (!uploadTargetFolderId) {
      openInfoDialog('请选择上传目录', '根路径下不允许直接上传，请先选择一个文件夹。');
      return;
    }

    setShowUploadModal(false);
    fileInputRef.current?.click();
  };

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const uploadList = event.target.files;
    if (!uploadList?.length) return;

    if (!uploadTargetFolderId) {
      openInfoDialog('请选择上传目录', '请先选择上传目录。');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const errors: string[] = [];
    setUploading(true);
    setUploadProgress(0);

    try {
      for (const [index, file] of Array.from(uploadList).entries()) {
        const validation = storageService.validateFile(file);
        if (!validation.valid) {
          errors.push(`${file.name}: ${validation.error || '校验失败'}`);
          continue;
        }

        const upload = await storageService.uploadFile(file, {
          folderId: uploadTargetFolderId,
          teamId,
          onProgress: ({ progress }) => {
            const completed = (index / uploadList.length) * 100;
            setUploadProgress(Math.min(100, Math.round(completed + progress / uploadList.length)));
          },
        });

        if (upload.error) {
          errors.push(`${file.name}: ${upload.error}`);
          continue;
        }

        const created = await fileService.create({
          name: file.name,
          type: storageService.getFileType(file.name),
          size: file.size,
          url: upload.url,
          storage_path: upload.path,
          folder_id: uploadTargetFolderId,
          team_id: teamId,
        });

        if (!created) {
          errors.push(`${file.name}: 文件索引保存失败`);
        }
      }

      await refreshFiles();
    } finally {
      setUploading(false);
      setUploadTargetFolderId('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }

    if (errors.length > 0) {
      openInfoDialog('部分文件上传失败', errors.join('\n'));
    }
  };

  const handleCreateFolder = async () => {
    const name = newFolderName.trim();
    if (!name) return;

    const created = await folderService.create({
      name,
      parent_id: currentFolderId,
      icon: 'folder',
      team_id: teamId,
    });

    if (!created) {
      openInfoDialog('创建失败', '创建文件夹失败。');
      return;
    }

    setNewFolderName('');
    setShowNewFolderModal(false);
    await refreshFiles();
  };

  const handleToggleStar = async (file: FileItem) => {
    if (!supportsFileFavorites) {
      openInfoDialog(
        '文件收藏暂未生效',
        '当前后端还没有完成文件收藏字段升级。请重启后端后再试，重启后会自动把 is_starred 字段迁移到数据库。',
      );
      return;
    }

    const updated = await fileService.update(file.id, {
      is_starred: !file.isStarred,
    });

    if (!updated) {
      openInfoDialog('收藏失败', '更新文件收藏状态失败。');
      return;
    }

    if (typeof updated.is_starred !== 'boolean') {
      openInfoDialog(
        '文件收藏暂未生效',
        '后端返回的数据里没有 is_starred 字段，通常是后端还没重启。请重启后端后再试。',
      );
      return;
    }

    applyUpdatedFile(updated);
  };

  const handleDeleteFile = async (file: FileItem) => {
    openConfirmDialog({
      title: '删除文件',
      message: `确定删除“${file.name}”吗？`,
      tone: 'danger',
      confirmText: '删除',
      onConfirm: async () => {
        const deleted = await fileService.delete(file.id);
        if (!deleted) {
          openInfoDialog('删除失败', '删除文件失败。');
          return;
        }

        if (selectedFile?.id === file.id) setSelectedFile(null);
        if (shareFile?.id === file.id) setShareFile(null);

        setMovingFiles((prev) => prev.filter((item) => item.id !== file.id));
        setSelectedMediaIds((prev) => prev.filter((id) => id !== file.id));

        await refreshFiles();
      },
    });
  };

  const handleBatchDelete = async () => {
    if (selectedMediaFiles.length === 0) return;
    openConfirmDialog({
      title: '批量删除',
      message: `确定删除选中的 ${selectedMediaFiles.length} 个图片/视频文件吗？`,
      tone: 'danger',
      confirmText: '删除',
      onConfirm: async () => {
        const selectedIds = new Set(selectedMediaFiles.map((file) => file.id));
        const results = await Promise.all(selectedMediaFiles.map((file) => fileService.delete(file.id)));

        if (results.some((item) => !item)) {
          openInfoDialog('删除失败', '批量删除失败。');
          return;
        }

        if (selectedFile && selectedIds.has(selectedFile.id)) setSelectedFile(null);
        if (shareFile && selectedIds.has(shareFile.id)) setShareFile(null);

        setMovingFiles((prev) => prev.filter((file) => !selectedIds.has(file.id)));
        setSelectedMediaIds([]);
        setSelectionMode(false);

        await refreshFiles();
      },
    });
  };

  const openMoveModal = (files: FileItem[] | FileItem) => {
    const input = Array.isArray(files) ? files : [files];
    const mediaFiles = input.filter(isMediaFile);

    if (mediaFiles.length === 0) {
      return;
    }

    setMovingFiles(mediaFiles);
    setTargetFolderId(mediaFiles[0]?.folderId || '');
  };

  const handleMoveFiles = async () => {
    if (movingFiles.length === 0) return;

    const movingIds = new Set(movingFiles.map((file) => file.id));
    const nextFolderId = targetFolderId || null;

    const results = await Promise.all(
      movingFiles.map((file) =>
        fileService.update(file.id, {
          folder_id: nextFolderId,
        }),
      ),
    );

    if (results.some((item) => !item)) {
      openInfoDialog('移动失败', '批量移动失败。');
      return;
    }

    if (selectedFile && movingIds.has(selectedFile.id)) {
      setSelectedFile({
        ...selectedFile,
        folderId: nextFolderId || undefined,
      });
    }

    if (shareFile && movingIds.has(shareFile.id)) {
      setShareFile({
        ...shareFile,
        folderId: nextFolderId || undefined,
      });
    }

    setMovingFiles([]);
    setTargetFolderId('');
    setSelectedMediaIds([]);
    setSelectionMode(false);
    await refreshFiles();
  };

  const handleLongPressSelect = (fileId: string) => {
    setSelectionMode(true);
    setSelectedMediaIds((prev) => (prev.includes(fileId) ? prev : [...prev, fileId]));
  };

  const toggleMediaSelection = (fileId: string) => {
    setSelectionMode(true);
    setSelectedMediaIds((prev) =>
      prev.includes(fileId) ? prev.filter((id) => id !== fileId) : [...prev, fileId],
    );
  };

  const clearMediaSelection = () => {
    setSelectedMediaIds([]);
    setSelectionMode(false);
  };

  const getFolderDeleteImpact = (folderId: string) => {
    const affectedFolderIds = new Set<string>();
    const stack = [folderId];

    while (stack.length > 0) {
      const currentId = stack.pop();
      if (!currentId || affectedFolderIds.has(currentId)) {
        continue;
      }

      affectedFolderIds.add(currentId);
      scopedFolders.forEach((folder) => {
        if (folder.parentId === currentId) {
          stack.push(folder.id);
        }
      });
    }

    const childFolderCount = Math.max(affectedFolderIds.size - 1, 0);
    const fileCount = scopedAllFiles.filter((file) => file.folderId && affectedFolderIds.has(file.folderId)).length;

    return {
      affectedFolderIds,
      childFolderCount,
      fileCount,
    };
  };

  const handleDeleteFolder = async (folder: FolderItem) => {
    const { affectedFolderIds, childFolderCount, fileCount } = getFolderDeleteImpact(folder.id);
    let message = `确定删除文件夹“${folder.name}”吗？`;

    if (fileCount > 0 && childFolderCount > 0) {
      message += `\n\n该文件夹及其 ${childFolderCount} 个子文件夹下共有 ${fileCount} 个文件，删除后会一并删除且不可恢复。`;
    } else if (fileCount > 0) {
      message += `\n\n该文件夹下共有 ${fileCount} 个文件，删除后会一并删除且不可恢复。`;
    } else if (childFolderCount > 0) {
      message += `\n\n该文件夹下共有 ${childFolderCount} 个子文件夹，删除后不可恢复。`;
    }

    openConfirmDialog({
      title: '删除文件夹',
      message,
      tone: 'danger',
      confirmText: '删除',
      onConfirm: async () => {
        const deleted = await folderService.delete(folder.id);
        if (!deleted.success) {
          openInfoDialog('删除失败', deleted.error || '删除文件夹失败。');
          return;
        }

        if (currentFolderId && affectedFolderIds.has(currentFolderId)) {
          setCurrentFolderId(folder.parentId || null);
        }

        if (selectedFile?.folderId && affectedFolderIds.has(selectedFile.folderId)) {
          setSelectedFile(null);
        }

        if (shareFile?.folderId && affectedFolderIds.has(shareFile.folderId)) {
          setShareFile(null);
        }

        setMovingFiles((prev) => prev.filter((file) => !file.folderId || !affectedFolderIds.has(file.folderId)));
        setSelectedMediaIds((prev) =>
          prev.filter((id) => !scopedAllFiles.some((file) => file.id === id && file.folderId && affectedFolderIds.has(file.folderId))),
        );

        await refreshFiles();
      },
    });
  };

  const showEmpty =
    currentFolders.length === 0 &&
    filteredCurrentFiles.length === 0 &&
    (currentFolderId !== null || !hasHomepageMedia);

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="border-b border-slate-200 px-6 py-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
              <button
                type="button"
                onClick={() => setCurrentFolderId(null)}
                className="rounded px-2 py-1 hover:bg-slate-100"
              >
                全部文件
              </button>
              {breadcrumbs.map((folder) => (
                <div key={folder.id} className="flex items-center gap-2">
                  <span>/</span>
                  <button
                    type="button"
                    onClick={() => setCurrentFolderId(folder.id)}
                    className="rounded px-2 py-1 hover:bg-slate-100"
                  >
                    {folder.name}
                  </button>
                </div>
              ))}
            </div>
            <h2 className="mt-2 text-xl font-semibold text-slate-900">
              {currentFolder?.name || '文件管理首页'}
            </h2>
            <p className="text-sm text-slate-500">
              首页会汇总预览所有目录中的图片和视频，并在卡片下方显示所在路径。
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <label className="relative block min-w-[240px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="搜索文件名或路径"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm outline-none focus:border-blue-500 focus:bg-white"
              />
            </label>

            <input ref={fileInputRef} type="file" multiple onChange={handleUpload} className="hidden" />
            <button
              type="button"
              onClick={openUploadModal}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              <Upload className="h-4 w-4" />
              上传
            </button>
            <button
              type="button"
              onClick={() => setShowNewFolderModal(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <FolderPlus className="h-4 w-4" />
              新建文件夹
            </button>
          </div>
        </div>
      </div>

      {uploading && (
        <div className="border-b border-blue-100 bg-blue-50 px-6 py-3">
          <div className="mb-2 flex items-center justify-between text-sm text-blue-700">
            <span>上传中...</span>
            <span>{uploadProgress}%</span>
          </div>
          <div className="h-2 rounded-full bg-blue-100">
            <div
              className="h-full rounded-full bg-blue-600 transition-all"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-6 py-6">
        {currentFolder && (
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setCurrentFolderId(currentFolder.parentId || null)}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" />
              返回上一层
            </button>
            <button
              type="button"
              onClick={() => void handleDeleteFolder(currentFolder)}
              className="inline-flex items-center gap-2 rounded-lg border border-rose-200 px-3 py-2 text-sm text-rose-600 hover:bg-rose-50"
            >
              <Trash2 className="h-4 w-4" />
              删除当前文件夹
            </button>
          </div>
        )}

        {currentFolders.length > 0 && (
          <section className="mb-8">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-500">
              <FolderOpen className="h-4 w-4" />
              文件夹 ({currentFolders.length})
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {currentFolders.map((folder) => (
                <FolderCard
                  key={folder.id}
                  folder={folder}
                  pathLabel={buildPathLabel(folder.id, folderMap)}
                  onOpen={() => setCurrentFolderId(folder.id)}
                  onDelete={() => void handleDeleteFolder(folder)}
                />
              ))}
            </div>
          </section>
        )}

        {selectionMode && (
          <div className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3">
            <div className="text-sm font-medium text-blue-800">
              {selectedMediaFiles.length > 0
                ? `已选中 ${selectedMediaFiles.length} 个图片/视频文件`
                : '已进入选择模式，点击卡片可勾选'}
            </div>
            <button
              type="button"
              onClick={() => openMoveModal(selectedMediaFiles)}
              disabled={selectedMediaFiles.length === 0}
              className="inline-flex items-center gap-2 rounded-lg border border-blue-300 bg-white px-3 py-2 text-sm text-blue-700 hover:bg-blue-50"
            >
              <MoveRight className="h-4 w-4" />
              批量移动
            </button>
            <button
              type="button"
              onClick={() => void handleBatchDelete()}
              disabled={selectedMediaFiles.length === 0}
              className="inline-flex items-center gap-2 rounded-lg border border-rose-300 bg-white px-3 py-2 text-sm text-rose-600 hover:bg-rose-50"
            >
              <Trash2 className="h-4 w-4" />
              批量删除
            </button>
            <button
              type="button"
              onClick={clearMediaSelection}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              退出选择
            </button>
          </div>
        )}

        <MediaGridSection
          title={`当前目录图片 (${groupedCurrentFiles.image.length})`}
          icon={<Image className="h-4 w-4" />}
          files={groupedCurrentFiles.image}
          getPath={renderPath}
          selectionMode={selectionMode}
          selectedIds={selectedMediaIds}
          onLongPressSelect={handleLongPressSelect}
          onToggleSelect={toggleMediaSelection}
          onOpen={openPreview}
          onToggleStar={handleToggleStar}
          onShare={setShareFile}
          onDelete={handleDeleteFile}
          onMove={openMoveModal}
        />

        <MediaGridSection
          title={`当前目录视频 (${groupedCurrentFiles.video.length})`}
          icon={<Video className="h-4 w-4" />}
          files={groupedCurrentFiles.video}
          getPath={renderPath}
          selectionMode={selectionMode}
          selectedIds={selectedMediaIds}
          onLongPressSelect={handleLongPressSelect}
          onToggleSelect={toggleMediaSelection}
          onOpen={openPreview}
          onToggleStar={handleToggleStar}
          onShare={setShareFile}
          onDelete={handleDeleteFile}
          onMove={openMoveModal}
        />

        <FileRowSection
          title={`当前目录 PDF (${groupedCurrentFiles.pdf.length})`}
          icon={<FileText className="h-4 w-4" />}
          files={groupedCurrentFiles.pdf}
          getPath={renderPath}
          onOpen={openPreview}
          onDownload={(file) => storageService.downloadFile(file.url, file.name)}
          onToggleStar={handleToggleStar}
          onShare={setShareFile}
          onDelete={handleDeleteFile}
        />

        <FileRowSection
          title={`当前目录其他文件 (${groupedCurrentFiles.other.length})`}
          icon={<File className="h-4 w-4" />}
          files={groupedCurrentFiles.other}
          getPath={renderPath}
          onOpen={openPreview}
          onDownload={(file) => storageService.downloadFile(file.url, file.name)}
          onToggleStar={handleToggleStar}
          onShare={setShareFile}
          onDelete={handleDeleteFile}
        />

        {currentFolderId === null && (
          <section className="mt-10 border-t border-slate-200 pt-8">
            <div className="mb-5">
              <h3 className="text-lg font-semibold text-slate-900">首页预览</h3>
              <p className="mt-1 text-sm text-slate-500">
                这里会汇总所有文件夹下的图片和视频，并显示它们的所在路径。
              </p>
            </div>

            <MediaGridSection
              title={`全部图片预览 (${homepagePreview.images.length})`}
              icon={<Image className="h-4 w-4" />}
              files={homepagePreview.images}
              getPath={renderPath}
              selectionMode={selectionMode}
              selectedIds={selectedMediaIds}
              onLongPressSelect={handleLongPressSelect}
              onToggleSelect={toggleMediaSelection}
              onOpen={openPreview}
              onToggleStar={handleToggleStar}
              onShare={setShareFile}
              onDelete={handleDeleteFile}
              onMove={openMoveModal}
            />

            <MediaGridSection
              title={`全部视频预览 (${homepagePreview.videos.length})`}
              icon={<Video className="h-4 w-4" />}
              files={homepagePreview.videos}
              getPath={renderPath}
              selectionMode={selectionMode}
              selectedIds={selectedMediaIds}
              onLongPressSelect={handleLongPressSelect}
              onToggleSelect={toggleMediaSelection}
              onOpen={openPreview}
              onToggleStar={handleToggleStar}
              onShare={setShareFile}
              onDelete={handleDeleteFile}
              onMove={openMoveModal}
            />
          </section>
        )}

        {showEmpty && (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-6 py-16 text-center">
            <div className="text-lg font-semibold text-slate-900">当前目录暂无内容</div>
            <p className="mt-2 text-sm text-slate-500">
              上传文件或新建文件夹后，数据会持久化保存在本地数据库和 data 目录。
            </p>
          </div>
        )}

        {selectedFile && (
          <PreviewModal
            file={selectedFile}
            pathLabel={renderPath(selectedFile)}
            onClose={() => setSelectedFile(null)}
          />
        )}
      </div>

      {showUploadModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowUploadModal(false)}
        >
          <div
            className="w-full max-w-md rounded-3xl bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b border-slate-200 px-6 py-4 text-lg font-semibold text-slate-900">
              选择上传目录
            </div>
            <div className="space-y-4 px-6 py-6">
              <p className="text-sm text-slate-600">
                根路径下不允许直接上传，请先选择一个文件夹。
              </p>
              <select
                value={uploadTargetFolderId}
                onChange={(event) => setUploadTargetFolderId(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-blue-500"
              >
                <option value="">请选择文件夹</option>
                {folderOptions.map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {folder.path}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-200 px-6 py-4">
              <button
                type="button"
                onClick={() => setShowUploadModal(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={confirmUploadTarget}
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                确认
              </button>
            </div>
          </div>
        </div>
      )}

      {showNewFolderModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowNewFolderModal(false)}
        >
          <div
            className="w-full max-w-md rounded-3xl bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b border-slate-200 px-6 py-4 text-lg font-semibold text-slate-900">
              新建文件夹
            </div>
            <div className="px-6 py-6">
              <input
                type="text"
                value={newFolderName}
                onChange={(event) => setNewFolderName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    void handleCreateFolder();
                  }
                }}
                placeholder="文件夹名称"
                autoFocus
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500"
              />
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-200 px-6 py-4">
              <button
                type="button"
                onClick={() => setShowNewFolderModal(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void handleCreateFolder()}
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}

      {actionDialog && (
        <ActionDialog
          title={actionDialog.title}
          message={actionDialog.message}
          tone={actionDialog.tone}
          confirmText={actionDialog.confirmText}
          cancelText={actionDialog.cancelText}
          showCancel={actionDialog.showCancel}
          onClose={() => setActionDialog(null)}
          onConfirm={async () => {
            const handler = actionDialog.onConfirm;
            setActionDialog(null);
            await handler?.();
          }}
        />
      )}

      {shareFile && (
        <ResourceShareModal
          isOpen
          onClose={() => setShareFile(null)}
          resourceType="file"
          resourceId={shareFile.id}
          resourceName={shareFile.name}
          initialTeamId={shareFile.teamId ?? null}
        />
      )}

      {movingFiles.length > 0 && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setMovingFiles([])}
        >
          <div
            className="w-full max-w-lg rounded-3xl bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b border-slate-200 px-6 py-4">
              <div className="text-lg font-semibold text-slate-900">
                {movingFiles.length > 1 ? '批量移动' : '移动'}
              </div>
              <div className="mt-1 text-sm text-slate-500">
                {movingFiles.length > 1
                  ? `已选择 ${movingFiles.length} 个文件`
                  : movingFiles[0]?.name || ''}
              </div>
            </div>
            <div className="space-y-4 px-6 py-6">
              <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
                {movingFiles.length === 1 ? (
                  <div>当前路径：{renderPath(movingFiles[0])}</div>
                ) : (
                  <div>
                    将把选中的图片/视频移动到新路径。这里只更新系统中的目录索引，不会移动磁盘中的原始文件。
                  </div>
                )}
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">目标路径</label>
                <select
                  value={targetFolderId}
                  onChange={(event) => setTargetFolderId(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-blue-500"
                >
                  <option value="">全部文件（根目录）</option>
                  {folderOptions.map((folder) => (
                    <option key={folder.id} value={folder.id}>
                      {folder.path}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-200 px-6 py-4">
              <button
                type="button"
                onClick={() => setMovingFiles([])}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void handleMoveFiles()}
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                确认移动
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface FolderCardProps {
  folder: FolderItem;
  pathLabel: string;
  onOpen: () => void;
  onDelete: () => void;
}

function FolderCard({ folder, pathLabel, onOpen, onDelete }: FolderCardProps) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 transition hover:border-blue-300 hover:bg-white">
      <button type="button" onClick={onOpen} className="block w-full p-5 text-left">
        <div className="mb-4 inline-flex rounded-2xl bg-blue-100 p-3 text-blue-700">
          <FolderOpen className="h-6 w-6" />
        </div>
        <div className="pr-10 text-base font-medium text-slate-900">{folder.name}</div>
        <div className="mt-1 text-sm text-slate-500">路径：{pathLabel}</div>
      </button>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onDelete();
        }}
        className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-xl border border-rose-200 bg-white text-rose-500 shadow-sm transition sm:opacity-0 sm:group-hover:opacity-100 hover:bg-rose-50"
        aria-label={`删除文件夹 ${folder.name}`}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

interface ActionDialogProps {
  title: string;
  message: string;
  tone?: 'default' | 'danger';
  confirmText?: string;
  cancelText?: string;
  showCancel?: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
}

function ActionDialog({
  title,
  message,
  tone = 'default',
  confirmText = '确认',
  cancelText = '取消',
  showCancel = true,
  onClose,
  onConfirm,
}: ActionDialogProps) {
  const messageLines = message
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/45 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-3xl bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-slate-200 px-6 py-5">
          <div className="text-lg font-semibold text-slate-900">{title}</div>
        </div>
        <div className="space-y-3 px-6 py-6">
          {messageLines.map((line, index) => (
            <p key={`${title}-${index}`} className="text-sm leading-6 text-slate-600">
              {line}
            </p>
          ))}
        </div>
        <div className="flex justify-end gap-3 border-t border-slate-200 px-6 py-4">
          {showCancel && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              {cancelText}
            </button>
          )}
          <button
            type="button"
            onClick={() => void onConfirm()}
            className={`rounded-xl px-4 py-2 text-sm font-medium text-white ${
              tone === 'danger' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

interface MediaGridSectionProps {
  title: string;
  icon: ReactNode;
  files: FileItem[];
  getPath: (file: FileItem) => string;
  selectionMode: boolean;
  selectedIds: string[];
  onLongPressSelect: (fileId: string) => void;
  onToggleSelect: (fileId: string) => void;
  onOpen: (file: FileItem) => void;
  onToggleStar: (file: FileItem) => void;
  onShare: (file: FileItem) => void;
  onDelete: (file: FileItem) => void;
  onMove?: (file: FileItem) => void;
}

function MediaGridSection({
  title,
  icon,
  files,
  getPath,
  selectionMode,
  selectedIds,
  onLongPressSelect,
  onToggleSelect,
  onOpen,
  onToggleStar,
  onShare,
  onDelete,
  onMove,
}: MediaGridSectionProps) {
  if (files.length === 0) return null;

  return (
    <section className="mb-8">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-500">
        {icon}
        {title}
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {files.map((file) => (
          <MediaCard
            key={file.id}
            file={file}
            pathLabel={getPath(file)}
            selectionMode={selectionMode}
            selected={selectedIds.includes(file.id)}
            onLongPressSelect={() => onLongPressSelect(file.id)}
            onToggleSelect={() => onToggleSelect(file.id)}
            onOpen={() => onOpen(file)}
            onToggleStar={() => onToggleStar(file)}
            onShare={() => onShare(file)}
            onDelete={() => onDelete(file)}
            onMove={onMove ? () => onMove(file) : undefined}
          />
        ))}
      </div>
    </section>
  );
}

interface VideoCardPreviewProps {
  file: FileItem;
}

function VideoCardPreview({ file }: VideoCardPreviewProps) {
  const [thumbnail, setThumbnail] = useState<string | null>(() => file.thumbnail || videoThumbnailCache.get(file.url) || null);

  useEffect(() => {
    if (file.type !== 'video') {
      return;
    }

    if (file.thumbnail) {
      videoThumbnailCache.set(file.url, file.thumbnail);
      setThumbnail(file.thumbnail);
      return;
    }

    const cachedThumbnail = videoThumbnailCache.get(file.url);
    if (cachedThumbnail) {
      setThumbnail(cachedThumbnail);
      return;
    }

    let disposed = false;
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    const cleanup = () => {
      video.removeEventListener('loadeddata', handleLoadedData);
      video.removeEventListener('seeked', captureFrame);
      video.removeEventListener('error', cleanup);
      video.pause();
      video.removeAttribute('src');
      video.load();
    };

    const captureFrame = () => {
      if (disposed || !video.videoWidth || !video.videoHeight) {
        return;
      }

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext('2d');
      if (!context) {
        return;
      }

      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const nextThumbnail = canvas.toDataURL('image/jpeg', 0.82);
      videoThumbnailCache.set(file.url, nextThumbnail);
      setThumbnail(nextThumbnail);
      cleanup();
    };

    const handleLoadedData = () => {
      const targetTime = Number.isFinite(video.duration) && video.duration > 0 ? Math.min(video.duration / 3, 1) : 0;
      if (targetTime <= 0) {
        captureFrame();
        return;
      }

      try {
        video.currentTime = targetTime;
      } catch {
        captureFrame();
      }
    };

    video.addEventListener('loadeddata', handleLoadedData);
    video.addEventListener('seeked', captureFrame);
    video.addEventListener('error', cleanup);
    video.src = file.url;
    video.load();

    return () => {
      disposed = true;
      cleanup();
    };
  }, [file.thumbnail, file.type, file.url]);

  if (thumbnail) {
    return <img src={thumbnail} alt={file.name} className="h-full w-full object-cover" />;
  }

  return (
    <div className="relative h-full w-full bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700">
      <video src={file.url} className="h-full w-full object-cover" muted playsInline preload="metadata" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />
    </div>
  );
}

interface FileRowSectionProps {
  title: string;
  icon: ReactNode;
  files: FileItem[];
  getPath: (file: FileItem) => string;
  onOpen: (file: FileItem) => void;
  onDownload: (file: FileItem) => void;
  onToggleStar: (file: FileItem) => void;
  onShare: (file: FileItem) => void;
  onDelete: (file: FileItem) => void;
}

function FileRowSection({ title, icon, files, getPath, onOpen, onDownload, onToggleStar, onShare, onDelete }: FileRowSectionProps) {
  if (files.length === 0) return null;

  return (
    <section className="mb-8">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-500">
        {icon}
        {title}
      </div>
      <div className="space-y-3">
        {files.map((file) => (
          <FileRow
            key={file.id}
            file={file}
            pathLabel={getPath(file)}
            onOpen={() => onOpen(file)}
            onDownload={() => onDownload(file)}
            onToggleStar={() => onToggleStar(file)}
            onShare={() => onShare(file)}
            onDelete={() => onDelete(file)}
          />
        ))}
      </div>
    </section>
  );
}

interface MediaCardProps {
  file: FileItem;
  pathLabel: string;
  selectionMode: boolean;
  selected: boolean;
  onLongPressSelect: () => void;
  onToggleSelect: () => void;
  onOpen: () => void;
  onToggleStar: () => void;
  onShare: () => void;
  onDelete: () => void;
  onMove?: () => void;
}

function MediaCard({
  file,
  pathLabel,
  selectionMode,
  selected,
  onLongPressSelect,
  onToggleSelect,
  onOpen,
  onToggleStar,
  onShare,
  onDelete,
  onMove,
}: MediaCardProps) {
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef(false);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };

    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showMenu]);

  useEffect(
    () => () => {
      if (longPressTimerRef.current !== null) {
        window.clearTimeout(longPressTimerRef.current);
      }
    },
    [],
  );

  const clearLongPress = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || selectionMode) return;
    longPressTriggeredRef.current = false;
    clearLongPress();
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTriggeredRef.current = true;
      onLongPressSelect();
    }, 420);
  };

  const handlePreviewClick = () => {
    if (longPressTriggeredRef.current) {
      longPressTriggeredRef.current = false;
      return;
    }

    if (selectionMode) {
      onToggleSelect();
      return;
    }

    onOpen();
  };

  const runMenuAction = (action: () => void) => {
    setShowMenu(false);
    action();
  };

  return (
    <div
      className={`group overflow-hidden rounded-2xl border bg-white shadow-sm ${
        selected ? 'border-blue-400 ring-2 ring-blue-100' : 'border-slate-200'
      }`}
    >
      <div className="relative">
        {selectionMode && (
          <label
            className="absolute left-2 top-2 z-20 inline-flex items-center gap-1 rounded-lg bg-white/90 px-2 py-1 text-xs text-slate-700 shadow-sm"
            onClick={(event) => event.stopPropagation()}
          >
            <input
              type="checkbox"
              checked={selected}
              onChange={onToggleSelect}
              className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            选择
          </label>
        )}

        {!selectionMode && file.isStarred && (
          <div className="absolute left-2 top-2 z-20 inline-flex items-center gap-1 rounded-lg bg-amber-50/95 px-2 py-1 text-xs text-amber-700 shadow-sm">
            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
            已收藏
          </div>
        )}

        <div ref={menuRef} className="absolute right-2 top-2 z-20">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setShowMenu((prev) => !prev);
            }}
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-white/90 text-slate-600 shadow-sm hover:bg-white"
            aria-label="更多操作"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
          {showMenu && (
            <div className="absolute right-0 mt-1 min-w-[110px] rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
              <button
                type="button"
                onClick={() => runMenuAction(onToggleStar)}
                className="block w-full rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
              >
                {file.isStarred ? '取消收藏' : '收藏'}
              </button>
              <button
                type="button"
                onClick={() => runMenuAction(onShare)}
                className="block w-full rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
              >
                分享
              </button>
              {onMove && (
                <button
                  type="button"
                  onClick={() => runMenuAction(onMove)}
                  className="block w-full rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
                >
                  移动
                </button>
              )}
              <button
                type="button"
                onClick={() => runMenuAction(onDelete)}
                className="block w-full rounded-lg px-3 py-2 text-left text-sm text-rose-600 hover:bg-rose-50"
              >
                删除
              </button>
            </div>
          )}
        </div>

        <button
          type="button"
          onPointerDown={handlePointerDown}
          onPointerUp={clearLongPress}
          onPointerLeave={() => {
            clearLongPress();
            longPressTriggeredRef.current = false;
          }}
          onPointerCancel={() => {
            clearLongPress();
            longPressTriggeredRef.current = false;
          }}
          onClick={handlePreviewClick}
          className="block w-full text-left"
        >
          <div className="relative aspect-square overflow-hidden bg-slate-100">
            {file.thumbnail || file.type === 'image' ? (
              <img src={file.thumbnail || file.url} alt={file.name} className="h-full w-full object-cover" />
            ) : file.type === 'video' ? (
              <VideoCardPreview file={file} />
            ) : (
              <div className="flex h-full items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200">
                <div className="rounded-2xl bg-white p-4 shadow-sm">{getFileIcon(file.type)}</div>
              </div>
            )}
            {file.type === 'video' && (
              <div className="pointer-events-none absolute bottom-3 left-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white shadow-sm">
                <Video className="h-4 w-4" />
              </div>
            )}
            {!selectionMode && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all group-hover:bg-black/20 group-hover:opacity-100">
                <span className="inline-flex items-center rounded-full bg-black/60 p-2 text-white">
                  <Eye className="h-4 w-4" />
                </span>
              </div>
            )}
          </div>
        </button>
      </div>
      <div className="space-y-3 p-3">
        <div>
          <div className="truncate text-sm font-medium text-slate-900">{file.name}</div>
          <div className="mt-1 text-xs text-slate-500">{formatFileSize(file.size)}</div>
          <div className="mt-1 text-xs text-slate-400">路径：{pathLabel}</div>
        </div>
      </div>
    </div>
  );
}

interface FileRowProps {
  file: FileItem;
  pathLabel: string;
  onOpen: () => void;
  onDownload: () => void;
  onToggleStar: () => void;
  onShare: () => void;
  onDelete: () => void;
}

function FileRow({ file, pathLabel, onOpen, onDownload, onToggleStar, onShare, onDelete }: FileRowProps) {
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-slate-100 p-3">{getFileIcon(file.type)}</div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <div className="truncate font-medium text-slate-900">{file.name}</div>
              {file.isStarred && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700">
                  <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                  已收藏
                </span>
              )}
            </div>
            <div className="mt-1 text-sm text-slate-500">
              {formatFileSize(file.size)} · {formatTime(file.uploadedAt)}
            </div>
            <div className="mt-1 text-xs text-slate-400">路径：{pathLabel}</div>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onOpen}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
        >
          <Eye className="h-4 w-4" />预览
        </button>
        <button
          type="button"
          onClick={onDownload}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
        >
          <Download className="h-4 w-4" />下载
        </button>
        <button
          type="button"
          onClick={onToggleStar}
          className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
            file.isStarred
              ? 'border-amber-200 text-amber-700 hover:bg-amber-50'
              : 'border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Star className={`h-4 w-4 ${file.isStarred ? 'fill-amber-400 text-amber-400' : ''}`} />
          {file.isStarred ? '取消收藏' : '收藏'}
        </button>
        <button
          type="button"
          onClick={onShare}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
        >
          <Share2 className="h-4 w-4" />分享
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="inline-flex items-center gap-2 rounded-lg border border-rose-200 px-3 py-2 text-sm text-rose-600 hover:bg-rose-50"
        >
          <Trash2 className="h-4 w-4" />删除
        </button>
      </div>
    </div>
  );
}

interface PreviewModalProps {
  file: FileItem;
  pathLabel: string;
  onClose: () => void;
}

function PreviewModal({ file, pathLabel, onClose }: PreviewModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" onClick={onClose}>
      <div
        className="w-full max-w-5xl overflow-hidden rounded-3xl bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div className="min-w-0">
            <div className="truncate text-lg font-semibold text-slate-900">{file.name}</div>
            <div className="mt-1 text-sm text-slate-500">
              {formatFileSize(file.size)} · {formatTime(file.uploadedAt)}
            </div>
            <div className="mt-1 text-xs text-slate-400">路径：{pathLabel}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="max-h-[80vh] overflow-auto bg-slate-950 p-6">
          {file.type === 'image' && (
            <img
              src={file.url}
              alt={file.name}
              className="mx-auto max-h-[70vh] max-w-full rounded-2xl object-contain"
            />
          )}
          {file.type === 'video' && (
            <video src={file.url} controls className="mx-auto max-h-[70vh] max-w-full rounded-2xl" />
          )}
          {file.type === 'audio' && (
            <div className="flex min-h-[240px] items-center justify-center">
              <audio src={file.url} controls className="w-full max-w-2xl" />
            </div>
          )}
          {file.type === 'pdf' && (
            <iframe src={file.url} className="h-[70vh] w-full rounded-2xl bg-white" title={file.name} />
          )}
          {!['image', 'video', 'audio', 'pdf'].includes(file.type) && (
            <div className="rounded-3xl bg-white px-8 py-16 text-center">
              <div className="text-lg font-semibold text-slate-900">该文件类型暂不支持在线预览</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
