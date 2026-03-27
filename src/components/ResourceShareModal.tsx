import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, ExternalLink, Globe, Link2, Lock, Trash2, Users, X } from 'lucide-react';
import { resourcePermissionService, shareService, teamService } from '../lib/databaseApi';
import type { ResourcePermission, ShareLink, Team } from '../lib/types';

type ShareVisibility = 'private' | 'team' | 'public';
type ResourceType = 'document' | 'file';

interface ResourceShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  resourceType: ResourceType;
  resourceId: string;
  resourceName: string;
  initialTeamId?: string | null;
}

type PermissionState = Record<
  string,
  {
    can_view: boolean;
    can_edit: boolean;
    can_delete: boolean;
    permission: ResourcePermission;
  }
>;

const visibilityOptions: Array<{
  value: ShareVisibility;
  label: string;
  description: string;
  icon: typeof Lock;
}> = [
  { value: 'private', label: '私有', description: '仅资源所有者可访问', icon: Lock },
  { value: 'team', label: '团队', description: '登录且被授权的团队成员可访问', icon: Users },
  { value: 'public', label: '公开', description: '任何拿到链接的人都可只读查看', icon: Globe },
];

export default function ResourceShareModal({
  isOpen,
  onClose,
  resourceType,
  resourceId,
  resourceName,
  initialTeamId = null,
}: ResourceShareModalProps) {
  const [visibility, setVisibility] = useState<ShareVisibility>('private');
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string>(initialTeamId || '');
  const [memberQuery, setMemberQuery] = useState('');
  const [permissions, setPermissions] = useState<PermissionState>({});
  const [shareLinks, setShareLinks] = useState<ShareLink[]>([]);
  const [newLink, setNewLink] = useState('');
  const [copiedId, setCopiedId] = useState('');
  const [isBusy, setIsBusy] = useState(false);

  const ownedTeams = useMemo(() => teams.filter((team) => team.is_owner), [teams]);
  const permissionRows = useMemo(() => Object.values(permissions), [permissions]);

  useEffect(() => {
    if (!isOpen) return;

    const load = async () => {
      const [allTeams, links] = await Promise.all([
        teamService.getMyTeams(),
        resourceType === 'document'
          ? shareService.listByDocument(resourceId)
          : shareService.listByFile(resourceId),
      ]);

      setTeams(allTeams);
      setShareLinks(links);
      setNewLink('');

      const nextTeamId =
        initialTeamId && allTeams.some((team) => team.id === initialTeamId && team.is_owner)
          ? initialTeamId
          : allTeams.find((team) => team.is_owner)?.id || '';

      setSelectedTeamId(nextTeamId);
    };

    void load();
  }, [initialTeamId, isOpen, resourceId, resourceType]);

  useEffect(() => {
    if (!isOpen || visibility !== 'team' || !selectedTeamId) {
      setPermissions({});
      return;
    }

    const loadPermissions = async () => {
      const rows = await resourcePermissionService.getForResource(
        selectedTeamId,
        resourceType,
        resourceId,
        memberQuery,
      );

      const nextState: PermissionState = {};
      rows.forEach((permission) => {
        nextState[permission.member_user_id] = {
          can_view: permission.can_view,
          can_edit: permission.can_edit,
          can_delete: permission.can_delete,
          permission,
        };
      });
      setPermissions(nextState);
    };

    void loadPermissions();
  }, [isOpen, memberQuery, resourceId, resourceType, selectedTeamId, visibility]);

  if (!isOpen) return null;

  const handlePermissionToggle = (
    memberUserId: string,
    field: 'can_view' | 'can_edit' | 'can_delete',
    checked: boolean,
  ) => {
    setPermissions((prev) => {
      const current = prev[memberUserId];
      if (!current) return prev;

      const next = {
        ...current,
        [field]: checked,
      };

      if (field !== 'can_view' && checked) {
        next.can_view = true;
      }

      if (field === 'can_view' && !checked) {
        next.can_edit = false;
        next.can_delete = false;
      }

      return {
        ...prev,
        [memberUserId]: next,
      };
    });
  };

  const handleCopy = async (value: string, key: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedId(key);
      window.setTimeout(() => setCopiedId(''), 1800);
    } catch {
      setCopiedId('');
    }
  };

  const handleDeleteLink = async (id: string) => {
    const deleted = await shareService.deleteShareLink(id);
    if (!deleted) return;
    setShareLinks((prev) => prev.filter((item) => item.id !== id));
  };

  const handleCreateLink = async () => {
    setIsBusy(true);

    try {
      if (visibility === 'team') {
        if (!selectedTeamId) {
          alert('请先选择一个团队');
          return;
        }

        const entries = permissionRows.map((row) => ({
          member_user_id: row.permission.member_user_id,
          can_view: row.can_view,
          can_edit: row.can_edit,
          can_delete: row.can_delete,
        }));

        if (!entries.some((entry) => entry.can_view)) {
          alert('请至少给一名成员勾选查看权限');
          return;
        }

        await resourcePermissionService.replaceForResource(
          selectedTeamId,
          resourceType,
          resourceId,
          entries,
        );
      }

      const created = await shareService.createShareLink(
        resourceType === 'document' ? resourceId : undefined,
        resourceType === 'file' ? resourceId : undefined,
        visibility,
        visibility === 'team' ? selectedTeamId : null,
      );

      if (!created) {
        alert('生成分享链接失败');
        return;
      }

      const url = `${window.location.origin}/share/${created.share_token}`;
      setShareLinks((prev) => [created, ...prev]);
      setNewLink(url);
      await handleCopy(url, 'new');
    } finally {
      setIsBusy(false);
    }
  };

  const getVisibilityLabel = (value: ShareVisibility) =>
    value === 'private' ? '私有' : value === 'team' ? '团队' : '公开';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-4xl rounded-3xl bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <div className="text-lg font-semibold text-slate-900">分享资源</div>
            <div className="mt-1 text-sm text-slate-500">{resourceName}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-6 px-6 py-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-6">
            <div>
              <div className="mb-3 text-sm font-medium text-slate-700">访问方式</div>
              <div className="grid gap-3 sm:grid-cols-3">
                {visibilityOptions.map((option) => {
                  const Icon = option.icon;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setVisibility(option.value)}
                      className={`rounded-2xl border px-4 py-4 text-left transition ${
                        visibility === option.value
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <div className="mb-2 flex items-center gap-2">
                        <Icon className="h-4 w-4" />
                        <span className="font-medium">{option.label}</span>
                      </div>
                      <div className="text-xs leading-5">{option.description}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {visibility === 'team' && (
              <div className="space-y-4 rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <div>
                  <div className="mb-2 text-sm font-medium text-slate-700">选择团队</div>
                  <select
                    value={selectedTeamId}
                    onChange={(event) => setSelectedTeamId(event.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-blue-500"
                  >
                    <option value="">请选择团队</option>
                    {ownedTeams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                      </option>
                    ))}
                  </select>
                  {ownedTeams.length === 0 && (
                    <div className="mt-2 text-xs text-amber-600">你还没有可管理的团队，请先到团队页创建团队。</div>
                  )}
                </div>

                {selectedTeamId && (
                  <>
                    <div>
                      <div className="mb-2 text-sm font-medium text-slate-700">搜索成员</div>
                      <input
                        type="text"
                        value={memberQuery}
                        onChange={(event) => setMemberQuery(event.target.value)}
                        placeholder="按昵称或邮箱搜索成员"
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-blue-500"
                      />
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white">
                      <div className="grid grid-cols-[minmax(0,1fr)_88px_88px_88px] gap-2 border-b border-slate-200 px-4 py-3 text-xs font-medium text-slate-500">
                        <div>成员</div>
                        <div className="text-center">查看</div>
                        <div className="text-center">编辑</div>
                        <div className="text-center">删除</div>
                      </div>
                      <div className="max-h-72 overflow-y-auto">
                        {permissionRows.length === 0 ? (
                          <div className="px-4 py-8 text-center text-sm text-slate-500">暂无成员可授权</div>
                        ) : (
                          permissionRows.map((row) => (
                            <div
                              key={row.permission.member_user_id}
                              className="grid grid-cols-[minmax(0,1fr)_88px_88px_88px] gap-2 border-b border-slate-100 px-4 py-3 text-sm last:border-b-0"
                            >
                              <div className="min-w-0">
                                <div className="truncate font-medium text-slate-900">
                                  {row.permission.user?.nickname || row.permission.user?.email || row.permission.member_user_id}
                                </div>
                                <div className="truncate text-xs text-slate-500">
                                  {row.permission.user?.email || row.permission.member_user_id}
                                </div>
                              </div>
                              <div className="flex justify-center">
                                <input
                                  type="checkbox"
                                  checked={row.can_view}
                                  onChange={(event) =>
                                    handlePermissionToggle(
                                      row.permission.member_user_id,
                                      'can_view',
                                      event.target.checked,
                                    )
                                  }
                                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                />
                              </div>
                              <div className="flex justify-center">
                                <input
                                  type="checkbox"
                                  checked={row.can_edit}
                                  onChange={(event) =>
                                    handlePermissionToggle(
                                      row.permission.member_user_id,
                                      'can_edit',
                                      event.target.checked,
                                    )
                                  }
                                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                />
                              </div>
                              <div className="flex justify-center">
                                <input
                                  type="checkbox"
                                  checked={row.can_delete}
                                  onChange={(event) =>
                                    handlePermissionToggle(
                                      row.permission.member_user_id,
                                      'can_delete',
                                      event.target.checked,
                                    )
                                  }
                                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                />
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={() => void handleCreateLink()}
              disabled={isBusy || (visibility === 'team' && !selectedTeamId)}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Link2 className="h-4 w-4" />
              {isBusy ? '处理中...' : visibility === 'team' ? '保存权限并生成链接' : '生成分享链接'}
            </button>
          </div>

          <div className="space-y-4">
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-2 text-sm font-medium text-slate-700">最新链接</div>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={newLink}
                  placeholder="生成后会显示在这里"
                  className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none"
                />
                <button
                  type="button"
                  disabled={!newLink}
                  onClick={() => void handleCopy(newLink, 'new')}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-white disabled:opacity-50"
                >
                  {copiedId === 'new' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </button>
                <a
                  href={newLink || '#'}
                  target="_blank"
                  rel="noreferrer"
                  className={`inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 ${
                    newLink ? 'hover:bg-white' : 'pointer-events-none opacity-50'
                  }`}
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white">
              <div className="border-b border-slate-200 px-4 py-3 text-sm font-medium text-slate-700">已有分享链接</div>
              <div className="max-h-[28rem] overflow-y-auto p-4">
                {shareLinks.length === 0 ? (
                  <div className="rounded-2xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">还没有分享链接</div>
                ) : (
                  <div className="space-y-3">
                    {shareLinks.map((link) => {
                      const linkUrl = `${window.location.origin}/share/${link.share_token}`;
                      return (
                        <div key={link.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <div>
                              <div className="text-sm font-medium text-slate-900">
                                {getVisibilityLabel(link.visibility)}
                              </div>
                              <div className="mt-1 text-xs text-slate-500">
                                {new Date(link.created_at).toLocaleString('zh-CN')}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => void handleDeleteLink(link.id)}
                              className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-white hover:text-red-600"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              readOnly
                              value={linkUrl}
                              className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => void handleCopy(linkUrl, link.id)}
                              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-white"
                            >
                              {copiedId === link.id ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                            </button>
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
