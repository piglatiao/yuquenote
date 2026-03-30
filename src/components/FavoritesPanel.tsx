import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Download,
  File,
  FileText,
  Image as ImageIcon,
  Loader2,
  Star,
  Video,
  X,
} from 'lucide-react';
import { documentService, type DocTreeItem } from '../lib/documentsApi';
import { fileService, folderService } from '../lib/databaseApi';
import type { Document, FileRecord, Folder } from '../lib/types';

interface FavoritesPanelProps {
  docTree: DocTreeItem[];
  teamId?: string | null;
}

function formatTime(value: string) {
  return new Date(value).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function buildFolderPathLabel(folderId: string | null | undefined, folderMap: Map<string, Folder>) {
  if (!folderId) {
    return '全部文件';
  }

  const names: string[] = [];
  let current = folderMap.get(folderId);

  while (current) {
    names.unshift(current.name);
    current = current.parent_id ? folderMap.get(current.parent_id) : undefined;
  }

  return ['全部文件', ...names].join(' / ');
}

function getFileIcon(type: FileRecord['type']) {
  switch (type) {
    case 'image':
      return <ImageIcon className="h-5 w-5 text-emerald-600" />;
    case 'video':
      return <Video className="h-5 w-5 text-indigo-600" />;
    case 'pdf':
    case 'document':
      return <FileText className="h-5 w-5 text-sky-600" />;
    default:
      return <File className="h-5 w-5 text-slate-500" />;
  }
}

export default function FavoritesPanel({
  docTree,
  teamId = null,
}: FavoritesPanelProps) {
  const [starredDocs, setStarredDocs] = useState<Document[]>([]);
  const [starredFiles, setStarredFiles] = useState<FileRecord[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [previewDocument, setPreviewDocument] = useState<Document | null>(null);
  const [previewFile, setPreviewFile] = useState<FileRecord | null>(null);
  const [previewLoadingLabel, setPreviewLoadingLabel] = useState('');

  useEffect(() => {
    let cancelled = false;

    const loadFavorites = async () => {
      setIsLoading(true);

      const [docsResult, filesResult, foldersResult] = await Promise.allSettled([
        documentService.getStarred(),
        fileService.getAll(teamId),
        folderService.getAll(teamId),
      ]);

      if (cancelled) {
        return;
      }

      const errors: string[] = [];

      if (docsResult.status === 'fulfilled') {
        setStarredDocs(
          docsResult.value.filter(
            (doc) => (doc.team_id ?? null) === teamId && doc.icon !== 'folder' && !doc.is_deleted,
          ),
        );
      } else {
        setStarredDocs([]);
        errors.push(docsResult.reason instanceof Error ? docsResult.reason.message : '收藏笔记加载失败');
      }

      if (filesResult.status === 'fulfilled') {
        setStarredFiles(
          filesResult.value.filter(
            (file) => (file.team_id ?? null) === teamId && file.is_starred,
          ),
        );
      } else {
        setStarredFiles([]);
        errors.push(filesResult.reason instanceof Error ? filesResult.reason.message : '收藏文件加载失败');
      }

      if (foldersResult.status === 'fulfilled') {
        setFolders(foldersResult.value.filter((folder) => (folder.team_id ?? null) === teamId));
      } else {
        setFolders([]);
        errors.push(foldersResult.reason instanceof Error ? foldersResult.reason.message : '文件夹路径加载失败');
      }

      setLoadError(errors[0] ?? '');
      setIsLoading(false);
    };

    void loadFavorites();

    return () => {
      cancelled = true;
    };
  }, [docTree, teamId]);

  const folderMap = useMemo(() => new Map(folders.map((folder) => [folder.id, folder])), [folders]);

  const noteItems = useMemo<Document[]>(
    () =>
      starredDocs
        .slice()
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [starredDocs],
  );

  const imageFiles = useMemo(
    () => starredFiles.filter((file) => file.type === 'image'),
    [starredFiles],
  );

  const videoFiles = useMemo(
    () => starredFiles.filter((file) => file.type === 'video'),
    [starredFiles],
  );

  const otherFiles = useMemo(
    () => starredFiles.filter((file) => !['image', 'video'].includes(file.type)),
    [starredFiles],
  );

  const totalFavorites = noteItems.length + starredFiles.length;

  const openDocumentPreview = async (doc: Document) => {
    setPreviewFile(null);
    setPreviewLoadingLabel(doc.title);

    if (doc.content?.trim()) {
      setPreviewDocument(doc);
      setPreviewLoadingLabel('');
      return;
    }

    const latest = await documentService.getById(doc.id);
    setPreviewDocument(latest || doc);
    setPreviewLoadingLabel('');
  };

  const openFilePreview = (file: FileRecord) => {
    setPreviewDocument(null);
    setPreviewFile(file);
    setPreviewLoadingLabel('');
  };

  const closePreview = () => {
    setPreviewDocument(null);
    setPreviewFile(null);
    setPreviewLoadingLabel('');
  };

  if (isLoading) {
    return (
      <div className="app-page-enter flex h-full items-center justify-center bg-[#faf7f1]">
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-600 shadow-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          正在整理收藏内容...
        </div>
      </div>
    );
  }

  return (
    <div className="app-page-enter h-full overflow-y-auto bg-[#faf7f1]">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <section className="app-card-hover app-section-enter rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-sm font-medium text-amber-700">
                <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                收藏夹
              </div>
              <h2 className="mt-4 text-2xl font-semibold text-slate-900">这里会直接显示你收藏的笔记和文件</h2>
              <p className="mt-2 text-sm text-slate-500">
                当前按笔记、图片、视频和其他文件分类展示，点击卡片即可直接打开对应内容。
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <SummaryStat label="全部收藏" value={totalFavorites} />
              <SummaryStat label="笔记" value={noteItems.length} />
              <SummaryStat label="图片/视频" value={imageFiles.length + videoFiles.length} />
              <SummaryStat label="文件" value={otherFiles.length} />
            </div>
          </div>
        </section>

        {loadError ? (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
            {loadError}
          </div>
        ) : null}

        {totalFavorites === 0 ? (
          <div className="app-section-enter rounded-[28px] border border-dashed border-slate-300 bg-white px-6 py-16 text-center shadow-sm">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
              <Star className="h-6 w-6" />
            </div>
            <div className="mt-4 text-lg font-semibold text-slate-900">还没有收藏内容</div>
            <p className="mt-2 text-sm text-slate-500">
              在笔记或文件里点收藏后，会自动显示到这里。
            </p>
          </div>
        ) : (
          <>
            <SectionHeader
              className="mt-8"
              icon={<FileText className="h-4 w-4" />}
              title={`收藏笔记 (${noteItems.length})`}
            />
            {noteItems.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {noteItems.map((doc) => (
                  <button
                    key={doc.id}
                    type="button"
                    onClick={() => void openDocumentPreview(doc)}
                    className="app-card-hover rounded-[24px] border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-base font-semibold text-slate-900">{doc.title}</div>
                        <div className="mt-2 text-sm text-slate-500">
                          创建于：{formatTime(doc.created_at)}
                        </div>
                      </div>
                      <span className="rounded-full bg-amber-50 p-2 text-amber-500">
                        <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <SectionEmpty>当前空间里还没有收藏笔记。</SectionEmpty>
            )}

            <SectionHeader
              className="mt-10"
              icon={<ImageIcon className="h-4 w-4" />}
              title={`收藏图片 (${imageFiles.length})`}
            />
            {imageFiles.length > 0 ? (
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
                {imageFiles.map((file) => (
                  <FavoriteMediaCard
                    key={file.id}
                    file={file}
                    pathLabel={buildFolderPathLabel(file.folder_id, folderMap)}
                    onOpen={() => openFilePreview(file)}
                  />
                ))}
              </div>
            ) : (
              <SectionEmpty>当前空间里还没有收藏图片。</SectionEmpty>
            )}

            <SectionHeader
              className="mt-10"
              icon={<Video className="h-4 w-4" />}
              title={`收藏视频 (${videoFiles.length})`}
            />
            {videoFiles.length > 0 ? (
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
                {videoFiles.map((file) => (
                  <FavoriteMediaCard
                    key={file.id}
                    file={file}
                    pathLabel={buildFolderPathLabel(file.folder_id, folderMap)}
                    onOpen={() => openFilePreview(file)}
                  />
                ))}
              </div>
            ) : (
              <SectionEmpty>当前空间里还没有收藏视频。</SectionEmpty>
            )}

            <SectionHeader
              className="mt-10"
              icon={<File className="h-4 w-4" />}
              title={`收藏文件 (${otherFiles.length})`}
            />
            {otherFiles.length > 0 ? (
              <div className="space-y-3">
                {otherFiles.map((file) => (
                  <button
                    key={file.id}
                    type="button"
                    onClick={() => openFilePreview(file)}
                    className="app-card-hover flex w-full flex-col gap-4 rounded-[24px] border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-sky-300 hover:shadow-md md:flex-row md:items-center md:justify-between"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="rounded-2xl bg-slate-100 p-3">{getFileIcon(file.type)}</div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-slate-900">{file.name}</div>
                        <div className="mt-1 text-xs text-slate-500">
                          路径：{buildFolderPathLabel(file.folder_id, folderMap)}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span>{Math.max(1, Math.round(file.size / 1024))} KB</span>
                      <span>·</span>
                      <span>{formatTime(file.updated_at)}</span>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <SectionEmpty>当前空间里还没有收藏文件。</SectionEmpty>
            )}
          </>
        )}
      </div>

      {(previewDocument || previewFile || previewLoadingLabel) && (
        <FavoritesPreviewModal
          document={previewDocument}
          file={previewFile}
          loadingLabel={previewLoadingLabel}
          onClose={closePreview}
        />
      )}
    </div>
  );
}

interface SummaryStatProps {
  label: string;
  value: number;
}

function SummaryStat({ label, value }: SummaryStatProps) {
  return (
    <div className="app-card-hover rounded-2xl bg-slate-50 px-4 py-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-semibold text-slate-900">{value}</div>
    </div>
  );
}

interface SectionHeaderProps {
  className?: string;
  icon: ReactNode;
  title: string;
}

function SectionHeader({ className = '', icon, title }: SectionHeaderProps) {
  return (
    <div className={`mb-4 flex items-center gap-2 text-sm font-medium text-slate-600 ${className}`.trim()}>
      {icon}
      {title}
    </div>
  );
}

function SectionEmpty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-5 py-8 text-sm text-slate-500 shadow-sm">
      {children}
    </div>
  );
}

interface FavoriteMediaCardProps {
  file: FileRecord;
  pathLabel: string;
  onOpen: () => void;
}

function FavoriteMediaCard({ file, pathLabel, onOpen }: FavoriteMediaCardProps) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="app-card-hover group overflow-hidden rounded-[24px] border border-slate-200 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md"
    >
      <div className="relative aspect-square overflow-hidden bg-slate-100">
        {file.type === 'image' ? (
          <img src={file.url} alt={file.name} className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]" />
        ) : file.thumbnail_url ? (
          <img src={file.thumbnail_url} alt={file.name} className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]" />
        ) : (
          <div className="flex h-full items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 text-white">
            <Video className="h-10 w-10" />
          </div>
        )}
        <div className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-black/55 px-2.5 py-1 text-xs text-white">
          <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
          已收藏
        </div>
        {file.type === 'video' ? (
          <div className="absolute bottom-3 right-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white">
            <Video className="h-4 w-4" />
          </div>
        ) : null}
      </div>
      <div className="p-3">
        <div className="truncate text-sm font-semibold text-slate-900">{file.name}</div>
        <div className="mt-1 text-xs text-slate-500">路径：{pathLabel}</div>
        <div className="mt-1 text-xs text-slate-400">更新于：{formatTime(file.updated_at)}</div>
      </div>
    </button>
  );
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

interface FavoritesPreviewModalProps {
  document: Document | null;
  file: FileRecord | null;
  loadingLabel: string;
  onClose: () => void;
}

function FavoritesPreviewModal({
  document,
  file,
  loadingLabel,
  onClose,
}: FavoritesPreviewModalProps) {
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="app-modal-enter app-soft-surface flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-[32px] bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
          <div className="min-w-0">
            <div className="truncate text-lg font-semibold text-slate-900">
              {document?.title || file?.name || loadingLabel || '收藏预览'}
            </div>
            <div className="mt-1 text-sm text-slate-500">
              {document
                ? `更新于：${formatTime(document.updated_at)}`
                : file
                  ? `${formatFileSize(file.size)} · 更新于：${formatTime(file.updated_at)}`
                  : '正在加载内容...'}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {file ? (
              <a
                href={file.url}
                download={file.name}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                <Download className="h-4 w-4" />
                下载
              </a>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
              aria-label="关闭预览"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-[#f8fafc] px-6 py-6">
          {loadingLabel ? (
            <div className="flex h-full min-h-[320px] items-center justify-center">
              <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-600 shadow-sm">
                <Loader2 className="h-4 w-4 animate-spin" />
                正在打开「{loadingLabel}」...
              </div>
            </div>
          ) : null}

          {!loadingLabel && document ? (
            <article className="app-card-hover mx-auto max-w-4xl rounded-[28px] border border-slate-200 bg-white px-8 py-7 shadow-sm">
              <div className="border-b border-slate-100 pb-5">
                <div className="text-3xl font-semibold text-slate-900">{document.title}</div>
                <div className="mt-2 text-sm text-slate-500">
                  创建于：{formatTime(document.created_at)} · 更新于：{formatTime(document.updated_at)}
                </div>
              </div>
              <div
                className="share-content prose-yuque mt-6 max-w-none"
                dangerouslySetInnerHTML={{ __html: document.content || '<p>这篇笔记暂时没有内容。</p>' }}
              />
            </article>
          ) : null}

          {!loadingLabel && file ? (
            <div className="app-card-hover overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-6 py-5">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-slate-100 p-3">{getFileIcon(file.type)}</div>
                  <div className="min-w-0">
                    <div className="truncate text-xl font-semibold text-slate-900">{file.name}</div>
                    <div className="mt-1 text-sm text-slate-500">
                      {formatFileSize(file.size)} · 更新于：{formatTime(file.updated_at)}
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-slate-950 px-6 py-6">
                {file.type === 'image' ? (
                  <img src={file.url} alt={file.name} className="mx-auto max-h-[70vh] max-w-full rounded-2xl object-contain" />
                ) : file.type === 'video' ? (
                  <video src={file.url} controls className="mx-auto max-h-[70vh] max-w-full rounded-2xl" />
                ) : file.type === 'audio' ? (
                  <div className="flex min-h-[240px] items-center justify-center">
                    <audio src={file.url} controls className="w-full max-w-2xl" />
                  </div>
                ) : file.type === 'pdf' ? (
                  <iframe src={file.url} className="h-[70vh] w-full rounded-2xl bg-white" title={file.name} />
                ) : (
                  <div className="rounded-3xl bg-white px-8 py-16 text-center">
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100">
                      {getFileIcon(file.type)}
                    </div>
                    <div className="text-lg font-semibold text-slate-900">当前文件类型暂不支持在线预览</div>
                    <div className="mt-2 text-sm text-slate-500">可以直接点击右上角下载，在本地查看原文件。</div>
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
