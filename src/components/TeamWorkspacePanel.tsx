import { useEffect, useMemo, useState } from 'react';
import { Check, KeyRound, Loader2, Plus, Search, ShieldCheck, Users, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import NameInputModal from './NameInputModal';
import { teamService } from '../lib/databaseApi';
import { notify } from '../lib/notify';
import type { Team, TeamInvitation, TeamMember } from '../lib/types';

interface TeamWorkspacePanelProps {
  activeWorkspaceTeamId?: string | null;
  initialSelectedTeamId?: string | null;
  onSelectedTeamChange?: (teamId: string | null) => void;
  onEnterTeamSpace?: (team: Team) => void;
}

function formatDateTime(dateLike: string) {
  const date = new Date(dateLike);
  if (Number.isNaN(date.getTime())) {
    return '--';
  }

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
    .format(date)
    .replace(/\//g, '-');
}

function getStatusText(team: Team) {
  if (team.is_owner || team.membership_status === 'approved') {
    return '已加入';
  }

  if (team.membership_status === 'pending') {
    return '申请中';
  }

  if (team.membership_status === 'rejected') {
    return '已拒绝，可重新申请';
  }

  return '未加入';
}

function getSpaceManageLabel(team: Team) {
  return team.is_owner ? '空间管理' : '空间总览';
}

function getSpaceManagePath(team: Team) {
  const basePath = `/spaces/${encodeURIComponent(team.id)}/manage`;
  return team.is_owner ? basePath : `${basePath}?section=overview`;
}

export default function TeamWorkspacePanel({
  activeWorkspaceTeamId = null,
  initialSelectedTeamId = null,
  onSelectedTeamChange,
  onEnterTeamSpace,
}: TeamWorkspacePanelProps) {
  const navigate = useNavigate();
  const [teams, setTeams] = useState<Team[]>([]);
  const [discoverableTeams, setDiscoverableTeams] = useState<Team[]>([]);
  const [myInvitations, setMyInvitations] = useState<TeamInvitation[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState(initialSelectedTeamId ?? '');
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [joinRequests, setJoinRequests] = useState<TeamMember[]>([]);
  const [memberQuery, setMemberQuery] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [draftTeamName, setDraftTeamName] = useState('');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const selectedTeam = useMemo(
    () => teams.find((team) => team.id === selectedTeamId) || null,
    [selectedTeamId, teams],
  );

  const filteredMembers = useMemo(() => {
    const query = memberQuery.trim().toLowerCase();
    if (!query) {
      return members;
    }

    return members.filter((member) => {
      const nickname = member.user?.nickname?.toLowerCase() || '';
      const email = member.user?.email?.toLowerCase() || '';
      return nickname.includes(query) || email.includes(query);
    });
  }, [memberQuery, members]);

  const loadTeams = async () => {
    setIsLoading(true);
    setError('');

    try {
      const [mine, discoverable, invitations] = await Promise.all([
        teamService.getMyTeams(),
        teamService.getDiscoverableTeams(),
        teamService.getMyInvitations(),
      ]);

      setTeams(mine);
      setDiscoverableTeams(discoverable);
      setMyInvitations(invitations);
      setSelectedTeamId((current) => {
        if (current && mine.some((team) => team.id === current)) {
          return current;
        }
        if (activeWorkspaceTeamId && mine.some((team) => team.id === activeWorkspaceTeamId)) {
          return activeWorkspaceTeamId;
        }
        return mine[0]?.id || '';
      });
    } catch (loadError) {
      setTeams([]);
      setDiscoverableTeams([]);
      setMyInvitations([]);
      setSelectedTeamId('');
      setError(loadError instanceof Error ? loadError.message : '空间数据加载失败');
    } finally {
      setIsLoading(false);
    }
  };

  const loadSelectedTeam = async (teamId: string, isOwner: boolean) => {
    if (!teamId) {
      setMembers([]);
      setJoinRequests([]);
      return;
    }

    try {
      const [memberRows, requestRows] = await Promise.all([
        teamService.getMembers(teamId),
        isOwner ? teamService.getJoinRequests(teamId) : Promise.resolve([]),
      ]);

      setMembers(memberRows);
      setJoinRequests(requestRows);
    } catch (loadError) {
      setMembers([]);
      setJoinRequests([]);
      setError(loadError instanceof Error ? loadError.message : '空间详情加载失败');
    }
  };

  useEffect(() => {
    void loadTeams();
  }, []);

  useEffect(() => {
    void loadSelectedTeam(selectedTeamId, !!selectedTeam?.is_owner);
  }, [selectedTeamId, selectedTeam?.is_owner]);

  useEffect(() => {
    if (!activeWorkspaceTeamId) {
      return;
    }

    setSelectedTeamId((current) => (current === activeWorkspaceTeamId ? current : activeWorkspaceTeamId));
  }, [activeWorkspaceTeamId]);

  useEffect(() => {
    if (!initialSelectedTeamId) {
      return;
    }

    setSelectedTeamId((current) => (current === initialSelectedTeamId ? current : initialSelectedTeamId));
  }, [initialSelectedTeamId]);

  useEffect(() => {
    onSelectedTeamChange?.(selectedTeamId || null);
  }, [onSelectedTeamChange, selectedTeamId]);

  const handleCreateTeam = async () => {
    const nextName = draftTeamName.trim();
    if (!nextName) {
      setError('请输入空间名称');
      return;
    }

    setBusyKey('create-space');
    setError('');
    setNotice('');

    try {
      const created = await teamService.createTeam(nextName);
      if (!created) {
        setError('创建空间失败');
        notify.error('创建空间失败', '请稍后重试。');
        return;
      }

      setDraftTeamName('');
      setShowCreateDialog(false);
      await loadTeams();
      setSelectedTeamId(created.id);
      setNotice('空间已创建');
      notify.success('空间已创建', created.name);
    } catch (actionError) {
      const message = actionError instanceof Error ? actionError.message : '创建空间失败';
      setError(message);
      notify.error('创建空间失败', message);
    } finally {
      setBusyKey(null);
    }
  };

  const handleRequestJoin = async (teamId: string) => {
    setBusyKey(`request:${teamId}`);
    setError('');
    setNotice('');

    try {
      const ok = await teamService.requestToJoin(teamId);
      if (!ok) {
        setError('提交加入申请失败');
        notify.error('申请失败', '请稍后重试。');
        return;
      }

      await loadTeams();
      setNotice('加入申请已提交，等待空间创建者处理');
      const targetTeam = discoverableTeams.find((team) => team.id === teamId);
      notify.success('加入申请已提交', targetTeam?.name || '等待空间创建者处理');
    } catch (actionError) {
      const message = actionError instanceof Error ? actionError.message : '提交加入申请失败';
      setError(message);
      notify.error('申请失败', message);
    } finally {
      setBusyKey(null);
    }
  };

  const handleJoinByCode = async () => {
    const nextCode = inviteCode.trim().toUpperCase();
    if (!nextCode) {
      setError('请输入邀请码');
      return;
    }

    setBusyKey('join-by-code');
    setError('');
    setNotice('');

    try {
      const joinedTeam = await teamService.joinByInviteCode(nextCode);
      if (!joinedTeam) {
        setError('加入空间失败');
        notify.error('加入空间失败', '请检查邀请码后重试。');
        return;
      }

      setInviteCode('');
      await loadTeams();
      setSelectedTeamId(joinedTeam.id);
      setNotice(`已加入空间「${joinedTeam.name}」`);
      notify.success('已加入空间', joinedTeam.name);
    } catch (actionError) {
      const message = actionError instanceof Error ? actionError.message : '邀请码加入失败';
      setError(message);
      notify.error('邀请码加入失败', message);
    } finally {
      setBusyKey(null);
    }
  };

  const handleAcceptInvitation = async (invitation: TeamInvitation) => {
    setBusyKey(`accept-invitation:${invitation.id}`);
    setError('');
    setNotice('');

    try {
      const joinedTeam = await teamService.acceptInvitation(invitation.id);
      if (!joinedTeam) {
        setError('接受邀请失败');
        notify.error('接受邀请失败', '请稍后重试。');
        return;
      }

      await loadTeams();
      setSelectedTeamId(joinedTeam.id);
      setNotice(`已加入空间「${joinedTeam.name}」`);
      notify.success('已加入空间', joinedTeam.name);
    } catch (actionError) {
      const message = actionError instanceof Error ? actionError.message : '接受邀请失败';
      setError(message);
      notify.error('接受邀请失败', message);
    } finally {
      setBusyKey(null);
    }
  };

  const handleRejectInvitation = async (invitationId: string) => {
    setBusyKey(`reject-invitation:${invitationId}`);
    setError('');
    setNotice('');

    try {
      const ok = await teamService.rejectInvitation(invitationId);
      if (!ok) {
        setError('拒绝邀请失败');
        notify.error('拒绝邀请失败', '请稍后重试。');
        return;
      }

      await loadTeams();
      setNotice('已拒绝邀请');
      notify.success('已拒绝邀请');
    } catch (actionError) {
      const message = actionError instanceof Error ? actionError.message : '拒绝邀请失败';
      setError(message);
      notify.error('拒绝邀请失败', message);
    } finally {
      setBusyKey(null);
    }
  };

  const handleApproveRequest = async (requestId: string) => {
    if (!selectedTeam) {
      return;
    }

    setBusyKey(`approve-request:${requestId}`);
    setError('');
    setNotice('');

    try {
      const ok = await teamService.approveJoinRequest(selectedTeam.id, requestId);
      if (!ok) {
        setError('通过申请失败');
        notify.error('通过申请失败', '请检查成员上限设置。');
        return;
      }

      await loadSelectedTeam(selectedTeam.id, true);
      await loadTeams();
      setNotice('已通过加入申请');
      notify.success('已通过加入申请');
    } catch (actionError) {
      const message = actionError instanceof Error ? actionError.message : '通过申请失败';
      setError(message);
      notify.error('通过申请失败', message);
    } finally {
      setBusyKey(null);
    }
  };

  const handleRejectRequest = async (requestId: string) => {
    if (!selectedTeam) {
      return;
    }

    setBusyKey(`reject-request:${requestId}`);
    setError('');
    setNotice('');

    try {
      const ok = await teamService.rejectJoinRequest(selectedTeam.id, requestId);
      if (!ok) {
        setError('拒绝申请失败');
        notify.error('拒绝申请失败', '请稍后重试。');
        return;
      }

      await loadSelectedTeam(selectedTeam.id, true);
      setNotice('已拒绝加入申请');
      notify.success('已拒绝加入申请');
    } catch (actionError) {
      const message = actionError instanceof Error ? actionError.message : '拒绝申请失败';
      setError(message);
      notify.error('拒绝申请失败', message);
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className="app-page-enter h-full overflow-y-auto bg-slate-50">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-6">
        <section className="app-card-hover app-section-enter rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-2xl font-semibold text-slate-900">空间</div>
              <div className="mt-2 text-sm text-slate-500">
                这里可以创建空间、处理收到的邀请，也可以通过邀请码或申请加入其他空间。
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => {
                  setDraftTeamName('');
                  setShowCreateDialog(true);
                }}
                disabled={busyKey !== null}
                className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Plus className="h-4 w-4" />
                创建空间
              </button>
              <button
                type="button"
                onClick={() => void loadTeams()}
                disabled={busyKey !== null || isLoading}
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                刷新
              </button>
            </div>
          </div>

          {notice ? (
            <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {notice}
            </div>
          ) : null}

          {error ? (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          ) : null}
        </section>

        <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="space-y-6">
            <section className="app-card-hover app-section-enter rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2 text-sm font-medium text-slate-700">
                <ShieldCheck className="h-4 w-4 text-slate-900" />
                收到的邀请
              </div>

              {isLoading ? (
                <div className="rounded-2xl bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                  正在加载邀请...
                </div>
              ) : myInvitations.length === 0 ? (
                <div className="rounded-2xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                  暂时没有待处理的空间邀请
                </div>
              ) : (
                <div className="space-y-3">
                  {myInvitations.map((invitation) => {
                    const acceptBusy = busyKey === `accept-invitation:${invitation.id}`;
                    const rejectBusy = busyKey === `reject-invitation:${invitation.id}`;

                    return (
                      <div key={invitation.id} className="rounded-2xl border border-slate-200 px-4 py-4">
                        <div className="font-medium text-slate-900">{invitation.team?.name || '未命名空间'}</div>
                        <div className="mt-1 text-xs text-slate-500">
                          邀请对象：{invitation.invited_user?.email || invitation.invited_email || '当前账号'}
                        </div>
                        <div className="mt-1 text-xs text-slate-400">
                          发起时间：{formatDateTime(invitation.created_at)}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => void handleAcceptInvitation(invitation)}
                            disabled={busyKey !== null}
                            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-sm text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {acceptBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                            接受
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleRejectInvitation(invitation.id)}
                            disabled={busyKey !== null}
                            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {rejectBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                            拒绝
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="app-card-hover app-section-enter rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2 text-sm font-medium text-slate-700">
                <KeyRound className="h-4 w-4 text-slate-900" />
                邀请码加入空间
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <div className="relative">
                  <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={inviteCode}
                    onChange={(event) => setInviteCode(event.target.value.toUpperCase())}
                    placeholder="输入邀请码"
                    className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm text-slate-900 outline-none transition focus:border-slate-900"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => void handleJoinByCode()}
                  disabled={busyKey !== null}
                  className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busyKey === 'join-by-code' ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                  加入空间
                </button>
                <div className="mt-3 text-xs leading-5 text-slate-500">
                  输入空间创建者提供的邀请码后，可直接加入该空间。
                </div>
              </div>
            </section>

            <section className="app-card-hover app-section-enter rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2 text-sm font-medium text-slate-700">
                <Users className="h-4 w-4 text-slate-900" />
                可申请加入的空间
              </div>

              {isLoading ? (
                <div className="rounded-2xl bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                  正在加载空间列表...
                </div>
              ) : discoverableTeams.length === 0 ? (
                <div className="rounded-2xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                  暂无可申请加入的空间
                </div>
              ) : (
                <div className="space-y-3">
                  {discoverableTeams.map((team) => (
                    <div key={team.id} className="rounded-2xl border border-slate-200 px-4 py-4">
                      <div className="font-medium text-slate-900">{team.name}</div>
                      <div className="mt-1 text-xs text-slate-500">{getStatusText(team)}</div>
                      <button
                        type="button"
                        onClick={() => void handleRequestJoin(team.id)}
                        disabled={
                          busyKey !== null ||
                          team.membership_status === 'pending' ||
                          team.membership_status === 'approved'
                        }
                        className="mt-3 inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {busyKey === `request:${team.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                        申请加入
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="app-card-hover app-section-enter rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2 text-sm font-medium text-slate-700">
                <ShieldCheck className="h-4 w-4 text-slate-900" />
                我的空间
              </div>

              {isLoading ? (
                <div className="rounded-2xl bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                  正在加载空间...
                </div>
              ) : teams.length === 0 ? (
                <div className="rounded-2xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                  你还没有已加入的空间
                </div>
              ) : (
                <div className="space-y-3">
                  {teams.map((team) => (
                    <button
                      key={team.id}
                      type="button"
                      onClick={() => setSelectedTeamId(team.id)}
                      className={`w-full rounded-2xl border px-4 py-4 text-left transition ${
                        selectedTeamId === team.id ? 'border-slate-900 bg-slate-50' : 'border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="truncate font-medium text-slate-900">{team.name}</div>
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">
                          {team.is_owner ? '创建者' : '成员'}
                        </span>
                      </div>
                      <div className="mt-2 text-xs text-slate-500">{getStatusText(team)}</div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            navigate(getSpaceManagePath(team));
                          }}
                          className="rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-700 transition hover:bg-white"
                        >
                          {getSpaceManageLabel(team)}
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            onEnterTeamSpace?.(team);
                          }}
                          className="rounded-xl bg-slate-900 px-3 py-2 text-xs text-white transition hover:bg-slate-800"
                        >
                          进入空间
                        </button>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </section>
          </aside>

          <section className="app-card-hover app-section-enter rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            {!selectedTeam ? (
              <div className="rounded-3xl bg-slate-50 px-6 py-16 text-center text-sm text-slate-500">
                先从左侧选择一个已加入的空间查看详情。
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex flex-col gap-3 border-b border-slate-200 pb-5 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="text-2xl font-semibold text-slate-900">{selectedTeam.name}</div>
                    <div className="mt-2 text-sm text-slate-500">
                      {selectedTeam.is_owner
                        ? '你是这个空间的创建者，可以处理成员申请并进入空间管理。'
                        : '你已经加入这个空间，可以进入空间查看团队内容，也可以打开空间总览查看信息。'}
                    </div>
                  </div>
                  <div className="rounded-full bg-slate-100 px-3 py-2 text-xs text-slate-600">
                    {selectedTeam.is_owner ? '创建者视角' : '成员视角'}
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => navigate(getSpaceManagePath(selectedTeam))}
                    className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                  >
                    {getSpaceManageLabel(selectedTeam)}
                  </button>
                  <button
                    type="button"
                    onClick={() => onEnterTeamSpace?.(selectedTeam)}
                    className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800"
                  >
                    <Users className="h-4 w-4" />
                    进入空间
                  </button>
                </div>

                {selectedTeam.is_owner ? (
                  <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                    <div className="mb-3 text-sm font-medium text-slate-700">待处理的加入申请</div>
                    {joinRequests.length === 0 ? (
                      <div className="rounded-2xl bg-white px-4 py-6 text-center text-sm text-slate-500">
                        当前没有待处理的加入申请
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {joinRequests.map((request) => {
                          const approveBusy = busyKey === `approve-request:${request.id}`;
                          const rejectBusy = busyKey === `reject-request:${request.id}`;

                          return (
                            <div
                              key={request.id}
                              className="flex flex-col gap-3 rounded-2xl bg-white px-4 py-4 lg:flex-row lg:items-center lg:justify-between"
                            >
                              <div>
                                <div className="font-medium text-slate-900">
                                  {request.user?.nickname || request.user?.email || request.user_id}
                                </div>
                                <div className="mt-1 text-xs text-slate-500">
                                  {request.user?.email || request.user_id}
                                </div>
                                <div className="mt-1 text-xs text-slate-400">
                                  申请时间：{formatDateTime(request.created_at)}
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => void handleApproveRequest(request.id)}
                                  disabled={busyKey !== null}
                                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-sm text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {approveBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                                  通过
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleRejectRequest(request.id)}
                                  disabled={busyKey !== null}
                                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {rejectBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                                  拒绝
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : null}

                <div>
                  <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="text-sm font-medium text-slate-700">
                      成员列表
                      <span className="ml-2 text-slate-400">{members.length} 人</span>
                    </div>
                    <div className="relative w-full max-w-sm">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={memberQuery}
                        onChange={(event) => setMemberQuery(event.target.value)}
                        placeholder="搜索成员昵称或邮箱"
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm text-slate-900 outline-none transition focus:border-slate-900"
                      />
                    </div>
                  </div>

                  {filteredMembers.length === 0 ? (
                    <div className="rounded-3xl bg-slate-50 px-6 py-12 text-center text-sm text-slate-500">
                      没有找到符合条件的成员
                    </div>
                  ) : (
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {filteredMembers.map((member) => (
                        <div key={member.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                          <div className="font-medium text-slate-900">
                            {member.user?.nickname || member.user?.email || member.user_id}
                          </div>
                          <div className="mt-1 text-xs text-slate-500">{member.user?.email || member.user_id}</div>
                          <div className="mt-3 text-xs text-slate-500">
                            身份：{member.user_id === selectedTeam.owner_user_id ? '创建者' : '成员'}
                          </div>
                          <div className="mt-1 text-xs text-slate-400">
                            加入时间：{formatDateTime(member.created_at)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>
      </div>

      <NameInputModal
        isOpen={showCreateDialog}
        title="创建空间"
        description="先输入空间名称，再创建空间。创建后你将自动成为该空间创建者。"
        label="空间名称"
        value={draftTeamName}
        placeholder="请输入空间名称"
        confirmText={busyKey === 'create-space' ? '创建中...' : '创建空间'}
        cancelText="取消"
        onChange={setDraftTeamName}
        onConfirm={() => void handleCreateTeam()}
        onCancel={() => {
          if (busyKey === 'create-space') {
            return;
          }
          setShowCreateDialog(false);
        }}
      />
    </div>
  );
}
