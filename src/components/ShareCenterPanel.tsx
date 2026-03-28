import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Copy,
  ExternalLink,
  Eye,
  File,
  FileText,
  Image,
  Link2,
  Lock,
  RefreshCcw,
  Trash2,
  Users,
  Video,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { documentService } from '../lib/documentsApi';
import { fileService, publicResourceService, shareService, teamService } from '../lib/databaseApi';
import type {
  Document,
  FileRecord,
  PublicDocumentSummary,
  PublicFileSummary,
  ShareLink,
  Team,
} from '../lib/types';

interface ShareCenterPanelProps {
  currentUserId?: string | null;
  currentWorkspaceTeamId?: string | null;
  workspaceLabel?: string;
}

function normalizeVisibility(value?: ShareLink['visibility']) {
  if (value === 'team' || value === 'space') return 'space';
  if (value === 'public' || value === 'link') return 'link';
  return 'private';
}

function formatDateTime(value?: string | null) {
  if (!value) return '未知时间';
  return new Date(value).toLocaleString('zh-CN');
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function resolveFileIcon(type: FileRecord['type']) {
  if (type === 'image') return <Image className="h-4 w-4" />;
  if (type === 'video') return <Video className="h-4 w-4" />;
  if (type === 'pdf' || type === 'document') return <FileText className="h-4 w-4" />;
  return <File className="h-4 w-4" />;
}

function buildDocumentRecord(document: Document | null, link: ShareLink, teamMap: Map<string, Team>) {
  if (!document) return null;

  const sharedTeamId = link.team_id ?? null;
  const record: PublicDocumentSummary = {
    ...document,
    share_link_id: link.id,
    share_token: link.share_token,
    share_user_id: link.user_id ?? null,
    share_created_at: link.created_at,
    shared_team_id: sharedTeamId,
    shared_team_name: sharedTeamId ? teamMap.get(sharedTeamId)?.name ?? '未命名空间' : null,
    share_visibility: normalizeVisibility(link.visibility),
    has_password: Boolean(link.has_password),
  };
  return record;
}

function buildFileRecord(file: FileRecord | null, link: ShareLink, teamMap: Map<string, Team>) {
  if (!file) return null;

  const sharedTeamId = link.team_id ?? null;
  const record: PublicFileSummary = {
    ...file,
    share_link_id: link.id,
    share_token: link.share_token,
    share_user_id: link.user_id ?? null,
    share_created_at: link.created_at,
    shared_team_id: sharedTeamId,
    shared_team_name: sharedTeamId ? teamMap.get(sharedTeamId)?.name ?? '未命名空间' : null,
    share_visibility: normalizeVisibility(link.visibility),
    has_password: Boolean(link.has_password),
  };
  return record;
}

export default function ShareCenterPanel({
  currentUserId = null,
  currentWorkspaceTeamId = null,
  workspaceLabel,
}: ShareCenterPanelProps) {
  const [documents, setDocuments] = useState<PublicDocumentSummary[]>([]);
  const [files, setFiles] = useState<PublicFileSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyKey, setBusyKey] = useState('');
  const [copiedKey, setCopiedKey] = useState('');

  const isPersonalMode = !currentWorkspaceTeamId;
  const activeWorkspaceLabel = workspaceLabel || (currentWorkspaceTeamId ? '当前空间' : '个人空间');

  const pageMeta = useMemo(
    () =>
      isPersonalMode
        ? {
            title: '分享记录',
            description: '这里只显示你发起过的分享。取消后，其他人或目标空间将立刻无法继续访问。',
            iconStyle: 'bg-blue-50 text-blue-600',
            icon: <Link2 className="h-6 w-6" />,
            noteTitle: '已分享笔记',
            fileTitle: '已分享文件',
            emptyNote: '你还没有分享过笔记',
            emptyFile: '你还没有分享过文件',
            loadingText: '正在加载分享记录...',
            footnote: '只有分享发起人可以取消分享。',
          }
        : {
            title: '空间分享',
            description: `这里只显示“${activeWorkspaceLabel}”收到的分享资源。跨空间分享只保留查看和取消分享，不再跳回来源空间的原位置。`,
            iconStyle: 'bg-emerald-50 text-emerald-600',
            icon: <Users className="h-6 w-6" />,
            noteTitle: '当前空间收到的笔记分享',
            fileTitle: '当前空间收到的文件分享',
            emptyNote: '当前空间还没有收到笔记分享',
            emptyFile: '当前空间还没有收到文件分享',
            loadingText: '正在加载空间分享...',
            footnote: '只有把资源分享到当前空间的人，才可以在这里取消这条分享。',
          },
    [activeWorkspaceLabel, isPersonalMode],
  );

  const load = useCallback(async () => {
    setIsLoading(true);
    setError('');

    try {
      if (isPersonalMode) {
        const [allLinks, teams] = await Promise.all([shareService.listMine(), teamService.getMyTeams()]);
        const links = allLinks.filter((link) => normalizeVisibility(link.visibility) !== 'private');
        const teamMap = new Map(teams.map((team) => [team.id, team]));
        const documentLinks = links.filter((link) => !!link.document_id);
        const fileLinks = links.filter((link) => !!link.file_id);
        const documentIds = [...new Set(documentLinks.map((link) => link.document_id).filter(Boolean))] as string[];
        const fileIds = [...new Set(fileLinks.map((link) => link.file_id).filter(Boolean))] as string[];

        const [documentRows, fileRows] = await Promise.all([
          Promise.all(documentIds.map((id) => documentService.getById(id))),
          Promise.all(fileIds.map((id) => fileService.getById(id))),
        ]);

        const documentMap = new Map(
          documentRows.filter((item): item is Document => Boolean(item)).map((item) => [item.id, item]),
        );
        const fileMap = new Map(
          fileRows.filter((item): item is FileRecord => Boolean(item)).map((item) => [item.id, item]),
        );

        setDocuments(
          documentLinks
            .map((link) => buildDocumentRecord(documentMap.get(link.document_id || '') || null, link, teamMap))
            .filter((item): item is PublicDocumentSummary => Boolean(item)),
        );
        setFiles(
          fileLinks
            .map((link) => buildFileRecord(fileMap.get(link.file_id || '') || null, link, teamMap))
            .filter((item): item is PublicFileSummary => Boolean(item)),
        );
        return;
      }

      const [documentRows, fileRows] = await Promise.all([
        publicResourceService.getDocuments(currentWorkspaceTeamId),
        publicResourceService.getFiles(currentWorkspaceTeamId),
      ]);

      setDocuments(documentRows);
      setFiles(fileRows);
    } catch (loadError) {
      setDocuments([]);
      setFiles([]);
      setError(loadError instanceof Error ? loadError.message : isPersonalMode ? '分享记录加载失败' : '空间分享加载失败');
    } finally {
      setIsLoading(false);
    }
  }, [currentWorkspaceTeamId, isPersonalMode]);

  useEffect(() => {
    void load();
  }, [load]);

  const copyLink = async (token: string, key: string) => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/share/${token}`);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey(''), 1800);
    } catch {
      setCopiedKey('');
    }
  };

  const cancelShare = async (resourceType: 'document' | 'file', shareLinkId: string) => {
    const actionKey = `${resourceType}:${shareLinkId}`;
    setBusyKey(actionKey);
    setError('');

    try {
      const deleted = await shareService.deleteShareLink(shareLinkId);
      if (!deleted) {
        setError('取消分享失败，请稍后重试。');
        return;
      }

      if (resourceType === 'document') {
        setDocuments((prev) => prev.filter((item) => item.share_link_id !== shareLinkId));
      } else {
        setFiles((prev) => prev.filter((item) => item.share_link_id !== shareLinkId));
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
              <div className={`rounded-2xl p-3 ${pageMeta.iconStyle}`}>{pageMeta.icon}</div>
              <div>
                <div className="text-2xl font-semibold text-slate-900">{pageMeta.title}</div>
                <div className="mt-1 text-sm text-slate-500">{pageMeta.description}</div>
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

          <div className="mt-4 text-xs text-slate-400">{pageMeta.footnote}</div>

          {error ? (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          ) : null}
        </section>

        {isLoading ? (
          <div className="rounded-[28px] border border-slate-200 bg-white px-6 py-20 text-center text-sm text-slate-500 shadow-sm">
            {pageMeta.loadingText}
          </div>
        ) : (
          <div className="grid gap-6 xl:grid-cols-2">
            <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center gap-2 text-sm font-medium text-slate-700">
                <FileText className="h-4 w-4 text-blue-600" />
                {pageMeta.noteTitle}
              </div>

              {documents.length === 0 ? (
                <div className="rounded-2xl bg-slate-50 px-4 py-12 text-center text-sm text-slate-500">
                  {pageMeta.emptyNote}
                </div>
              ) : (
                <div className="space-y-3">
                  {documents.map((document) => {
                    const shareMode = normalizeVisibility(document.share_visibility);
                    const shareUrl = `${window.location.origin}/share/${document.share_token}`;
                    const actionKey = `document:${document.share_link_id || document.id}`;
                    const canCancel = !!currentUserId && (document.share_user_id ?? null) === currentUserId;

                    return (
                      <div
                        key={document.share_link_id || `${document.id}-${document.share_token}`}
                        className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate font-medium text-slate-900">{document.title}</div>
                            <div className="mt-2 flex flex-wrap gap-2">
                              <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${shareMode === 'space' ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'}`}>
                                {shareMode === 'space' ? '分享到空间' : '分享链接'}
                              </span>
                              {document.has_password ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
                                  <Lock className="h-3 w-3" />
                                  已加密码
                                </span>
                              ) : null}
                            </div>
                            <div className="mt-3 text-xs text-slate-500">
                              分享时间：{formatDateTime(document.share_created_at)}
                            </div>
                            <div className="mt-1 text-xs text-slate-500">
                              更新时间：{formatDateTime(document.updated_at)}
                            </div>
                            {shareMode === 'space' ? (
                              <div className="mt-1 text-xs text-slate-500">
                                目标空间：{document.shared_team_name || '未命名空间'}
                              </div>
                            ) : (
                              <div className="mt-1 text-xs text-slate-500">访问方式：拿到链接即可查看</div>
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
                          {canCancel && document.share_link_id ? (
                            <button
                              type="button"
                              onClick={() => void cancelShare('document', document.share_link_id || '')}
                              disabled={busyKey === actionKey}
                              className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600 hover:bg-rose-100 disabled:opacity-60"
                            >
                              <Trash2 className="h-4 w-4" />
                              {busyKey === actionKey ? '处理中...' : '取消分享'}
                            </button>
                          ) : null}
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
                {pageMeta.fileTitle}
              </div>

              {files.length === 0 ? (
                <div className="rounded-2xl bg-slate-50 px-4 py-12 text-center text-sm text-slate-500">
                  {pageMeta.emptyFile}
                </div>
              ) : (
                <div className="space-y-3">
                  {files.map((file) => {
                    const shareMode = normalizeVisibility(file.share_visibility);
                    const shareUrl = `${window.location.origin}/share/${file.share_token}`;
                    const actionKey = `file:${file.share_link_id || file.id}`;
                    const canCancel = !!currentUserId && (file.share_user_id ?? null) === currentUserId;

                    return (
                      <div
                        key={file.share_link_id || `${file.id}-${file.share_token}`}
                        className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start gap-3">
                              <div className="rounded-xl bg-white p-2 text-slate-500">{resolveFileIcon(file.type)}</div>
                              <div className="min-w-0 flex-1">
                                <div className="truncate font-medium text-slate-900">{file.name}</div>
                                <div className="mt-2 flex flex-wrap gap-2">
                                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${shareMode === 'space' ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'}`}>
                                    {shareMode === 'space' ? '分享到空间' : '分享链接'}
                                  </span>
                                  {file.has_password ? (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
                                      <Lock className="h-3 w-3" />
                                      已加密码
                                    </span>
                                  ) : null}
                                </div>
                                <div className="mt-3 text-xs text-slate-500">
                                  文件大小：{formatFileSize(file.size)}
                                </div>
                                <div className="mt-1 text-xs text-slate-500">
                                  分享时间：{formatDateTime(file.share_created_at)}
                                </div>
                                <div className="mt-1 text-xs text-slate-500">
                                  更新时间：{formatDateTime(file.updated_at)}
                                </div>
                                {shareMode === 'space' ? (
                                  <div className="mt-1 text-xs text-slate-500">
                                    目标空间：{file.shared_team_name || '未命名空间'}
                                  </div>
                                ) : (
                                  <div className="mt-1 text-xs text-slate-500">访问方式：拿到链接即可查看</div>
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
                          {canCancel && file.share_link_id ? (
                            <button
                              type="button"
                              onClick={() => void cancelShare('file', file.share_link_id || '')}
                              disabled={busyKey === actionKey}
                              className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600 hover:bg-rose-100 disabled:opacity-60"
                            >
                              <Trash2 className="h-4 w-4" />
                              {busyKey === actionKey ? '处理中...' : '取消分享'}
                            </button>
                          ) : null}
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
