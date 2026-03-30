import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, ExternalLink, Link2, Lock, Trash2, Users, X } from 'lucide-react';
import { shareService, teamService } from '../lib/databaseApi';
import { notify } from '../lib/notify';
import type { ShareLink, Team } from '../lib/types';

type ShareMode = 'space' | 'link';
type ResourceType = 'document' | 'file';

interface ResourceShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  resourceType: ResourceType;
  resourceId: string;
  resourceName: string;
  initialTeamId?: string | null;
}

function normalizeVisibility(value: ShareLink['visibility']) {
  if (value === 'team' || value === 'space') return 'space';
  if (value === 'public' || value === 'link') return 'link';
  return 'private';
}

function dedupeLinks(links: ShareLink[]) {
  const seen = new Set<string>();
  return links.filter((link) => {
    if (seen.has(link.id)) return false;
    seen.add(link.id);
    return true;
  });
}

export function ResourceShareModal({
  isOpen,
  onClose,
  resourceType,
  resourceId,
  resourceName,
  initialTeamId = null,
}: ResourceShareModalProps) {
  const [shareMode, setShareMode] = useState<ShareMode>('space');
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [sharePassword, setSharePassword] = useState('');
  const [shareLinks, setShareLinks] = useState<ShareLink[]>([]);
  const [latestResult, setLatestResult] = useState<{ mode: ShareMode; value: string } | null>(null);
  const [copiedId, setCopiedId] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState('');

  const resourceBelongsToSpace = Boolean(initialTeamId);
  const teamMap = useMemo(() => new Map(teams.map((team) => [team.id, team])), [teams]);
  const availableSpaces = useMemo(() => {
    const approved = teams.filter((team) => team.is_owner || team.membership_status === 'approved');
    return resourceBelongsToSpace ? approved : approved.filter((team) => team.is_owner);
  }, [resourceBelongsToSpace, teams]);
  const spaceShareLinks = useMemo(
    () => shareLinks.filter((link) => normalizeVisibility(link.visibility) === 'space'),
    [shareLinks],
  );
  const linkShareLinks = useMemo(
    () => shareLinks.filter((link) => normalizeVisibility(link.visibility) === 'link'),
    [shareLinks],
  );

  useEffect(() => {
    if (!isOpen) return;
    const load = async () => {
      const [allTeams, links] = await Promise.all([
        teamService.getMyTeams(),
        resourceType === 'document' ? shareService.listByDocument(resourceId) : shareService.listByFile(resourceId),
      ]);
      const approved = allTeams.filter((team) => team.is_owner || team.membership_status === 'approved');
      const nextSpaces = resourceBelongsToSpace ? approved : approved.filter((team) => team.is_owner);
      setTeams(allTeams);
      setShareLinks(dedupeLinks(links));
      setLatestResult(null);
      setSharePassword('');
      setError('');
      setSelectedTeamId(nextSpaces.find((team) => team.id === initialTeamId)?.id || nextSpaces[0]?.id || '');
    };
    void load();
  }, [initialTeamId, isOpen, resourceBelongsToSpace, resourceId, resourceType]);

  if (!isOpen) return null;

  const handleCopy = async (value: string, key: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedId(key);
      window.setTimeout(() => setCopiedId(''), 1800);
      notify.copied('分享链接已复制');
    } catch {
      setCopiedId('');
      notify.error('复制失败', '请稍后重试。');
    }
  };

  const handleDeleteLink = async (id: string) => {
    const ok = await shareService.deleteShareLink(id);
    if (!ok) {
      setError('删除分享失败，请稍后重试。');
      notify.error('删除分享失败', '请稍后重试。');
      return;
    }
    setShareLinks((prev) => prev.filter((item) => item.id !== id));
    notify.success('已取消这条分享');
  };

  const handleCreate = async () => {
    setIsBusy(true);
    setError('');
    try {
      if (shareMode === 'space') {
        if (!selectedTeamId) {
          setError('请先选择一个空间。');
          return;
        }
        const existing = spaceShareLinks.find((link) => link.team_id === selectedTeamId);
        if (existing) {
          setLatestResult({ mode: 'space', value: `该资源已经分享到「${teamMap.get(selectedTeamId)?.name || '当前空间'}」` });
          notify.info('这个空间已经分享过了');
          return;
        }
        const created = await shareService.createShareLink(
          resourceType === 'document' ? resourceId : undefined,
          resourceType === 'file' ? resourceId : undefined,
          'space',
          selectedTeamId,
        );
        if (!created) {
          setError('分享到空间失败，请稍后重试。');
          return;
        }
        setShareLinks((prev) => dedupeLinks([created, ...prev]));
        setLatestResult({ mode: 'space', value: `已分享到「${teamMap.get(selectedTeamId)?.name || '所选空间'}」` });
        notify.success('分享成功', `已分享到「${teamMap.get(selectedTeamId)?.name || '所选空间'}」`);
        return;
      }

      const created = await shareService.createShareLink(
        resourceType === 'document' ? resourceId : undefined,
        resourceType === 'file' ? resourceId : undefined,
        'link',
        null,
        sharePassword.trim() || null,
      );
      if (!created) {
        setError('生成分享链接失败，请稍后重试。');
        return;
      }
      const url = `${window.location.origin}/share/${created.share_token}`;
      setShareLinks((prev) => dedupeLinks([created, ...prev]));
      setLatestResult({ mode: 'link', value: url });
      await handleCopy(url, 'latest');
      notify.success('分享链接已生成', sharePassword.trim() ? '已为这条链接设置访问密码。' : '拿到链接即可访问。');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="app-modal-enter app-soft-surface w-full max-w-5xl rounded-3xl bg-white" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <div className="text-lg font-semibold text-slate-900">分享资源</div>
            <div className="mt-1 text-sm text-slate-500">{resourceName}</div>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-50">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-6 px-6 py-6 lg:grid-cols-[1.02fr_0.98fr]">
          <div className="space-y-6">
            <div>
              <div className="mb-3 text-sm font-medium text-slate-700">分享方式</div>
              <div className="grid gap-3 sm:grid-cols-2">
                <button type="button" onClick={() => setShareMode('space')} className={`rounded-2xl border px-4 py-4 text-left transition ${shareMode === 'space' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                  <div className="mb-2 flex items-center gap-2"><Users className="h-4 w-4" /><span className="font-medium">分享到空间</span></div>
                  <div className="text-xs leading-5">选择一个空间，分享后该空间成员都可以查看。</div>
                </button>
                <button type="button" onClick={() => setShareMode('link')} className={`rounded-2xl border px-4 py-4 text-left transition ${shareMode === 'link' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                  <div className="mb-2 flex items-center gap-2"><Link2 className="h-4 w-4" /><span className="font-medium">分享链接</span></div>
                  <div className="text-xs leading-5">拿到链接即可查看，也可以额外设置访问密码。</div>
                </button>
              </div>
            </div>

            {shareMode === 'space' ? (
              <div className="space-y-4 rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <div>
                  <div className="mb-2 text-sm font-medium text-slate-700">选择空间</div>
                  <select value={selectedTeamId} onChange={(event) => setSelectedTeamId(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-blue-500">
                    <option value="">请选择空间</option>
                    {availableSpaces.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
                  </select>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-600">
                  {resourceBelongsToSpace ? '当前资源属于团队空间，因此你可以分享到自己已加入的空间。' : '当前资源属于个人内容，因此只能分享到你自己拥有的空间。'}
                </div>
                {availableSpaces.length === 0 && (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                    {resourceBelongsToSpace ? '你还没有可用的目标空间。先加入一个空间，再执行空间分享。' : '你还没有自己拥有的空间。先创建空间后，再把个人资源分享到空间。'}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4 rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <div>
                  <div className="mb-2 text-sm font-medium text-slate-700">访问密码</div>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input type="password" value={sharePassword} onChange={(event) => setSharePassword(event.target.value)} placeholder="可选，不填则拿到链接即可访问" className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-sm outline-none focus:border-blue-500" />
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-600">设置后，打开这条分享链接的人需要先输入访问密码。</div>
              </div>
            )}

            {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

            <button type="button" onClick={() => void handleCreate()} disabled={isBusy || (shareMode === 'space' && (!selectedTeamId || availableSpaces.length === 0))} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60">
              {shareMode === 'space' ? <Users className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
              {isBusy ? '处理中...' : shareMode === 'space' ? '分享到空间' : '生成分享链接'}
            </button>
          </div>

          <div className="space-y-4">
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-2 text-sm font-medium text-slate-700">最新结果</div>
              {latestResult?.mode === 'link' ? (
                <div className="flex gap-2">
                  <input type="text" readOnly value={latestResult.value} className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none" />
                  <button type="button" onClick={() => void handleCopy(latestResult.value, 'latest')} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-white">
                    {copiedId === 'latest' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </button>
                  <a href={latestResult.value} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-white">
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </div>
              ) : (
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">{latestResult?.value || '分享完成后，会在这里显示结果。'}</div>
              )}
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white">
              <div className="border-b border-slate-200 px-4 py-3 text-sm font-medium text-slate-700">已分享到空间</div>
              <div className="max-h-56 overflow-y-auto p-4">
                {spaceShareLinks.length === 0 ? <div className="rounded-2xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">还没有分享到任何空间</div> : (
                  <div className="space-y-3">
                    {spaceShareLinks.map((link) => (
                      <div key={link.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-medium text-slate-900">{teamMap.get(link.team_id || '')?.name || '未命名空间'}</div>
                            <div className="mt-1 text-xs text-slate-500">{new Date(link.created_at).toLocaleString('zh-CN')}</div>
                            <div className="mt-2 text-xs text-slate-400">该空间成员都可以查看这个资源。</div>
                          </div>
                          <button type="button" onClick={() => void handleDeleteLink(link.id)} className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-white hover:text-rose-600">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white">
              <div className="border-b border-slate-200 px-4 py-3 text-sm font-medium text-slate-700">已有分享链接</div>
              <div className="max-h-[20rem] overflow-y-auto p-4">
                {linkShareLinks.length === 0 ? <div className="rounded-2xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">还没有分享链接</div> : (
                  <div className="space-y-3">
                    {linkShareLinks.map((link) => {
                      const linkUrl = `${window.location.origin}/share/${link.share_token}`;
                      return (
                        <div key={link.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <div className="mb-3 flex items-start justify-between gap-3">
                            <div>
                              <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
                                <Link2 className="h-4 w-4 text-slate-400" />分享链接
                                {link.has_password ? <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700">已加密码</span> : null}
                              </div>
                              <div className="mt-1 text-xs text-slate-500">{new Date(link.created_at).toLocaleString('zh-CN')}</div>
                            </div>
                            <button type="button" onClick={() => void handleDeleteLink(link.id)} className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-white hover:text-rose-600">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                          <div className="flex gap-2">
                            <input type="text" readOnly value={linkUrl} className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none" />
                            <button type="button" onClick={() => void handleCopy(linkUrl, link.id)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-white">
                              {copiedId === link.id ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                            </button>
                            <a href={linkUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-white">
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ResourceShareModal;
