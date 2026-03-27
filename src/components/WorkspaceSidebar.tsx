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
  UserPlus,
  Users,
} from 'lucide-react';
import NameInputModal from './NameInputModal';
import ProfileSettingsModal from './ProfileSettingsModal';
import { authService } from '../lib/authApi';
import { teamService } from '../lib/databaseApi';
import type { DocTreeItem } from '../lib/documentsApi';
import type { Team, User } from '../lib/types';
import { useNavigate } from 'react-router-dom';

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
  { key: 'public', label: '公开', icon: Globe },
] as const;

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
  const [knowledgeBaseOpen, setKnowledgeBaseOpen] = useState(true);
  const [teams, setTeams] = useState<Team[]>([]);
  const [accounts, setAccounts] = useState<User[]>([]);
  const [showCreateSpaceDialog, setShowCreateSpaceDialog] = useState(false);
  const [draftSpaceName, setDraftSpaceName] = useState('');
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [isCreatingSpace, setIsCreatingSpace] = useState(false);
  const [isSwitchingAccount, setIsSwitchingAccount] = useState(false);
  const [menuError, setMenuError] = useState('');
  const [activeTeamMemberCount, setActiveTeamMemberCount] = useState(0);
  const [activeTeamOwner, setActiveTeamOwner] = useState<User | null>(null);
  const workspaceMenuRef = useRef<HTMLDivElement | null>(null);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);

  const normalizedQuery = searchQuery.trim().toLowerCase();

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
  const selectedTreeNode = selectedDocId ? docMap.get(selectedDocId) || null : null;
  const contextTarget = contextMenu ? docMap.get(contextMenu.docId) || null : null;
  const createParentId = selectedTreeNode?.icon === 'folder' ? selectedTreeNode.id : selectedTreeNode?.parent_id ?? null;
  const workspaceSubLabel = activeWorkspaceTeam?.name || '个人空间';

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;

      if (workspaceMenuRef.current && !workspaceMenuRef.current.contains(target)) {
        setWorkspaceMenuOpen(false);
      }

      if (accountMenuRef.current && !accountMenuRef.current.contains(target)) {
        setAccountMenuOpen(false);
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
  }, [accountMenuOpen, user?.id]);

  useEffect(() => {
    setWorkspaceMenuOpen(false);
    setAccountMenuOpen(false);
    setShowCreateSpaceDialog(false);
    setShowProfileModal(false);
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
    onTabChange('docs');
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
    const isSelected = selectedDocId === doc.id && activeTab === 'docs';

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
        return;
      }

      setTeams((prev) => [created, ...prev]);
      setDraftSpaceName('');
      setShowCreateSpaceDialog(false);
      setWorkspaceMenuOpen(false);
      onEnterTeamSpace(created);
      onTabChange('docs');
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
      return;
    }

    onSessionChange();
    setAccountMenuOpen(false);
  };

  const openSpaceManagement = (teamId: string, section = 'overview') => {
    setWorkspaceMenuOpen(false);
    navigate(`/spaces/${encodeURIComponent(teamId)}/manage?section=${encodeURIComponent(section)}`);
  };

  return (
    <>
      <aside className="flex h-full min-h-0 w-[244px] min-w-[244px] shrink-0 flex-col overflow-visible border-r border-slate-200 bg-[#f7f5f1] lg:w-[256px] lg:min-w-[256px]">
        <div className="border-b border-slate-200 px-3 py-3">
          <div className="flex items-center gap-2">
            <div ref={workspaceMenuRef} className="relative flex-1">
              <button
                type="button"
                onClick={() => {
                  setWorkspaceMenuOpen((prev) => !prev);
                  setAccountMenuOpen(false);
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
                <div className="absolute left-0 top-[calc(100%+8px)] z-50 w-[min(264px,calc(100vw-16px))] max-w-[calc(100vw-16px)] rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl">
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
                          <button
                            type="button"
                            onClick={() => openSpaceManagement(activeWorkspaceTeam.id, 'members')}
                            className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-slate-600 transition hover:text-slate-900"
                          >
                            <UserPlus className="h-3.5 w-3.5" />
                            邀请成员
                          </button>
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
                          空间管理
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

            <button
              type="button"
              className="relative rounded-xl p-2 text-slate-500 transition hover:bg-white/80 hover:text-slate-700"
              title="通知"
            >
              <Bell className="h-5 w-5" />
              <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-blue-500" />
            </button>

            <div ref={accountMenuRef} className="relative">
              <button
                type="button"
                onClick={() => {
                  setAccountMenuOpen((prev) => !prev);
                  setWorkspaceMenuOpen(false);
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
                <div className="absolute left-0 top-[calc(100%+8px)] z-50 w-[min(320px,calc(100vw-16px))] max-w-[calc(100vw-16px)] rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl">
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
                  </div>

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
              title="新建笔记"
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

        <div className="mt-3 flex-1 overflow-y-auto px-3 pb-4">
          <div className="rounded-[24px] bg-[#f2efe8] px-2 py-2">
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
                {filteredTree.length === 0 ? (
                  <div className="rounded-2xl px-4 py-6 text-center text-sm text-slate-400">
                    这里还没有内容
                    <button
                      type="button"
                      onClick={() => onCreateFolder(createParentId)}
                      className="mt-3 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
                    >
                      新建文件夹
                    </button>
                  </div>
                ) : (
                  filteredTree.map((doc) => renderDoc(doc))
                )}
              </div>
            )}
          </div>
        </div>

        {contextMenu && (
          <div
            ref={contextMenuRef}
            className="fixed z-[80] min-w-[160px] rounded-2xl border border-slate-200 bg-white p-1 shadow-2xl"
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

      <ProfileSettingsModal
        isOpen={showProfileModal}
        user={user}
        onClose={() => setShowProfileModal(false)}
        onSaved={onUserRefresh}
      />
    </>
  );
}
