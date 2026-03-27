import { useEffect, useMemo, useState } from 'react';
import { Copy, ExternalLink, Eye, File, FileText, Globe, Image, RefreshCcw, Trash2, Video } from 'lucide-react';
import { Link } from 'react-router-dom';
import { publicResourceService, shareService } from '../lib/databaseApi';
import type { PublicDocumentSummary, PublicFileSummary } from '../lib/types';

interface PublicLibraryManagerPanelProps {
  currentUserId?: string | null;
  onEditDocument?: (document: PublicDocumentSummary) => void;
  onOpenFile?: (file: PublicFileSummary) => void;
}

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
};

function dedupeById<T extends { id: string }>(items: T[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

export default function PublicLibraryManagerPanel({
  currentUserId = null,
  onEditDocument,
  onOpenFile,
}: PublicLibraryManagerPanelProps) {
  const [documents, setDocuments] = useState<PublicDocumentSummary[]>([]);
  const [files, setFiles] = useState<PublicFileSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyKey, setBusyKey] = useState('');
  const [copiedKey, setCopiedKey] = useState('');

  const visibleDocuments = useMemo(() => dedupeById(documents), [documents]);
  const visibleFiles = useMemo(() => dedupeById(files), [files]);

  const load = async () => {
    setIsLoading(true);
    setError('');

    try {
      const [docRows, fileRows] = await Promise.all([
        publicResourceService.getDocuments(),
        publicResourceService.getFiles(),
      ]);

      setDocuments(docRows);
      setFiles(fileRows);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '公开资源加载失败');
      setDocuments([]);
      setFiles([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const copyLink = async (token: string, key: string) => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/share/${token}`);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey(''), 1800);
    } catch {
      setCopiedKey('');
    }
  };

  const cancelPublic = async (resourceType: 'document' | 'file', resourceId: string) => {
    const actionKey = `${resourceType}:${resourceId}`;
    setBusyKey(actionKey);
    setError('');

    try {
      const links = resourceType === 'document'
        ? await shareService.listByDocument(resourceId)
        : await shareService.listByFile(resourceId);

      const publicLinks = links.filter((link) => link.visibility === 'public');
      const results = await Promise.all(publicLinks.map((link) => shareService.deleteShareLink(link.id)));

      if (results.some((item) => !item)) {
        setError('取消公开失败，请稍后重试');
        return;
      }

      if (resourceType === 'document') {
        setDocuments((prev) => prev.filter((item) => item.id !== resourceId));
      } else {
        setFiles((prev) => prev.filter((item) => item.id !== resourceId));
      }
    } finally {
      setBusyKey('');
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-slate-50">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-6">
        <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-blue-50 p-3 text-blue-600">
                <Globe className="h-6 w-6" />
              </div>
              <div>
                <div className="text-2xl font-semibold text-slate-900">公开资源</div>
                <div className="mt-1 text-sm text-slate-500">
                  这里展示所有已公开的笔记和文件。资源所有者可以继续编辑、复制链接或取消公开。
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void load()}
              disabled={isLoading}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              <RefreshCcw className="h-4 w-4" />
              刷新列表
            </button>
          </div>

          {error && (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          )}
        </section>

        {isLoading ? (
          <div className="rounded-[28px] border border-slate-200 bg-white px-6 py-20 text-center text-sm text-slate-500 shadow-sm">
            正在加载公开资源...
          </div>
        ) : (
          <div className="grid gap-6 xl:grid-cols-2">
            <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center gap-2 text-sm font-medium text-slate-700">
                <FileText className="h-4 w-4 text-blue-600" />
                公开笔记
              </div>

              {visibleDocuments.length === 0 ? (
                <div className="rounded-2xl bg-slate-50 px-4 py-12 text-center text-sm text-slate-500">
                  暂无公开笔记
                </div>
              ) : (
                <div className="space-y-3">
                  {visibleDocuments.map((document) => {
                    const shareUrl = `${window.location.origin}/share/${document.share_token}`;
                    const isOwner = !!currentUserId && document.user_id === currentUserId;
                    const actionKey = `document:${document.id}`;

                    return (
                      <div
                        key={`${document.id}-${document.share_token}`}
                        className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate font-medium text-slate-900">{document.title}</div>
                            <div className="mt-2 text-xs text-slate-500">
                              更新时间：{new Date(document.updated_at).toLocaleString('zh-CN')}
                            </div>
                            {isOwner && (
                              <div className="mt-2 text-xs font-medium text-blue-600">你是该资源的所有者</div>
                            )}
                          </div>
                          <Link
                            to={`/share/${document.share_token}`}
                            className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                          >
                            <Eye className="h-4 w-4" />
                            查看
                          </Link>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => void copyLink(document.share_token, actionKey)}
                            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                          >
                            <Copy className="h-4 w-4" />
                            {copiedKey === actionKey ? '已复制' : '复制链接'}
                          </button>
                          <a
                            href={shareUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                          >
                            <ExternalLink className="h-4 w-4" />
                            新窗口打开
                          </a>
                          {isOwner && onEditDocument && (
                            <button
                              type="button"
                              onClick={() => onEditDocument(document)}
                              className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700 hover:bg-blue-100"
                            >
                              <FileText className="h-4 w-4" />
                              编辑笔记
                            </button>
                          )}
                          {isOwner && (
                            <button
                              type="button"
                              onClick={() => void cancelPublic('document', document.id)}
                              disabled={busyKey === actionKey}
                              className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600 hover:bg-rose-100 disabled:opacity-60"
                            >
                              <Trash2 className="h-4 w-4" />
                              {busyKey === actionKey ? '处理中...' : '取消公开'}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center gap-2 text-sm font-medium text-slate-700">
                <Image className="h-4 w-4 text-emerald-600" />
                公开文件
              </div>

              {visibleFiles.length === 0 ? (
                <div className="rounded-2xl bg-slate-50 px-4 py-12 text-center text-sm text-slate-500">
                  暂无公开文件
                </div>
              ) : (
                <div className="space-y-3">
                  {visibleFiles.map((file) => {
                    const shareUrl = `${window.location.origin}/share/${file.share_token}`;
                    const isOwner = !!currentUserId && file.user_id === currentUserId;
                    const actionKey = `file:${file.id}`;

                    return (
                      <div
                        key={`${file.id}-${file.share_token}`}
                        className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start gap-3">
                              <div className="rounded-xl bg-white p-2 text-slate-500">
                                {file.type === 'image' ? (
                                  <Image className="h-4 w-4" />
                                ) : file.type === 'video' ? (
                                  <Video className="h-4 w-4" />
                                ) : file.type === 'pdf' || file.type === 'document' ? (
                                  <FileText className="h-4 w-4" />
                                ) : (
                                  <File className="h-4 w-4" />
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="truncate font-medium text-slate-900">{file.name}</div>
                                <div className="mt-2 text-xs text-slate-500">
                                  {formatFileSize(file.size)} · {new Date(file.updated_at).toLocaleString('zh-CN')}
                                </div>
                                {isOwner && (
                                  <div className="mt-2 text-xs font-medium text-blue-600">你是该资源的所有者</div>
                                )}
                              </div>
                            </div>
                          </div>
                          <Link
                            to={`/share/${file.share_token}`}
                            className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                          >
                            <Eye className="h-4 w-4" />
                            查看
                          </Link>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => void copyLink(file.share_token, actionKey)}
                            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                          >
                            <Copy className="h-4 w-4" />
                            {copiedKey === actionKey ? '已复制' : '复制链接'}
                          </button>
                          <a
                            href={shareUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                          >
                            <ExternalLink className="h-4 w-4" />
                            新窗口打开
                          </a>
                          {isOwner && onOpenFile && (
                            <button
                              type="button"
                              onClick={() => onOpenFile(file)}
                              className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700 hover:bg-blue-100"
                            >
                              <File className="h-4 w-4" />
                              在文件管理中打开
                            </button>
                          )}
                          {isOwner && (
                            <button
                              type="button"
                              onClick={() => void cancelPublic('file', file.id)}
                              disabled={busyKey === actionKey}
                              className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600 hover:bg-rose-100 disabled:opacity-60"
                            >
                              <Trash2 className="h-4 w-4" />
                              {busyKey === actionKey ? '处理中...' : '取消公开'}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
