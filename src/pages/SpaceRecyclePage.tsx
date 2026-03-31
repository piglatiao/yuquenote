import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  File,
  FileText,
  FolderOpen,
  Image,
  Loader2,
  RefreshCw,
  Video,
} from 'lucide-react';
import ShareTransferModal from '../components/ShareTransferModal';
import { teamService } from '../lib/databaseApi';
import { notify } from '../lib/notify';
import type { Document, FileRecord, Folder, TeamRecyclePayload } from '../lib/types';

function formatDateTime(value?: string | null) {
  if (!value) {
    return '--';
  }
  return new Date(value).toLocaleString('zh-CN');
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function getDocumentPath(document: Document, documents: Document[]) {
  const map = new Map(documents.map((item) => [item.id, item]));
  const parts = [document.title];
  let currentParentId = document.parent_id;

  while (currentParentId) {
    const parent = map.get(currentParentId);
    if (!parent) {
      break;
    }
    parts.unshift(parent.title);
    currentParentId = parent.parent_id;
  }

  return parts.join(' / ');
}

function getFilePath(file: FileRecord, folders: Folder[]) {
  const map = new Map(folders.map((folder) => [folder.id, folder]));
  const parts = [file.name];
  let currentFolderId = file.folder_id;

  while (currentFolderId) {
    const folder = map.get(currentFolderId);
    if (!folder) {
      break;
    }
    parts.unshift(folder.name);
    currentFolderId = folder.parent_id;
  }

  return parts.join(' / ');
}

function resolveFileIcon(type: FileRecord['type']) {
  if (type === 'image') return <Image className="h-4 w-4" />;
  if (type === 'video') return <Video className="h-4 w-4" />;
  if (type === 'pdf' || type === 'document') return <FileText className="h-4 w-4" />;
  return <File className="h-4 w-4" />;
}

export default function SpaceRecyclePage() {
  const navigate = useNavigate();
  const { teamId = '' } = useParams();
  const [payload, setPayload] = useState<TeamRecyclePayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [transferTarget, setTransferTarget] = useState<{
    resourceType: 'document' | 'file';
    resourceId: string;
    resourceName: string;
  } | null>(null);
  const [isSavingTransfer, setIsSavingTransfer] = useState(false);

  const load = async () => {
    if (!teamId) {
      setError('缺少空间标识');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError('');
    try {
      const result = await teamService.getRecycle(teamId);
      setPayload(result);
    } catch (loadError) {
      setPayload(null);
      setError(loadError instanceof Error ? loadError.message : '回收站加载失败');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [teamId]);

  const documents = payload?.documents || [];
  const files = payload?.files || [];
  const folders = payload?.folders || [];

  const sortedDocuments = useMemo(
    () =>
      [...documents].sort((left, right) =>
        getDocumentPath(left, documents).localeCompare(getDocumentPath(right, documents), 'zh-CN'),
      ),
    [documents],
  );

  const sortedFiles = useMemo(
    () =>
      [...files].sort((left, right) => getFilePath(left, folders).localeCompare(getFilePath(right, folders), 'zh-CN')),
    [files, folders],
  );

  const handleTransferConfirm = async (targetId: string | null) => {
    if (!transferTarget || !payload) {
      return;
    }

    setIsSavingTransfer(true);
    try {
      if (transferTarget.resourceType === 'document') {
        const result = await teamService.saveRecycleDocument(payload.team.id, transferTarget.resourceId, targetId);
        notify.success('转存成功', result.document?.title || '已保存到我的笔记');
      } else {
        const result = await teamService.saveRecycleFile(payload.team.id, transferTarget.resourceId, targetId);
        notify.success('转存成功', result.file?.name || '已保存到我的文件');
      }

      setTransferTarget(null);
    } catch (saveError) {
      notify.error('转存失败', saveError instanceof Error ? saveError.message : '请稍后重试。');
    } finally {
      setIsSavingTransfer(false);
    }
  };

  return (
    <div className="app-page-enter min-h-screen bg-slate-50">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-8">
        <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <button
                type="button"
                onClick={() => navigate('/')}
                className="inline-flex shrink-0 items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2.5 text-sm text-slate-700 transition hover:bg-slate-50"
              >
                <ArrowLeft className="h-4 w-4" />
                返回首页
              </button>

              <div className="hidden h-10 w-px bg-slate-200 lg:block" />

              <div className="min-w-0">
                <div className="text-2xl font-semibold text-slate-900">
                  {payload?.team.name || '空间回收站'}
                </div>
                <div className="mt-1 text-sm text-slate-500">
                  已解散空间的内容仅保留查看与转存，不恢复原空间。
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void load()}
              disabled={isLoading}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2.5 text-sm text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              刷新
            </button>
          </div>

          {payload?.retention_until ? (
            <div className="mt-5 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-700">
              保留截止时间：{formatDateTime(payload.retention_until)}
            </div>
          ) : null}

          {error ? (
            <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
              {error}
            </div>
          ) : null}
        </section>

        <main className="mt-6 flex-1">
          {isLoading ? (
            <div className="rounded-[32px] border border-slate-200 bg-white px-6 py-20 text-center shadow-sm">
              <div className="inline-flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                正在加载回收内容...
              </div>
            </div>
          ) : payload ? (
            <div className="grid gap-6 xl:grid-cols-2">
              <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
                <div className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900">
                  <FolderOpen className="h-5 w-5 text-blue-500" />
                  笔记与知识库
                </div>

                {sortedDocuments.length === 0 ? (
                  <div className="rounded-2xl bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                    当前没有可转存的笔记内容。
                  </div>
                ) : (
                  <div className="space-y-3">
                    {sortedDocuments.map((document) => (
                      <div key={document.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-slate-900">{document.title}</div>
                            <div className="mt-1 text-xs text-slate-500">{document.icon === 'folder' ? '文件夹' : '笔记'}</div>
                            <div className="mt-2 break-all text-xs text-slate-400">{getDocumentPath(document, documents)}</div>
                            <div className="mt-1 text-xs text-slate-400">更新时间：{formatDateTime(document.updated_at)}</div>
                          </div>

                          <button
                            type="button"
                            onClick={() =>
                              setTransferTarget({
                                resourceType: 'document',
                                resourceId: document.id,
                                resourceName: document.title,
                              })
                            }
                            className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 transition hover:bg-emerald-100"
                          >
                            转存
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
                <div className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900">
                  <FileText className="h-5 w-5 text-emerald-500" />
                  文件
                </div>

                {sortedFiles.length === 0 ? (
                  <div className="rounded-2xl bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                    当前没有可转存的文件。
                  </div>
                ) : (
                  <div className="space-y-3">
                    {sortedFiles.map((file) => (
                      <div key={file.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="rounded-xl bg-white p-2 text-slate-500">{resolveFileIcon(file.type)}</span>
                              <div className="truncate text-sm font-semibold text-slate-900">{file.name}</div>
                            </div>
                            <div className="mt-2 text-xs text-slate-500">{formatFileSize(file.size)}</div>
                            <div className="mt-2 break-all text-xs text-slate-400">{getFilePath(file, folders)}</div>
                            <div className="mt-1 text-xs text-slate-400">更新时间：{formatDateTime(file.updated_at)}</div>
                          </div>

                          <button
                            type="button"
                            onClick={() =>
                              setTransferTarget({
                                resourceType: 'file',
                                resourceId: file.id,
                                resourceName: file.name,
                              })
                            }
                            className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 transition hover:bg-emerald-100"
                          >
                            转存
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          ) : null}
        </main>

        <ShareTransferModal
          isOpen={!!transferTarget}
          resourceType={transferTarget?.resourceType || 'document'}
          resourceName={transferTarget?.resourceName || ''}
          isSubmitting={isSavingTransfer}
          onClose={() => {
            if (isSavingTransfer) {
              return;
            }
            setTransferTarget(null);
          }}
          onConfirm={(targetId) => void handleTransferConfirm(targetId)}
        />
      </div>
    </div>
  );
}
