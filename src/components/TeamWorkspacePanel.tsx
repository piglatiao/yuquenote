import { useEffect, useMemo, useState } from 'react';
import { Check, Plus, Search, ShieldCheck, Users, X } from 'lucide-react';
import NameInputModal from './NameInputModal';
import { teamService } from '../lib/databaseApi';
import type { Team, TeamMember } from '../lib/types';

interface TeamWorkspacePanelProps {
  activeWorkspaceTeamId?: string | null;
  onEnterTeamSpace?: (team: Team) => void;
}

export default function TeamWorkspacePanel({
  activeWorkspaceTeamId = null,
  onEnterTeamSpace,
}: TeamWorkspacePanelProps) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [discoverableTeams, setDiscoverableTeams] = useState<Team[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [joinRequests, setJoinRequests] = useState<TeamMember[]>([]);
  const [memberQuery, setMemberQuery] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [draftTeamName, setDraftTeamName] = useState('');

  const selectedTeam = useMemo(
    () => teams.find((team) => team.id === selectedTeamId) || null,
    [selectedTeamId, teams],
  );

  const filteredMembers = useMemo(() => {
    const query = memberQuery.trim().toLowerCase();
    if (!query) return members;

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
      const [mine, discoverable] = await Promise.all([
        teamService.getMyTeams(),
        teamService.getDiscoverableTeams(),
      ]);

      setTeams(mine);
      setDiscoverableTeams(discoverable);
      setSelectedTeamId((current) => {
        if (current && mine.some((team) => team.id === current)) {
          return current;
        }
        return mine[0]?.id || '';
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '团队数据加载失败');
      setTeams([]);
      setDiscoverableTeams([]);
      setSelectedTeamId('');
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
      setError(loadError instanceof Error ? loadError.message : '团队详情加载失败');
      setMembers([]);
      setJoinRequests([]);
    }
  };

  useEffect(() => {
    void loadTeams();
  }, []);

  useEffect(() => {
    void loadSelectedTeam(selectedTeamId, !!selectedTeam?.is_owner);
  }, [selectedTeamId, selectedTeam?.is_owner]);

  const handleCreateTeam = async () => {
    const nextName = draftTeamName.trim();
    if (!nextName) return;

    setIsBusy(true);
    setError('');

    try {
      const created = await teamService.createTeam(nextName);
      if (!created) {
        setError('创建团队失败');
        return;
      }

      setDraftTeamName('');
      setShowCreateDialog(false);
      await loadTeams();
      setSelectedTeamId(created.id);
    } finally {
      setIsBusy(false);
    }
  };

  const handleJoinTeam = async (teamId: string) => {
    setIsBusy(true);
    setError('');

    try {
      const ok = await teamService.requestToJoin(teamId);
      if (!ok) {
        setError('提交加入申请失败');
        return;
      }

      await loadTeams();
    } finally {
      setIsBusy(false);
    }
  };

  const handleApprove = async (requestId: string) => {
    if (!selectedTeam) return;

    setIsBusy(true);
    setError('');

    try {
      const ok = await teamService.approveJoinRequest(selectedTeam.id, requestId);
      if (!ok) {
        setError('审批申请失败');
        return;
      }

      await loadSelectedTeam(selectedTeam.id, true);
    } finally {
      setIsBusy(false);
    }
  };

  const handleReject = async (requestId: string) => {
    if (!selectedTeam) return;

    setIsBusy(true);
    setError('');

    try {
      const ok = await teamService.rejectJoinRequest(selectedTeam.id, requestId);
      if (!ok) {
        setError('拒绝申请失败');
        return;
      }

      await loadSelectedTeam(selectedTeam.id, true);
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-slate-50">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-6">
        <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-2xl font-semibold text-slate-900">团队空间</div>
              <div className="mt-2 text-sm text-slate-500">
                在这里创建团队、申请加入团队，并由团队创建者审批成员。
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => {
                  setDraftTeamName('');
                  setShowCreateDialog(true);
                }}
                disabled={isBusy}
                className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-4 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
              >
                <Plus className="h-4 w-4" />
                创建团队
              </button>
              <button
                type="button"
                onClick={() => void loadTeams()}
                disabled={isBusy || isLoading}
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                刷新
              </button>
            </div>
          </div>
          {error && (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          )}
        </section>

        <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="space-y-6">
            <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2 text-sm font-medium text-slate-700">
                <ShieldCheck className="h-4 w-4 text-blue-600" />
                我的团队
              </div>

              {isLoading ? (
                <div className="rounded-2xl bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                  正在加载团队...
                </div>
              ) : teams.length === 0 ? (
                <div className="rounded-2xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                  你还没有团队，先创建一个。
                </div>
              ) : (
                <div className="space-y-3">
                  {teams.map((team) => (
                    <button
                      key={team.id}
                      type="button"
                      onClick={() => setSelectedTeamId(team.id)}
                      className={`w-full rounded-2xl border px-4 py-4 text-left transition ${
                        selectedTeamId === team.id
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="truncate font-medium text-slate-900">{team.name}</div>
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">
                          {team.is_owner ? '创建者' : '成员'}
                        </span>
                      </div>
                      <div className="mt-2 text-xs text-slate-500">
                        {team.membership_status === 'approved' || team.is_owner
                          ? '已加入'
                          : team.membership_status || '未加入'}
                      </div>
                      {activeWorkspaceTeamId === team.id && (
                        <div className="mt-2 text-xs font-medium text-blue-600">当前已进入该团队空间</div>
                      )}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedTeamId(team.id);
                          }}
                          className="rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-700 hover:bg-slate-100"
                        >
                          管理团队
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            onEnterTeamSpace?.(team);
                          }}
                          className="rounded-xl bg-blue-600 px-3 py-2 text-xs text-white hover:bg-blue-700"
                        >
                          进入团队空间
                        </button>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2 text-sm font-medium text-slate-700">
                <Users className="h-4 w-4 text-emerald-600" />
                可申请加入的团队
              </div>

              {isLoading ? (
                <div className="rounded-2xl bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                  正在加载可加入团队...
                </div>
              ) : discoverableTeams.length === 0 ? (
                <div className="rounded-2xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                  暂无可申请团队
                </div>
              ) : (
                <div className="space-y-3">
                  {discoverableTeams.map((team) => (
                    <div key={team.id} className="rounded-2xl border border-slate-200 px-4 py-4">
                      <div className="font-medium text-slate-900">{team.name}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        {team.membership_status === 'pending'
                          ? '申请中'
                          : team.membership_status === 'approved'
                            ? '已加入'
                            : team.membership_status === 'rejected'
                              ? '已拒绝，可重新申请'
                              : '尚未申请'}
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleJoinTeam(team.id)}
                        disabled={isBusy || team.membership_status === 'pending' || team.membership_status === 'approved'}
                        className="mt-3 inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      >
                        申请加入
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </aside>

          <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            {!selectedTeam ? (
              <div className="rounded-3xl bg-slate-50 px-6 py-16 text-center text-sm text-slate-500">
                请选择一个团队查看详情。
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex flex-col gap-3 border-b border-slate-200 pb-5 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="text-2xl font-semibold text-slate-900">{selectedTeam.name}</div>
                    <div className="mt-2 text-sm text-slate-500">
                      {selectedTeam.is_owner
                        ? '你是该团队创建者，可以审批申请并管理资源授权。'
                        : '你已加入该团队，可访问已明确授权给你的团队资源。'}
                    </div>
                  </div>
                  <div className="rounded-full bg-slate-100 px-3 py-2 text-xs text-slate-600">
                    {selectedTeam.is_owner ? '创建者视角' : '成员视角'}
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => onEnterTeamSpace?.(selectedTeam)}
                    className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-4 py-3 text-sm font-medium text-white hover:bg-blue-700"
                  >
                    <Users className="h-4 w-4" />
                    进入团队空间
                  </button>
                </div>

                {selectedTeam.is_owner && (
                  <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                    <div className="mb-3 text-sm font-medium text-slate-700">待审批申请</div>
                    {joinRequests.length === 0 ? (
                      <div className="rounded-2xl bg-white px-4 py-6 text-center text-sm text-slate-500">
                        当前没有待审批申请
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {joinRequests.map((request) => (
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
                            </div>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => void handleApprove(request.id)}
                                disabled={isBusy}
                                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-sm text-white hover:bg-emerald-700 disabled:opacity-60"
                              >
                                <Check className="h-4 w-4" />
                                通过
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleReject(request.id)}
                                disabled={isBusy}
                                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-60"
                              >
                                <X className="h-4 w-4" />
                                拒绝
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="text-sm font-medium text-slate-700">已加入成员</div>
                    <div className="relative w-full max-w-sm">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={memberQuery}
                        onChange={(event) => setMemberQuery(event.target.value)}
                        placeholder="搜索成员昵称或邮箱"
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm outline-none focus:border-blue-500"
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
                            状态：{member.status === 'approved' ? '已通过' : member.status}
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
        title="创建团队"
        description="先输入团队名称，再创建团队。创建后你将自动成为团队创建者。"
        label="团队名称"
        value={draftTeamName}
        placeholder="请输入团队名称"
        confirmText={isBusy ? '创建中...' : '创建团队'}
        cancelText="取消"
        onChange={setDraftTeamName}
        onConfirm={() => void handleCreateTeam()}
        onCancel={() => {
          if (isBusy) return;
          setShowCreateDialog(false);
        }}
      />
    </div>
  );
}
