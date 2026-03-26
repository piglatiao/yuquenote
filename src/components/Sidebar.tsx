import { useState, useMemo } from 'react';
import {
  BookOpen,
  FileText,
  ChevronDown,
  ChevronRight,
  Plus,
  MoreHorizontal,
  Search,
  FolderOpen,
  Star,
  Clock,
  Trash2,
  Copy,
  LogOut,
  HardDrive,
  Trash,
  File,
} from 'lucide-react';
import type { User } from '../lib/types';
import type { DocTreeItem } from '../lib/documents';

interface SidebarProps {
  onDocSelect: (doc: DocTreeItem) => void;
  onFilesSelect: () => void;
  selectedDocId: string;
  activeTab: string;
  onTabChange: (tab: string) => void;
  docTree: DocTreeItem[];
  onCreateDoc: () => void;
  onDeleteDoc: (id: string) => void;
  onToggleStar: (id: string) => void;
  onLogout: () => void;
  user: User | null;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export default function Sidebar({
  onDocSelect,
  onFilesSelect,
  selectedDocId,
  activeTab,
  onTabChange,
  docTree,
  onCreateDoc,
  onDeleteDoc,
  onToggleStar,
  onLogout,
  user,
  searchQuery,
  onSearchChange,
}: SidebarProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set(['doc-1', 'doc-2', 'doc-3']));
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; docId: string } | null>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleContextMenu = (e: React.MouseEvent, docId: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, docId });
  };

  const closeContextMenu = () => setContextMenu(null);

  // Filter docs based on search
  const filteredDocTree = useMemo(() => {
    if (!searchQuery.trim()) return docTree;

    const query = searchQuery.toLowerCase();

    const filterTree = (items: DocTreeItem[]): DocTreeItem[] => {
      return items.reduce<DocTreeItem[]>((acc, item) => {
        const matchesTitle = item.title.toLowerCase().includes(query);
        const filteredChildren = filterTree(item.children);

        if (matchesTitle || filteredChildren.length > 0) {
          acc.push({
            ...item,
            children: filteredChildren,
            expanded: matchesTitle ? true : item.expanded,
          });
        }

        return acc;
      }, []);
    };

    return filterTree(docTree);
  }, [docTree, searchQuery]);

  // Get starred docs
  const starredDocs = useMemo(() => {
    const flatten = (items: DocTreeItem[]): DocTreeItem[] => {
      return items.reduce<DocTreeItem[]>((acc, item) => {
        if (item.is_starred) {
          acc.push(item);
        }
        if (item.children.length > 0) {
          acc.push(...flatten(item.children));
        }
        return acc;
      }, []);
    };
    return flatten(docTree);
  }, [docTree]);

  // Get recent docs (last 5 updated)
  const recentDocs = useMemo(() => {
    const flatten = (items: DocTreeItem[]): DocTreeItem[] => {
      return items.reduce<DocTreeItem[]>((acc, item) => {
        acc.push(item);
        if (item.children.length > 0) {
          acc.push(...flatten(item.children));
        }
        return acc;
      }, []);
    };

    return flatten(docTree)
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      .slice(0, 5);
  }, [docTree]);

  const getIcon = (icon?: 'file' | 'folder' | 'star' | null, isStarred?: boolean) => {
    if (icon === 'folder') {
      return <FolderOpen className="w-4 h-4 text-yuque-primary" />;
    }
    if (icon === 'star' || isStarred) {
      return <Star className="w-4 h-4 text-yuque-accent fill-yuque-accent" />;
    }
    return <FileText className="w-4 h-4 text-yuque-textMuted" />;
  };

  const renderDoc = (doc: DocTreeItem, level: number = 0): JSX.Element => {
    const isSelected = selectedDocId === doc.id;
    const hasChildren = doc.children && doc.children.length > 0;
    const isExpanded = expandedIds.has(doc.id);

    return (
      <div key={doc.id}>
        <div
          className={`group flex items-center gap-2 px-3 py-2 cursor-pointer transition-all duration-150 ${
            isSelected
              ? 'bg-yuque-selected text-yuque-primary font-medium'
              : 'hover:bg-yuque-hover text-yuque-text'
          }`}
          style={{ paddingLeft: `${12 + level * 16}px` }}
          onClick={() => {
            onDocSelect(doc);
            if (hasChildren) toggleExpand(doc.id);
          }}
          onContextMenu={(e) => handleContextMenu(e, doc.id)}
        >
          {hasChildren ? (
            isExpanded ? (
              <ChevronDown className="w-3.5 h-3.5 text-yuque-textMuted shrink-0" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-yuque-textMuted shrink-0" />
            )
          ) : (
            <span className="w-3.5" />
          )}
          <span className="shrink-0">{getIcon(doc.icon, doc.is_starred)}</span>
          <span className="flex-1 truncate text-sm">{doc.title}</span>
          <button
            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-200 rounded transition-opacity"
            onClick={(e) => {
              e.stopPropagation();
              handleContextMenu(e, doc.id);
            }}
          >
            <MoreHorizontal className="w-3.5 h-3.5 text-yuque-textMuted" />
          </button>
        </div>
        {hasChildren && isExpanded && (
          <div className="animate-accordion-down overflow-hidden">
            {doc.children.map((child) => renderDoc(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  const getInitials = (name: string) => {
    return name.charAt(0).toUpperCase();
  };

  return (
    <div className="w-64 h-full bg-yuque-sidebar border-r border-yuque-border flex flex-col" onClick={closeContextMenu}>
      {/* Logo区域 */}
      <div className="h-14 flex items-center gap-3 px-4 border-b border-yuque-border">
        <div className="w-8 h-8 bg-gradient-to-br from-yuque-primary to-blue-400 rounded-lg flex items-center justify-center">
          <BookOpen className="w-5 h-5 text-white" />
        </div>
        <span className="font-semibold text-yuque-text text-lg">语雀笔记</span>
      </div>

      {/* 搜索框 */}
      <div className="px-3 py-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-yuque-textMuted" />
          <input
            type="text"
            placeholder="搜索文档..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-yuque-background border border-yuque-border rounded-lg text-sm focus:outline-none focus:border-yuque-primary focus:ring-2 focus:ring-yuque-primary/20 transition-all"
          />
        </div>
      </div>

      {/* 标签切换 */}
      <div className="flex px-3 pb-2 gap-1">
        <button
          onClick={() => onTabChange('docs')}
          className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
            activeTab === 'docs'
              ? 'bg-yuque-primary text-white'
              : 'text-yuque-textSecondary hover:bg-yuque-hover'
          }`}
        >
          文档
        </button>
        <button
          onClick={() => {
            onTabChange('files');
            onFilesSelect();
          }}
          className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center justify-center gap-1 ${
            activeTab === 'files'
              ? 'bg-yuque-primary text-white'
              : 'text-yuque-textSecondary hover:bg-yuque-hover'
          }`}
        >
          <HardDrive className="w-3 h-3" />
          文件
        </button>
        <button
          onClick={() => onTabChange('star')}
          className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center justify-center gap-1 ${
            activeTab === 'star'
              ? 'bg-yuque-primary text-white'
              : 'text-yuque-textSecondary hover:bg-yuque-hover'
          }`}
        >
          <Star className="w-3 h-3" />
        </button>
        <button
          onClick={() => onTabChange('recent')}
          className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center justify-center gap-1 ${
            activeTab === 'recent'
              ? 'bg-yuque-primary text-white'
              : 'text-yuque-textSecondary hover:bg-yuque-hover'
          }`}
        >
          <Clock className="w-3 h-3" />
        </button>
      </div>

      {/* 新建按钮 */}
      <div className="px-3 pb-3">
        <button
          onClick={onCreateDoc}
          className="w-full flex items-center justify-center gap-2 py-2 bg-yuque-primary text-white rounded-lg text-sm font-medium hover:bg-blue-600 active:scale-[0.98] transition-all shadow-sm"
        >
          <Plus className="w-4 h-4" />
          新建文档
        </button>
      </div>

      {/* 文档列表 */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'docs' && (
          <div className="py-1">
            {filteredDocTree.length === 0 ? (
              <div className="py-8 text-center text-yuque-textMuted">
                <FileText className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                <p className="text-sm">暂无文档</p>
                <button
                  onClick={onCreateDoc}
                  className="mt-2 text-sm text-yuque-primary hover:underline"
                >
                  创建第一个文档
                </button>
              </div>
            ) : (
              filteredDocTree.map((doc) => renderDoc(doc))
            )}
          </div>
        )}

        {activeTab === 'star' && (
          <div className="py-2">
            {starredDocs.length === 0 ? (
              <div className="py-8 text-center text-yuque-textMuted">
                <Star className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                <p className="text-sm">暂无收藏内容</p>
              </div>
            ) : (
              starredDocs.map((doc) => (
                <div
                  key={doc.id}
                  onClick={() => onDocSelect(doc)}
                  className={`flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-yuque-hover ${
                    selectedDocId === doc.id ? 'bg-yuque-selected text-yuque-primary font-medium' : ''
                  }`}
                >
                  <Star className="w-4 h-4 text-yuque-accent fill-yuque-accent" />
                  <span className="text-sm truncate">{doc.title}</span>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'recent' && (
          <div className="py-2">
            {recentDocs.length === 0 ? (
              <div className="py-8 text-center text-yuque-textMuted">
                <Clock className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                <p className="text-sm">暂无最近访问</p>
              </div>
            ) : (
              <>
                <div className="px-3 py-2 text-xs text-yuque-textMuted font-medium">最近访问</div>
                {recentDocs.map((doc) => (
                  <div
                    key={doc.id}
                    onClick={() => onDocSelect(doc)}
                    className={`flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-yuque-hover ${
                      selectedDocId === doc.id ? 'bg-yuque-selected text-yuque-primary font-medium' : ''
                    }`}
                  >
                    <File className="w-4 h-4 text-yuque-textMuted" />
                    <span className="text-sm truncate">{doc.title}</span>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {/* 底部用户区域 */}
      <div className="border-t border-yuque-border p-3">
        <div
          className="relative flex items-center gap-3 p-2 hover:bg-yuque-hover rounded-lg cursor-pointer transition-colors"
          onClick={() => setShowUserMenu(!showUserMenu)}
        >
          <div className="w-8 h-8 bg-gradient-to-br from-purple-400 to-pink-400 rounded-full flex items-center justify-center text-white text-sm font-medium">
            {user?.nickname ? getInitials(user.nickname) : '?'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-yuque-text truncate">{user?.nickname || '用户'}</div>
            <div className="text-xs text-yuque-textMuted truncate">{user?.email || 'email@example.com'}</div>
          </div>
        </div>

        {/* User dropdown menu */}
        {showUserMenu && (
          <div className="absolute bottom-16 left-0 w-64 bg-white rounded-lg shadow-dropdown py-1 z-50 border border-gray-100">
            <div className="px-4 py-2 border-b border-gray-100">
              <p className="text-sm font-medium">{user?.nickname}</p>
              <p className="text-xs text-gray-500">{user?.email}</p>
            </div>
            <button
              onClick={() => {
                onLogout();
                setShowUserMenu(false);
              }}
              className="w-full px-4 py-2 text-sm text-left hover:bg-gray-50 flex items-center gap-2 text-red-500"
            >
              <LogOut className="w-4 h-4" />
              退出登录
            </button>
          </div>
        )}
      </div>

      {/* 右键菜单 */}
      {contextMenu && (
        <div
          className="fixed bg-white rounded-lg shadow-dropdown py-1 min-w-[160px] z-50 animate-scale-in border border-gray-100"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => {
              onToggleStar(contextMenu.docId);
              closeContextMenu();
            }}
            className="w-full px-4 py-2 text-sm text-left hover:bg-gray-50 flex items-center gap-2 text-yuque-text"
          >
            <Star className="w-4 h-4" />
            收藏
          </button>
          <button className="w-full px-4 py-2 text-sm text-left hover:bg-gray-50 flex items-center gap-2 text-yuque-text">
            <Copy className="w-4 h-4" />
            复制
          </button>
          <div className="h-px bg-gray-100 my-1" />
          <button
            onClick={() => {
              onDeleteDoc(contextMenu.docId);
              closeContextMenu();
            }}
            className="w-full px-4 py-2 text-sm text-left hover:bg-gray-50 flex items-center gap-2 text-red-500"
          >
            <Trash2 className="w-4 h-4" />
            删除
          </button>
        </div>
      )}
    </div>
  );
}
