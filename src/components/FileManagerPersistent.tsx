import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Copy,
  Download,
  Eye,
  File,
  FileArchive,
  FileText,
  FolderOpen,
  FolderPlus,
  Image,
  Music,
  Search,
  Share2,
  Trash2,
  Upload,
  Video,
  X,
} from 'lucide-react';
import { fileService, folderService, shareService, storageService } from '../lib';
import type { FileRecord, Folder } from '../lib';

export interface FileItem {
  id: string;
  name: string;
  type: 'image' | 'video' | 'pdf' | 'document' | 'archive' | 'audio' | 'other';
  size: number;
  url: string;
  thumbnail?: string;
  uploadedAt: Date;
  folderId?: string;
}

interface FolderItem {
  id: string;
  name: string;
  parentId?: string;
  createdAt: Date;
}

interface FileManagerProps {
  onFileSelect?: (file: FileItem) => void;
  initialFolderId?: string;
}

type ShareVisibility = 'private' | 'team' | 'public';

const mapFile = (file: FileRecord): FileItem => ({
  id: file.id,
  name: file.name,
  type: file.type,
  size: file.size,
  url: file.url,
  thumbnail: file.thumbnail_url || undefined,
  uploadedAt: new Date(file.created_at),
  folderId: file.folder_id || undefined,
});

const mapFolder = (folder: Folder): FolderItem => ({
  id: folder.id,
  name: folder.name,
  parentId: folder.parent_id || undefined,
  createdAt: new Date(folder.created_at),
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

const getFileIcon = (type: FileItem['type']) => {
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

function buildBreadcrumbs(folderId: string | null, folders: FolderItem[]) {
  const folderMap = new Map(folders.map((folder) => [folder.id, folder]));
  const breadcrumbs: FolderItem[] = [];
  let current = folderId ? folderMap.get(folderId) : undefined;

  while (current) {
    breadcrumbs.unshift(current);
    current = current.parentId ? folderMap.get(current.parentId) : undefined;
  }

  return breadcrumbs;
}

export default function FileManagerPersistent({ onFileSelect, initialFolderId }: FileManagerProps) {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(initialFolderId ?? null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [shareFile, setShareFile] = useState<FileItem | null>(null);
  const [shareVisibility, setShareVisibility] = useState<ShareVisibility>('private');
  const [shareLink, setShareLink] = useState('');
  const [shareCopied, setShareCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadFiles = async (folderId: string | null = currentFolderId) => {
    const data = await fileService.getByFolder(folderId);
    setFiles(data.map(mapFile));
  };

  const loadFolders = async () => {
    const data = await folderService.getAll();
    setFolders(data.map(mapFolder));
  };

  useEffect(() => {
    setCurrentFolderId(initialFolderId ?? null);
  }, [initialFolderId]);

  useEffect(() => {
    void loadFolders();
  }, []);

  useEffect(() => {
    void loadFiles();
  }, [currentFolderId]);

  const breadcrumbs = useMemo(() => buildBreadcrumbs(currentFolderId, folders), [currentFolderId, folders]);
  const currentFolder = useMemo(
    () => folders.find((folder) => folder.id === currentFolderId) || null,
    [folders, currentFolderId],
  );
  const normalizedQuery = searchQuery.trim().toLowerCase();

  const currentFolders = useMemo(
    () =>
      folders.filter((folder) => {
        const sameParent = (folder.parentId || null) === currentFolderId;
        return sameParent && (!normalizedQuery || folder.name.toLowerCase().includes(normalizedQuery));
      }),
    [folders, currentFolderId, normalizedQuery],
  );

  const filteredFiles = useMemo(
    () => files.filter((file) => !normalizedQuery || file.name.toLowerCase().includes(normalizedQuery)),
    [files, normalizedQuery],
  );

  const groupedFiles = useMemo(
    () => ({
      image: filteredFiles.filter((file) => file.type === 'image'),
      video: filteredFiles.filter((file) => file.type === 'video'),
      pdf: filteredFiles.filter((file) => file.type === 'pdf'),
      other: filteredFiles.filter((file) => !['image', 'video', 'pdf'].includes(file.type)),
    }),
    [filteredFiles],
  );

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const uploadList = event.target.files;
    if (!uploadList?.length) return;

    const errors: string[] = [];
    setUploading(true);
    setUploadProgress(0);

    try {
      for (const [index, file] of Array.from(uploadList).entries()) {
        const validation = storageService.validateFile(file);
        if (!validation.valid) {
          errors.push(`${file.name}: ${validation.error || 'Validation failed.'}`);
          continue;
        }

        const upload = await storageService.uploadFile(file, {
          folderId: currentFolderId || undefined,
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
          folder_id: currentFolderId,
        });

        if (!created) {
          errors.push(`${file.name}: failed to save file record.`);
        }
      }

      await loadFiles();
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }

    if (errors.length > 0) {
      alert(errors.join('\n'));
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    const created = await folderService.create({
      name: newFolderName.trim(),
      parent_id: currentFolderId,
      icon: 'folder',
    });

    if (!created) {
      alert('Failed to create folder.');
      return;
    }

    setNewFolderName('');
    setShowNewFolderModal(false);
    await loadFolders();
  };

  const handleDelete = async (fileId: string) => {
    const deleted = await fileService.delete(fileId);
    if (!deleted) {
      alert('Failed to delete file.');
      return;
    }

    if (selectedFile?.id === fileId) setSelectedFile(null);
    if (shareFile?.id === fileId) setShareFile(null);
    await loadFiles();
  };

  const handleShare = async () => {
    if (!shareFile) return;
    const created = await shareService.createShareLink(undefined, shareFile.id, shareVisibility);
    if (!created) {
      alert('Failed to create share link.');
      return;
    }

    const url = `${window.location.origin}/share/${created.share_token}`;
    setShareLink(url);
    await navigator.clipboard.writeText(url);
    setShareCopied(true);
  };

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="border-b border-slate-200 px-6 py-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
              <button type="button" onClick={() => setCurrentFolderId(null)} className="rounded px-2 py-1 hover:bg-slate-100">全部文件</button>
              {breadcrumbs.map((folder) => (
                <div key={folder.id} className="flex items-center gap-2">
                  <span>/</span>
                  <button type="button" onClick={() => setCurrentFolderId(folder.id)} className="rounded px-2 py-1 hover:bg-slate-100">{folder.name}</button>
                </div>
              ))}
            </div>
            <h2 className="mt-2 text-xl font-semibold text-slate-900">{currentFolder?.name || '全部文件'}</h2>
            <p className="text-sm text-slate-500">文件存储在 data/files/YYYY-MM-DD/type，索引存储在 SQLite。</p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <label className="relative block min-w-[240px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="搜索当前目录"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm outline-none focus:border-blue-500 focus:bg-white"
              />
            </label>
            <input ref={fileInputRef} type="file" multiple onChange={handleUpload} className="hidden" />
            <button type="button" onClick={() => fileInputRef.current?.click()} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700">
              <Upload className="h-4 w-4" />
              上传
            </button>
            <button type="button" onClick={() => setShowNewFolderModal(true)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
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
            <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${uploadProgress}%` }} />
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-6 py-6">
        {currentFolder && (
          <button type="button" onClick={() => setCurrentFolderId(currentFolder.parentId || null)} className="mb-4 inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">
            <ArrowLeft className="h-4 w-4" />
            返回上一级
          </button>
        )}

        {currentFolders.length > 0 && (
          <div className="mb-8">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-500">
              <FolderOpen className="h-4 w-4" />
              文件夹 ({currentFolders.length})
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {currentFolders.map((folder) => (
                <button key={folder.id} type="button" onClick={() => setCurrentFolderId(folder.id)} className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-left hover:border-blue-300 hover:bg-white">
                  <div className="mb-4 inline-flex rounded-2xl bg-blue-100 p-3 text-blue-700">
                    <FolderOpen className="h-6 w-6" />
                  </div>
                  <div className="text-base font-medium text-slate-900">{folder.name}</div>
                  <div className="mt-1 text-sm text-slate-500">创建于 {formatTime(folder.createdAt)}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-500">
          <File className="h-4 w-4" />
          文件
        </div>

        {filteredFiles.length === 0 && currentFolders.length === 0 && (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-6 py-16 text-center">
            <div className="text-lg font-semibold text-slate-900">当前目录暂无文件</div>
            <p className="mt-2 text-sm text-slate-500">点击上方“上传”或“新建文件夹”，刷新后也会保留。</p>
          </div>
        )}

        {groupedFiles.image.length > 0 && (
          <div className="mb-8">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-500">
              <Image className="h-4 w-4" />
              图片 ({groupedFiles.image.length})
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {groupedFiles.image.map((file) => (
                <FileGridCard
                  key={file.id}
                  file={file}
                  onOpen={() => { setSelectedFile(file); onFileSelect?.(file); }}
                  onDownload={() => storageService.downloadFile(file.url, file.name)}
                  onShare={() => { setShareFile(file); setShareLink(''); setShareCopied(false); }}
                  onDelete={() => void handleDelete(file.id)}
                />
              ))}
            </div>
          </div>
        )}

        {groupedFiles.video.length > 0 && (
          <div className="mb-8">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-500">
              <Video className="h-4 w-4" />
              视频 ({groupedFiles.video.length})
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {groupedFiles.video.map((file) => (
                <FileGridCard
                  key={file.id}
                  file={file}
                  onOpen={() => { setSelectedFile(file); onFileSelect?.(file); }}
                  onDownload={() => storageService.downloadFile(file.url, file.name)}
                  onShare={() => { setShareFile(file); setShareLink(''); setShareCopied(false); }}
                  onDelete={() => void handleDelete(file.id)}
                />
              ))}
            </div>
          </div>
        )}

        {groupedFiles.pdf.length > 0 && (
          <div className="mb-8">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-500">
              <FileText className="h-4 w-4" />
              PDF ({groupedFiles.pdf.length})
            </div>
            <div className="space-y-3">
              {groupedFiles.pdf.map((file) => (
                <FileRow
                  key={file.id}
                  file={file}
                  onOpen={() => { setSelectedFile(file); onFileSelect?.(file); }}
                  onDownload={() => storageService.downloadFile(file.url, file.name)}
                  onShare={() => { setShareFile(file); setShareLink(''); setShareCopied(false); }}
                  onDelete={() => void handleDelete(file.id)}
                />
              ))}
            </div>
          </div>
        )}

        {groupedFiles.other.length > 0 && (
          <div>
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-500">
              <File className="h-4 w-4" />
              其它文件 ({groupedFiles.other.length})
            </div>
            <div className="space-y-3">
              {groupedFiles.other.map((file) => (
                <FileRow
                  key={file.id}
                  file={file}
                  onOpen={() => { setSelectedFile(file); onFileSelect?.(file); }}
                  onDownload={() => storageService.downloadFile(file.url, file.name)}
                  onShare={() => { setShareFile(file); setShareLink(''); setShareCopied(false); }}
                  onDelete={() => void handleDelete(file.id)}
                />
              ))}
            </div>
          </div>
        )}

        {false && (
        <div className="space-y-3">
          {filteredFiles.map((file) => (
            <div key={file.id} className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-slate-100 p-3">{getFileIcon(file.type)}</div>
                  <div className="min-w-0">
                    <div className="truncate font-medium text-slate-900">{file.name}</div>
                    <div className="mt-1 text-sm text-slate-500">{formatFileSize(file.size)} · {formatTime(file.uploadedAt)}</div>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => { setSelectedFile(file); onFileSelect?.(file); }} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"><Eye className="h-4 w-4" />Preview</button>
                <button type="button" onClick={() => storageService.downloadFile(file.url, file.name)} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"><Download className="h-4 w-4" />Download</button>
                <button type="button" onClick={() => { setShareFile(file); setShareLink(''); setShareCopied(false); }} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"><Share2 className="h-4 w-4" />Share</button>
                <button type="button" onClick={() => void handleDelete(file.id)} className="inline-flex items-center gap-2 rounded-lg border border-rose-200 px-3 py-2 text-sm text-rose-600 hover:bg-rose-50"><Trash2 className="h-4 w-4" />Delete</button>
              </div>
            </div>
          ))}
        </div>
        )}
      </div>

      {selectedFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" onClick={() => setSelectedFile(null)}>
          <div className="w-full max-w-5xl overflow-hidden rounded-3xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div className="min-w-0">
                <div className="truncate text-lg font-semibold text-slate-900">{selectedFile.name}</div>
                <div className="mt-1 text-sm text-slate-500">{formatFileSize(selectedFile.size)} · {formatTime(selectedFile.uploadedAt)}</div>
              </div>
              <button type="button" onClick={() => setSelectedFile(null)} className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-50">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="max-h-[80vh] overflow-auto bg-slate-950 p-6">
              {selectedFile.type === 'image' && <img src={selectedFile.url} alt={selectedFile.name} className="mx-auto max-h-[70vh] max-w-full rounded-2xl object-contain" />}
              {selectedFile.type === 'video' && <video src={selectedFile.url} controls className="mx-auto max-h-[70vh] max-w-full rounded-2xl" />}
              {selectedFile.type === 'audio' && <div className="flex min-h-[240px] items-center justify-center"><audio src={selectedFile.url} controls className="w-full max-w-2xl" /></div>}
              {selectedFile.type === 'pdf' && <iframe src={selectedFile.url} className="h-[70vh] w-full rounded-2xl bg-white" title={selectedFile.name} />}
              {!['image', 'video', 'audio', 'pdf'].includes(selectedFile.type) && <div className="rounded-3xl bg-white px-8 py-16 text-center"><div className="text-lg font-semibold text-slate-900">该文件类型暂不支持在线预览</div></div>}
            </div>
          </div>
        </div>
      )}

      {showNewFolderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowNewFolderModal(false)}>
          <div className="w-full max-w-md rounded-3xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="border-b border-slate-200 px-6 py-4">
              <div className="text-lg font-semibold text-slate-900">新建文件夹</div>
            </div>
            <div className="px-6 py-6">
              <input type="text" value={newFolderName} onChange={(event) => setNewFolderName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void handleCreateFolder(); }} placeholder="文件夹名称" autoFocus className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500" />
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-200 px-6 py-4">
              <button type="button" onClick={() => setShowNewFolderModal(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">取消</button>
              <button type="button" onClick={() => void handleCreateFolder()} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">创建</button>
            </div>
          </div>
        </div>
      )}

      {shareFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShareFile(null)}>
          <div className="w-full max-w-lg rounded-3xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <div className="text-lg font-semibold text-slate-900">分享文件</div>
                <div className="mt-1 text-sm text-slate-500">{shareFile.name}</div>
              </div>
              <button type="button" onClick={() => setShareFile(null)} className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-6 px-6 py-6">
              <div className="grid grid-cols-3 gap-3">
                {(['private', 'team', 'public'] as const).map((value) => (
                  <button key={value} type="button" onClick={() => setShareVisibility(value)} className={`rounded-2xl border px-4 py-3 text-sm font-medium ${shareVisibility === value ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{value === 'private' ? '私密' : value === 'team' ? '团队' : '公开'}</button>
                ))}
              </div>
              <button type="button" onClick={() => void handleShare()} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-3 text-sm font-medium text-white hover:bg-blue-700">
                <Share2 className="h-4 w-4" />
                生成永久分享链接
              </button>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="mb-2 text-sm font-medium text-slate-700">分享链接</div>
                <div className="flex gap-2">
                  <input type="text" readOnly value={shareLink} placeholder="先生成链接" className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none" />
                  <button
                    type="button"
                    onClick={async () => {
                      if (!shareLink) return;
                      await navigator.clipboard.writeText(shareLink);
                      setShareCopied(true);
                    }}
                    disabled={!shareLink}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-white disabled:opacity-50"
                  >
                    <Copy className="h-4 w-4" />
                    {shareCopied ? '已复制' : '复制'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface FileGridCardProps {
  file: FileItem;
  onOpen: () => void;
  onDownload: () => void;
  onShare: () => void;
  onDelete: () => void;
}

function FileGridCard({ file, onOpen, onDownload, onShare, onDelete }: FileGridCardProps) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <button type="button" onClick={onOpen} className="block w-full text-left">
        <div className="aspect-square overflow-hidden bg-slate-100">
          {file.thumbnail || file.type === 'image' ? (
            <img src={file.thumbnail || file.url} alt={file.name} className="h-full w-full object-cover" />
          ) : file.type === 'video' ? (
            <div className="flex h-full items-center justify-center bg-gradient-to-br from-indigo-100 to-violet-200">
              <Video className="h-12 w-12 text-indigo-500" />
            </div>
          ) : (
            <div className="flex h-full items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200">
              <div className="rounded-2xl bg-white p-4 shadow-sm">{getFileIcon(file.type)}</div>
            </div>
          )}
        </div>
      </button>
      <div className="space-y-3 p-3">
        <div>
          <div className="truncate text-sm font-medium text-slate-900">{file.name}</div>
          <div className="mt-1 text-xs text-slate-500">{formatFileSize(file.size)}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onOpen} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50">预览</button>
          <button type="button" onClick={onDownload} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50">下载</button>
          <button type="button" onClick={onShare} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50">分享</button>
          <button type="button" onClick={onDelete} className="rounded-lg border border-rose-200 px-2.5 py-1.5 text-xs text-rose-600 hover:bg-rose-50">删除</button>
        </div>
      </div>
    </div>
  );
}

interface FileRowProps {
  file: FileItem;
  onOpen: () => void;
  onDownload: () => void;
  onShare: () => void;
  onDelete: () => void;
}

function FileRow({ file, onOpen, onDownload, onShare, onDelete }: FileRowProps) {
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-slate-100 p-3">{getFileIcon(file.type)}</div>
          <div className="min-w-0">
            <div className="truncate font-medium text-slate-900">{file.name}</div>
            <div className="mt-1 text-sm text-slate-500">{formatFileSize(file.size)} · {formatTime(file.uploadedAt)}</div>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onOpen} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"><Eye className="h-4 w-4" />预览</button>
        <button type="button" onClick={onDownload} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"><Download className="h-4 w-4" />下载</button>
        <button type="button" onClick={onShare} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"><Share2 className="h-4 w-4" />分享</button>
        <button type="button" onClick={onDelete} className="inline-flex items-center gap-2 rounded-lg border border-rose-200 px-3 py-2 text-sm text-rose-600 hover:bg-rose-50"><Trash2 className="h-4 w-4" />删除</button>
      </div>
    </div>
  );
}
