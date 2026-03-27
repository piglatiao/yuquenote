import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  ChevronRight,
  FolderKanban,
  Settings,
  Shield,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { authService } from '../lib/authApi';
import { teamService } from '../lib/databaseApi';
import type { Team, TeamMember, User } from '../lib/types';

type ManageSection = 'overview' | 'members' | 'team' | 'settings';

const navItems: Array<{
  key: ManageSection;
  label: string;
  icon: typeof FolderKanban;
}> = [
  { key: 'overview', label: '空间概览', icon: FolderKanban },
  { key: 'members', label: '成员与权限', icon: Users },
  { key: 'team', label: '团队管理', icon: Shield },
  { key: 'settings', label: '空间设置', icon: Settings },
];

function getInitials(name: string) {
  return name.trim().charAt(0).toUpperCase() || '?';
}

export default function SpaceManagementPage() {
  const navigate = useNavigate();
  const { teamId = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [joinRequests, setJoinRequests] = useState<TeamMember[]>([]);
  const [memberQuery, setMemberQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState('');

  const activeSection = (searchParams.get('section') as ManageSection) || 'overview';

  const owner = useMemo(() => {
    if (!team) return null;
    return members.find((member) => member.user_id === team.owner_user_id)?.user || null;
  }, [members, team]);

  const filteredMembers = useMemo(() => {
    const query = memberQuery.trim().toLowerCase();
    if (!query) return members;

    return members.filter((member) => {
      const nickname = member.user?.nickname?.toLowerCase() || '';
      const email = member.user?.email?.toLowerCase() || '';
      return nickname.includes(query) || email.includes(query);
    });
  }, [memberQuery, members]);

  const isOwner = !!team?.is_owner;

  const load = async () => {
    if (!teamId) return;

    setIsLoading(true);
    setError('');

    try {
      const user = await authService.init();
      setCurrentUser(user);

      const nextTeam = await teamService.getById(teamId);
      if (!nextTeam) {
        setTeam(null);
        setMembers([]);
        setJoinRequests([]);
        setError('空间不存在或你没有权限访问');
        return;
      }

      setTeam(nextTeam);

      const [memberRows, requestRows] = await Promise.all([
        teamService.getMembers(teamId),
        nextTeam.is_owner ? teamService.getJoinRequests(teamId) : Promise.resolve([]),
      ]);

      setMembers(memberRows);
      setJoinRequests(requestRows);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '空间管理数据加载失败');
      setTeam(null);
      setMembers([]);
      setJoinRequests([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [teamId]);

  const switchSection = (section: ManageSection) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('section', section);
      return next;
    });
  };

  const handleApprove = async (requestId: string) => {
    if (!team) return;

    setIsBusy(true);
    try {
      await teamService.approveJoinRequest(team.id, requestId);
      await load();
    } finally {
      setIsBusy(false);
    }
  };

  const handleReject = async (requestId: string) => {
    if (!team) return;

    setIsBusy(true);
    try {
      await teamService.rejectJoinRequest(team.id, requestId);
      await load();
    } finally {
      setIsBusy(false);
    }
  };

  const goBackToSpace = () => {
    if (!team) {
      navigate('/');
      return;
    }
    navigate(`/?team=${encodeURIComponent(team.id)}`);
  };

  const renderOverview = () => (
    <div className="space-y-8">
      <section>
        <div className="text-3xl font-semibold text-slate-900">空间概览</div>
        <div className="mt-2 text-sm text-slate-500">这里集中管理当前空间的成员、团队审批和空间设置。</div>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <button
          type="button"
          onClick={() => switchSection('members')}
          className="rounded-3xl border border-slate-200 bg-white p-6 text-left shadow-sm hover:border-emerald-200 hover:bg-emerald-50/30"
        >
          <div className="text-lg font-semibold text-slate-900">邀请成员</div>
          <div className="mt-2 text-sm text-slate-500">查看成员与权限，邀请或管理空间内协作者。</div>
        </button>
        <button
          type="button"
          onClick={() => switchSection('team')}
          className="rounded-3xl border border-slate-200 bg-white p-6 text-left shadow-sm hover:border-emerald-200 hover:bg-emerald-50/30"
        >
          <div className="text-lg font-semibold text-slate-900">管理团队</div>
          <div className="mt-2 text-sm text-slate-500">审批加入申请，维护当前空间关联的团队成员。</div>
        </button>
        <button
          type="button"
          onClick={goBackToSpace}
          className="rounded-3xl border border-slate-200 bg-white p-6 text-left shadow-sm hover:border-emerald-200 hover:bg-emerald-50/30"
        >
          <div className="text-lg font-semibold text-slate-900">返回空间</div>
          <div className="mt-2 text-sm text-slate-500">回到当前空间继续编辑文档、文件和分享内容。</div>
        </button>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-blue-400 text-white">
              <Users className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-2xl font-semibold text-slate-900">{team?.name}</div>
              <div className="mt-1 text-sm text-slate-500">标准版空间</div>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
            <div>
              <div className="text-3xl font-semibold text-slate-900">{members.length}</div>
              <div className="mt-1 text-sm text-slate-500">空间成员</div>
            </div>
            <div>
              <div className="text-3xl font-semibold text-slate-900">{joinRequests.length}</div>
              <div className="mt-1 text-sm text-slate-500">待审批</div>
            </div>
            <div>
              <div className="text-3xl font-semibold text-slate-900">{isOwner ? 1 : 0}</div>
              <div className="mt-1 text-sm text-slate-500">我管理的空间</div>
            </div>
            <div>
              <div className="text-3xl font-semibold text-slate-900">10</div>
              <div className="mt-1 text-sm text-slate-500">成员上限</div>
            </div>
          </div>
        </div>

        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-sm font-medium text-slate-500">管理员</div>
          <div className="mt-4 flex items-center gap-3">
            {owner?.avatar_url ? (
              <img src={owner.avatar_url} alt={owner.nickname} className="h-12 w-12 rounded-full object-cover" />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-200 font-semibold text-slate-700">
                {getInitials(owner?.nickname || team?.name || '')}
              </div>
            )}
            <div className="min-w-0">
              <div className="truncate text-lg font-semibold text-slate-900">{owner?.nickname || '当前空间管理员'}</div>
              <div className="truncate text-sm text-slate-500">{owner?.email || currentUser?.email || ''}</div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => switchSection('settings')}
            className="mt-6 inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            <Settings className="h-4 w-4" />
            查看空间设置
          </button>
        </div>
      </section>
    </div>
  );

  const renderJoinRequests = () => {
    if (!isOwner) return null;

    return (
      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="text-lg font-semibold text-slate-900">待审批申请</div>
        {joinRequests.length === 0 ? (
          <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
            当前没有待审批申请
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {joinRequests.map((request) => (
              <div
                key={request.id}
                className="flex flex-col gap-3 rounded-2xl border border-slate-200 px-4 py-4 lg:flex-row lg:items-center lg:justify-between"
              >
                <div>
                  <div className="font-medium text-slate-900">
                    {request.user?.nickname || request.user?.email || request.user_id}
                  </div>
                  <div className="mt-1 text-sm text-slate-500">{request.user?.email || request.user_id}</div>
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
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  >
                    <X className="h-4 w-4" />
                    拒绝
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    );
  };

  const renderMembers = () => (
    <div className="space-y-6">
      <section>
        <div className="text-3xl font-semibold text-slate-900">成员与权限</div>
        <div className="mt-2 text-sm text-slate-500">查看空间成员，处理加入申请，后续可继续扩展资源级授权。</div>
      </section>

      {renderJoinRequests()}

      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="text-lg font-semibold text-slate-900">当前成员</div>
          <input
            type="text"
            value={memberQuery}
            onChange={(event) => setMemberQuery(event.target.value)}
            placeholder="搜索成员昵称或邮箱"
            className="w-full max-w-sm rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-emerald-500"
          />
        </div>

        {filteredMembers.length === 0 ? (
          <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
            没有匹配的成员
          </div>
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filteredMembers.map((member) => (
              <div key={member.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <div className="font-medium text-slate-900">
                  {member.user?.nickname || member.user?.email || member.user_id}
                </div>
                <div className="mt-1 text-sm text-slate-500">{member.user?.email || member.user_id}</div>
                <div className="mt-3 text-xs text-slate-500">状态：{member.status === 'approved' ? '已通过' : member.status}</div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );

  const renderTeam = () => (
    <div className="space-y-6">
      <section>
        <div className="text-3xl font-semibold text-slate-900">团队管理</div>
        <div className="mt-2 text-sm text-slate-500">审批团队加入申请，并管理当前空间关联的团队成员。</div>
      </section>
      {renderJoinRequests()}
      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="text-lg font-semibold text-slate-900">团队摘要</div>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl bg-slate-50 px-4 py-4">
            <div className="text-sm text-slate-500">团队名称</div>
            <div className="mt-2 text-lg font-semibold text-slate-900">{team?.name}</div>
          </div>
          <div className="rounded-2xl bg-slate-50 px-4 py-4">
            <div className="text-sm text-slate-500">成员总数</div>
            <div className="mt-2 text-lg font-semibold text-slate-900">{members.length}</div>
          </div>
          <div className="rounded-2xl bg-slate-50 px-4 py-4">
            <div className="text-sm text-slate-500">待审批</div>
            <div className="mt-2 text-lg font-semibold text-slate-900">{joinRequests.length}</div>
          </div>
        </div>
      </section>
    </div>
  );

  const renderSettings = () => (
    <div className="space-y-6">
      <section>
        <div className="text-3xl font-semibold text-slate-900">空间设置</div>
        <div className="mt-2 text-sm text-slate-500">当前版本先展示核心信息，后续再继续补重命名等设置项。</div>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl bg-slate-50 px-4 py-4">
            <div className="text-sm text-slate-500">空间名称</div>
            <div className="mt-2 text-lg font-semibold text-slate-900">{team?.name}</div>
          </div>
          <div className="rounded-2xl bg-slate-50 px-4 py-4">
            <div className="text-sm text-slate-500">创建者</div>
            <div className="mt-2 text-lg font-semibold text-slate-900">
              {owner?.nickname || owner?.email || '当前空间管理员'}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={goBackToSpace}
          className="mt-6 inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
        >
          <ArrowLeft className="h-4 w-4" />
          返回当前空间
        </button>
      </section>
    </div>
  );

  const renderSection = () => {
    if (activeSection === 'members') return renderMembers();
    if (activeSection === 'team') return renderTeam();
    if (activeSection === 'settings') return renderSettings();
    return renderOverview();
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="flex min-h-screen">
        <aside className="w-[240px] shrink-0 border-r border-slate-200 bg-white px-4 py-5">
          <button
            type="button"
            onClick={goBackToSpace}
            className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800"
          >
            <ArrowLeft className="h-4 w-4" />
            返回空间
          </button>

          <div className="mt-8 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-blue-400 text-white">
              <Users className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-xl font-semibold text-slate-900">{team?.name || '空间管理'}</div>
              <div className="text-sm text-slate-500">空间管理中心</div>
            </div>
          </div>

          <nav className="mt-8 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeSection === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => switchSection(item.key)}
                  className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left text-sm transition ${
                    isActive ? 'bg-slate-100 font-medium text-slate-900' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </span>
                  <ChevronRight className="h-4 w-4 text-slate-400" />
                </button>
              );
            })}
          </nav>
        </aside>

        <main className="min-w-0 flex-1 px-8 py-8">
          {isLoading ? (
            <div className="rounded-[28px] border border-slate-200 bg-white px-6 py-20 text-center text-sm text-slate-500 shadow-sm">
              正在加载空间管理数据...
            </div>
          ) : error ? (
            <div className="rounded-[28px] border border-rose-200 bg-white px-6 py-20 text-center shadow-sm">
              <div className="text-lg font-semibold text-rose-600">{error}</div>
              <button
                type="button"
                onClick={() => void load()}
                className="mt-4 inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
              >
                重新加载
              </button>
            </div>
          ) : (
            renderSection()
          )}
        </main>
      </div>
    </div>
  );
}
