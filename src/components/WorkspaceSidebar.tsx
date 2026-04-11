import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  Edit3,
  FilePlus,
  FileText,
  FolderOpen,
  FolderPlus,
  Globe,
  HardDrive,
  Home,
  LogOut,
  MoreHorizontal,
  Plus,
  Search,
  Settings,
  Star,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import ActionDialog from './ActionDialog';
import NameInputModal from './NameInputModal';
import ProfileSettingsUploadModal from './ProfileSettingsUploadModal';
import { authService } from '../lib/authApi';
import { notificationService, publicResourceService, teamService } from '../lib/databaseApi';
import type { DocTreeItem } from '../lib/documentsApi';
import { notify } from '../lib/notify';
import type { PublicDocumentSummary, PublicFileSummary, Team, TeamInvitation, User, UserNotification } from '../lib/types';
import { Archive } from 'lucide-react';

interface WorkspaceSidebarProps {
  onDocSelect: (doc: DocTreeItem) => void;
  onFilesSelect: () => void;
  selectedDocId: string;
  activeTab: string;
  onTabChange: (tab: string) => void;
  docTree: DocTreeItem[];
  onCreateDoc: (parentId?: string | null) => void;
  onCreateFolder: (parentId?: string | null) => void;
  onRequestRenameDoc: (id: string, title: string) => void;
  onDeleteDoc: (id: string) => void;
  onToggleStar: (id: string) => void;
  onShareDoc: (doc: Pick<DocTreeItem, 'id' | 'title' | 'team_id'>) => void;
  onLogout: () => void;
  onSessionChange: () => void;
  onUserRefresh: () => void;
  onEnterTeamSpace: (team: Team) => void;
  onLeaveTeamSpace: () => void;
  activeWorkspaceTeam?: Team | null;
  user: User | null;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

const shortcutItems = [
  { key: 'docs', label: '开始', icon: Home },
  { key: 'files', label: '文件', icon: HardDrive },
  { key: 'star', label: '收藏', icon: Star },
  { key: 'public', label: '分享', icon: Globe },
] as const;

interface PublicShareFeedItem {
  id: string;
  title: string;
  kind: 'document' | 'file';
  shareToken: string;
  updatedAt: string;
}

function getInitials(name: string) {
  return name.trim().charAt(0).toUpperCase() || '?';
}

function filterTree(items: DocTreeItem[], query: string): DocTreeItem[] {
  if (!query) return items;

  return items.reduce<DocTreeItem[]>((acc, item) => {
    const matchesTitle = item.title.toLowerCase().includes(query);
    const filteredChildren = filterTree(item.children, query);

    if (matchesTitle || filteredChildren.length > 0) {
      acc.push({
        ...item,
        children: filteredChildren,
      });
    }

    return acc;
  }, []);
}

export default function WorkspaceSidebar({
  onDocSelect,
  onFilesSelect,
  selectedDocId,
  activeTab,
  onTabChange,
  docTree,
  onCreateDoc,
  onCreateFolder,
  onRequestRenameDoc,
  onDeleteDoc,
  onToggleStar,
  onShareDoc,
  onLogout,
  onSessionChange,
  onUserRefresh,
  onEnterTeamSpace,
  onLeaveTeamSpace,
  activeWorkspaceTeam = null,
  user,
  searchQuery,
  onSearchChange,
}: WorkspaceSidebarProps) {
  const navigate = useNavigate();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; docId: string } | null>(null);
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [notificationMenuOpen, setNotificationMenuOpen] = useState(false);
  const [knowledgeBaseOpen, setKnowledgeBaseOpen] = useState(true);
  const [teams, setTeams] = useState<Team[]>([]);
  const [dissolvedTeams, setDissolvedTeams] = useState<Team[]>([]);
  const [accounts, setAccounts] = useState<User[]>([]);
  const [pendingInvitations, setPendingInvitations] = useState<TeamInvitation[]>([]);
  const [publicDocuments, setPublicDocuments] = useState<PublicDocumentSummary[]>([]);
  const [publicFiles, setPublicFiles] = useState<PublicFileSummary[]>([]);
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [showCreateSpaceDialog, setShowCreateSpaceDialog] = useState(false);
  const [draftSpaceName, setDraftSpaceName] = useState('');
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showJoinSpaceDialog, setShowJoinSpaceDialog] = useState(false);
  const [draftJoinSpaceCode, setDraftJoinSpaceCode] = useState('');
  const [isCreatingSpace, setIsCreatingSpace] = useState(false);
  const [isJoiningSpace, setIsJoiningSpace] = useState(false);
  const [isSwitchingAccount, setIsSwitchingAccount] = useState(false);
  const [isLoadingNotifications, setIsLoadingNotifications] = useState(false);
  const [busyInvitationId, setBusyInvitationId] = useState<string | null>(null);
  const [busyWorkspaceActionId, setBusyWorkspaceActionId] = useState<string | null>(null);
  const [copiedNotificationKey, setCopiedNotificationKey] = useState('');
  const [workspaceActionDialog, setWorkspaceActionDialog] = useState<{
    title: string;
    message: string;
    tone?: 'default' | 'danger';
    confirmText?: string;
    onConfirm: () => void | Promise<void>;
  } | null>(null);
  const [notificationDetailDialog, setNotificationDetailDialog] = useState<UserNotification | null>(null);
  const [isConfirmingWorkspaceAction, setIsConfirmingWorkspaceAction] = useState(false);
  const [menuError, setMenuError] = useState('');
  const [joinSpaceError, setJoinSpaceError] = useState('');
  const [notificationError, setNotificationError] = useState('');
  const [activeTeamMemberCount, setActiveTeamMemberCount] = useState(0);
  const [activeTeamOwner, setActiveTeamOwner] = useState<User | null>(null);
  const workspaceMenuRef = useRef<HTMLDivElement | null>(null);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);
  const notificationMenuRef = useRef<HTMLDivElement | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const publicShareItems = useMemo<PublicShareFeedItem[]>(() => {
    const workspaceDocuments = publicDocuments
      .map((document) => ({
        id: `document:${document.id}`,
        title: document.title,
        kind: 'document' as const,
        shareToken: document.share_token,
        updatedAt: document.updated_at,
      }));

    const workspaceFiles = publicFiles
      .map((file) => ({
        id: `file:${file.id}`,
        title: file.name,
        kind: 'file' as const,
        shareToken: file.share_token,
        updatedAt: file.updated_at,
      }));

    return [...workspaceDocuments, ...workspaceFiles]
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [publicDocuments, publicFiles]);

  const systemNotifications = useMemo(() => {
    const items: Array<{ id: string; title: string; detail: string }> = [];

    if (activeWorkspaceTeam) {
      items.push({
        id: 'workspace-active',
        title: `当前空间：${activeWorkspaceTeam.name}`,
        detail: '你可以继续在当前空间中编辑内容，或在这里处理邀请与空间分享动态。',
      });
    } else {
      items.push({
        id: 'workspace-personal',
        title: '当前处于个人空间',
        detail: '即使还没有加入任何团队空间，也可以在这里直接接受空间邀请。',
      });
    }

    items.push({
      id: 'invite-summary',
      title:
        pendingInvitations.length > 0
          ? `收到 ${pendingInvitations.length} 条待处理空间邀请`
          : '当前没有待处理空间邀请',
      detail:
        pendingInvitations.length > 0
          ? '点击接受后会直接进入对应空间。'
          : '有新的团队邀请时，会优先显示在这里。',
    });

    items.push({
      id: 'public-summary',
      title:
        publicShareItems.length > 0
          ? `当前空间有 ${publicShareItems.length} 个分享资源`
          : '当前空间还没有分享资源',
      detail:
        publicShareItems.length > 0
          ? '这些资源已经分享到当前空间，空间成员都可以查看。'
          : '将笔记或文件分享到当前空间后，会自动汇总到这里。',
    });

    return items;
  }, [activeWorkspaceTeam, pendingInvitations.length, publicShareItems.length]);

  const notificationBadgeCount = useMemo(
    () => pendingInvitations.length + publicShareItems.length + notifications.filter((item) => !item.is_read).length,
    [notifications, pendingInvitations.length, publicShareItems.length],
  );

  const allDocs = useMemo(() => {
    const result: DocTreeItem[] = [];
    const walk = (items: DocTreeItem[]) => {
      items.forEach((item) => {
        result.push(item);
        if (item.children.length > 0) {
          walk(item.children);
        }
      });
    };
    walk(docTree);
    return result;
  }, [docTree]);

  const docMap = useMemo(() => new Map(allDocs.map((item) => [item.id, item])), [allDocs]);
  const filteredTree = useMemo(() => filterTree(docTree, normalizedQuery), [docTree, normalizedQuery]);
  const starredDocs = useMemo(
    () =>
      allDocs
        .filter((item) => item.is_starred)
        .filter((item) => item.title.toLowerCase().includes(normalizedQuery)),
    [allDocs, normalizedQuery],
  );
  const selectedTreeNode = selectedDocId ? docMap.get(selectedDocId) || null : null;
  const contextTarget = contextMenu ? docMap.get(contextMenu.docId) || null : null;
  const createParentId = selectedTreeNode?.icon === 'folder' ? selectedTreeNode.id : selectedTreeNode?.parent_id ?? null;
  const workspaceSubLabel = activeWorkspaceTeam?.name || '个人空间';
  const activeWorkspaceManageLabel = activeWorkspaceTeam?.is_owner ? '空间管理' : '空间总览';
  const isDocumentLikeTab = activeTab === 'docs' || activeTab === 'star';

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;

      if (workspaceMenuRef.current && !workspaceMenuRef.current.contains(target)) {
        setWorkspaceMenuOpen(false);
      }

      if (accountMenuRef.current && !accountMenuRef.current.contains(target)) {
        setAccountMenuOpen(false);
      }

      if (notificationMenuRef.current && !notificationMenuRef.current.contains(target)) {
        setNotificationMenuOpen(false);
      }

      if (contextMenuRef.current && !contextMenuRef.current.contains(target)) {
        setContextMenu(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [contextMenu]);

  useEffect(() => {
    if (!workspaceMenuOpen || !user) return;

    const loadTeams = async () => {
      try {
        setMenuError('');
        const rows = await teamService.getMyTeams();
        setTeams(rows);
      } catch (error) {
        setMenuError(error instanceof Error ? error.message : '空间列表加载失败');
      }
    };

    void loadTeams();
  }, [workspaceMenuOpen, user?.id]);

  useEffect(() => {
    if (!workspaceMenuOpen || !activeWorkspaceTeam) {
      setActiveTeamMemberCount(0);
      setActiveTeamOwner(null);
      return;
    }

    const loadWorkspaceSummary = async () => {
      try {
        const members = await teamService.getMembers(activeWorkspaceTeam.id);
        setActiveTeamMemberCount(members.length);
        const ownerFromMembers = members.find((member) => member.user_id === activeWorkspaceTeam.owner_user_id)?.user || null;
        if (ownerFromMembers) {
          setActiveTeamOwner(ownerFromMembers);
          return;
        }
        const ownerProfile = await authService.getUserProfile(activeWorkspaceTeam.owner_user_id);
        setActiveTeamOwner(ownerProfile);
      } catch {
        setActiveTeamMemberCount(0);
        setActiveTeamOwner(null);
      }
    };

    void loadWorkspaceSummary();
  }, [workspaceMenuOpen, activeWorkspaceTeam]);

  useEffect(() => {
    if (!accountMenuOpen || !user) return;

    const loadAccounts = async () => {
      try {
        setMenuError('');
        const rows = await authService.listUsers();
        setAccounts(rows);
      } catch (error) {
        setMenuError(error instanceof Error ? error.message : '账号列表加载失败');
      }
    };

    void loadAccounts();

    const loadDissolvedTeams = async () => {
      try {
        const dissolved = await teamService.getDissolvedTeams();
        setDissolvedTeams(dissolved);
      } catch {
        // 静默失败，不影响主功能
      }
    };

    void loadDissolvedTeams();
  }, [accountMenuOpen, user?.id]);

  const loadNotificationFeed = async () => {
    if (!user) {
      setPendingInvitations([]);
      setPublicDocuments([]);
      setPublicFiles([]);
      setNotifications([]);
      return;
    }

    setIsLoadingNotifications(true);
    setNotifications([]);

    try {
      setNotificationError('');
      const [invitationResult, documentResult, fileResult, notificationResult] = await Promise.allSettled([
        teamService.getMyInvitations(),
        publicResourceService.getDocuments(activeWorkspaceTeam?.id ?? null),
        publicResourceService.getFiles(activeWorkspaceTeam?.id ?? null),
        notificationService.getMine(),
      ]);

      const errors: string[] = [];

      if (invitationResult.status === 'fulfilled') {
        setPendingInvitations(invitationResult.value);
      } else {
        setPendingInvitations([]);
        errors.push(invitationResult.reason instanceof Error ? invitationResult.reason.message : '空间邀请加载失败');
      }

      if (documentResult.status === 'fulfilled') {
        setPublicDocuments(documentResult.value);
      } else {
        setPublicDocuments([]);
        errors.push(documentResult.reason instanceof Error ? documentResult.reason.message : '空间分享笔记加载失败');
      }

      if (fileResult.status === 'fulfilled') {
        setPublicFiles(fileResult.value);
      } else {
        setPublicFiles([]);
        errors.push(fileResult.reason instanceof Error ? fileResult.reason.message : '空间分享文件加载失败');
      }

      if (notificationResult.status === 'fulfilled') {
        setNotifications(notificationResult.value);
      } else {
        setNotifications([]);
        errors.push(notificationResult.reason instanceof Error ? notificationResult.reason.message : '消息列表加载失败');
      }

      if (errors.length > 0) {
        setNotificationError(errors[0]);
      }
    } catch (error) {
      setPendingInvitations([]);
      setPublicDocuments([]);
      setPublicFiles([]);
      setNotificationError(error instanceof Error ? error.message : '消息面板加载失败');
    } finally {
      setIsLoadingNotifications(false);
    }
  };

  useEffect(() => {
    if (!user) {
      setPendingInvitations([]);
      setPublicDocuments([]);
      setPublicFiles([]);
      setNotifications([]);
      return;
    }

    void loadNotificationFeed();
  }, [user?.id, activeWorkspaceTeam?.id]);

  useEffect(() => {
    if (!notificationMenuOpen) {
      return;
    }

    const unreadNotifications = notifications.filter((item) => !item.is_read);
    if (unreadNotifications.length === 0) {
      return;
    }

    let cancelled = false;
    const markRead = async () => {
      await Promise.all(unreadNotifications.map((item) => notificationService.markRead(item.id).catch(() => null)));
      if (!cancelled) {
        setNotifications((current) => current.map((item) => ({ ...item, is_read: true })));
      }
    };

    void markRead();

    return () => {
      cancelled = true;
    };
  }, [notificationMenuOpen, notifications]);

  useEffect(() => {
    setWorkspaceMenuOpen(false);
    setAccountMenuOpen(false);
    setNotificationMenuOpen(false);
    setShowCreateSpaceDialog(false);
    setShowProfileModal(false);
    setShowJoinSpaceDialog(false);
    setDraftJoinSpaceCode('');
    setJoinSpaceError('');
  }, [user?.id]);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleShortcut = (tab: (typeof shortcutItems)[number]['key']) => {
    setContextMenu(null);

    if (tab === 'files') {
      onTabChange('files');
      onFilesSelect();
      return;
    }

    onTabChange(tab);
  };

  const handleTreeSelect = (doc: DocTreeItem) => {
    onTabChange(activeTab === 'star' ? 'star' : 'docs');
    onDocSelect(doc);
  };

  const renderDocIcon = (doc: DocTreeItem) => {
    if (doc.icon === 'folder') {
      return <FolderOpen className="h-4 w-4 text-blue-500" />;
    }
    if (doc.is_starred) {
      return <Star className="h-4 w-4 fill-amber-400 text-amber-400" />;
    }
    return <FileText className="h-4 w-4 text-slate-400" />;
  };

  const renderDoc = (doc: DocTreeItem, level = 0): JSX.Element => {
    const hasChildren = doc.children.length > 0;
    const isExpanded = expandedIds.has(doc.id);
    const isSelected = selectedDocId === doc.id && isDocumentLikeTab;

    return (
      <div key={doc.id}>
        <div
          className={`group flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 transition ${
            isSelected
              ? 'bg-white font-medium text-emerald-700 shadow-sm ring-1 ring-emerald-100'
              : 'text-slate-700 hover:bg-white/80'
          }`}
          style={{ paddingLeft: `${12 + level * 16}px` }}
          onClick={() => {
            handleTreeSelect(doc);
            if (hasChildren) {
              toggleExpand(doc.id);
            }
          }}
          onContextMenu={(event) => {
            event.preventDefault();
            setContextMenu({ x: event.clientX, y: event.clientY, docId: doc.id });
          }}
        >
          {hasChildren ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                toggleExpand(doc.id);
              }}
              className="rounded p-0.5 text-slate-400 hover:bg-slate-100"
              aria-label={isExpanded ? '收起' : '展开'}
            >
              {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </button>
          ) : (
            <span className="w-4 shrink-0" />
          )}

          <span className="shrink-0">{renderDocIcon(doc)}</span>
          <span className="min-w-0 flex-1 truncate text-sm">{doc.title}</span>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setContextMenu({ x: event.clientX, y: event.clientY, docId: doc.id });
            }}
            className="rounded p-1 opacity-0 transition group-hover:opacity-100 hover:bg-slate-100"
            aria-label="更多操作"
          >
            <MoreHorizontal className="h-3.5 w-3.5 text-slate-400" />
          </button>
        </div>

        {hasChildren && isExpanded && (
          <div className="space-y-1 pt-1">
            {doc.children.map((child) => renderDoc(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  const handleCreateSpace = async () => {
    const name = draftSpaceName.trim();
    if (!name) return;

    setIsCreatingSpace(true);
    setMenuError('');

    try {
      const created = await teamService.createTeam(name);
      if (!created) {
        setMenuError('创建空间失败');
        notify.error('创建空间失败', '请稍后重试。');
        return;
      }

      setTeams((prev) => [created, ...prev]);
      setDraftSpaceName('');
      setShowCreateSpaceDialog(false);
      setWorkspaceMenuOpen(false);
      onEnterTeamSpace(created);
      onTabChange('docs');
      notify.success('空间已创建', `已切换到「${created.name}」。`);
    } catch (error) {
      const message = error instanceof Error ? error.message : '创建空间失败';
      setMenuError(message);
      notify.error('创建空间失败', message);
    } finally {
      setIsCreatingSpace(false);
    }
  };

  const handleSwitchAccount = async (accountId: string) => {
    if (!user || accountId === user.id) {
      setAccountMenuOpen(false);
      return;
    }

    setIsSwitchingAccount(true);
    setMenuError('');

    const result = await authService.switchUser(accountId);
    setIsSwitchingAccount(false);

    if (result.error) {
      setMenuError(result.error);
      notify.error('切换账号失败', result.error);
      return;
    }

    onSessionChange();
    setAccountMenuOpen(false);
    const nextAccount = accounts.find((account) => account.id === accountId);
    notify.success('已切换账号', nextAccount?.nickname || nextAccount?.email || '当前账号');
  };

  const handleJoinSpaceByCode = async () => {
    const nextCode = draftJoinSpaceCode.trim().toUpperCase();
    if (!nextCode) {
      setJoinSpaceError('请输入空间邀请码。');
      return;
    }

    setIsJoiningSpace(true);
    setJoinSpaceError('');

    try {
      const joinedTeam = await teamService.joinByInviteCode(nextCode);
      if (!joinedTeam) {
        setJoinSpaceError('加入空间失败，请检查邀请码后重试。');
        notify.error('加入空间失败', '请检查邀请码后重试。');
        return;
      }

      setTeams((current) => {
        if (current.some((team) => team.id === joinedTeam.id)) {
          return current;
        }
        return [joinedTeam, ...current];
      });
      setDraftJoinSpaceCode('');
      setShowJoinSpaceDialog(false);
      setAccountMenuOpen(false);
      onEnterTeamSpace(joinedTeam);
      onTabChange('docs');
      notify.success('已加入空间', joinedTeam.name);
    } catch (error) {
      const message = error instanceof Error ? error.message : '邀请码无效或已失效。';
      setJoinSpaceError(message);
      notify.error('加入空间失败', message);
    } finally {
      setIsJoiningSpace(false);
    }
  };

  const handleAcceptInvitation = async (invitation: TeamInvitation) => {
    setBusyInvitationId(invitation.id);
    setNotificationError('');

    try {
      const joinedTeam = await teamService.acceptInvitation(invitation.id);
      if (!joinedTeam) {
        setNotificationError('接受邀请失败');
        notify.error('接受邀请失败', '请稍后重试。');
        return;
      }

      setPendingInvitations((current) => current.filter((item) => item.id !== invitation.id));
      setTeams((current) => {
        if (current.some((team) => team.id === joinedTeam.id)) {
          return current;
        }
        return [joinedTeam, ...current];
      });
      setNotificationMenuOpen(false);
      onEnterTeamSpace(joinedTeam);
      onTabChange('docs');
      notify.success('已加入空间', joinedTeam.name);
    } catch (error) {
      const message = error instanceof Error ? error.message : '接受邀请失败';
      setNotificationError(message);
      notify.error('接受邀请失败', message);
    } finally {
      setBusyInvitationId(null);
    }
  };

  const handleRejectInvitation = async (invitationId: string) => {
    setBusyInvitationId(invitationId);
    setNotificationError('');

    try {
      const ok = await teamService.rejectInvitation(invitationId);
      if (!ok) {
        setNotificationError('拒绝邀请失败');
        notify.error('忽略邀请失败', '请稍后重试。');
        return;
      }

      setPendingInvitations((current) => current.filter((item) => item.id !== invitationId));
      notify.success('已忽略邀请');
    } catch (error) {
      const message = error instanceof Error ? error.message : '拒绝邀请失败';
      setNotificationError(message);
      notify.error('忽略邀请失败', message);
    } finally {
      setBusyInvitationId(null);
    }
  };

  const handleCopyPublicLink = async (shareToken: string, key: string) => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/share/${shareToken}`);
      setCopiedNotificationKey(key);
      window.setTimeout(() => setCopiedNotificationKey(''), 1800);
      notify.copied('分享链接已复制');
    } catch {
      setCopiedNotificationKey('');
      setNotificationError('复制分享链接失败');
      notify.error('复制失败', '请检查浏览器剪贴板权限。');
    }
  };

  const openPublicTab = () => {
    setNotificationMenuOpen(false);
    onTabChange('public');
  };

  const openSpaceManagement = (teamId: string, section = 'overview') => {
    setWorkspaceMenuOpen(false);
    navigate(`/spaces/${encodeURIComponent(teamId)}/manage?section=${encodeURIComponent(section)}`);
  };

  const handleWorkspaceAction = (team: Team) => {
    const isOwnerSpace = !!team.is_owner;
    setWorkspaceActionDialog({
      title: isOwnerSpace ? '解散空间' : '退出空间',
      message: isOwnerSpace
        ? `确定要解散「${team.name}」吗？\n解散后，空间成员会收到通知，原空间内容会进入 7 天回收保留期。`
        : `确定要退出「${team.name}」吗？\n退出后，你将无法继续访问这个空间的内容。`,
      tone: 'danger',
      confirmText: isOwnerSpace ? '确认解散' : '确认退出',
      onConfirm: async () => {
        setBusyWorkspaceActionId(team.id);
        try {
          if (isOwnerSpace) {
            await teamService.dissolveTeam(team.id);
            notify.success('空间已解散', `${team.name} 的内容将保留 7 天。`);
          } else {
            await teamService.leaveTeam(team.id);
            notify.success('已退出空间', team.name);
          }

          setTeams((current) => current.filter((item) => item.id !== team.id));
          if (activeWorkspaceTeam?.id === team.id) {
            onLeaveTeamSpace();
            onTabChange('docs');
          }
          setWorkspaceMenuOpen(false);
        } catch (actionError) {
          notify.error(
            isOwnerSpace ? '解散空间失败' : '退出空间失败',
            actionError instanceof Error ? actionError.message : '请稍后重试。',
          );
          throw actionError;
        } finally {
          setBusyWorkspaceActionId(null);
        }
      },
    });
  };

  const openNotificationAction = (notification: UserNotification) => {
    setNotificationMenuOpen(false);
    setNotificationDetailDialog(notification);
  };

  const buildNotificationDetailMessage = (notification: UserNotification) => {
    const lines = [notification.content];

    if (notification.team?.name) {
      lines.push(`相关空间：${notification.team.name}`);
    }

    if (notification.actor_user) {
      lines.push(`发起人：${notification.actor_user.nickname || notification.actor_user.email}`);
    }

    lines.push(`通知时间：${new Date(notification.created_at).toLocaleString('zh-CN')}`);

    return lines.join('\n');
  };

  return (
    <>
      <aside className="app-page-enter relative flex h-full min-h-0 w-[244px] min-w-[244px] shrink-0 flex-col overflow-visible border-r border-slate-200 bg-[#f7f5f1] lg:w-[256px] lg:min-w-[256px]">
        <div className="border-b border-slate-200 px-3 py-3">
          <div className="flex items-center gap-2">
            <div ref={workspaceMenuRef} className="relative flex-1">
              <button
                type="button"
                onClick={() => {
                  setWorkspaceMenuOpen((prev) => !prev);
                  setAccountMenuOpen(false);
                  setNotificationMenuOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left hover:bg-white/80"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-green-400 shadow-sm">
                  <BookOpen className="h-4 w-4 text-white" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-base font-semibold text-slate-900">语雀</div>
                  <div className="truncate text-xs text-slate-500">{workspaceSubLabel}</div>
                </div>
                <ChevronDown className="h-4 w-4 text-slate-400" />
              </button>

              {workspaceMenuOpen && (
                <div className="app-modal-enter app-soft-surface absolute left-0 top-[calc(100%+8px)] z-50 w-[min(264px,calc(100vw-16px))] max-w-[calc(100vw-16px)] rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl">
                  {activeWorkspaceTeam && (
                    <div className="-mx-1 mb-5 rounded-[24px] border border-slate-200/80 bg-gradient-to-b from-slate-50 to-white p-3.5 shadow-[0_10px_24px_rgba(15,23,42,0.08)]">
                      <div className="flex items-start gap-3">
                        {activeWorkspaceTeam.avatar_url ? (
                          <img
                            src={activeWorkspaceTeam.avatar_url}
                            alt={activeWorkspaceTeam.name}
                            className="h-9 w-9 shrink-0 rounded-2xl object-cover shadow-sm"
                          />
                        ) : (
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-blue-400 text-white shadow-sm">
                            <Users className="h-4.5 w-4.5" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold text-slate-900">{activeWorkspaceTeam.name}</div>
                          <div className="mt-1 text-xs text-slate-500">
                            {activeTeamMemberCount} 位成员
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 rounded-[20px] border border-white/80 bg-white px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-[11px] text-slate-400">成员数</div>
                            <div className="mt-0.5 text-sm font-semibold text-slate-900">
                              {activeTeamMemberCount}
                              <span className="ml-1 text-xs font-normal text-slate-400">/{activeWorkspaceTeam.member_limit ?? 10}</span>
                            </div>
                          </div>
                          {activeWorkspaceTeam.is_owner ? (
                            <button
                              type="button"
                              onClick={() => openSpaceManagement(activeWorkspaceTeam.id, 'members')}
                              className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-slate-600 transition hover:text-slate-900"
                            >
                              管理成员
                            </button>
                          ) : null}
                        </div>

                        <div className="mt-3 border-t border-slate-100 pt-3">
                          <div className="text-[11px] text-slate-400">管理员</div>
                          <div className="mt-1.5 flex min-w-0 items-center gap-2">
                            {activeTeamOwner?.avatar_url ? (
                              <img
                                src={activeTeamOwner.avatar_url}
                                alt={activeTeamOwner.nickname}
                                className="h-6 w-6 shrink-0 rounded-full object-cover"
                              />
                            ) : (
                              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[10px] font-semibold text-slate-700">
                                {getInitials(activeTeamOwner?.nickname || activeWorkspaceTeam.name)}
                              </div>
                            )}
                            <div className="truncate text-sm font-medium text-slate-800">
                              {activeTeamOwner?.nickname || activeTeamOwner?.email || '空间管理员'}
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => openSpaceManagement(activeWorkspaceTeam.id)}
                          className="mt-3 inline-flex w-full items-center justify-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-100"
                        >
                          <Settings className="h-4 w-4" />
                          {activeWorkspaceManageLabel}
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="text-sm font-medium text-slate-400">个人</div>
                  <button
                    type="button"
                    onClick={() => {
                      onLeaveTeamSpace();
                      onTabChange('docs');
                      setWorkspaceMenuOpen(false);
                    }}
                    className="mt-3 flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left hover:bg-slate-50"
                  >
                    {user?.avatar_url ? (
                      <img src={user.avatar_url} alt={user.nickname} className="h-11 w-11 rounded-2xl object-cover" />
                    ) : (
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-900 to-slate-700 text-sm font-semibold text-white">
                        {getInitials(user?.nickname || '')}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-slate-900">{user?.nickname || '当前账号'}</div>
                      <div className="truncate text-sm text-slate-500">我自己</div>
                    </div>
                    {!activeWorkspaceTeam && <Check className="h-4 w-4 text-slate-900" />}
                  </button>

                  <div className="mt-5 text-sm font-medium text-slate-400">空间</div>
                  <div className="mt-3 space-y-2">
                    {teams.map((team) => (
                      <button
                        key={team.id}
                        type="button"
                        onClick={() => {
                          onEnterTeamSpace(team);
                          onTabChange('docs');
                          setWorkspaceMenuOpen(false);
                        }}
                        className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left hover:bg-slate-50"
                      >
                        {team.avatar_url ? (
                          <img
                            src={team.avatar_url}
                            alt={team.name}
                            className="h-11 w-11 shrink-0 rounded-2xl object-cover"
                          />
                        ) : (
                          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-blue-400 text-white">
                            <Users className="h-5 w-5" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold text-slate-900">{team.name}</div>
                          <div className="truncate text-sm text-slate-500">
                            {team.is_owner ? '你创建的空间' : '已加入空间'}
                          </div>
                        </div>
                        {activeWorkspaceTeam?.id === team.id && <Check className="h-4 w-4 text-slate-900" />}
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            void handleWorkspaceAction(team);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              event.stopPropagation();
                              void handleWorkspaceAction(team);
                            }
                          }}
                          className={`ml-1 inline-flex shrink-0 items-center rounded-xl px-2.5 py-1 text-xs font-medium ${
                            team.is_owner
                              ? 'bg-rose-50 text-rose-600'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {busyWorkspaceActionId === team.id ? '处理中...' : team.is_owner ? '解散' : '退出'}
                        </span>
                      </button>
                    ))}

                    <button
                      type="button"
                      onClick={() => {
                        setDraftSpaceName('');
                        setShowCreateSpaceDialog(true);
                      }}
                      className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left hover:bg-slate-50"
                    >
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600">
                        <Plus className="h-5 w-5" />
                      </div>
                      <div className="text-sm font-medium text-slate-900">创建空间</div>
                    </button>
                  </div>

                  {menuError && (
                    <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600">
                      {menuError}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div ref={notificationMenuRef} className="relative">
              <button
                type="button"
                onClick={() => {
                  setNotificationMenuOpen((prev) => !prev);
                  setWorkspaceMenuOpen(false);
                  setAccountMenuOpen(false);
                  if (!notificationMenuOpen) {
                    void loadNotificationFeed();
                  }
                }}
                className="relative rounded-xl p-2 text-slate-500 transition hover:bg-white/80 hover:text-slate-700"
                aria-label="消息"
              >
                <Bell className="h-5 w-5" />
                {notificationBadgeCount > 0 ? (
                  <span className="absolute -right-1 -top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">
                    {notificationBadgeCount > 99 ? '99+' : notificationBadgeCount}
                  </span>
                ) : null}
              </button>

              {notificationMenuOpen ? (
                <div className="app-modal-enter app-soft-surface absolute left-0 top-[calc(100%+8px)] z-50 max-h-[78vh] w-[min(420px,calc(100vw-16px))] max-w-[calc(100vw-16px)] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl">
                  <div className="rounded-2xl bg-slate-50 px-4 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">消息中心</div>
                        <div className="mt-1 text-xs text-slate-500">
                          {`空间邀请 ${pendingInvitations.length} 条，空间分享 ${publicShareItems.length} 个`}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void loadNotificationFeed()}
                        className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 transition hover:bg-white"
                      >
                        {isLoadingNotifications ? '刷新中...' : '刷新'}
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 space-y-2">
                    {pendingInvitations.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
                        暂时没有新消息
                      </div>
                    ) : (
                      pendingInvitations.map((invitation) => {
                        const isBusy = busyInvitationId === invitation.id;
                        return (
                          <div key={invitation.id} className="rounded-2xl border border-slate-200 px-4 py-4">
                            <div className="text-sm font-semibold text-slate-900">
                              邀请你加入「{invitation.team?.name || '未命名空间'}」
                            </div>
                            <div className="mt-1 text-xs text-slate-500">
                              账号：{invitation.invited_user?.email || invitation.invited_email || user?.email || '当前账号'}
                            </div>
                            <div className="mt-1 text-xs text-slate-400">
                              发起时间：{new Date(invitation.created_at).toLocaleString('zh-CN')}
                            </div>
                            <div className="mt-3 flex gap-2">
                              <button
                                type="button"
                                onClick={() => void handleAcceptInvitation(invitation)}
                                disabled={busyInvitationId !== null}
                                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-slate-900 px-3 py-2.5 text-sm text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                <Check className="h-4 w-4" />
                                {isBusy ? '处理中...' : '接受'}
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleRejectInvitation(invitation.id)}
                                disabled={busyInvitationId !== null}
                                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                <X className="h-4 w-4" />
                                忽略
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  <div className="mt-3 rounded-2xl border border-slate-200 px-4 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">空间分享</div>
                        <div className="mt-1 text-xs text-slate-500">
                          {publicShareItems.length > 0 ? `当前空间分享了 ${publicShareItems.length} 个资源` : '当前空间没有分享资源'}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={openPublicTab}
                        className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 transition hover:bg-slate-50"
                      >
                        打开分享页
                      </button>
                    </div>

                    <div className="mt-3 space-y-2">
                      {publicShareItems.length === 0 ? (
                        <div className="rounded-2xl bg-slate-50 px-4 py-5 text-center text-sm text-slate-500">
                          当前空间还没有分享的笔记或文件
                        </div>
                      ) : (
                        publicShareItems.map((item) => {
                          const copyKey = `public:${item.id}`;
                          return (
                            <div key={item.id} className="rounded-2xl bg-slate-50 px-4 py-4">
                              <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="truncate text-sm font-semibold text-slate-900">{item.title}</div>
                                  <div className="mt-1 text-xs text-slate-500">
                                    {item.kind === 'document' ? '分享笔记' : '分享文件'}
                                  </div>
                                  <div className="mt-1 text-xs text-slate-400">
                                    更新时间：{new Date(item.updatedAt).toLocaleString('zh-CN')}
                                  </div>
                                </div>
                                <Globe className="h-4 w-4 shrink-0 text-slate-400" />
                              </div>
                              <div className="mt-3 flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => void handleCopyPublicLink(item.shareToken, copyKey)}
                                  className="inline-flex flex-1 items-center justify-center rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700 transition hover:bg-white"
                                >
                                  {copiedNotificationKey === copyKey ? '已复制' : '复制链接'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => window.open(`${window.location.origin}/share/${item.shareToken}`, '_blank', 'noopener,noreferrer')}
                                  className="inline-flex flex-1 items-center justify-center rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700 transition hover:bg-white"
                                >
                                  查看分享
                                </button>
                              </div>
                            </div>
                          );
                        })
                      )}
	                    </div>
	                  </div>

	                  <div className="mt-3 rounded-2xl border border-slate-200 px-4 py-4">
	                    <div className="flex items-center justify-between gap-3">
	                      <div>
	                        <div className="text-sm font-semibold text-slate-900">空间消息</div>
	                        <div className="mt-1 text-xs text-slate-500">
	                          {notifications.length > 0 ? `共有 ${notifications.length} 条通知` : '暂时没有新的空间消息'}
	                        </div>
	                      </div>
	                    </div>

	                    <div className="mt-3 space-y-2">
	                      {notifications.length === 0 ? (
	                        <div className="rounded-2xl bg-slate-50 px-4 py-5 text-center text-sm text-slate-500">
	                          当前没有新的通知
	                        </div>
	                      ) : (
	                        notifications.map((item) => (
	                          <div key={item.id} className="rounded-2xl bg-slate-50 px-4 py-4">
	                            <div className="flex items-start justify-between gap-3">
	                              <div className="min-w-0">
	                                <div className="flex items-center gap-2">
	                                  <div className="truncate text-sm font-semibold text-slate-900">{item.title}</div>
	                                  {!item.is_read ? <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" /> : null}
	                                </div>
	                                <div className="mt-1 text-xs leading-5 text-slate-500">{item.content}</div>
	                                <div className="mt-2 text-[11px] text-slate-400">
	                                  {new Date(item.created_at).toLocaleString('zh-CN')}
	                                </div>
	                              </div>
	                              {item.actor_user?.avatar_url ? (
	                                <img
	                                  src={item.actor_user.avatar_url}
	                                  alt={item.actor_user.nickname}
	                                  className="h-8 w-8 shrink-0 rounded-full object-cover"
	                                />
	                              ) : item.actor_user ? (
	                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[11px] font-semibold text-slate-700">
	                                  {getInitials(item.actor_user.nickname || item.actor_user.email || '?')}
	                                </div>
	                              ) : null}
	                            </div>

		                            {true ? (
	                              <div className="mt-3">
	                                <button
	                                  type="button"
	                                  onClick={() => openNotificationAction(item)}
	                                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-100"
	                                >
	                                  打开
	                                </button>
	                              </div>
	                            ) : null}
	                          </div>
	                        ))
	                      )}
	                    </div>
	                  </div>

	                  <div className="mt-3 rounded-2xl border border-slate-200 px-4 py-4">
                    <div className="text-sm font-semibold text-slate-900">系统通知</div>
                    <div className="mt-3 space-y-2">
                      {systemNotifications.map((item) => (
                        <div key={item.id} className="rounded-2xl bg-slate-50 px-4 py-4">
                          <div className="text-sm font-semibold text-slate-900">{item.title}</div>
                          <div className="mt-1 text-xs leading-5 text-slate-500">{item.detail}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {notificationError ? (
                    <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600">
                      {notificationError}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div ref={accountMenuRef} className="relative">
              <button
                type="button"
                onClick={() => {
                  setAccountMenuOpen((prev) => !prev);
                  setWorkspaceMenuOpen(false);
                  setNotificationMenuOpen(false);
                }}
                className="rounded-full p-0.5 transition hover:bg-white/80"
                aria-label="账号菜单"
              >
                {user?.avatar_url ? (
                  <img src={user.avatar_url} alt={user.nickname} className="h-9 w-9 rounded-full object-cover" />
                ) : (
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-rose-300 to-stone-500 text-sm font-semibold text-white">
                    {getInitials(user?.nickname || '')}
                  </div>
                )}
              </button>

              {accountMenuOpen && (
                <div className="app-modal-enter app-soft-surface absolute left-0 top-[calc(100%+8px)] z-50 w-[min(320px,calc(100vw-16px))] max-w-[calc(100vw-16px)] rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl">
                  <div className="rounded-2xl bg-slate-50 px-4 py-4">
                    <div className="text-sm font-semibold text-slate-900">{user?.nickname || '当前账号'}</div>
                    <div className="mt-1 text-sm text-slate-500">{user?.email}</div>
                  </div>

                  <div className="mt-3 space-y-1">
                    <button
                      type="button"
                      onClick={() => {
                        setShowProfileModal(true);
                        setAccountMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50"
                    >
                      <Edit3 className="h-4 w-4" />
                      编辑个人资料
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowJoinSpaceDialog(true);
                        setDraftJoinSpaceCode('');
                        setJoinSpaceError('');
                        setAccountMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50"
                    >
                      <Users className="h-4 w-4" />
                      加入空间
                    </button>
                  </div>

                  {dissolvedTeams.length > 0 && (
                    <div className="mt-3">
                      <div className="flex items-center justify-between px-3">
                        <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">回收站</div>
                        <button
                          type="button"
                          onClick={() => {
                            window.open('/spaces/recycle', '_blank', 'noopener,noreferrer');
                            setAccountMenuOpen(false);
                          }}
                          className="text-xs text-emerald-600 hover:text-emerald-700"
                        >
                          查看全部
                        </button>
                      </div>
                      <div className="mt-2 space-y-1">
                        {dissolvedTeams.slice(0, 3).map((team) => (
                          <button
                            key={team.id}
                            type="button"
                            onClick={() => {
                              window.open(`/spaces/${encodeURIComponent(team.id)}/recycle`, '_blank', 'noopener,noreferrer');
                              setAccountMenuOpen(false);
                            }}
                            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50"
                          >
                            <Archive className="h-4 w-4 text-slate-400" />
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-medium text-slate-900">{team.name}</div>
                              <div className="truncate text-xs text-slate-500">
                                保留至 {new Date(team.retention_until!).toLocaleDateString('zh-CN')}
                              </div>
                            </div>
                          </button>
                        ))}
                        {dissolvedTeams.length > 3 && (
                          <button
                            type="button"
                            onClick={() => {
                              window.open('/spaces/recycle', '_blank', 'noopener,noreferrer');
                              setAccountMenuOpen(false);
                            }}
                            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-emerald-700 hover:bg-emerald-50"
                          >
                            <Archive className="h-4 w-4" />
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-medium">
                                还有 {dissolvedTeams.length - 3} 个已解散空间...
                              </div>
                            </div>
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="mt-4 border-t border-slate-100 pt-4">
                    <div className="px-3 text-xs font-medium uppercase tracking-[0.18em] text-slate-400">切换账号</div>
                    <div className="mt-2 space-y-1">
                      {accounts.map((account) => (
                        <button
                          key={account.id}
                          type="button"
                          onClick={() => void handleSwitchAccount(account.id)}
                          disabled={isSwitchingAccount}
                          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-slate-50 disabled:opacity-60"
                        >
                          {account.avatar_url ? (
                            <img src={account.avatar_url} alt={account.nickname} className="h-9 w-9 rounded-full object-cover" />
                          ) : (
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-700">
                              {getInitials(account.nickname)}
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium text-slate-900">{account.nickname}</div>
                            <div className="truncate text-xs text-slate-500">{account.email}</div>
                          </div>
                          {user?.id === account.id && <Check className="h-4 w-4 text-emerald-600" />}
                        </button>
                      ))}
                    </div>
                  </div>

                  {menuError && (
                    <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600">
                      {menuError}
                    </div>
                  )}

                  <div className="mt-4 border-t border-slate-100 pt-3">
                    <button
                      type="button"
                      onClick={onLogout}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-rose-600 hover:bg-rose-50"
                    >
                      <LogOut className="h-4 w-4" />
                      退出登录
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="px-3 py-3">
          <div className="flex items-center gap-2">
            <label className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
	              <input
	                type="text"
	                name="workspace-search"
	                autoComplete="off"
	                autoCorrect="off"
	                autoCapitalize="none"
	                spellCheck={false}
	                value={searchQuery}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder="搜索"
                className="w-full rounded-2xl border border-slate-200 bg-white py-2.5 pl-10 pr-16 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] text-slate-400">
                Ctrl J
              </span>
            </label>

            <button
              type="button"
              onClick={() => onCreateDoc(createParentId)}
              className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50"
              aria-label="新建笔记"
            >
              <Plus className="h-5 w-5" />
            </button>
          </div>
        </div>

        <nav className="px-3">
          {shortcutItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => handleShortcut(item.key)}
                className={`mb-1 flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm transition ${
                  isActive
                    ? 'bg-white font-medium text-slate-900 shadow-sm'
                    : 'text-slate-700 hover:bg-white/80'
                }`}
              >
                <Icon className={`h-4 w-4 ${isActive ? 'text-slate-900' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="mt-3 min-h-0 flex-1 overflow-y-auto px-3 pb-4">
          <div className="app-section-enter rounded-[24px] bg-[#f2efe8] px-2 py-2">
            <button
              type="button"
              onClick={() => setKnowledgeBaseOpen((prev) => !prev)}
              className="flex w-full items-center gap-2 rounded-2xl px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-white/50"
            >
              {knowledgeBaseOpen ? (
                <ChevronDown className="h-4 w-4 text-slate-400" />
              ) : (
                <ChevronRight className="h-4 w-4 text-slate-400" />
              )}
              <span>知识库</span>
            </button>

            {knowledgeBaseOpen && (
              <div className="mt-1 space-y-1">
                {(activeTab === 'star' ? starredDocs.length === 0 : filteredTree.length === 0) ? (
                  <div className="rounded-2xl px-4 py-6 text-center text-sm text-slate-400">
                    {activeTab === 'star' ? '这里还没有收藏内容' : '这里还没有内容'}
                    {activeTab !== 'star' && (
                      <button
                        type="button"
                        onClick={() => onCreateFolder(createParentId)}
                        className="mt-3 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
                      >
                        新建文件夹
                      </button>
                    )}
                  </div>
                ) : (
                  (activeTab === 'star' ? starredDocs : filteredTree).map((doc) => renderDoc(doc))
                )}
              </div>
            )}
          </div>
        </div>

        <div aria-hidden="true" className="h-[156px] shrink-0" />

        {contextMenu && (
          <div
            ref={contextMenuRef}
            className="app-modal-enter app-soft-surface fixed z-[80] min-w-[160px] rounded-2xl border border-slate-200 bg-white p-1 shadow-2xl"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => {
                onToggleStar(contextMenu.docId);
                setContextMenu(null);
              }}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
            >
              <Star className="h-4 w-4" />
              {contextTarget?.is_starred ? '取消收藏' : '收藏'}
            </button>

	            {contextTarget?.icon === 'folder' && (
	              <>
                <button
                  type="button"
                  onClick={() => {
                    onCreateDoc(contextMenu.docId);
                    setContextMenu(null);
                  }}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                >
                  <FilePlus className="h-4 w-4" />
                  新建笔记
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onCreateFolder(contextMenu.docId);
                    setContextMenu(null);
                  }}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                >
                  <FolderPlus className="h-4 w-4" />
                  新建文件夹
                </button>
	              </>
	            )}

	            {contextTarget?.icon !== 'folder' && (
	              <>
	                <button
	                  type="button"
	                  onClick={() => {
	                    if (contextTarget) {
	                      onShareDoc({
	                        id: contextTarget.id,
	                        title: contextTarget.title,
	                        team_id: contextTarget.team_id ?? null,
	                      });
	                    }
	                    setContextMenu(null);
	                  }}
	                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
	                >
	                  <Globe className="h-4 w-4" />
	                  分享
	                </button>
	                <div className="my-1 h-px bg-slate-100" />
	              </>
	            )}

	            <button
	              type="button"
              onClick={() => {
                if (contextTarget) {
                  onRequestRenameDoc(contextTarget.id, contextTarget.title);
                }
                setContextMenu(null);
              }}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
            >
              <Edit3 className="h-4 w-4" />
              重命名
            </button>

            <div className="my-1 h-px bg-slate-100" />

            <button
              type="button"
              onClick={() => {
                onDeleteDoc(contextMenu.docId);
                setContextMenu(null);
              }}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-rose-600 hover:bg-rose-50"
            >
              <Trash2 className="h-4 w-4" />
              删除
            </button>
          </div>
        )}

      </aside>

      <NameInputModal
        isOpen={showCreateSpaceDialog}
        title="创建空间"
        description="先输入空间名称，再创建新的团队空间。"
        label="空间名称"
        value={draftSpaceName}
        placeholder="例如：产品团队"
        confirmText={isCreatingSpace ? '创建中...' : '创建空间'}
        onChange={setDraftSpaceName}
        onConfirm={() => void handleCreateSpace()}
        onCancel={() => {
          if (isCreatingSpace) return;
          setShowCreateSpaceDialog(false);
        }}
      />

      <NameInputModal
        isOpen={showJoinSpaceDialog}
        title="加入空间"
        description="输入空间邀请码后即可加入对应空间。"
        label="空间邀请码"
        value={draftJoinSpaceCode}
        error={joinSpaceError}
        placeholder="请输入邀请码"
        confirmText={isJoiningSpace ? '加入中...' : '加入空间'}
        onChange={(value) => {
          setDraftJoinSpaceCode(value.replace(/\s+/g, '').toUpperCase());
          if (joinSpaceError) {
            setJoinSpaceError('');
          }
        }}
        onConfirm={() => void handleJoinSpaceByCode()}
        onCancel={() => {
          if (isJoiningSpace) return;
          setShowJoinSpaceDialog(false);
          setDraftJoinSpaceCode('');
          setJoinSpaceError('');
        }}
      />

      <ActionDialog
        isOpen={!!workspaceActionDialog}
        title={workspaceActionDialog?.title || ''}
        message={workspaceActionDialog?.message || ''}
        tone={workspaceActionDialog?.tone || 'default'}
        confirmText={workspaceActionDialog?.confirmText || '确认'}
        isConfirming={isConfirmingWorkspaceAction}
        onClose={() => {
          if (isConfirmingWorkspaceAction) {
            return;
          }
          setWorkspaceActionDialog(null);
        }}
        onConfirm={async () => {
          if (!workspaceActionDialog) {
            return;
          }

          setIsConfirmingWorkspaceAction(true);
          try {
            await workspaceActionDialog.onConfirm();
            setWorkspaceActionDialog(null);
          } finally {
            setIsConfirmingWorkspaceAction(false);
          }
        }}
      />

      <ActionDialog
        isOpen={!!notificationDetailDialog}
        title={notificationDetailDialog?.title || ''}
        message={notificationDetailDialog ? buildNotificationDetailMessage(notificationDetailDialog) : ''}
        confirmText="我知道了"
        showCancel={false}
        onClose={() => setNotificationDetailDialog(null)}
        onConfirm={() => setNotificationDetailDialog(null)}
      />

      <ProfileSettingsUploadModal
        isOpen={showProfileModal}
        user={user}
        onClose={() => setShowProfileModal(false)}
        onSaved={onUserRefresh}
      />
    </>
  );
}
