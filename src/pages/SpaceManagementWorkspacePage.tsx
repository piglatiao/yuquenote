import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  CalendarDays,
  Check,
  ChevronRight,
  Edit3,
  FileText,
  FolderKanban,
  FolderOpen,
  ImagePlus,
  Link2,
  Loader2,
  Megaphone,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Upload,
  UserMinus,
  UserPlus,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import ActionDialog from '../components/ActionDialog';
import { apiRequest } from '../lib/api';
import { authService } from '../lib/authApi';
import { teamService } from '../lib/databaseApi';
import { documentService } from '../lib/documentsApi';
import { notify } from '../lib/notify';
import type { Document, Team, TeamInvitation, TeamMember, User } from '../lib/types';

type ManageSection = 'overview' | 'members' | 'settings';

interface TeamDocumentStats {
  documentCount: number;
  knowledgeBaseCount: number;
}

const legacyNavItems: Array<{
  key: ManageSection;
  label: string;
  icon: LucideIcon;
}> = [
  { key: 'overview', label: '空间总览', icon: FolderKanban },
  { key: 'members', label: '人员与权限', icon: Users },
  { key: 'settings', label: '空间设置', icon: Settings },
];

const DEFAULT_MEMBER_LIMIT = 10;
const EMPTY_TEAM_STATS: TeamDocumentStats = {
  documentCount: 0,
  knowledgeBaseCount: 0,
};

function formatDate(dateLike: string) {
  const date = new Date(dateLike);
  if (Number.isNaN(date.getTime())) {
    return '--';
  }

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(date)
    .replace(/\//g, '-');
}

function formatSnapshotDate() {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(new Date())
    .replace(/\//g, '-');
}

function toDateTimeLocalValue(dateLike: string) {
  const date = new Date(dateLike);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function SpaceAvatar({
  team,
  avatarUrlOverride,
  className,
}: {
  team: Team | null;
  avatarUrlOverride?: string | null;
  className?: string;
}) {
  const avatarUrl = avatarUrlOverride ?? team?.avatar_url ?? null;
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={team?.name || '空间头像'}
        className={className || 'h-14 w-14 rounded-2xl object-cover'}
      />
    );
  }

  return (
    <div
      className={`flex items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-blue-400 text-white ${className || 'h-14 w-14'}`}
    >
      <Users className="h-6 w-6" />
    </div>
  );
}

function LegacyOverviewActionButton({
  icon: Icon,
  label,
  onClick,
  disabled = false,
}: {
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition ${
        disabled
          ? 'cursor-not-allowed text-slate-300'
          : 'text-slate-700 hover:bg-slate-50'
      }`}
      title={disabled ? '该功能暂未接入' : label}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function LegacyUsageMetricCard({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: number | string;
}) {
  return (
    <div className="rounded-2xl bg-slate-50 px-5 py-5">
      <div className="flex items-center gap-2 text-slate-500">
        <Icon className="h-4 w-4" />
        <span className="text-sm">{label}</span>
      </div>
      <div className="mt-4 text-3xl font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function LegacySpaceManagementWorkspacePage() {
  const navigate = useNavigate();
  const { teamId = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [joinRequests, setJoinRequests] = useState<TeamMember[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [memberQuery, setMemberQuery] = useState('');
  const [settingsName, setSettingsName] = useState('');
  const [settingsAvatarUrl, setSettingsAvatarUrl] = useState('');
  const [settingsCreatedAt, setSettingsCreatedAt] = useState('');
  const [settingsMemberLimit, setSettingsMemberLimit] = useState(String(DEFAULT_MEMBER_LIMIT));
  const [settingsFeedback, setSettingsFeedback] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [error, setError] = useState('');
  const announcementTitle = '';
  const setAnnouncementTitle = (_value: string) => undefined;
  const announcementContent = '';
  const setAnnouncementContent = (_value: string) => undefined;
  const isSendingAnnouncement = false;
  const inviteQuery = '';
  const setInviteQuery = (_value: string) => undefined;
  const inviteCandidates: User[] = [];
  const inviteFeedback = '';
  const setInviteFeedback = (_value: string) => undefined;
  const emailInvitations: TeamInvitation[] = [];
  const codeInvitation: TeamInvitation | null = null;
  const busyInviteCandidateId: string | null = null;
  const busyInvitationId: string | null = null;
  const isGeneratingInviteCode = false;
  const isSearchingInviteCandidates = false;
  const rejectedMembers: TeamMember[] = [];
  const handleSendAnnouncement = async () => undefined;
  const handleGenerateInviteCode = async () => undefined;
  const handleCopyInviteCode = async () => undefined;
  const handleInviteCandidate = async (_user: User) => undefined;
  const handleRevokeInvitation = async (_invitationId: string) => undefined;
  const handleRemoveMember = (_member: TeamMember) => undefined;

  const rawSection = searchParams.get('section');
  const activeSection: ManageSection =
    rawSection === 'members' || rawSection === 'settings' ? rawSection : 'overview';

  const owner = useMemo(() => {
    if (!team) return null;
    return members.find((member) => member.user_id === team.owner_user_id)?.user || null;
  }, [members, team]);

  const approvedMembers = useMemo(
    () => members.filter((member) => member.status === 'approved'),
    [members],
  );

  const departedMembers = useMemo(
    () => members.filter((member) => member.status === 'rejected'),
    [members],
  );

  const filteredMembers = useMemo(() => {
    const query = memberQuery.trim().toLowerCase();
    if (!query) return approvedMembers;

    return approvedMembers.filter((member) => {
      const nickname = member.user?.nickname?.toLowerCase() || '';
      const email = member.user?.email?.toLowerCase() || '';
      return nickname.includes(query) || email.includes(query);
    });
  }, [approvedMembers, memberQuery]);

  const teamDocumentStats = useMemo(() => {
    const statsMap = new Map<string, TeamDocumentStats>();

    documents.forEach((doc) => {
      if (!doc.team_id || doc.is_deleted) return;

      const current = statsMap.get(doc.team_id) || { ...EMPTY_TEAM_STATS };
      if (doc.icon === 'folder' && doc.parent_id === null) {
        current.knowledgeBaseCount += 1;
      } else if (doc.icon !== 'folder') {
        current.documentCount += 1;
      }
      statsMap.set(doc.team_id, current);
    });

    return statsMap;
  }, [documents]);

  const currentTeamStats = team ? teamDocumentStats.get(team.id) || EMPTY_TEAM_STATS : EMPTY_TEAM_STATS;
  const isOwner = !!team?.is_owner;
  const currentMemberLimit = Number(team?.member_limit ?? DEFAULT_MEMBER_LIMIT);

  const load = async () => {
    if (!teamId) {
      setError('缺少空间标识');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const [user, nextTeam, allDocuments] = await Promise.all([
        authService.init(),
        teamService.getById(teamId),
        documentService.getAll().catch(() => []),
      ]);

      setCurrentUser(user);
      setDocuments(allDocuments);

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
      setDocuments([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [teamId]);

  useEffect(() => {
    if (!team) return;

    setSettingsName(team.name);
    setSettingsAvatarUrl(team.avatar_url ?? '');
    setSettingsCreatedAt(toDateTimeLocalValue(team.created_at));
    setSettingsMemberLimit(String(team.member_limit ?? DEFAULT_MEMBER_LIMIT));
    setSettingsFeedback('');
  }, [team?.id, team?.name, team?.avatar_url, team?.created_at, team?.member_limit]);

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
      const approved = await teamService.approveJoinRequest(team.id, requestId);
      if (!approved) {
        setSettingsFeedback('审批失败，可能已达到成员上限。');
        return;
      }
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

  const handleAvatarUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setSettingsFeedback('请选择图片文件作为空间头像。');
      return;
    }

    setIsUploadingAvatar(true);
    try {
      const params = new URLSearchParams({
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
      });

      const upload = await apiRequest<{ url: string; path: string }>(
        `/files/upload?${params.toString()}`,
        {
          method: 'POST',
          body: file,
        },
      );

      setSettingsAvatarUrl(upload.url);
      setSettingsFeedback('空间头像已上传，记得保存设置。');
    } catch (uploadError) {
      setSettingsFeedback(uploadError instanceof Error ? uploadError.message : '空间头像上传失败');
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!team) return;

    const nextName = settingsName.trim();
    if (!nextName) {
      setSettingsFeedback('空间名称不能为空。');
      return;
    }

    const nextMemberLimit = Number(settingsMemberLimit);
    if (!Number.isInteger(nextMemberLimit) || nextMemberLimit < 1) {
      setSettingsFeedback('成员上限必须是大于 0 的整数。');
      return;
    }

    if (!settingsCreatedAt) {
      setSettingsFeedback('请选择有效的创建时间。');
      return;
    }

    const createdAt = new Date(settingsCreatedAt);
    if (Number.isNaN(createdAt.getTime())) {
      setSettingsFeedback('创建时间格式不正确。');
      return;
    }

    setIsBusy(true);
    setSettingsFeedback('');

    try {
      const updated = await teamService.updateTeam(team.id, {
        name: nextName,
        avatar_url: settingsAvatarUrl.trim() || null,
        created_at: createdAt.toISOString(),
        member_limit: nextMemberLimit,
      });

      if (!updated) {
        setSettingsFeedback('空间设置保存失败。');
        return;
      }

      setTeam((current) => (current ? { ...current, ...updated } : updated));
      setSettingsFeedback('空间设置已保存。');
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

  const renderJoinRequests = () => {
    if (!isOwner) return null;

    return (
      <section className="app-card-hover app-section-enter rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-lg font-semibold text-slate-900">待审批申请</div>
            <div className="mt-1 text-sm text-slate-500">当前空间的加入申请会显示在这里。</div>
          </div>
          <div className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700">
            {joinRequests.length} 条待处理
          </div>
        </div>

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
                  <div className="mt-1 text-sm text-slate-500">
                    {request.user?.email || request.user_id}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void handleApprove(request.id)}
                    disabled={isBusy}
                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-sm text-white transition hover:bg-emerald-700 disabled:opacity-60"
                  >
                    <Check className="h-4 w-4" />
                    通过
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleReject(request.id)}
                    disabled={isBusy}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
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

  const renderOverview = () => (
    <div className="space-y-6">
      <section>
        <div className="text-3xl font-semibold text-slate-900">使用情况</div>
        <div className="mt-2 text-sm text-slate-500">查看当前空间的成员状态、邀请入口和基础使用数据。</div>
      </section>

      <section className="app-card-hover app-section-enter rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <SpaceAvatar team={team} />
            <div className="min-w-0">
              <div className="truncate text-2xl font-semibold text-slate-900">{team?.name || '当前空间'}</div>
              <div className="mt-1 text-sm text-slate-500">享受标准版空间权益</div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => switchSection('settings')}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-700 transition hover:bg-slate-50"
          >
            <Edit3 className="h-4 w-4" />
            编辑信息
          </button>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div>
            <div className="text-3xl font-semibold text-slate-900">{approvedMembers.length}</div>
            <div className="mt-1 text-sm text-slate-500">空间成员</div>
          </div>
          <div>
            <div className="text-3xl font-semibold text-slate-900">0</div>
            <div className="mt-1 text-sm text-slate-500">外部联系人</div>
          </div>
          <div>
            <div className="text-3xl font-semibold text-slate-900">{departedMembers.length}</div>
            <div className="mt-1 text-sm text-slate-500">离职人员</div>
          </div>
          <div>
            <div className="text-3xl font-semibold text-slate-900">1</div>
            <div className="mt-1 text-sm text-slate-500">空间管理员</div>
          </div>
        </div>

        <div className="mt-8 grid gap-3 border-t border-slate-100 pt-5 sm:grid-cols-2 xl:grid-cols-4">
          <LegacyOverviewActionButton icon={UserPlus} label="添加成员" onClick={() => switchSection('members')} />
          <LegacyOverviewActionButton icon={Upload} label="批量导入" disabled />
          <LegacyOverviewActionButton icon={Link2} label="链接邀请" onClick={() => switchSection('members')} />
          <LegacyOverviewActionButton icon={RefreshCw} label="同步通讯录" disabled />
        </div>
      </section>

      <section className="app-card-hover app-section-enter rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-lg font-semibold text-slate-900">使用数据</div>
            <div className="mt-2 text-sm text-slate-500">
              {formatSnapshotDate()}（每日更新，“—” 表示暂无数据）
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-slate-300" />
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <LegacyUsageMetricCard icon={FileText} label="文档总数" value={currentTeamStats.documentCount} />
          <LegacyUsageMetricCard icon={FolderOpen} label="知识库总数" value={currentTeamStats.knowledgeBaseCount} />
          <LegacyUsageMetricCard icon={Users} label="成员上限" value={currentMemberLimit} />
        </div>
      </section>
    </div>
  );

  const renderMembers = () => (
    <div className="space-y-6">
      <section>
        <div className="text-3xl font-semibold text-slate-900">人员与权限</div>
        <div className="mt-2 text-sm text-slate-500">查看成员、搜索成员，并处理当前空间的加入申请。</div>
      </section>

      {renderJoinRequests()}

      <section className="app-card-hover app-section-enter rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="text-lg font-semibold text-slate-900">空间成员</div>
          <div className="relative w-full max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={memberQuery}
              onChange={(event) => setMemberQuery(event.target.value)}
              placeholder="搜索成员昵称或邮箱"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm outline-none transition focus:border-emerald-500"
            />
          </div>
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
                <div className="mt-3 text-xs text-slate-500">
                  状态：{member.status === 'approved' ? '已通过' : member.status}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );

  const renderLegacyManagedMembersSummary = () => (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-3">
        <SpaceManageMetricCard
          icon={Users}
          label="空间成员"
          value={approvedMembers.length}
          detail="已经加入并可访问当前空间的成员数量"
        />
        <SpaceManageMetricCard
          icon={UserPlus}
          label="待审批"
          value={joinRequests.length}
          detail={isOwner ? '由空间创建者处理加入申请' : '仅空间创建者可以审批'}
        />
        <SpaceManageMetricCard
          icon={ShieldCheck}
          label="成员上限"
          value={currentMemberLimit}
          detail={`当前上限不能低于已加入成员数 ${approvedMembers.length}`}
        />
      </section>

      {renderJoinRequests()}

      {isOwner ? (
        <section className="app-card-hover app-section-enter rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-600">
              <Megaphone className="h-5 w-5" />
            </div>
            <div>
              <div className="text-lg font-semibold text-slate-900">发送空间通知</div>
              <div className="mt-1 text-sm text-slate-500">
                创建者可以向当前空间成员发送一条自定义通知，成员会在消息面板中收到提醒。
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-4">
            <label className="grid gap-2">
              <span className="text-sm font-medium text-slate-700">通知标题</span>
              <input
                type="text"
                value={announcementTitle}
                onChange={(event) => setAnnouncementTitle(event.target.value)}
                placeholder="例如：本周资料整理安排"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500"
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-medium text-slate-700">通知内容</span>
              <textarea
                value={announcementContent}
                onChange={(event) => setAnnouncementContent(event.target.value)}
                placeholder="输入要发送给空间成员的通知内容"
                rows={4}
                className="w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500"
              />
            </label>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => void handleSendAnnouncement()}
                disabled={isSendingAnnouncement}
                className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2.5 text-sm text-white transition hover:bg-slate-800 disabled:opacity-60"
              >
                {isSendingAnnouncement ? <Loader2 className="h-4 w-4 animate-spin" /> : <Megaphone className="h-4 w-4" />}
                发送通知
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {isOwner ? (
        <section className="app-card-hover app-section-enter rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <div className="text-lg font-semibold text-slate-900">邀请成员</div>
              <div className="mt-1 text-sm text-slate-500">
                可以通过邀请码邀请，也可以通过邮箱或昵称搜索账号后直接发出邀请。
              </div>
            </div>
            <SpaceManageStatusTag label={`待处理邀请 ${emailInvitations.length} 条`} />
          </div>

          {inviteFeedback ? (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              {inviteFeedback}
            </div>
          ) : null}

          <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
            <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <Link2 className="h-4 w-4" />
                邀请码
              </div>
              <div className="mt-4 rounded-2xl bg-white px-4 py-4">
                <div className="text-xs uppercase tracking-[0.24em] text-slate-400">CODE</div>
                <div className="mt-2 break-all font-mono text-2xl font-semibold text-slate-900">
                  {codeInvitation?.code || '未生成'}
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  {codeInvitation
                    ? `生成时间：${formatManageDateTime(codeInvitation.created_at)}`
                    : '生成后可复制给成员直接加入当前空间。'}
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void handleGenerateInviteCode()}
                  disabled={isGeneratingInviteCode}
                  className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2.5 text-sm text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isGeneratingInviteCode ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  {codeInvitation ? '重新生成' : '生成邀请码'}
                </button>
                <button
                  type="button"
                  onClick={() => void handleCopyInviteCode()}
                  disabled={!codeInvitation?.code}
                  className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2.5 text-sm text-slate-700 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Link2 className="h-4 w-4" />
                  复制
                </button>
              </div>
            </div>

            <div className="space-y-5">
              <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
                <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <UserPlus className="h-4 w-4" />
                  搜索并邀请成员
                </div>
                <label className="relative mt-4 block">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={inviteQuery}
                    onChange={(event) => {
                      setInviteQuery(event.target.value);
                      setInviteFeedback('');
                    }}
                    placeholder="输入邮箱或昵称搜索用户"
                    className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm text-slate-900 outline-none transition focus:border-emerald-500"
                  />
                </label>

                <div className="mt-4 space-y-3">
                  {isSearchingInviteCandidates ? (
                    <div className="rounded-2xl bg-white px-4 py-5 text-sm text-slate-500">
                      正在搜索可邀请成员...
                    </div>
                  ) : inviteQuery.trim() && inviteCandidates.length === 0 ? (
                    <div className="rounded-2xl bg-white px-4 py-5 text-sm text-slate-500">
                      没有找到可邀请的用户，或该用户已在当前空间中。
                    </div>
                  ) : (
                    inviteCandidates.map((candidate) => {
                      const isBusy = busyInviteCandidateId === candidate.id;
                      return (
                        <div
                          key={candidate.id}
                          className="flex flex-col gap-3 rounded-2xl bg-white px-4 py-4 lg:flex-row lg:items-center lg:justify-between"
                        >
                          <div className="min-w-0">
                            <div className="truncate text-base font-medium text-slate-900">
                              {candidate.nickname || candidate.email}
                            </div>
                            <div className="mt-1 truncate text-sm text-slate-500">{candidate.email}</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => void handleInviteCandidate(candidate)}
                            disabled={busyInviteCandidateId !== null}
                            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                            发送邀请
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
                <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <Users className="h-4 w-4" />
                  待处理邀请
                </div>
                {emailInvitations.length === 0 ? (
                  <div className="mt-4 rounded-2xl bg-white px-4 py-6 text-sm text-slate-500">
                    当前没有待处理的定向邀请。
                  </div>
                ) : (
                  <div className="mt-4 space-y-3">
                    {emailInvitations.map((invitation) => {
                      const isBusy = busyInvitationId === invitation.id;
                      const displayName =
                        invitation.invited_user?.nickname ||
                        invitation.invited_user?.email ||
                        invitation.invited_email ||
                        invitation.invited_user_id ||
                        '未识别用户';

                      return (
                        <div
                          key={invitation.id}
                          className="flex flex-col gap-3 rounded-2xl bg-white px-4 py-4 lg:flex-row lg:items-center lg:justify-between"
                        >
                          <div className="min-w-0">
                            <div className="truncate text-base font-medium text-slate-900">{displayName}</div>
                            <div className="mt-1 truncate text-sm text-slate-500">
                              {invitation.invited_user?.email || invitation.invited_email || invitation.invited_user_id}
                            </div>
                            <div className="mt-2 text-xs text-slate-400">
                              邀请时间：{formatManageDateTime(invitation.created_at)}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => void handleRevokeInvitation(invitation.id)}
                            disabled={busyInvitationId !== null}
                            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 px-4 py-2.5 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                            撤销邀请
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <section className="app-card-hover app-section-enter rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-lg font-semibold text-slate-900">成员列表</div>
            <div className="mt-1 text-sm text-slate-500">查看当前空间成员，并按昵称或邮箱搜索。</div>
          </div>

          <label className="relative block w-full max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={memberQuery}
              onChange={(event) => setMemberQuery(event.target.value)}
              placeholder="搜索成员昵称或邮箱"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm text-slate-900 outline-none transition focus:border-emerald-500"
            />
          </label>
        </div>

        {filteredMembers.length === 0 ? (
          <div className="mt-4 rounded-[24px] bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
            没有匹配到成员。
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {filteredMembers.map((member) => {
              const isSpaceOwner = member.user_id === team?.owner_user_id;
              return (
                <div
                  key={member.id}
                  className="flex flex-col gap-3 rounded-[24px] border border-slate-200 px-4 py-4 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div className="min-w-0">
                    <div className="truncate text-base font-medium text-slate-900">
                      {member.user?.nickname || member.user?.email || member.user_id}
                    </div>
                    <div className="mt-1 truncate text-sm text-slate-500">
                      {member.user?.email || member.user_id}
                    </div>
                    <div className="mt-2 text-xs text-slate-400">加入时间：{formatManageDateTime(member.created_at)}</div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <SpaceManageStatusTag label={isSpaceOwner ? '空间创建者' : '空间成员'} />
                    <SpaceManageStatusTag label="已加入" />
                    {isOwner && !isSpaceOwner ? (
                      <button
                        type="button"
                        onClick={() => handleRemoveMember(member)}
                        className="inline-flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600 transition hover:bg-rose-100"
                      >
                        <UserMinus className="h-4 w-4" />
                        移出
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {rejectedMembers.length > 0 ? (
          <div className="mt-5 text-sm text-slate-500">已处理的拒绝申请：{rejectedMembers.length} 条</div>
        ) : null}
      </section>
    </div>
  );

  const renderLegacyManagedMembersA = () => (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-3">
        <SpaceManageMetricCard
          icon={Users}
          label="空间成员"
          value={approvedMembers.length}
          detail="已加入并可访问当前空间的成员数量"
        />
        <SpaceManageMetricCard
          icon={UserPlus}
          label="待审批"
          value={joinRequests.length}
          detail={isOwner ? '由空间创建者审批加入申请' : '仅空间创建者可审批'}
        />
        <SpaceManageMetricCard
          icon={ShieldCheck}
          label="成员上限"
          value={currentMemberLimit}
          detail={`当前上限不能低于已加入成员数 ${approvedMembers.length}`}
        />
      </section>

      {renderJoinRequests()}

      {isOwner ? (
        <section className="app-card-hover app-section-enter rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-600">
              <Megaphone className="h-5 w-5" />
            </div>
            <div>
              <div className="text-lg font-semibold text-slate-900">发送空间通知</div>
              <div className="mt-1 text-sm text-slate-500">
                创建者可以向当前空间成员发送一条自定义通知，成员会在消息面板中收到提醒。
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-4">
            <label className="grid gap-2">
              <span className="text-sm font-medium text-slate-700">通知标题</span>
              <input
                type="text"
                value={announcementTitle}
                onChange={(event) => setAnnouncementTitle(event.target.value)}
                placeholder="例如：本周资料整理安排"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500"
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-medium text-slate-700">通知内容</span>
              <textarea
                value={announcementContent}
                onChange={(event) => setAnnouncementContent(event.target.value)}
                placeholder="输入要发送给空间成员的通知内容"
                rows={4}
                className="w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500"
              />
            </label>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => void handleSendAnnouncement()}
                disabled={isSendingAnnouncement}
                className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2.5 text-sm text-white transition hover:bg-slate-800 disabled:opacity-60"
              >
                {isSendingAnnouncement ? <Loader2 className="h-4 w-4 animate-spin" /> : <Megaphone className="h-4 w-4" />}
                发送通知
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {isOwner ? (
        <section className="app-card-hover app-section-enter rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <div className="text-lg font-semibold text-slate-900">邀请成员</div>
              <div className="mt-1 text-sm text-slate-500">
                可以通过邀请码邀请，也可以通过邮箱或昵称搜索账号后直接发出邀请。
              </div>
            </div>
            <SpaceManageStatusTag label={`待处理邀请 ${emailInvitations.length} 条`} />
          </div>

          {inviteFeedback ? (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              {inviteFeedback}
            </div>
          ) : null}

          <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
            <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <Link2 className="h-4 w-4" />
                邀请码
              </div>
              <div className="mt-4 rounded-2xl bg-white px-4 py-4">
                <div className="text-xs uppercase tracking-[0.24em] text-slate-400">CODE</div>
                <div className="mt-2 break-all font-mono text-2xl font-semibold text-slate-900">
                  {codeInvitation?.code || '未生成'}
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  {codeInvitation
                    ? `生成时间：${formatManageDateTime(codeInvitation.created_at)}`
                    : '生成后可复制给成员直接加入当前空间'}
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void handleGenerateInviteCode()}
                  disabled={isGeneratingInviteCode}
                  className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2.5 text-sm text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isGeneratingInviteCode ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  {codeInvitation ? '重新生成' : '生成邀请码'}
                </button>
                <button
                  type="button"
                  onClick={() => void handleCopyInviteCode()}
                  disabled={!codeInvitation?.code}
                  className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2.5 text-sm text-slate-700 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Link2 className="h-4 w-4" />
                  复制
                </button>
              </div>
            </div>

            <div className="space-y-5">
              <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
                <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <UserPlus className="h-4 w-4" />
                  搜索并邀请成员
                </div>
                <label className="relative mt-4 block">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={inviteQuery}
                    onChange={(event) => {
                      setInviteQuery(event.target.value);
                      setInviteFeedback('');
                    }}
                    placeholder="输入邮箱或昵称搜索用户"
                    className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm text-slate-900 outline-none transition focus:border-emerald-500"
                  />
                </label>

                <div className="mt-4 space-y-3">
                  {isSearchingInviteCandidates ? (
                    <div className="rounded-2xl bg-white px-4 py-5 text-sm text-slate-500">正在搜索可邀请成员...</div>
                  ) : inviteQuery.trim() && inviteCandidates.length === 0 ? (
                    <div className="rounded-2xl bg-white px-4 py-5 text-sm text-slate-500">
                      没有找到可邀请的用户，或该用户已在当前空间中。
                    </div>
                  ) : (
                    inviteCandidates.map((candidate) => {
                      const isBusy = busyInviteCandidateId === candidate.id;
                      return (
                        <div
                          key={candidate.id}
                          className="flex flex-col gap-3 rounded-2xl bg-white px-4 py-4 lg:flex-row lg:items-center lg:justify-between"
                        >
                          <div className="min-w-0">
                            <div className="truncate text-base font-medium text-slate-900">
                              {candidate.nickname || candidate.email}
                            </div>
                            <div className="mt-1 truncate text-sm text-slate-500">{candidate.email}</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => void handleInviteCandidate(candidate)}
                            disabled={busyInviteCandidateId !== null}
                            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                            发送邀请
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
                <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <Users className="h-4 w-4" />
                  待处理邀请
                </div>
                {emailInvitations.length === 0 ? (
                  <div className="mt-4 rounded-2xl bg-white px-4 py-6 text-sm text-slate-500">
                    当前没有待处理的定向邀请。
                  </div>
                ) : (
                  <div className="mt-4 space-y-3">
                    {emailInvitations.map((invitation) => {
                      const isBusy = busyInvitationId === invitation.id;
                      const displayName =
                        invitation.invited_user?.nickname ||
                        invitation.invited_user?.email ||
                        invitation.invited_email ||
                        invitation.invited_user_id ||
                        '未识别用户';

                      return (
                        <div
                          key={invitation.id}
                          className="flex flex-col gap-3 rounded-2xl bg-white px-4 py-4 lg:flex-row lg:items-center lg:justify-between"
                        >
                          <div className="min-w-0">
                            <div className="truncate text-base font-medium text-slate-900">{displayName}</div>
                            <div className="mt-1 truncate text-sm text-slate-500">
                              {invitation.invited_user?.email || invitation.invited_email || invitation.invited_user_id}
                            </div>
                            <div className="mt-2 text-xs text-slate-400">
                              邀请时间：{formatManageDateTime(invitation.created_at)}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => void handleRevokeInvitation(invitation.id)}
                            disabled={busyInvitationId !== null}
                            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 px-4 py-2.5 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                            撤销邀请
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <section className="app-card-hover app-section-enter rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-lg font-semibold text-slate-900">成员列表</div>
            <div className="mt-1 text-sm text-slate-500">查看当前空间成员，并按昵称或邮箱搜索。</div>
          </div>

          <label className="relative block w-full max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={memberQuery}
              onChange={(event) => setMemberQuery(event.target.value)}
              placeholder="搜索成员昵称或邮箱"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm text-slate-900 outline-none transition focus:border-emerald-500"
            />
          </label>
        </div>

        {filteredMembers.length === 0 ? (
          <div className="mt-4 rounded-[24px] bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
            没有匹配到成员。
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {filteredMembers.map((member) => {
              const isSpaceOwner = member.user_id === team?.owner_user_id;
              return (
                <div
                  key={member.id}
                  className="flex flex-col gap-3 rounded-[24px] border border-slate-200 px-4 py-4 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div className="min-w-0">
                    <div className="truncate text-base font-medium text-slate-900">
                      {member.user?.nickname || member.user?.email || member.user_id}
                    </div>
                    <div className="mt-1 truncate text-sm text-slate-500">{member.user?.email || member.user_id}</div>
                    <div className="mt-2 text-xs text-slate-400">加入时间：{formatManageDateTime(member.created_at)}</div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <SpaceManageStatusTag label={isSpaceOwner ? '空间所有者' : '空间成员'} />
                    <SpaceManageStatusTag label="已加入" />
                    {isOwner && !isSpaceOwner ? (
                      <button
                        type="button"
                        onClick={() => handleRemoveMember(member)}
                        className="inline-flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600 transition hover:bg-rose-100"
                      >
                        <UserMinus className="h-4 w-4" />
                        移出
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {rejectedMembers.length > 0 ? (
          <div className="mt-5 text-sm text-slate-500">已处理的拒绝申请：{rejectedMembers.length} 条</div>
        ) : null}
      </section>
    </div>
  );

  const renderSettings = () => (
    <div className="space-y-6">
      <section>
        <div className="text-3xl font-semibold text-slate-900">空间设置</div>
        <div className="mt-2 text-sm text-slate-500">可以修改空间名称、创建时间、空间头像和成员上限。</div>
      </section>

      <section className="app-card-hover app-section-enter rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        {!isOwner && (
          <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            当前只有空间管理员可以修改这些设置。
          </div>
        )}

        <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
          <div className="rounded-[24px] bg-slate-50 p-5">
            <div className="text-sm font-medium text-slate-500">空间头像</div>
            <div className="mt-4 flex justify-center">
              <SpaceAvatar
                team={team}
                avatarUrlOverride={settingsAvatarUrl || null}
                className="h-24 w-24 rounded-[28px] object-cover"
              />
            </div>

            <label className="mt-5 inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 transition hover:bg-slate-50">
              <ImagePlus className="h-4 w-4" />
              {isUploadingAvatar ? '上传中...' : '上传空间头像'}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={!isOwner || isUploadingAvatar}
                onChange={(event) => void handleAvatarUpload(event)}
              />
            </label>

            <button
              type="button"
              onClick={() => setSettingsAvatarUrl('')}
              disabled={!isOwner || isUploadingAvatar}
              className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              清空头像
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">空间名称</label>
              <input
                type="text"
                value={settingsName}
                onChange={(event) => setSettingsName(event.target.value)}
                disabled={!isOwner}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-50"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">创建时间</label>
              <input
                type="datetime-local"
                value={settingsCreatedAt}
                onChange={(event) => setSettingsCreatedAt(event.target.value)}
                disabled={!isOwner}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-50"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">成员上限</label>
              <input
                type="number"
                min={1}
                step={1}
                value={settingsMemberLimit}
                onChange={(event) => setSettingsMemberLimit(event.target.value)}
                disabled={!isOwner}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-50"
              />
              <div className="mt-2 text-xs text-slate-500">
                当前已通过成员 {approvedMembers.length} 人，不能设置得比这个更小。
              </div>
            </div>

            {settingsFeedback && (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                {settingsFeedback}
              </div>
            )}

            <div className="flex flex-wrap gap-3 pt-2">
              <button
                type="button"
                onClick={() => void handleSaveSettings()}
                disabled={!isOwner || isBusy || isUploadingAvatar}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Settings className="h-4 w-4" />
                {isBusy ? '保存中...' : '保存设置'}
              </button>

              <button
                type="button"
                onClick={goBackToSpace}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-700 transition hover:bg-slate-50"
              >
                <ArrowLeft className="h-4 w-4" />
                返回当前空间
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );

  const renderLegacyManagedMembersDetailed = () => (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-3">
        <SpaceManageMetricCard
          icon={Users}
          label="空间成员"
          value={approvedMembers.length}
          detail="已经加入并可访问当前空间的成员数量"
        />
        <SpaceManageMetricCard
          icon={UserPlus}
          label="待审批"
          value={joinRequests.length}
          detail={isOwner ? '由空间创建者处理加入申请' : '仅空间创建者可以审批'}
        />
        <SpaceManageMetricCard
          icon={ShieldCheck}
          label="成员上限"
          value={currentMemberLimit}
          detail={`当前上限不能低于已加入成员数 ${approvedMembers.length}`}
        />
      </section>

      {renderJoinRequests()}

      {isOwner ? (
        <section className="app-card-hover app-section-enter rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-600">
              <Megaphone className="h-5 w-5" />
            </div>
            <div>
              <div className="text-lg font-semibold text-slate-900">发送空间通知</div>
              <div className="mt-1 text-sm text-slate-500">
                创建者可以向当前空间成员发送一条自定义通知，成员会在消息面板中收到提醒。
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-4">
            <label className="grid gap-2">
              <span className="text-sm font-medium text-slate-700">通知标题</span>
              <input
                type="text"
                value={announcementTitle}
                onChange={(event) => setAnnouncementTitle(event.target.value)}
                placeholder="例如：本周资料整理安排"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500"
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-medium text-slate-700">通知内容</span>
              <textarea
                value={announcementContent}
                onChange={(event) => setAnnouncementContent(event.target.value)}
                placeholder="输入要发送给空间成员的通知内容"
                rows={4}
                className="w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500"
              />
            </label>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => void handleSendAnnouncement()}
                disabled={isSendingAnnouncement}
                className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2.5 text-sm text-white transition hover:bg-slate-800 disabled:opacity-60"
              >
                {isSendingAnnouncement ? <Loader2 className="h-4 w-4 animate-spin" /> : <Megaphone className="h-4 w-4" />}
                发送通知
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {isOwner ? (
        <section className="app-card-hover app-section-enter rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <div className="text-lg font-semibold text-slate-900">邀请成员</div>
              <div className="mt-1 text-sm text-slate-500">
                可以通过邀请码邀请，也可以通过邮箱或昵称搜索账号后直接发出邀请。
              </div>
            </div>
            <SpaceManageStatusTag label={`待处理邀请 ${emailInvitations.length} 条`} />
          </div>

          {inviteFeedback ? (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              {inviteFeedback}
            </div>
          ) : null}

          <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
            <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <Link2 className="h-4 w-4" />
                邀请码
              </div>
              <div className="mt-4 rounded-2xl bg-white px-4 py-4">
                <div className="text-xs uppercase tracking-[0.24em] text-slate-400">CODE</div>
                <div className="mt-2 break-all font-mono text-2xl font-semibold text-slate-900">
                  {codeInvitation?.code || '未生成'}
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  {codeInvitation
                    ? `生成时间：${formatManageDateTime(codeInvitation.created_at)}`
                    : '生成后可复制给成员直接加入当前空间。'}
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void handleGenerateInviteCode()}
                  disabled={isGeneratingInviteCode}
                  className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2.5 text-sm text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isGeneratingInviteCode ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  {codeInvitation ? '重新生成' : '生成邀请码'}
                </button>
                <button
                  type="button"
                  onClick={() => void handleCopyInviteCode()}
                  disabled={!codeInvitation?.code}
                  className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2.5 text-sm text-slate-700 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Link2 className="h-4 w-4" />
                  复制
                </button>
              </div>
            </div>

            <div className="space-y-5">
              <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
                <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <UserPlus className="h-4 w-4" />
                  搜索并邀请成员
                </div>
                <label className="relative mt-4 block">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={inviteQuery}
                    onChange={(event) => {
                      setInviteQuery(event.target.value);
                      setInviteFeedback('');
                    }}
                    placeholder="输入邮箱或昵称搜索用户"
                    className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm text-slate-900 outline-none transition focus:border-emerald-500"
                  />
                </label>

                <div className="mt-4 space-y-3">
                  {isSearchingInviteCandidates ? (
                    <div className="rounded-2xl bg-white px-4 py-5 text-sm text-slate-500">
                      正在搜索可邀请成员...
                    </div>
                  ) : inviteQuery.trim() && inviteCandidates.length === 0 ? (
                    <div className="rounded-2xl bg-white px-4 py-5 text-sm text-slate-500">
                      没有找到可邀请的用户，或该用户已在当前空间中。
                    </div>
                  ) : (
                    inviteCandidates.map((candidate) => {
                      const isBusy = busyInviteCandidateId === candidate.id;
                      return (
                        <div
                          key={candidate.id}
                          className="flex flex-col gap-3 rounded-2xl bg-white px-4 py-4 lg:flex-row lg:items-center lg:justify-between"
                        >
                          <div className="min-w-0">
                            <div className="truncate text-base font-medium text-slate-900">
                              {candidate.nickname || candidate.email}
                            </div>
                            <div className="mt-1 truncate text-sm text-slate-500">{candidate.email}</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => void handleInviteCandidate(candidate)}
                            disabled={busyInviteCandidateId !== null}
                            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                            发送邀请
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
                <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <Users className="h-4 w-4" />
                  待处理邀请
                </div>
                {emailInvitations.length === 0 ? (
                  <div className="mt-4 rounded-2xl bg-white px-4 py-6 text-sm text-slate-500">
                    当前没有待处理的定向邀请。
                  </div>
                ) : (
                  <div className="mt-4 space-y-3">
                    {emailInvitations.map((invitation) => {
                      const isBusy = busyInvitationId === invitation.id;
                      const displayName =
                        invitation.invited_user?.nickname ||
                        invitation.invited_user?.email ||
                        invitation.invited_email ||
                        invitation.invited_user_id ||
                        '未识别用户';

                      return (
                        <div
                          key={invitation.id}
                          className="flex flex-col gap-3 rounded-2xl bg-white px-4 py-4 lg:flex-row lg:items-center lg:justify-between"
                        >
                          <div className="min-w-0">
                            <div className="truncate text-base font-medium text-slate-900">{displayName}</div>
                            <div className="mt-1 truncate text-sm text-slate-500">
                              {invitation.invited_user?.email || invitation.invited_email || invitation.invited_user_id}
                            </div>
                            <div className="mt-2 text-xs text-slate-400">
                              邀请时间：{formatManageDateTime(invitation.created_at)}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => void handleRevokeInvitation(invitation.id)}
                            disabled={busyInvitationId !== null}
                            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 px-4 py-2.5 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                            撤销邀请
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <section className="app-card-hover app-section-enter rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-lg font-semibold text-slate-900">成员列表</div>
            <div className="mt-1 text-sm text-slate-500">查看当前空间成员，并按昵称或邮箱搜索。</div>
          </div>

          <label className="relative block w-full max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={memberQuery}
              onChange={(event) => setMemberQuery(event.target.value)}
              placeholder="搜索成员昵称或邮箱"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm text-slate-900 outline-none transition focus:border-emerald-500"
            />
          </label>
        </div>

        {filteredMembers.length === 0 ? (
          <div className="mt-4 rounded-[24px] bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
            没有匹配到成员。
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {filteredMembers.map((member) => {
              const isSpaceOwner = member.user_id === team?.owner_user_id;
              return (
                <div
                  key={member.id}
                  className="flex flex-col gap-3 rounded-[24px] border border-slate-200 px-4 py-4 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div className="min-w-0">
                    <div className="truncate text-base font-medium text-slate-900">
                      {member.user?.nickname || member.user?.email || member.user_id}
                    </div>
                    <div className="mt-1 truncate text-sm text-slate-500">
                      {member.user?.email || member.user_id}
                    </div>
                    <div className="mt-2 text-xs text-slate-400">加入时间：{formatManageDateTime(member.created_at)}</div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <SpaceManageStatusTag label={isSpaceOwner ? '空间创建者' : '空间成员'} />
                    <SpaceManageStatusTag label="已加入" />
                    {isOwner && !isSpaceOwner ? (
                      <button
                        type="button"
                        onClick={() => handleRemoveMember(member)}
                        className="inline-flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600 transition hover:bg-rose-100"
                      >
                        <UserMinus className="h-4 w-4" />
                        移出
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {rejectedMembers.length > 0 ? (
          <div className="mt-5 text-sm text-slate-500">已处理的拒绝申请：{rejectedMembers.length} 条</div>
        ) : null}
      </section>
    </div>
  );

  const renderLegacyManagedMembersB = () => (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-3">
        <SpaceManageMetricCard
          icon={Users}
          label="空间成员"
          value={approvedMembers.length}
          detail="已加入并可访问当前空间的成员数量"
        />
        <SpaceManageMetricCard
          icon={UserPlus}
          label="待审批"
          value={joinRequests.length}
          detail={isOwner ? '由空间创建者审批加入申请' : '仅空间创建者可审批'}
        />
        <SpaceManageMetricCard
          icon={ShieldCheck}
          label="成员上限"
          value={currentMemberLimit}
          detail={`当前上限不能低于已加入成员数 ${approvedMembers.length}`}
        />
      </section>

      {renderJoinRequests()}

      {isOwner ? (
        <section className="app-card-hover app-section-enter rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-600">
              <Megaphone className="h-5 w-5" />
            </div>
            <div>
              <div className="text-lg font-semibold text-slate-900">发送空间通知</div>
              <div className="mt-1 text-sm text-slate-500">
                创建者可以向当前空间成员发送一条自定义通知，成员会在消息面板中收到提醒。
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-4">
            <label className="grid gap-2">
              <span className="text-sm font-medium text-slate-700">通知标题</span>
              <input
                type="text"
                value={announcementTitle}
                onChange={(event) => setAnnouncementTitle(event.target.value)}
                placeholder="例如：本周资料整理安排"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500"
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-medium text-slate-700">通知内容</span>
              <textarea
                value={announcementContent}
                onChange={(event) => setAnnouncementContent(event.target.value)}
                placeholder="输入要发送给空间成员的通知内容"
                rows={4}
                className="w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500"
              />
            </label>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => void handleSendAnnouncement()}
                disabled={isSendingAnnouncement}
                className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2.5 text-sm text-white transition hover:bg-slate-800 disabled:opacity-60"
              >
                {isSendingAnnouncement ? <Loader2 className="h-4 w-4 animate-spin" /> : <Megaphone className="h-4 w-4" />}
                发送通知
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {isOwner ? (
        <section className="app-card-hover app-section-enter rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <div className="text-lg font-semibold text-slate-900">邀请成员</div>
              <div className="mt-1 text-sm text-slate-500">
                可以通过邀请码邀请，也可以通过邮箱或昵称搜索账号后直接发出邀请。
              </div>
            </div>
            <SpaceManageStatusTag label={`待处理邀请 ${emailInvitations.length} 条`} />
          </div>

          {inviteFeedback ? (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              {inviteFeedback}
            </div>
          ) : null}

          <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
            <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <Link2 className="h-4 w-4" />
                邀请码
              </div>
              <div className="mt-4 rounded-2xl bg-white px-4 py-4">
                <div className="text-xs uppercase tracking-[0.24em] text-slate-400">CODE</div>
                <div className="mt-2 break-all font-mono text-2xl font-semibold text-slate-900">
                  {codeInvitation?.code || '未生成'}
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  {codeInvitation
                    ? `生成时间：${formatManageDateTime(codeInvitation.created_at)}`
                    : '生成后可复制给成员直接加入当前空间'}
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void handleGenerateInviteCode()}
                  disabled={isGeneratingInviteCode}
                  className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2.5 text-sm text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isGeneratingInviteCode ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  {codeInvitation ? '重新生成' : '生成邀请码'}
                </button>
                <button
                  type="button"
                  onClick={() => void handleCopyInviteCode()}
                  disabled={!codeInvitation?.code}
                  className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2.5 text-sm text-slate-700 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Link2 className="h-4 w-4" />
                  复制
                </button>
              </div>
            </div>

            <div className="space-y-5">
              <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
                <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <UserPlus className="h-4 w-4" />
                  搜索并邀请成员
                </div>
                <label className="relative mt-4 block">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={inviteQuery}
                    onChange={(event) => {
                      setInviteQuery(event.target.value);
                      setInviteFeedback('');
                    }}
                    placeholder="输入邮箱或昵称搜索用户"
                    className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm text-slate-900 outline-none transition focus:border-emerald-500"
                  />
                </label>

                <div className="mt-4 space-y-3">
                  {isSearchingInviteCandidates ? (
                    <div className="rounded-2xl bg-white px-4 py-5 text-sm text-slate-500">正在搜索可邀请成员...</div>
                  ) : inviteQuery.trim() && inviteCandidates.length === 0 ? (
                    <div className="rounded-2xl bg-white px-4 py-5 text-sm text-slate-500">
                      没有找到可邀请的用户，或该用户已在当前空间中。
                    </div>
                  ) : (
                    inviteCandidates.map((candidate) => {
                      const isBusy = busyInviteCandidateId === candidate.id;
                      return (
                        <div
                          key={candidate.id}
                          className="flex flex-col gap-3 rounded-2xl bg-white px-4 py-4 lg:flex-row lg:items-center lg:justify-between"
                        >
                          <div className="min-w-0">
                            <div className="truncate text-base font-medium text-slate-900">
                              {candidate.nickname || candidate.email}
                            </div>
                            <div className="mt-1 truncate text-sm text-slate-500">{candidate.email}</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => void handleInviteCandidate(candidate)}
                            disabled={busyInviteCandidateId !== null}
                            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                            发送邀请
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
                <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <Users className="h-4 w-4" />
                  待处理邀请
                </div>
                {emailInvitations.length === 0 ? (
                  <div className="mt-4 rounded-2xl bg-white px-4 py-6 text-sm text-slate-500">
                    当前没有待处理的定向邀请。
                  </div>
                ) : (
                  <div className="mt-4 space-y-3">
                    {emailInvitations.map((invitation) => {
                      const isBusy = busyInvitationId === invitation.id;
                      const displayName =
                        invitation.invited_user?.nickname ||
                        invitation.invited_user?.email ||
                        invitation.invited_email ||
                        invitation.invited_user_id ||
                        '未识别用户';

                      return (
                        <div
                          key={invitation.id}
                          className="flex flex-col gap-3 rounded-2xl bg-white px-4 py-4 lg:flex-row lg:items-center lg:justify-between"
                        >
                          <div className="min-w-0">
                            <div className="truncate text-base font-medium text-slate-900">{displayName}</div>
                            <div className="mt-1 truncate text-sm text-slate-500">
                              {invitation.invited_user?.email || invitation.invited_email || invitation.invited_user_id}
                            </div>
                            <div className="mt-2 text-xs text-slate-400">
                              邀请时间：{formatManageDateTime(invitation.created_at)}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => void handleRevokeInvitation(invitation.id)}
                            disabled={busyInvitationId !== null}
                            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 px-4 py-2.5 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                            撤销邀请
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <section className="app-card-hover app-section-enter rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-lg font-semibold text-slate-900">成员列表</div>
            <div className="mt-1 text-sm text-slate-500">查看当前空间成员，并按昵称或邮箱搜索。</div>
          </div>

          <label className="relative block w-full max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={memberQuery}
              onChange={(event) => setMemberQuery(event.target.value)}
              placeholder="搜索成员昵称或邮箱"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm text-slate-900 outline-none transition focus:border-emerald-500"
            />
          </label>
        </div>

        {filteredMembers.length === 0 ? (
          <div className="mt-4 rounded-[24px] bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
            没有匹配到成员。
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {filteredMembers.map((member) => {
              const isSpaceOwner = member.user_id === team?.owner_user_id;
              return (
                <div
                  key={member.id}
                  className="flex flex-col gap-3 rounded-[24px] border border-slate-200 px-4 py-4 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div className="min-w-0">
                    <div className="truncate text-base font-medium text-slate-900">
                      {member.user?.nickname || member.user?.email || member.user_id}
                    </div>
                    <div className="mt-1 truncate text-sm text-slate-500">{member.user?.email || member.user_id}</div>
                    <div className="mt-2 text-xs text-slate-400">加入时间：{formatManageDateTime(member.created_at)}</div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <SpaceManageStatusTag label={isSpaceOwner ? '空间所有者' : '空间成员'} />
                    <SpaceManageStatusTag label="已加入" />
                    {isOwner && !isSpaceOwner ? (
                      <button
                        type="button"
                        onClick={() => handleRemoveMember(member)}
                        className="inline-flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600 transition hover:bg-rose-100"
                      >
                        <UserMinus className="h-4 w-4" />
                        移出
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {rejectedMembers.length > 0 ? (
          <div className="mt-5 text-sm text-slate-500">已处理的拒绝申请：{rejectedMembers.length} 条</div>
        ) : null}
      </section>
    </div>
  );

  const renderSection = () => {
    if (activeSection === 'members') return renderMembers();
    return activeSection === 'settings' ? renderSettings() : renderOverview();
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="flex min-h-screen">
        <aside className="w-[240px] shrink-0 border-r border-slate-200 bg-white px-4 py-5">
          <button
            type="button"
            onClick={goBackToSpace}
            className="inline-flex items-center gap-2 text-sm text-slate-500 transition hover:text-slate-800"
          >
            <ArrowLeft className="h-4 w-4" />
            返回空间
          </button>

          <div className="mt-8 flex items-center gap-3">
            <SpaceAvatar team={team} className="h-12 w-12 rounded-2xl object-cover" />
            <div className="min-w-0">
              <div className="truncate text-xl font-semibold text-slate-900">{team?.name || '空间管理'}</div>
              <div className="text-sm text-slate-500">空间管理中心</div>
            </div>
          </div>

          <nav className="mt-8 space-y-1">
            {legacyNavItems.map((item) => {
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
                className="mt-4 inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2.5 text-sm text-slate-700 transition hover:bg-slate-50"
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

function formatManageDateTime(dateLike: string) {
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
    hour12: false,
  })
    .format(date)
    .replace(/\//g, '-');
}

const spaceManagementNavItems: Array<{
  key: ManageSection;
  label: string;
  icon: LucideIcon;
}> = [
  { key: 'overview', label: '空间总览', icon: FolderKanban },
  { key: 'members', label: '人员与权限', icon: Users },
  { key: 'settings', label: '空间设置', icon: Settings },
];

function SpaceManageSectionTab({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm transition ${
        active
          ? 'bg-slate-900 text-white shadow-sm'
          : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function SpaceManageMetricCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  detail?: string;
}) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <div className="mt-3 text-3xl font-semibold text-slate-900">{value}</div>
      {detail ? <div className="mt-2 text-sm text-slate-500">{detail}</div> : null}
    </div>
  );
}

function SpaceManageInfoItem({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[22px] bg-slate-50 px-4 py-4">
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <div className="mt-2 text-base font-medium text-slate-900">{value}</div>
    </div>
  );
}

function SpaceManageStatusTag({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
      {label}
    </span>
  );
}

export default function SpaceManagementWorkspacePage() {
  const navigate = useNavigate();
  const { teamId = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();

  const [team, setTeam] = useState<Team | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [joinRequests, setJoinRequests] = useState<TeamMember[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [memberQuery, setMemberQuery] = useState('');
  const [memberFeedback, setMemberFeedback] = useState('');
  const [invitations, setInvitations] = useState<TeamInvitation[]>([]);
  const [inviteQuery, setInviteQuery] = useState('');
  const [inviteCandidates, setInviteCandidates] = useState<User[]>([]);
  const [inviteFeedback, setInviteFeedback] = useState('');
  const [settingsName, setSettingsName] = useState('');
  const [settingsAvatarUrl, setSettingsAvatarUrl] = useState('');
  const [settingsCreatedAt, setSettingsCreatedAt] = useState('');
  const [settingsMemberLimit, setSettingsMemberLimit] = useState(String(DEFAULT_MEMBER_LIMIT));
  const [settingsFeedback, setSettingsFeedback] = useState('');
  const [announcementTitle, setAnnouncementTitle] = useState('');
  const [announcementContent, setAnnouncementContent] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isSendingAnnouncement, setIsSendingAnnouncement] = useState(false);
  const [busyRequestId, setBusyRequestId] = useState<string | null>(null);
  const [busyInvitationId, setBusyInvitationId] = useState<string | null>(null);
  const [busyInviteCandidateId, setBusyInviteCandidateId] = useState<string | null>(null);
  const [isGeneratingInviteCode, setIsGeneratingInviteCode] = useState(false);
  const [isSearchingInviteCandidates, setIsSearchingInviteCandidates] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    message: string;
    tone?: 'default' | 'danger';
    confirmText?: string;
    onConfirm: () => void | Promise<void>;
  } | null>(null);
  const [isConfirmingDialog, setIsConfirmingDialog] = useState(false);
  const [error, setError] = useState('');

  const renderManagedMembers = () => (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-3">
        <SpaceManageMetricCard
          icon={Users}
          label="空间成员"
          value={approvedMembers.length}
          detail="已加入并可访问当前空间的成员数量"
        />
        <SpaceManageMetricCard
          icon={UserPlus}
          label="待审批"
          value={joinRequests.length}
          detail={isOwner ? '由空间创建者审批加入申请' : '仅空间创建者可审批'}
        />
        <SpaceManageMetricCard
          icon={ShieldCheck}
          label="成员上限"
          value={currentMemberLimit}
          detail={`当前上限不能低于已加入成员数 ${approvedMembers.length}`}
        />
      </section>

      {renderJoinRequests()}

      {isOwner ? (
        <section className="app-card-hover app-section-enter rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-600">
              <Megaphone className="h-5 w-5" />
            </div>
            <div>
              <div className="text-lg font-semibold text-slate-900">发送空间通知</div>
              <div className="mt-1 text-sm text-slate-500">
                创建者可以向当前空间成员发送一条自定义通知，成员会在消息面板中收到提醒。
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-4">
            <label className="grid gap-2">
              <span className="text-sm font-medium text-slate-700">通知标题</span>
              <input
                type="text"
                value={announcementTitle}
                onChange={(event) => setAnnouncementTitle(event.target.value)}
                placeholder="例如：本周资料整理安排"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500"
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-medium text-slate-700">通知内容</span>
              <textarea
                value={announcementContent}
                onChange={(event) => setAnnouncementContent(event.target.value)}
                placeholder="输入要发送给空间成员的通知内容"
                rows={4}
                className="w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500"
              />
            </label>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => void handleSendAnnouncement()}
                disabled={isSendingAnnouncement}
                className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2.5 text-sm text-white transition hover:bg-slate-800 disabled:opacity-60"
              >
                {isSendingAnnouncement ? <Loader2 className="h-4 w-4 animate-spin" /> : <Megaphone className="h-4 w-4" />}
                发送通知
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {isOwner ? (
        <section className="app-card-hover app-section-enter rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <div className="text-lg font-semibold text-slate-900">邀请成员</div>
              <div className="mt-1 text-sm text-slate-500">
                可以通过邀请码邀请，也可以通过邮箱或昵称搜索账号后直接发出邀请。
              </div>
            </div>
            <SpaceManageStatusTag label={`待处理邀请 ${emailInvitations.length} 条`} />
          </div>

          {inviteFeedback ? (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              {inviteFeedback}
            </div>
          ) : null}

          <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
            <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <Link2 className="h-4 w-4" />
                邀请码
              </div>
              <div className="mt-4 rounded-2xl bg-white px-4 py-4">
                <div className="text-xs uppercase tracking-[0.24em] text-slate-400">CODE</div>
                <div className="mt-2 break-all font-mono text-2xl font-semibold text-slate-900">
                  {codeInvitation?.code || '未生成'}
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  {codeInvitation
                    ? `生成时间：${formatManageDateTime(codeInvitation.created_at)}`
                    : '生成后可复制给成员直接加入当前空间'}
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void handleGenerateInviteCode()}
                  disabled={isGeneratingInviteCode}
                  className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2.5 text-sm text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isGeneratingInviteCode ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  {codeInvitation ? '重新生成' : '生成邀请码'}
                </button>
                <button
                  type="button"
                  onClick={() => void handleCopyInviteCode()}
                  disabled={!codeInvitation?.code}
                  className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2.5 text-sm text-slate-700 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Link2 className="h-4 w-4" />
                  复制
                </button>
              </div>
            </div>

            <div className="space-y-5">
              <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
                <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <UserPlus className="h-4 w-4" />
                  搜索并邀请成员
                </div>
                <label className="relative mt-4 block">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={inviteQuery}
                    onChange={(event) => {
                      setInviteQuery(event.target.value);
                      setInviteFeedback('');
                    }}
                    placeholder="输入邮箱或昵称搜索用户"
                    className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm text-slate-900 outline-none transition focus:border-emerald-500"
                  />
                </label>

                <div className="mt-4 space-y-3">
                  {isSearchingInviteCandidates ? (
                    <div className="rounded-2xl bg-white px-4 py-5 text-sm text-slate-500">正在搜索可邀请成员...</div>
                  ) : inviteQuery.trim() && inviteCandidates.length === 0 ? (
                    <div className="rounded-2xl bg-white px-4 py-5 text-sm text-slate-500">
                      没有找到可邀请的用户，或该用户已在当前空间中。
                    </div>
                  ) : (
                    inviteCandidates.map((candidate) => {
                      const isBusy = busyInviteCandidateId === candidate.id;
                      return (
                        <div
                          key={candidate.id}
                          className="flex flex-col gap-3 rounded-2xl bg-white px-4 py-4 lg:flex-row lg:items-center lg:justify-between"
                        >
                          <div className="min-w-0">
                            <div className="truncate text-base font-medium text-slate-900">
                              {candidate.nickname || candidate.email}
                            </div>
                            <div className="mt-1 truncate text-sm text-slate-500">{candidate.email}</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => void handleInviteCandidate(candidate)}
                            disabled={busyInviteCandidateId !== null}
                            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                            发送邀请
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
                <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <Users className="h-4 w-4" />
                  待处理邀请
                </div>
                {emailInvitations.length === 0 ? (
                  <div className="mt-4 rounded-2xl bg-white px-4 py-6 text-sm text-slate-500">
                    当前没有待处理的定向邀请。
                  </div>
                ) : (
                  <div className="mt-4 space-y-3">
                    {emailInvitations.map((invitation) => {
                      const isBusy = busyInvitationId === invitation.id;
                      const displayName =
                        invitation.invited_user?.nickname ||
                        invitation.invited_user?.email ||
                        invitation.invited_email ||
                        invitation.invited_user_id ||
                        '未识别用户';

                      return (
                        <div
                          key={invitation.id}
                          className="flex flex-col gap-3 rounded-2xl bg-white px-4 py-4 lg:flex-row lg:items-center lg:justify-between"
                        >
                          <div className="min-w-0">
                            <div className="truncate text-base font-medium text-slate-900">{displayName}</div>
                            <div className="mt-1 truncate text-sm text-slate-500">
                              {invitation.invited_user?.email || invitation.invited_email || invitation.invited_user_id}
                            </div>
                            <div className="mt-2 text-xs text-slate-400">
                              邀请时间：{formatManageDateTime(invitation.created_at)}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => void handleRevokeInvitation(invitation.id)}
                            disabled={busyInvitationId !== null}
                            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 px-4 py-2.5 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                            撤销邀请
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <section className="app-card-hover app-section-enter rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-lg font-semibold text-slate-900">成员列表</div>
            <div className="mt-1 text-sm text-slate-500">查看当前空间成员，并按昵称或邮箱搜索。</div>
          </div>

          <label className="relative block w-full max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={memberQuery}
              onChange={(event) => setMemberQuery(event.target.value)}
              placeholder="搜索成员昵称或邮箱"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm text-slate-900 outline-none transition focus:border-emerald-500"
            />
          </label>
        </div>

        {filteredMembers.length === 0 ? (
          <div className="mt-4 rounded-[24px] bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
            没有匹配到成员。
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {filteredMembers.map((member) => {
              const isSpaceOwner = member.user_id === team?.owner_user_id;
              return (
                <div
                  key={member.id}
                  className="flex flex-col gap-3 rounded-[24px] border border-slate-200 px-4 py-4 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div className="min-w-0">
                    <div className="truncate text-base font-medium text-slate-900">
                      {member.user?.nickname || member.user?.email || member.user_id}
                    </div>
                    <div className="mt-1 truncate text-sm text-slate-500">{member.user?.email || member.user_id}</div>
                    <div className="mt-2 text-xs text-slate-400">加入时间：{formatManageDateTime(member.created_at)}</div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <SpaceManageStatusTag label={isSpaceOwner ? '空间所有者' : '空间成员'} />
                    <SpaceManageStatusTag label="已加入" />
                    {isOwner && !isSpaceOwner ? (
                      <button
                        type="button"
                        onClick={() => handleRemoveMember(member)}
                        className="inline-flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600 transition hover:bg-rose-100"
                      >
                        <UserMinus className="h-4 w-4" />
                        移出
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {rejectedMembers.length > 0 ? (
          <div className="mt-5 text-sm text-slate-500">已处理的拒绝申请：{rejectedMembers.length} 条</div>
        ) : null}
      </section>
    </div>
  );

  const rawSection = searchParams.get('section');
  const requestedSection: ManageSection =
    rawSection === 'members' || rawSection === 'settings' ? rawSection : 'overview';

  const approvedMembers = useMemo(
    () => members.filter((member) => member.status === 'approved'),
    [members],
  );

  const rejectedMembers = useMemo(
    () => members.filter((member) => member.status === 'rejected'),
    [members],
  );

  const codeInvitation = useMemo(
    () => invitations.find((invitation) => invitation.invite_type === 'code' && invitation.status === 'pending') || null,
    [invitations],
  );

  const emailInvitations = useMemo(
    () => invitations.filter((invitation) => invitation.invite_type === 'email' && invitation.status === 'pending'),
    [invitations],
  );

  const owner = useMemo(() => {
    if (!team) return null;
    return (
      approvedMembers.find((member) => member.user_id === team.owner_user_id)?.user ||
      members.find((member) => member.user_id === team.owner_user_id)?.user ||
      null
    );
  }, [approvedMembers, members, team]);

  const filteredMembers = useMemo(() => {
    const query = memberQuery.trim().toLowerCase();
    if (!query) {
      return approvedMembers;
    }

    return approvedMembers.filter((member) => {
      const nickname = member.user?.nickname?.toLowerCase() || '';
      const email = member.user?.email?.toLowerCase() || '';
      return nickname.includes(query) || email.includes(query);
    });
  }, [approvedMembers, memberQuery]);

  const currentTeamStats = useMemo(() => {
    if (!team) {
      return EMPTY_TEAM_STATS;
    }

    return documents.reduce<TeamDocumentStats>((stats, doc) => {
      if (doc.team_id !== team.id || doc.is_deleted) {
        return stats;
      }

      if (doc.icon === 'folder' && doc.parent_id === null) {
        stats.knowledgeBaseCount += 1;
        return stats;
      }

      if (doc.icon !== 'folder') {
        stats.documentCount += 1;
      }

      return stats;
    }, { ...EMPTY_TEAM_STATS });
  }, [documents, team]);

  const isOwner = !!team?.is_owner;
  const activeSection: ManageSection = isOwner ? requestedSection : 'overview';
  const visibleNavItems = isOwner
    ? spaceManagementNavItems
    : spaceManagementNavItems.filter((item) => item.key === 'overview');
  const currentMemberLimit = Number(team?.member_limit ?? DEFAULT_MEMBER_LIMIT);
  const usedSeatPercent =
    currentMemberLimit > 0
      ? Math.min(100, Math.round((approvedMembers.length / currentMemberLimit) * 100))
      : 0;

  const syncSettingsForm = (nextTeam: Team) => {
    setSettingsName(nextTeam.name);
    setSettingsAvatarUrl(nextTeam.avatar_url ?? '');
    setSettingsCreatedAt(toDateTimeLocalValue(nextTeam.created_at));
    setSettingsMemberLimit(String(nextTeam.member_limit ?? DEFAULT_MEMBER_LIMIT));
  };

  const load = async (mode: 'initial' | 'refresh' = 'initial') => {
    if (!teamId) {
      setError('缺少空间标识');
      setIsLoading(false);
      return;
    }

    if (mode === 'initial') {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }

    setError('');

    try {
      const nextTeam = await teamService.getById(teamId);

      if (!nextTeam) {
        setTeam(null);
        setMembers([]);
        setJoinRequests([]);
        setInvitations([]);
        setDocuments([]);
        setError('空间不存在，或你没有权限访问这个空间。');
        return;
      }

      const [memberRows, requestRows, invitationRows, allDocuments] = await Promise.all([
        teamService.getMembers(teamId),
        nextTeam.is_owner ? teamService.getJoinRequests(teamId) : Promise.resolve([]),
        nextTeam.is_owner ? teamService.getInvitations(teamId) : Promise.resolve([]),
        documentService.getAll().catch(() => []),
      ]);

      setTeam(nextTeam);
      setMembers(memberRows);
      setJoinRequests(requestRows);
      setInvitations(invitationRows);
      setDocuments(allDocuments);
      syncSettingsForm(nextTeam);
      setMemberFeedback('');
      if (mode === 'refresh') {
        notify.success('空间数据已刷新', nextTeam.name);
      }
    } catch (loadError) {
      setTeam(null);
      setMembers([]);
      setJoinRequests([]);
      setInvitations([]);
      setDocuments([]);
      const message = loadError instanceof Error ? loadError.message : '空间管理数据加载失败';
      setError(message);
      if (mode === 'refresh') {
        notify.error('刷新失败', message);
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    void load();
  }, [teamId]);

  useEffect(() => {
    setInviteQuery('');
    setInviteCandidates([]);
    setInviteFeedback('');
  }, [teamId]);

  useEffect(() => {
    if (!team || isOwner || requestedSection === 'overview') {
      return;
    }

    setSearchParams({ section: 'overview' }, { replace: true });
  }, [isOwner, requestedSection, setSearchParams, team]);

  useEffect(() => {
    if (!isOwner || !team) {
      setInviteCandidates([]);
      return;
    }

    const query = inviteQuery.trim();
    if (!query) {
      setInviteCandidates([]);
      setIsSearchingInviteCandidates(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setIsSearchingInviteCandidates(true);

      try {
        const candidates = await teamService.getInviteCandidates(team.id, query);
        if (!cancelled) {
          setInviteCandidates(candidates);
        }
      } catch (searchError) {
        if (!cancelled) {
          setInviteCandidates([]);
          setInviteFeedback(searchError instanceof Error ? searchError.message : '搜索可邀请成员失败');
        }
      } finally {
        if (!cancelled) {
          setIsSearchingInviteCandidates(false);
        }
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [inviteQuery, isOwner, team]);

  const switchSection = (section: ManageSection) => {
    setSearchParams({ section: isOwner ? section : 'overview' });
  };

  const goBackToSpace = () => {
    if (!team) {
      navigate('/');
      return;
    }

    navigate(`/?team=${encodeURIComponent(team.id)}`);
  };

  const handleApprove = async (requestId: string) => {
    if (!team) return;

    setBusyRequestId(requestId);
    setMemberFeedback('');

    try {
      const approved = await teamService.approveJoinRequest(team.id, requestId);
      if (!approved) {
        setMemberFeedback('审批失败，可能已经达到成员上限。');
        notify.error('审批失败', '可能已经达到成员上限。');
        return;
      }

      setMemberFeedback('已通过加入申请。');
      await load('refresh');
      notify.success('已通过加入申请');
    } catch (error) {
      const message = error instanceof Error ? error.message : '审批失败';
      setMemberFeedback(message);
      notify.error('审批失败', message);
    } finally {
      setBusyRequestId(null);
    }
  };

  const handleReject = async (requestId: string) => {
    if (!team) return;

    setBusyRequestId(requestId);
    setMemberFeedback('');

    try {
      const rejected = await teamService.rejectJoinRequest(team.id, requestId);
      if (!rejected) {
        setMemberFeedback('拒绝申请失败，请稍后重试。');
        notify.error('拒绝申请失败', '请稍后重试。');
        return;
      }

      setMemberFeedback('已拒绝加入申请。');
      await load('refresh');
      notify.success('已拒绝加入申请');
    } catch (error) {
      const message = error instanceof Error ? error.message : '拒绝申请失败';
      setMemberFeedback(message);
      notify.error('拒绝申请失败', message);
    } finally {
      setBusyRequestId(null);
    }
  };

  const handleGenerateInviteCode = async () => {
    if (!team) return;

    setIsGeneratingInviteCode(true);
    setInviteFeedback('');

    try {
      const invitation = await teamService.createInviteCode(team.id);
      if (!invitation) {
        setInviteFeedback('生成邀请码失败');
        notify.error('生成邀请码失败', '请稍后重试。');
        return;
      }

      const nextInvitations = await teamService.getInvitations(team.id);
      setInvitations(nextInvitations);
      setInviteFeedback('邀请码已更新');
      notify.success('邀请码已更新', invitation.code || '可继续复制发给成员。');
    } catch (inviteError) {
      const message = inviteError instanceof Error ? inviteError.message : '生成邀请码失败';
      setInviteFeedback(message);
      notify.error('生成邀请码失败', message);
    } finally {
      setIsGeneratingInviteCode(false);
    }
  };

  const handleCopyInviteCode = async () => {
    if (!codeInvitation?.code) {
      setInviteFeedback('当前还没有可用的邀请码');
      notify.info('当前还没有可用的邀请码');
      return;
    }

    try {
      await navigator.clipboard.writeText(codeInvitation.code);
      setInviteFeedback('邀请码已复制');
      notify.copied('邀请码已复制');
    } catch {
      setInviteFeedback('复制邀请码失败');
      notify.error('复制失败', '请检查浏览器剪贴板权限。');
    }
  };

  const handleInviteCandidate = async (user: User) => {
    if (!team) return;

    setBusyInviteCandidateId(user.id);
    setInviteFeedback('');

    try {
      const invitation = await teamService.createEmailInvitation(team.id, user.id);
      if (!invitation) {
        setInviteFeedback('发送邀请失败');
        notify.error('发送邀请失败', '请稍后重试。');
        return;
      }

      const nextInvitations = await teamService.getInvitations(team.id);
      setInvitations(nextInvitations);
      setInviteQuery('');
      setInviteCandidates([]);
      setInviteFeedback(`已向 ${user.email} 发送邀请`);
      notify.success('邀请已发送', user.email);
    } catch (inviteError) {
      const message = inviteError instanceof Error ? inviteError.message : '发送邀请失败';
      setInviteFeedback(message);
      notify.error('发送邀请失败', message);
    } finally {
      setBusyInviteCandidateId(null);
    }
  };

  const handleRevokeInvitation = async (invitationId: string) => {
    if (!team) return;

    setBusyInvitationId(invitationId);
    setInviteFeedback('');

    try {
      const ok = await teamService.revokeInvitation(team.id, invitationId);
      if (!ok) {
        setInviteFeedback('撤销邀请失败');
        notify.error('撤销邀请失败', '请稍后重试。');
        return;
      }

      const nextInvitations = await teamService.getInvitations(team.id);
      setInvitations(nextInvitations);
      setInviteFeedback('邀请已撤销');
      notify.success('邀请已撤销');
    } catch (inviteError) {
      const message = inviteError instanceof Error ? inviteError.message : '撤销邀请失败';
      setInviteFeedback(message);
      notify.error('撤销邀请失败', message);
    } finally {
      setBusyInvitationId(null);
    }
  };

  const handleSendAnnouncement = async () => {
    if (!team) {
      return;
    }

    const nextTitle = announcementTitle.trim();
    const nextContent = announcementContent.trim();
    if (!nextContent) {
      setMemberFeedback('请输入通知内容。');
      notify.info('请输入通知内容');
      return;
    }

    setIsSendingAnnouncement(true);
    setMemberFeedback('');

    try {
      await teamService.sendNotification(team.id, {
        title: nextTitle || '空间通知',
        content: nextContent,
      });
      setAnnouncementTitle('');
      setAnnouncementContent('');
      setMemberFeedback('空间通知已发送。');
      notify.success('空间通知已发送');
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : '发送空间通知失败';
      setMemberFeedback(message);
      notify.error('发送空间通知失败', message);
    } finally {
      setIsSendingAnnouncement(false);
    }
  };

  const handleRemoveMember = (member: TeamMember) => {
    if (!team || !member.user_id || member.user_id === team.owner_user_id) {
      return;
    }

    const displayName = member.user?.nickname || member.user?.email || member.user_id;
    setConfirmDialog({
      title: '移出成员',
      message: `确定要将「${displayName}」移出当前空间吗？\n移出后，该成员将无法继续访问当前空间内容。`,
      tone: 'danger',
      confirmText: '确认移出',
      onConfirm: async () => {
        await teamService.removeMember(team.id, member.user_id);
        await load();
        setMemberFeedback(`已移出成员：${displayName}`);
        notify.success('成员已移出', displayName);
      },
    });
  };

  const handleAvatarUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setSettingsFeedback('请选择图片文件作为空间头像。');
      notify.error('上传失败', '请选择图片文件作为空间头像。');
      return;
    }

    setIsUploadingAvatar(true);
    setSettingsFeedback('');

    try {
      const params = new URLSearchParams({
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
      });

      const upload = await apiRequest<{ url: string; path: string }>(
        `/files/upload?${params.toString()}`,
        {
          method: 'POST',
          body: file,
        },
      );

      setSettingsAvatarUrl(upload.url);
      setSettingsFeedback('空间头像已上传，保存设置后生效。');
      notify.success('空间头像已上传', '保存设置后会同步更新到空间入口。');
    } catch (uploadError) {
      const message = uploadError instanceof Error ? uploadError.message : '空间头像上传失败';
      setSettingsFeedback(message);
      notify.error('空间头像上传失败', message);
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!team) return;

    const nextName = settingsName.trim();
    const nextMemberLimit = Number(settingsMemberLimit);

    if (!nextName) {
      setSettingsFeedback('空间名称不能为空。');
      notify.info('空间名称不能为空');
      return;
    }

    if (!Number.isInteger(nextMemberLimit) || nextMemberLimit < 1) {
      setSettingsFeedback('成员上限必须是大于 0 的整数。');
      notify.info('成员上限必须是大于 0 的整数');
      return;
    }

    if (nextMemberLimit < approvedMembers.length) {
      setSettingsFeedback(`成员上限不能小于当前已加入成员数 ${approvedMembers.length}。`);
      notify.info('成员上限过小', `当前已有 ${approvedMembers.length} 位成员。`);
      return;
    }

    if (!settingsCreatedAt) {
      setSettingsFeedback('请选择有效的创建时间。');
      notify.info('请选择有效的创建时间');
      return;
    }

    const createdAt = new Date(settingsCreatedAt);
    if (Number.isNaN(createdAt.getTime())) {
      setSettingsFeedback('创建时间格式不正确。');
      notify.info('创建时间格式不正确');
      return;
    }

    setIsSavingSettings(true);
    setSettingsFeedback('');

    try {
      const updated = await teamService.updateTeam(team.id, {
        name: nextName,
        avatar_url: settingsAvatarUrl.trim() || null,
        created_at: createdAt.toISOString(),
        member_limit: nextMemberLimit,
      });

      if (!updated) {
        setSettingsFeedback('空间设置保存失败。');
        notify.error('空间设置保存失败', '请稍后重试。');
        return;
      }

      setTeam((current) => (current ? { ...current, ...updated } : updated));
      syncSettingsForm(updated);
      setSettingsFeedback('空间设置已保存。');
      notify.success('空间设置已保存', updated.name);
    } catch (error) {
      const message = error instanceof Error ? error.message : '空间设置保存失败';
      setSettingsFeedback(message);
      notify.error('空间设置保存失败', message);
    } finally {
      setIsSavingSettings(false);
    }
  };

  const renderJoinRequests = () => {
    if (!isOwner) {
      return null;
    }

    return (
      <section className="app-card-hover app-section-enter rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-lg font-semibold text-slate-900">加入申请</div>
            <div className="mt-1 text-sm text-slate-500">这里处理申请加入当前空间的成员请求。</div>
          </div>
          <SpaceManageStatusTag label={`${joinRequests.length} 条待审批`} />
        </div>

        {memberFeedback ? (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            {memberFeedback}
          </div>
        ) : null}

        {joinRequests.length === 0 ? (
          <div className="mt-4 rounded-[24px] bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
            当前没有待审批的加入申请。
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {joinRequests.map((request) => {
              const isBusy = busyRequestId === request.id;
              return (
                <div
                  key={request.id}
                  className="flex flex-col gap-4 rounded-[24px] border border-slate-200 px-4 py-4 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div className="min-w-0">
                    <div className="truncate text-base font-medium text-slate-900">
                      {request.user?.nickname || request.user?.email || request.user_id}
                    </div>
                    <div className="mt-1 truncate text-sm text-slate-500">
                      {request.user?.email || request.user_id}
                    </div>
                    <div className="mt-2 text-xs text-slate-400">
                      申请时间：{formatManageDateTime(request.created_at)}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void handleApprove(request.id)}
                      disabled={isBusy}
                      className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      通过
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleReject(request.id)}
                      disabled={isBusy}
                      className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2.5 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <X className="h-4 w-4" />
                      拒绝
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    );
  };

  const renderOverview = () => (
    <div className="space-y-6">
      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_360px]">
        <div className="app-card-hover app-section-enter rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <SpaceAvatar team={team} className="h-20 w-20 rounded-[28px] object-cover" />
              <div className="min-w-0">
                <div className="text-sm text-slate-500">团队空间</div>
                <div className="mt-1 truncate text-3xl font-semibold text-slate-900">
                  {team?.name || '未命名空间'}
                </div>
                <div className="mt-3 flex flex-wrap gap-3 text-sm text-slate-500">
                  <span>创建时间：{formatManageDateTime(team?.created_at || '')}</span>
                  <span>成员上限：{currentMemberLimit} 人</span>
                </div>
              </div>
            </div>

            {isOwner ? (
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => switchSection('members')}
                  className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2.5 text-sm text-slate-700 transition hover:bg-slate-50"
                >
                  <UserPlus className="h-4 w-4" />
                  人员与权限
                </button>
                <button
                  type="button"
                  onClick={() => switchSection('settings')}
                  className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2.5 text-sm text-white transition hover:bg-slate-800"
                >
                  <Settings className="h-4 w-4" />
                  空间设置
                </button>
              </div>
            ) : null}
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <SpaceManageMetricCard
              icon={Users}
              label="已加入成员"
              value={`${approvedMembers.length}/${currentMemberLimit}`}
              detail={`当前席位使用率 ${usedSeatPercent}%`}
            />
            <SpaceManageMetricCard
              icon={FileText}
              label="空间笔记"
              value={currentTeamStats.documentCount}
              detail="统计当前空间内的所有笔记文档"
            />
            <SpaceManageMetricCard
              icon={FolderOpen}
              label="知识库"
              value={currentTeamStats.knowledgeBaseCount}
              detail="统计根目录下的知识库文件夹"
            />
          </div>
        </div>

        <div className="app-card-hover app-section-enter rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-lg font-semibold text-slate-900">空间信息</div>
          <div className="mt-5 space-y-3">
            <SpaceManageInfoItem
              icon={ShieldCheck}
              label="空间所有者"
              value={owner?.nickname || owner?.email || '暂未识别'}
            />
            <SpaceManageInfoItem
              icon={CalendarDays}
              label="创建日期"
              value={formatDate(team?.created_at || '')}
            />
            <SpaceManageInfoItem
              icon={Users}
              label="待处理申请"
              value={isOwner ? `${joinRequests.length} 条` : '仅空间所有者可见'}
            />
          </div>

          <div className="mt-6 rounded-[24px] bg-slate-50 px-4 py-4">
            <div className="flex items-center justify-between gap-3 text-sm text-slate-600">
              <span>成员容量</span>
              <span>
                {approvedMembers.length} / {currentMemberLimit}
              </span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{ width: `${usedSeatPercent}%` }}
              />
            </div>
            <div className="mt-3 text-sm text-slate-500">
              当前还有 {Math.max(currentMemberLimit - approvedMembers.length, 0)} 个可用成员名额。
            </div>
          </div>
        </div>
      </section>
    </div>
  );

  const renderMembers = () => (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-3">
        <SpaceManageMetricCard
          icon={Users}
          label="空间成员"
          value={approvedMembers.length}
          detail="已经加入并可访问该空间的成员数量"
        />
        <SpaceManageMetricCard
          icon={UserPlus}
          label="待审批"
          value={joinRequests.length}
          detail={isOwner ? '由空间所有者审批加入申请' : '仅空间所有者可审批'}
        />
        <SpaceManageMetricCard
          icon={ShieldCheck}
          label="成员上限"
          value={currentMemberLimit}
          detail={`至少要大于等于当前已加入成员数 ${approvedMembers.length}`}
        />
      </section>

      {renderJoinRequests()}

      {isOwner ? (
        <section className="app-card-hover app-section-enter rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-600">
              <Megaphone className="h-5 w-5" />
            </div>
            <div>
              <div className="text-lg font-semibold text-slate-900">发送空间通知</div>
              <div className="mt-1 text-sm text-slate-500">
                创建者可以向当前空间成员发送一条自定义通知，成员会在消息面板中收到提醒。
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-4">
            <label className="grid gap-2">
              <span className="text-sm font-medium text-slate-700">通知标题</span>
              <input
                type="text"
                value={announcementTitle}
                onChange={(event) => setAnnouncementTitle(event.target.value)}
                placeholder="例如：本周资料整理安排"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500"
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-medium text-slate-700">通知内容</span>
              <textarea
                value={announcementContent}
                onChange={(event) => setAnnouncementContent(event.target.value)}
                placeholder="输入要发送给空间成员的通知内容"
                rows={4}
                className="w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500"
              />
            </label>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => void handleSendAnnouncement()}
                disabled={isSendingAnnouncement}
                className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2.5 text-sm text-white transition hover:bg-slate-800 disabled:opacity-60"
              >
                {isSendingAnnouncement ? <Loader2 className="h-4 w-4 animate-spin" /> : <Megaphone className="h-4 w-4" />}
                发送通知
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {isOwner ? (
        <section className="app-card-hover app-section-enter rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <div className="text-lg font-semibold text-slate-900">邀请成员</div>
              <div className="mt-1 text-sm text-slate-500">
                可以通过邀请码邀请，也可以通过邮箱或昵称搜索账号后直接发出邀请。
              </div>
            </div>
            <SpaceManageStatusTag label={`待处理邀请 ${emailInvitations.length} 条`} />
          </div>

          {inviteFeedback ? (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              {inviteFeedback}
            </div>
          ) : null}

          <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
            <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <Link2 className="h-4 w-4" />
                邀请码
              </div>
              <div className="mt-4 rounded-2xl bg-white px-4 py-4">
                <div className="text-xs uppercase tracking-[0.24em] text-slate-400">CODE</div>
                <div className="mt-2 break-all font-mono text-2xl font-semibold text-slate-900">
                  {codeInvitation?.code || '未生成'}
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  {codeInvitation
                    ? `生成时间：${formatManageDateTime(codeInvitation.created_at)}`
                    : '生成后可复制给成员直接加入当前空间'}
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void handleGenerateInviteCode()}
                  disabled={isGeneratingInviteCode}
                  className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2.5 text-sm text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isGeneratingInviteCode ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  {codeInvitation ? '重新生成' : '生成邀请码'}
                </button>
                <button
                  type="button"
                  onClick={() => void handleCopyInviteCode()}
                  disabled={!codeInvitation?.code}
                  className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2.5 text-sm text-slate-700 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Link2 className="h-4 w-4" />
                  复制
                </button>
              </div>
            </div>

            <div className="space-y-5">
              <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
                <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <UserPlus className="h-4 w-4" />
                  搜索并邀请成员
                </div>
                <label className="relative mt-4 block">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={inviteQuery}
                    onChange={(event) => {
                      setInviteQuery(event.target.value);
                      setInviteFeedback('');
                    }}
                    placeholder="输入邮箱或昵称搜索用户"
                    className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm text-slate-900 outline-none transition focus:border-emerald-500"
                  />
                </label>

                <div className="mt-4 space-y-3">
                  {isSearchingInviteCandidates ? (
                    <div className="rounded-2xl bg-white px-4 py-5 text-sm text-slate-500">
                      正在搜索可邀请成员...
                    </div>
                  ) : inviteQuery.trim() && inviteCandidates.length === 0 ? (
                    <div className="rounded-2xl bg-white px-4 py-5 text-sm text-slate-500">
                      没有找到可邀请的用户，或该用户已在当前空间中。
                    </div>
                  ) : (
                    inviteCandidates.map((candidate) => {
                      const isBusy = busyInviteCandidateId === candidate.id;
                      return (
                        <div
                          key={candidate.id}
                          className="flex flex-col gap-3 rounded-2xl bg-white px-4 py-4 lg:flex-row lg:items-center lg:justify-between"
                        >
                          <div className="min-w-0">
                            <div className="truncate text-base font-medium text-slate-900">
                              {candidate.nickname || candidate.email}
                            </div>
                            <div className="mt-1 truncate text-sm text-slate-500">{candidate.email}</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => void handleInviteCandidate(candidate)}
                            disabled={busyInviteCandidateId !== null}
                            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                            发送邀请
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
                <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <Users className="h-4 w-4" />
                  待处理邀请
                </div>
                {emailInvitations.length === 0 ? (
                  <div className="mt-4 rounded-2xl bg-white px-4 py-6 text-sm text-slate-500">
                    当前没有待处理的定向邀请。
                  </div>
                ) : (
                  <div className="mt-4 space-y-3">
                    {emailInvitations.map((invitation) => {
                      const isBusy = busyInvitationId === invitation.id;
                      const displayName =
                        invitation.invited_user?.nickname ||
                        invitation.invited_user?.email ||
                        invitation.invited_email ||
                        invitation.invited_user_id ||
                        '未识别用户';

                      return (
                        <div
                          key={invitation.id}
                          className="flex flex-col gap-3 rounded-2xl bg-white px-4 py-4 lg:flex-row lg:items-center lg:justify-between"
                        >
                          <div className="min-w-0">
                            <div className="truncate text-base font-medium text-slate-900">{displayName}</div>
                            <div className="mt-1 truncate text-sm text-slate-500">
                              {invitation.invited_user?.email || invitation.invited_email || invitation.invited_user_id}
                            </div>
                            <div className="mt-2 text-xs text-slate-400">
                              邀请时间：{formatManageDateTime(invitation.created_at)}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => void handleRevokeInvitation(invitation.id)}
                            disabled={busyInvitationId !== null}
                            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 px-4 py-2.5 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                            撤销邀请
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <section className="app-card-hover app-section-enter rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-lg font-semibold text-slate-900">成员列表</div>
            <div className="mt-1 text-sm text-slate-500">查看当前空间成员，并按昵称或邮箱搜索。</div>
          </div>

          <label className="relative block w-full max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={memberQuery}
              onChange={(event) => setMemberQuery(event.target.value)}
              placeholder="搜索成员昵称或邮箱"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm text-slate-900 outline-none transition focus:border-emerald-500"
            />
          </label>
        </div>

        {filteredMembers.length === 0 ? (
          <div className="mt-4 rounded-[24px] bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
            没有匹配到成员。
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {filteredMembers.map((member) => {
              const isSpaceOwner = member.user_id === team?.owner_user_id;
              return (
                <div
                  key={member.id}
                  className="flex flex-col gap-3 rounded-[24px] border border-slate-200 px-4 py-4 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div className="min-w-0">
                    <div className="truncate text-base font-medium text-slate-900">
                      {member.user?.nickname || member.user?.email || member.user_id}
                    </div>
                    <div className="mt-1 truncate text-sm text-slate-500">
                      {member.user?.email || member.user_id}
                    </div>
                    <div className="mt-2 text-xs text-slate-400">
                      加入时间：{formatManageDateTime(member.created_at)}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <SpaceManageStatusTag label={isSpaceOwner ? '空间所有者' : '空间成员'} />
                    <SpaceManageStatusTag label="已加入" />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {rejectedMembers.length > 0 ? (
          <div className="mt-5 text-sm text-slate-500">已处理的拒绝申请：{rejectedMembers.length} 条</div>
        ) : null}
      </section>
    </div>
  );

  const renderSettings = () => (
    <div className="space-y-6">
      <section className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <div className="app-card-hover app-section-enter rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-lg font-semibold text-slate-900">空间头像</div>
          <div className="mt-5 flex justify-center">
            <label htmlFor="space-avatar-upload" className={`group relative ${isOwner ? 'cursor-pointer' : 'cursor-not-allowed'}`}>
              <SpaceAvatar
                team={team}
                avatarUrlOverride={settingsAvatarUrl || null}
                className="h-28 w-28 rounded-[32px] object-cover"
              />
              {settingsAvatarUrl.trim() ? (
                <button
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setSettingsAvatarUrl('');
                    setSettingsFeedback('空间头像已清空，保存设置后生效。');
                    notify.info('空间头像已清空', '保存设置后会恢复为默认头像。');
                  }}
                  disabled={!isOwner || isUploadingAvatar}
                  className="absolute -right-2 -top-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-white opacity-0 transition hover:bg-black/85 group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="清空空间头像"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
              <input
                id="space-avatar-upload"
                type="file"
                accept="image/*"
                className="hidden"
                disabled={!isOwner || isUploadingAvatar}
                onChange={(event) => void handleAvatarUpload(event)}
              />
              <div className="absolute -bottom-2 -right-2 rounded-full bg-white p-2 text-slate-500 shadow-sm">
                {isUploadingAvatar ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
              </div>
            </label>
          </div>

          <div className="mt-4 rounded-[28px] bg-slate-50 px-5 py-5 text-center">
            <div className="text-sm leading-7 text-slate-600">
              人安静地生活，
              <br />
              哪怕是静静地听着风声，
              <br />
              亦能感觉到诗意的生活。
            </div>
            <div className="mt-3 text-xs tracking-[0.12em] text-slate-400">马丁·海德格尔</div>
          </div>

          <label className="hidden mt-6 inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 transition hover:bg-slate-50">
            <ImagePlus className="h-4 w-4" />
            {isUploadingAvatar ? '上传中...' : '上传空间头像'}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={!isOwner || isUploadingAvatar}
              onChange={(event) => void handleAvatarUpload(event)}
            />
          </label>

          <button
            type="button"
            onClick={() => setSettingsAvatarUrl('')}
            disabled={!isOwner || isUploadingAvatar}
            className="hidden mt-3 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            清空头像
          </button>

          <div className="mt-4 text-center text-xs text-slate-400">点击头像即可上传或更换空间头像。</div>
        </div>

        <div className="app-card-hover app-section-enter rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-2">
            <div className="text-lg font-semibold text-slate-900">空间设置</div>
            <div className="text-sm text-slate-500">
              可编辑空间名称、创建时间、空间头像和成员上限。
            </div>
          </div>

          {!isOwner ? (
            <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              当前只有空间所有者可以修改这些设置。
            </div>
          ) : null}

          <div className="mt-6 space-y-5">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">空间名称</label>
              <input
                type="text"
                value={settingsName}
                onChange={(event) => setSettingsName(event.target.value)}
                disabled={!isOwner}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-50"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">创建时间</label>
              <input
                type="datetime-local"
                value={settingsCreatedAt}
                onChange={(event) => setSettingsCreatedAt(event.target.value)}
                disabled={!isOwner}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-50"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">成员上限</label>
              <input
                type="number"
                min={1}
                step={1}
                value={settingsMemberLimit}
                onChange={(event) => setSettingsMemberLimit(event.target.value)}
                disabled={!isOwner}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-50"
              />
              <div className="mt-2 text-xs text-slate-500">
                当前已加入成员 {approvedMembers.length} 人，设置时不能比这个数字更小。
              </div>
            </div>
          </div>

          {settingsFeedback ? (
            <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              {settingsFeedback}
            </div>
          ) : null}

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void handleSaveSettings()}
              disabled={!isOwner || isSavingSettings || isUploadingAvatar}
              className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSavingSettings ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Settings className="h-4 w-4" />
              )}
              保存设置
            </button>

            <button
              type="button"
              onClick={() => {
                if (!team) return;
                syncSettingsForm(team);
                setSettingsFeedback('');
              }}
              disabled={isSavingSettings || isUploadingAvatar}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              恢复当前值
            </button>
          </div>
        </div>
      </section>
    </div>
  );

  const renderSection = () => {
    if (activeSection === 'members') {
      return renderManagedMembers();
    }

    if (activeSection === 'settings') {
      return renderSettings();
    }

    return renderOverview();
  };

  return (
    <div className="app-page-enter min-h-screen bg-[#f5f7fb]">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 py-8">
        <div className="app-card-hover app-section-enter rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <button
                type="button"
                onClick={goBackToSpace}
                className="inline-flex shrink-0 items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2.5 text-sm text-slate-700 transition hover:bg-slate-50"
              >
                <ArrowLeft className="h-4 w-4" />
                返回空间
              </button>

              <div className="hidden h-10 w-px bg-slate-200 lg:block" />

              <div className="flex min-w-0 items-center gap-3">
                <SpaceAvatar team={team} className="h-14 w-14 rounded-[24px] object-cover" />
                <div className="min-w-0">
                  <div className="truncate text-2xl font-semibold text-slate-900">
                    {team?.name || (isOwner ? '空间管理' : '空间总览')}
                  </div>
                  <div className="mt-1 text-sm text-slate-500">
                    {isOwner ? '独立空间管理页面' : '当前空间总览'}
                  </div>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void load('refresh')}
              disabled={isRefreshing}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2.5 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              刷新
            </button>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            {visibleNavItems.map((item) => (
              <SpaceManageSectionTab
                key={item.key}
                icon={item.icon}
                label={item.label}
                active={activeSection === item.key}
                onClick={() => switchSection(item.key)}
              />
            ))}
          </div>
        </div>

        <main className="mt-6 flex-1">
          {isLoading ? (
            <div className="app-card-hover app-section-enter rounded-[32px] border border-slate-200 bg-white px-6 py-20 text-center shadow-sm">
              <div className="inline-flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                正在加载空间管理数据...
              </div>
            </div>
          ) : error ? (
            <div className="app-card-hover app-section-enter rounded-[32px] border border-rose-200 bg-white px-6 py-20 text-center shadow-sm">
              <div className="text-lg font-semibold text-rose-600">{error}</div>
              <div className="mt-5 flex justify-center gap-3">
                <button
                  type="button"
                  onClick={() => void load('refresh')}
                  className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2.5 text-sm text-slate-700 transition hover:bg-slate-50"
                >
                  <RefreshCw className="h-4 w-4" />
                  重新加载
                </button>
                <button
                  type="button"
                  onClick={goBackToSpace}
                  className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2.5 text-sm text-white transition hover:bg-slate-800"
                >
                  <ArrowLeft className="h-4 w-4" />
                  返回空间
                </button>
              </div>
            </div>
          ) : (
            renderSection()
          )}
        </main>

        <ActionDialog
          isOpen={!!confirmDialog}
          title={confirmDialog?.title || ''}
          message={confirmDialog?.message || ''}
          tone={confirmDialog?.tone || 'default'}
          confirmText={confirmDialog?.confirmText || '确认'}
          isConfirming={isConfirmingDialog}
          onClose={() => {
            if (isConfirmingDialog) {
              return;
            }
            setConfirmDialog(null);
          }}
          onConfirm={async () => {
            if (!confirmDialog) {
              return;
            }

            setIsConfirmingDialog(true);
            try {
              await confirmDialog.onConfirm();
              setConfirmDialog(null);
            } catch (dialogError) {
              notify.error('操作失败', dialogError instanceof Error ? dialogError.message : '请稍后重试。');
            } finally {
              setIsConfirmingDialog(false);
            }
          }}
        />
      </div>
    </div>
  );
}
