import { useMemo, useState } from 'react';
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  Clock,
  Edit3,
  File,
  FilePlus,
  FileText,
  FolderOpen,
  FolderPlus,
  Globe,
  HardDrive,
  LogOut,
  MoreHorizontal,
  Search,
  Star,
  Trash2,
  Users,
} from 'lucide-react';
import type { DocTreeItem } from '../lib/documentsApi';
import type { User } from '../lib/types';

interface SidebarProps {
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
  user: User | null;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

const tabItems = [
  { key: 'docs', label: '文档', icon: FileText },
  { key: 'files', label: '文件', icon: HardDrive },
  { key: 'teams', label: '团队', icon: Users },
  { key: 'public', label: '公开', icon: Globe },
  { key: 'star', label: '收藏', icon: Star },
  { key: 'recent', label: '最近', icon: Clock },
] as const;

const docTabs = new Set(['docs', 'star', 'recent']);

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

export default function SidebarPanel({
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
  user,
  searchQuery,
  onSearchChange,
}: SidebarProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; docId: string } | null>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const isDocTab = docTabs.has(activeTab);

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
  const selectedTreeNode = selectedDocId ? docMap.get(selectedDocId) || null : null;
  const contextTarget = contextMenu ? docMap.get(contextMenu.docId) || null : null;

  const filteredDocTree = useMemo(() => filterTree(docTree, normalizedQuery), [docTree, normalizedQuery]);

  const starredTree = useMemo(() => {
    const cloneAll = (node: DocTreeItem): DocTreeItem => ({
      ...node,
      children: node.children.map(cloneAll),
    });

    const build = (items: DocTreeItem[], forceIncludeAllChildren = false): DocTreeItem[] =>
      items.reduce<DocTreeItem[]>((acc, item) => {
        const forceForCurrent = forceIncludeAllChildren || (item.is_starred && item.icon === 'folder');

        if (forceForCurrent) {
          acc.push({
            ...item,
            children: item.children.map(cloneAll),
          });
          return acc;
        }

        const children = build(item.children, false);
        if (item.is_starred || children.length > 0) {
          acc.push({
            ...item,
            children,
          });
        }

        return acc;
      }, []);

    return filterTree(build(docTree), normalizedQuery);
  }, [docTree, normalizedQuery]);

  const recentDocs = useMemo(() => {
    const docs = [...allDocs]
      .filter((item) => item.icon !== 'folder')
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      .slice(0, 12);

    if (!normalizedQuery) return docs;
    return docs.filter((item) => item.title.toLowerCase().includes(normalizedQuery));
  }, [allDocs, normalizedQuery]);

  const createParentId = useMemo(() => {
    if (!selectedTreeNode) return null;
    if (selectedTreeNode.icon === 'folder') return selectedTreeNode.id;
    return selectedTreeNode.parent_id;
  }, [selectedTreeNode]);

  const closeContextMenu = () => setContextMenu(null);

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

  const getDocIcon = (icon?: 'file' | 'folder' | 'star' | null, isStarred?: boolean) => {
    if (icon === 'folder') {
      return <FolderOpen className="h-4 w-4 text-yuque-primary" />;
    }
    if (icon === 'star' || isStarred) {
      return <Star className="h-4 w-4 fill-yuque-accent text-yuque-accent" />;
    }
    return <FileText className="h-4 w-4 text-yuque-textMuted" />;
  };

  const renderDoc = (doc: DocTreeItem, level = 0, forceExpand = false): JSX.Element => {
    const isSelected = selectedDocId === doc.id;
    const hasChildren = doc.children.length > 0;
    const isExpanded = forceExpand || expandedIds.has(doc.id);

    return (
      <div key={doc.id}>
        <div
          className={`group flex cursor-pointer items-center gap-2 px-3 py-2 transition-all duration-150 ${
            isSelected
              ? 'bg-yuque-selected font-medium text-yuque-primary'
              : 'text-yuque-text hover:bg-yuque-hover'
          }`}
          style={{ paddingLeft: `${12 + level * 16}px` }}
          onClick={() => {
            onDocSelect(doc);
            if (hasChildren && !forceExpand) {
              toggleExpand(doc.id);
            }
          }}
          onContextMenu={(event) => {
            event.preventDefault();
            setContextMenu({ x: event.clientX, y: event.clientY, docId: doc.id });
          }}
        >
          {hasChildren ? (
            isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-yuque-textMuted" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-yuque-textMuted" />
            )
          ) : (
            <span className="w-3.5" />
          )}
          <span className="shrink-0">{getDocIcon(doc.icon, doc.is_starred)}</span>
          <span className="flex-1 truncate text-sm">{doc.title}</span>
          <button
            type="button"
            className="rounded p-1 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-gray-200"
            onClick={(event) => {
              event.stopPropagation();
              setContextMenu({ x: event.clientX, y: event.clientY, docId: doc.id });
            }}
            aria-label="更多操作"
          >
            <MoreHorizontal className="h-3.5 w-3.5 text-yuque-textMuted" />
          </button>
        </div>

        {hasChildren && isExpanded && (
          <div className="animate-accordion-down overflow-hidden">
            {doc.children.map((child) => renderDoc(child, level + 1, forceExpand))}
          </div>
        )}
      </div>
    );
  };

  const getInitials = (name: string) => name.charAt(0).toUpperCase();

  return (
    <div className="flex h-full w-64 flex-col border-r border-yuque-border bg-yuque-sidebar" onClick={closeContextMenu}>
      <div className="flex h-14 items-center gap-3 border-b border-yuque-border px-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-yuque-primary to-blue-400">
          <BookOpen className="h-5 w-5 text-white" />
        </div>
        <span className="text-lg font-semibold text-yuque-text">语雀笔记</span>
      </div>

      {isDocTab && (
        <div className="px-3 py-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-yuque-textMuted" />
            <input
              type="text"
              placeholder="搜索文档..."
              value={searchQuery}
              onChange={(event) => onSearchChange(event.target.value)}
              className="w-full rounded-lg border border-yuque-border bg-yuque-background py-2 pl-9 pr-3 text-sm transition-all focus:border-yuque-primary focus:outline-none focus:ring-2 focus:ring-yuque-primary/20"
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-1 px-3 pb-2">
        {tabItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.key;

          return (
            <button
              key={item.key}
              type="button"
              onClick={() => {
                if (item.key === 'files') {
                  onTabChange('files');
                  onFilesSelect();
                  return;
                }
                onTabChange(item.key);
              }}
              className={`flex items-center justify-center gap-1 rounded-md px-2 py-2 text-xs font-medium transition-colors ${
                isActive ? 'bg-yuque-primary text-white' : 'text-yuque-textSecondary hover:bg-yuque-hover'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {isDocTab && (
        <div className="px-3 pb-3">
          <button
            type="button"
            onClick={() => onCreateFolder(createParentId)}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-yuque-primary py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-blue-600 active:scale-[0.98]"
          >
            <FolderPlus className="h-4 w-4" />
            新建文件夹
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {activeTab === 'docs' && (
          <div className="py-1">
            {filteredDocTree.length === 0 ? (
              <div className="py-8 text-center text-yuque-textMuted">
                <FileText className="mx-auto mb-2 h-8 w-8 text-gray-300" />
                <p className="text-sm">暂无文档</p>
                <button
                  type="button"
                  onClick={() => onCreateFolder(createParentId)}
                  className="mt-2 text-sm text-yuque-primary hover:underline"
                >
                  先新建文件夹
                </button>
              </div>
            ) : (
              filteredDocTree.map((doc) => renderDoc(doc))
            )}
          </div>
        )}

        {activeTab === 'star' && (
          <div className="py-2">
            {starredTree.length === 0 ? (
              <div className="py-8 text-center text-yuque-textMuted">
                <Star className="mx-auto mb-2 h-8 w-8 text-gray-300" />
                <p className="text-sm">暂无收藏内容</p>
              </div>
            ) : (
              starredTree.map((doc) => renderDoc(doc, 0, true))
            )}
          </div>
        )}

        {activeTab === 'recent' && (
          <div className="py-2">
            {recentDocs.length === 0 ? (
              <div className="py-8 text-center text-yuque-textMuted">
                <Clock className="mx-auto mb-2 h-8 w-8 text-gray-300" />
                <p className="text-sm">暂无最近访问</p>
              </div>
            ) : (
              <>
                <div className="px-3 py-2 text-xs font-medium text-yuque-textMuted">最近访问</div>
                {recentDocs.map((doc) => (
                  <button
                    key={doc.id}
                    type="button"
                    onClick={() => onDocSelect(doc)}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-yuque-hover ${
                      selectedDocId === doc.id ? 'bg-yuque-selected font-medium text-yuque-primary' : ''
                    }`}
                  >
                    <File className="h-4 w-4 text-yuque-textMuted" />
                    <span className="truncate text-sm">{doc.title}</span>
                  </button>
                ))}
              </>
            )}
          </div>
        )}
      </div>

      <div className="relative border-t border-yuque-border p-3">
        <button
          type="button"
          className="flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-yuque-hover"
          onClick={() => setShowUserMenu((prev) => !prev)}
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-purple-400 to-pink-400 text-sm font-medium text-white">
            {user?.nickname ? getInitials(user.nickname) : '?'}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-yuque-text">{user?.nickname || '用户'}</div>
            <div className="truncate text-xs text-yuque-textMuted">{user?.email || 'email@example.com'}</div>
          </div>
        </button>

        {showUserMenu && (
          <div className="absolute bottom-16 left-3 right-3 z-50 rounded-lg border border-gray-100 bg-white py-1 shadow-dropdown">
            <div className="border-b border-gray-100 px-4 py-2">
              <p className="text-sm font-medium">{user?.nickname}</p>
              <p className="text-xs text-gray-500">{user?.email}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                onLogout();
                setShowUserMenu(false);
              }}
              className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-red-500 hover:bg-gray-50"
            >
              <LogOut className="h-4 w-4" />
              退出登录
            </button>
          </div>
        )}
      </div>

      {contextMenu && (
        <div
          className="fixed z-50 min-w-[160px] animate-scale-in rounded-lg border border-gray-100 bg-white py-1 shadow-dropdown"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => {
              onToggleStar(contextMenu.docId);
              closeContextMenu();
            }}
            className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-yuque-text hover:bg-gray-50"
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
                  closeContextMenu();
                }}
                className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-yuque-text hover:bg-gray-50"
              >
                <FilePlus className="h-4 w-4" />
                新建笔记
              </button>
              <button
                type="button"
                onClick={() => {
                  onCreateFolder(contextMenu.docId);
                  closeContextMenu();
                }}
                className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-yuque-text hover:bg-gray-50"
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
              closeContextMenu();
            }}
            className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-yuque-text hover:bg-gray-50"
          >
            <Edit3 className="h-4 w-4" />
            重命名
          </button>

          <div className="my-1 h-px bg-gray-100" />

          <button
            type="button"
            onClick={() => {
              onDeleteDoc(contextMenu.docId);
              closeContextMenu();
            }}
            className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-red-500 hover:bg-gray-50"
          >
            <Trash2 className="h-4 w-4" />
            删除
          </button>
        </div>
      )}
    </div>
  );
}
