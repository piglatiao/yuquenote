import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Sidebar from './components/WorkspaceSidebar';
import Header from './components/Header';
import RichTextEditor from './components/RichTextEditor';
import FileManager from './components/FileManagerGallery';
import Login from './components/Login';
import CommentSection from './components/CommentSection';
import TodoList from './components/TodoList';
import NameInputModal from './components/NameInputModal';
import PublicLibrary from './components/PublicLibraryManagerPanel';
import ResourceShareModal from './components/ResourceShareModal';
import TeamWorkspace from './components/TeamWorkspacePanel';
import FavoritesPanel from './components/FavoritesPanel';
import { authService } from './lib/authApi';
import { teamService } from './lib/databaseApi';
import { documentService, DocTreeItem } from './lib/documentsApi';
import { commentService, todoService } from './lib/servicesApi';
import type { User, Document, Team, PublicDocumentSummary, PublicFileSummary, FileRecord } from './lib/types';
import { useSearchParams } from 'react-router-dom';
import './App.css';

const DEFAULT_NOTES_FOLDER_NAME = '默认笔记文件夹';
const AUTOSAVE_DELAY_MS = 1200;

type NameDialogMode = 'create_doc' | 'create_folder' | 'rename';

interface NameDialogState {
  mode: NameDialogMode;
  value: string;
  fallbackValue: string;
  parentId: string | null;
  docId?: string;
}

const APP_TABS = new Set(['docs', 'files', 'star', 'teams', 'public']);
const DOCUMENT_VIEW_TABS = new Set(['docs']);

function normalizeAppTab(value: string | null): string {
  return value && APP_TABS.has(value) ? value : 'docs';
}

function filterDocTreeByWorkspace(items: DocTreeItem[], teamId: string | null): DocTreeItem[] {
  return items.reduce<DocTreeItem[]>((acc, item) => {
    const children = filterDocTreeByWorkspace(item.children, teamId);
    const itemTeamId = item.team_id ?? null;
    if ((teamId ? itemTeamId === teamId : !itemTeamId) || children.length > 0) {
      acc.push({
        ...item,
        children,
      });
    }
    return acc;
  }, []);
}

function collectTreeIds(items: DocTreeItem[]): Set<string> {
  const ids = new Set<string>();
  const walk = (nodes: DocTreeItem[]) => {
    nodes.forEach((node) => {
      ids.add(node.id);
      if (node.children.length > 0) {
        walk(node.children);
      }
    });
  };
  walk(items);
  return ids;
}

function App() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = normalizeAppTab(searchParams.get('tab'));
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showFileManager, setShowFileManager] = useState(initialTab === 'files');

  // Document state
  const [docTree, setDocTree] = useState<DocTreeItem[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
  const [content, setContent] = useState('');
  const [docTitle, setDocTitle] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | undefined>(new Date());

  // UI state
  const [activeTab, setActiveTab] = useState(initialTab);
  const [searchQuery, setSearchQuery] = useState('');
  const [showShareModal, setShowShareModal] = useState(false);
  const [showComments, setShowComments] = useState(DOCUMENT_VIEW_TABS.has(initialTab) && searchParams.get('comments') === '1');
  const [showTodos, setShowTodos] = useState(DOCUMENT_VIEW_TABS.has(initialTab) && searchParams.get('todos') === '1');
  const [nameDialog, setNameDialog] = useState<NameDialogState | null>(null);
  const [activeWorkspaceTeam, setActiveWorkspaceTeam] = useState<Team | null>(null);
  const [fileManagerFolderId, setFileManagerFolderId] = useState<string | null>(
    initialTab === 'files' ? searchParams.get('folder') : null,
  );
  const [pendingPreviewFileId, setPendingPreviewFileId] = useState<string | null>(
    initialTab === 'files' ? searchParams.get('file') : null,
  );
  const [selectedTeamsTabTeamId, setSelectedTeamsTabTeamId] = useState<string | null>(
    initialTab === 'teams' ? searchParams.get('teamPanel') : null,
  );
  const selectedDocIdRef = useRef<string | null>(null);
  const editVersionRef = useRef(0);
  const isSavingRef = useRef(false);
  const pendingSaveRef = useRef(false);
  const suppressSearchStateSyncRef = useRef(false);

  useEffect(() => {
    selectedDocIdRef.current = selectedDoc?.id ?? null;
  }, [selectedDoc?.id]);

  const updateSearchState = useCallback(
    (updater: (params: URLSearchParams) => void) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        updater(next);
        return next.toString() === prev.toString() ? prev : next;
      }, { replace: true });
    },
    [setSearchParams],
  );

  useEffect(() => {
    if (!user) return;

    const teamId = searchParams.get('team');
    if (!teamId) {
      setActiveWorkspaceTeam(null);
      return;
    }

    let cancelled = false;

    const loadTeam = async () => {
      const team = await teamService.getById(teamId);
      if (!cancelled) {
        setActiveWorkspaceTeam(team);
      }
    };

    void loadTeam();

    return () => {
      cancelled = true;
    };
  }, [user?.id, searchParams]);

  useEffect(() => {
    const nextTab = normalizeAppTab(searchParams.get('tab'));
    const nextShowFileManager = nextTab === 'files';
    const nextShowComments = DOCUMENT_VIEW_TABS.has(nextTab) && searchParams.get('comments') === '1';
    const nextShowTodos = DOCUMENT_VIEW_TABS.has(nextTab) && searchParams.get('todos') === '1';
    const nextRequestedDocId = DOCUMENT_VIEW_TABS.has(nextTab) ? searchParams.get('doc') : null;
    const nextFolderId = nextShowFileManager ? searchParams.get('folder') : null;
    const nextPreviewFileId = nextShowFileManager ? searchParams.get('file') : null;
    const nextSelectedTeamsTabTeamId = nextTab === 'teams' ? searchParams.get('teamPanel') : null;

    const shouldRestoreFromUrl =
      activeTab !== nextTab ||
      ((DOCUMENT_VIEW_TABS.has(activeTab) ? selectedDoc?.id ?? null : null) !== nextRequestedDocId) ||
      showFileManager !== nextShowFileManager ||
      showComments !== nextShowComments ||
      showTodos !== nextShowTodos ||
      fileManagerFolderId !== nextFolderId ||
      pendingPreviewFileId !== nextPreviewFileId ||
      selectedTeamsTabTeamId !== nextSelectedTeamsTabTeamId;

    if (shouldRestoreFromUrl) {
      suppressSearchStateSyncRef.current = true;
    }

    setActiveTab((prev) => (prev === nextTab ? prev : nextTab));
    setShowFileManager((prev) => (prev === nextShowFileManager ? prev : nextShowFileManager));
    setShowComments((prev) => (prev === nextShowComments ? prev : nextShowComments));
    setShowTodos((prev) => (prev === nextShowTodos ? prev : nextShowTodos));
    setFileManagerFolderId((prev) => (prev === nextFolderId ? prev : nextFolderId));
    setPendingPreviewFileId((prev) => (prev === nextPreviewFileId ? prev : nextPreviewFileId));
    setSelectedTeamsTabTeamId((prev) => (prev === nextSelectedTeamsTabTeamId ? prev : nextSelectedTeamsTabTeamId));

    if (nextTab === 'docs' && !nextRequestedDocId) {
      setSelectedDoc((prev) => (prev ? null : prev));
      setDocTitle((prev) => (prev ? '' : prev));
      setContent((prev) => (prev ? '' : prev));
      setIsEditing(false);
    }
  }, [searchParams]);

  const visibleDocTree = useMemo(() => {
    return filterDocTreeByWorkspace(docTree, activeWorkspaceTeam?.id ?? null);
  }, [docTree, activeWorkspaceTeam]);

  const visibleDocIds = useMemo(() => collectTreeIds(visibleDocTree), [visibleDocTree]);

  useEffect(() => {
    if (suppressSearchStateSyncRef.current) {
      suppressSearchStateSyncRef.current = false;
      return;
    }

    updateSearchState((params) => {
      params.set('tab', activeTab);

      if (DOCUMENT_VIEW_TABS.has(activeTab) && selectedDoc?.id) {
        params.set('doc', selectedDoc.id);
      } else {
        params.delete('doc');
      }

      if (DOCUMENT_VIEW_TABS.has(activeTab) && showComments) {
        params.set('comments', '1');
      } else {
        params.delete('comments');
      }

      if (DOCUMENT_VIEW_TABS.has(activeTab) && showTodos) {
        params.set('todos', '1');
      } else {
        params.delete('todos');
      }

      if (activeTab === 'files' && pendingPreviewFileId) {
        params.set('file', pendingPreviewFileId);
      } else {
        params.delete('file');
      }

      if (activeTab === 'files' && fileManagerFolderId) {
        params.set('folder', fileManagerFolderId);
      } else {
        params.delete('folder');
      }

      if (activeTab === 'teams' && selectedTeamsTabTeamId) {
        params.set('teamPanel', selectedTeamsTabTeamId);
      } else {
        params.delete('teamPanel');
      }
    });
  }, [
    activeTab,
    fileManagerFolderId,
    pendingPreviewFileId,
    selectedDoc?.id,
    selectedTeamsTabTeamId,
    showComments,
    showTodos,
    updateSearchState,
  ]);

  // Initialize app
  useEffect(() => {
    const init = async () => {
      // Initialize services
      documentService.init();
      commentService.init();
      todoService.init();

      // Check auth
      const currentUser = await authService.init();
      setUser(currentUser);
      setIsLoading(false);

      // Load documents
      if (currentUser) {
        await loadDocuments();
      }
    };

    init();

    // Subscribe to auth changes
    const unsubscribe = authService.subscribe((newUser) => {
      setUser(newUser);
      if (newUser) {
        loadDocuments();
      } else {
        setDocTree([]);
        setSelectedDoc(null);
      }
    });

    return () => unsubscribe();
  }, []);

  const loadDocuments = async () => {
    const tree = await documentService.getTree();
    setDocTree(tree);
  };

  const handleSessionChange = useCallback(async () => {
    const currentUser = await authService.init();
    setUser(currentUser);
    setPendingPreviewFileId(null);
    setShowFileManager(false);
    setSelectedDoc(null);
    setDocTitle('');
    setContent('');
    setShowComments(false);
    setShowTodos(false);
    setActiveTab('docs');
    if (!searchParams.get('team')) {
      setActiveWorkspaceTeam(null);
    }
    if (currentUser) {
      await loadDocuments();
    } else {
      setDocTree([]);
    }
  }, [searchParams]);

  const handleUserRefresh = useCallback(async () => {
    const currentUser = await authService.init();
    setUser(currentUser);
  }, []);

  const handleLogin = async () => {
    await handleSessionChange();
  };

  const handleLogout = async () => {
    await authService.logout();
    updateSearchState((params) => {
      params.delete('team');
      params.delete('tab');
      params.delete('doc');
      params.delete('comments');
      params.delete('todos');
      params.delete('file');
    });
    setUser(null);
    setDocTree([]);
    setSelectedDoc(null);
    setActiveWorkspaceTeam(null);
    setPendingPreviewFileId(null);
  };

  const openDocumentById = useCallback(async (docId: string) => {
    const fullDoc = await documentService.getById(docId);
    if (fullDoc) {
      setActiveTab('docs');
      setSelectedDoc(fullDoc);
      setDocTitle(fullDoc.title);
      setContent(fullDoc.content);
      setIsEditing(false);
      editVersionRef.current = 0;
      pendingSaveRef.current = false;
      setLastSaved(new Date(fullDoc.updated_at));
      setShowFileManager(false);
      setPendingPreviewFileId(null);
      setShowComments(false);
      setShowTodos(false);
    }
  }, []);

  const handleDocSelect = useCallback(async (doc: DocTreeItem) => {
    await openDocumentById(doc.id);
  }, [openDocumentById]);

  const handleFilesSelect = useCallback(() => {
    setActiveTab('files');
    setShowFileManager(true);
    setSelectedDoc(null);
    setShowComments(false);
    setShowTodos(false);
  }, []);

  useEffect(() => {
    if (!user || !DOCUMENT_VIEW_TABS.has(activeTab)) return;

    const requestedDocId = searchParams.get('doc');
    const requestedTeamId = searchParams.get('team');
    if (!requestedDocId) return;
    if (selectedDoc?.id === requestedDocId) return;
    if (requestedTeamId && activeWorkspaceTeam?.id !== requestedTeamId) return;

    let cancelled = false;

    const loadRequestedDocument = async () => {
      const fullDoc = await documentService.getById(requestedDocId);
      if (cancelled) return;

      if (!fullDoc) {
        updateSearchState((params) => {
          params.delete('doc');
          params.delete('comments');
          params.delete('todos');
        });
        return;
      }

      setSelectedDoc(fullDoc);
      setDocTitle(fullDoc.title);
      setContent(fullDoc.content);
      setIsEditing(false);
      editVersionRef.current = 0;
      pendingSaveRef.current = false;
      setLastSaved(new Date(fullDoc.updated_at));
      setShowFileManager(false);
    };

    void loadRequestedDocument();

    return () => {
      cancelled = true;
    };
  }, [activeTab, activeWorkspaceTeam?.id, searchParams, selectedDoc?.id, updateSearchState, user]);

  useEffect(() => {
    if (selectedDoc && !visibleDocIds.has(selectedDoc.id)) {
      setSelectedDoc(null);
      setDocTitle('');
      setContent('');
      setShowComments(false);
      setShowTodos(false);
    }
  }, [selectedDoc, visibleDocIds]);

  const handleContentChange = useCallback((newContent: string) => {
    if (newContent === content) return;
    setContent(newContent);
    editVersionRef.current += 1;
    setIsEditing(true);
  }, [content]);

  const handleSave = useCallback(async () => {
    const docId = selectedDoc?.id;
    if (!docId) return false;

    if (isSavingRef.current) {
      pendingSaveRef.current = true;
      return false;
    }

    isSavingRef.current = true;
    const versionAtSaveStart = editVersionRef.current;

    try {
      const updated = await documentService.update(docId, {
        title: docTitle,
        content,
      });
      if (!updated) return false;

      await loadDocuments();
      setSelectedDoc((prev) => (prev && prev.id === docId ? updated : prev));
      setLastSaved(new Date(updated.updated_at));

      if (selectedDocIdRef.current === docId && editVersionRef.current === versionAtSaveStart) {
        setIsEditing(false);
      }
      return true;
    } finally {
      isSavingRef.current = false;
      if (pendingSaveRef.current) {
        pendingSaveRef.current = false;
        window.setTimeout(() => {
          void handleSave();
        }, 0);
      }
    }
  }, [selectedDoc?.id, docTitle, content]);

  const handleTitleChange = useCallback((newTitle: string) => {
    if (newTitle === docTitle) return;
    setDocTitle(newTitle);
    editVersionRef.current += 1;
    setIsEditing(true);
  }, [docTitle]);

  useEffect(() => {
    if (!selectedDoc || showFileManager || !isEditing) return;

    const timer = window.setTimeout(() => {
      void handleSave();
    }, AUTOSAVE_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [selectedDoc?.id, showFileManager, isEditing, docTitle, content, handleSave]);

  const handleTabChange = useCallback((tab: string) => {
    setActiveTab(tab);
    setShowShareModal(false);
    if (tab === 'files') {
      setShowFileManager(true);
      setSelectedDoc(null);
      setShowComments(false);
      setShowTodos(false);
    } else if (tab === 'teams' || tab === 'public' || tab === 'star') {
      setShowFileManager(false);
      setShowComments(false);
      setShowTodos(false);
    } else {
      setShowFileManager(false);
    }
  }, []);

  const handleEnterTeamSpace = useCallback((team: Team) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('team', team.id);
      return next;
    });
    setActiveWorkspaceTeam(team);
    setPendingPreviewFileId(null);
    setShowFileManager(false);
    setSelectedDoc(null);
    setDocTitle('');
    setContent('');
    setShowComments(false);
    setShowTodos(false);
    setActiveTab('docs');
  }, [setSearchParams]);

  const handleLeaveTeamSpace = useCallback(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('team');
      return next;
    });
    setActiveWorkspaceTeam(null);
    setPendingPreviewFileId(null);
  }, [setSearchParams]);

  const findFolderByTitle = (items: DocTreeItem[], title: string): DocTreeItem | null => {
    for (const item of items) {
      if (item.icon === 'folder' && item.title === title) {
        return item;
      }
      if (item.children.length > 0) {
        const found = findFolderByTitle(item.children, title);
        if (found) return found;
      }
    }
    return null;
  };

  const findDefaultNotesFolderId = (tree: DocTreeItem[]): string | null => {
    const rootMatch = tree.find(
      (item) => item.icon === 'folder' && item.parent_id === null && item.title === DEFAULT_NOTES_FOLDER_NAME
    );
    if (rootMatch) return rootMatch.id;

    return findFolderByTitle(tree, DEFAULT_NOTES_FOLDER_NAME)?.id ?? null;
  };

  const ensureDefaultNotesFolderId = async (): Promise<string | null> => {
    const latestTree = await documentService.getTree();
    const existingFolderId = findDefaultNotesFolderId(filterDocTreeByWorkspace(latestTree, null));
    if (existingFolderId) return existingFolderId;

    const createdFolder = await documentService.create({
      title: DEFAULT_NOTES_FOLDER_NAME,
      content: '<p></p>',
      parent_id: null,
      icon: 'folder',
    });

    return createdFolder?.id ?? null;
  };

  const flattenTree = (items: DocTreeItem[]): DocTreeItem[] => {
    const result: DocTreeItem[] = [];
    const walk = (nodes: DocTreeItem[]) => {
      nodes.forEach((node) => {
        result.push(node);
        if (node.children.length > 0) {
          walk(node.children);
        }
      });
    };
    walk(items);
    return result;
  };

  const getAutoName = (
    tree: DocTreeItem[],
    parentId: string | null,
    icon: 'file' | 'folder',
    baseName: string
  ) => {
    const siblingNames = new Set(
      flattenTree(tree)
        .filter((item) => item.parent_id === parentId && item.icon === icon)
        .map((item) => item.title)
    );

    if (!siblingNames.has(baseName)) {
      return baseName;
    }

    let index = 2;
    while (siblingNames.has(`${baseName} ${index}`)) {
      index += 1;
    }
    return `${baseName} ${index}`;
  };

  const handleCreateDoc = async (parentId: string | null = null) => {
    const latestTree = await documentService.getTree();
    const scopedTree = filterDocTreeByWorkspace(latestTree, activeWorkspaceTeam?.id ?? null);
    const suggestedParentId = activeWorkspaceTeam ? parentId : parentId ?? findDefaultNotesFolderId(scopedTree);
    const scopedSuggestedName = suggestedParentId
      ? getAutoName(scopedTree, suggestedParentId, 'file', '\u65b0\u5efa\u7b14\u8bb0')
      : '\u65b0\u5efa\u7b14\u8bb0';

    setNameDialog({
      mode: 'create_doc',
      value: scopedSuggestedName,
      fallbackValue: scopedSuggestedName,
      parentId,
    });
  };

  const handleCreateFolder = async (parentId: string | null = null) => {
    const latestTree = await documentService.getTree();
    const scopedTree = filterDocTreeByWorkspace(latestTree, activeWorkspaceTeam?.id ?? null);
    const scopedSuggestedFolderName = getAutoName(scopedTree, parentId, 'folder', '\u65b0\u5efa\u6587\u4ef6\u5939');
    setNameDialog({
      mode: 'create_folder',
      value: scopedSuggestedFolderName,
      fallbackValue: scopedSuggestedFolderName,
      parentId,
    });
  };

  const handleNameDialogConfirm = async () => {
    if (!nameDialog) return;

    const dialog = nameDialog;
    const finalName = dialog.value.trim() || dialog.fallbackValue;
    setNameDialog(null);

    if (!finalName) return;

    if (dialog.mode === 'rename') {
      if (!dialog.docId || finalName === dialog.fallbackValue) return;
      await handleRenameDoc(dialog.docId, finalName);
      return;
    }

    if (dialog.mode === 'create_folder') {
      const newFolder = await documentService.create({
        title: finalName,
        content: '<p></p>',
        parent_id: dialog.parentId,
        icon: 'folder',
        team_id: activeWorkspaceTeam?.id ?? null,
      });
      if (newFolder) {
        await loadDocuments();
        setSelectedDoc(newFolder);
        setDocTitle(newFolder.title);
        setContent(newFolder.content);
        setIsEditing(false);
        editVersionRef.current = 0;
        setLastSaved(new Date(newFolder.updated_at));
      }
      return;
    }

    const targetParentId = activeWorkspaceTeam
      ? dialog.parentId
      : dialog.parentId ?? (await ensureDefaultNotesFolderId());
    if (!activeWorkspaceTeam && !targetParentId) return;

    const newDoc = await documentService.create({
      title: finalName,
      content: '<p></p>',
      parent_id: targetParentId,
      icon: 'file',
      team_id: activeWorkspaceTeam?.id ?? null,
    });
    if (newDoc) {
      await loadDocuments();
      setSelectedDoc(newDoc);
      setDocTitle(newDoc.title);
      setContent(newDoc.content);
      setIsEditing(false);
      editVersionRef.current = 0;
      setLastSaved(new Date(newDoc.updated_at));
    }
  };
  const findNodeById = (items: DocTreeItem[], id: string): DocTreeItem | null => {
    for (const item of items) {
      if (item.id === id) return item;
      if (item.children.length > 0) {
        const found = findNodeById(item.children, id);
        if (found) return found;
      }
    }
    return null;
  };
  const collectSubtreeIds = (node: DocTreeItem): string[] => {
    return [node.id, ...node.children.flatMap((child) => collectSubtreeIds(child))];
  };
  const handleDeleteDoc = async (id: string) => {
    const target = findNodeById(docTree, id);
    if (!target) return;
    const idsToDelete = collectSubtreeIds(target);
    const confirmMessage =
      target.icon === 'folder'
        ? `Delete folder "${target.title}" and ${Math.max(0, idsToDelete.length - 1)} child item(s)?`
        : `Delete note "${target.title}"?`;
    if (!confirm(confirmMessage)) return;
    await Promise.all(idsToDelete.map((docId) => documentService.softDelete(docId)));
    await loadDocuments();
    if (selectedDoc && idsToDelete.includes(selectedDoc.id)) {
      setSelectedDoc(null);
      setDocTitle('');
      setContent('');
    }
  };
  const handleRenameDoc = async (id: string, title: string) => {
    const hasUnsavedChangesOnCurrentDoc = isEditing && selectedDoc?.id === id;
    const updated = await documentService.update(id, { title });
    if (!updated) return;
    await loadDocuments();
    if (selectedDoc?.id === id) {
      setSelectedDoc(updated);
      setDocTitle(updated.title);
    }
    setLastSaved(new Date(updated.updated_at));
    if (!hasUnsavedChangesOnCurrentDoc) {
      setIsEditing(false);
      editVersionRef.current = 0;
    }
  };

  const handleRequestRenameDoc = (id: string, currentTitle: string) => {
    setNameDialog({
      mode: 'rename',
      value: currentTitle,
      fallbackValue: currentTitle,
      parentId: null,
      docId: id,
    });
  };

  const handleToggleStar = async (id: string) => {
    await documentService.toggleStar(id);
    await loadDocuments();

    if (selectedDoc?.id === id) {
      const updated = await documentService.getById(id);
      if (updated) setSelectedDoc(updated);
    }
  };

  const handleEditPublicDocument = useCallback(async (document: PublicDocumentSummary) => {
    const targetTeamId = document.team_id ?? null;
    if (targetTeamId) {
      const team = await teamService.getById(targetTeamId);
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set('team', targetTeamId);
        return next;
      });
      setActiveWorkspaceTeam(team);
    } else {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete('team');
        return next;
      });
      setActiveWorkspaceTeam(null);
    }
    setPendingPreviewFileId(null);
    setActiveTab('docs');
    setShowFileManager(false);
    await openDocumentById(document.id);
  }, [openDocumentById, setSearchParams]);

  const handleOpenFileRecord = useCallback(async (file: Pick<FileRecord, 'id' | 'team_id'>) => {
    const targetTeamId = file.team_id ?? null;
    if (targetTeamId) {
      const team = await teamService.getById(targetTeamId);
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set('team', targetTeamId);
        return next;
      });
      setActiveWorkspaceTeam(team);
    } else {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete('team');
        return next;
      });
      setActiveWorkspaceTeam(null);
    }
    setSelectedDoc(null);
    setShowComments(false);
    setShowTodos(false);
    setPendingPreviewFileId(file.id);
    setActiveTab('files');
    setShowFileManager(true);
  }, [setSearchParams]);

  const handleOpenPublicFile = useCallback(async (file: PublicFileSummary) => {
    await handleOpenFileRecord(file);
  }, [handleOpenFileRecord]);

  const headerTitle = showFileManager
    ? '文件管理'
    : activeTab === 'teams'
      ? '团队空间'
      : activeTab === 'public'
        ? '公开资源'
        : selectedDoc
          ? docTitle
          : '开始';
  const pageTitle = showFileManager
    ? '文件管理'
    : activeTab === 'teams'
      ? '空间管理'
      : activeTab === 'star'
        ? '收藏'
        : activeTab === 'public'
          ? '公开资源'
          : selectedDoc
            ? docTitle
            : '开始';
  const canShowDocActions = activeTab === 'docs' && !!selectedDoc && !showFileManager;

  // Loading state
  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500">鍔犺浇涓?..</p>
        </div>
      </div>
    );
  }

  // Not logged in
  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <div className="h-screen flex bg-yuque-background">
      {/* Sidebar */}
      <Sidebar
        onDocSelect={handleDocSelect}
        onFilesSelect={handleFilesSelect}
        selectedDocId={selectedDoc?.id || ''}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        docTree={visibleDocTree}
        onCreateDoc={handleCreateDoc}
        onCreateFolder={handleCreateFolder}
        onRequestRenameDoc={handleRequestRenameDoc}
        onDeleteDoc={handleDeleteDoc}
        onToggleStar={handleToggleStar}
        onLogout={handleLogout}
        onSessionChange={handleSessionChange}
        onUserRefresh={handleUserRefresh}
        onEnterTeamSpace={handleEnterTeamSpace}
        onLeaveTeamSpace={handleLeaveTeamSpace}
        activeWorkspaceTeam={activeWorkspaceTeam}
        user={user}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <Header
          title={pageTitle}
          onTitleChange={handleTitleChange}
          isEditing={canShowDocActions ? isEditing : false}
          onSave={handleSave}
          lastSaved={canShowDocActions ? lastSaved : undefined}
          canEditTitle={canShowDocActions}
          showShare={canShowDocActions}
          onShare={() => setShowShareModal(true)}
          showComments={canShowDocActions}
          onToggleComments={() => setShowComments(!showComments)}
          showTodos={canShowDocActions}
          onToggleTodos={() => setShowTodos(!showTodos)}
        />

        {/* Content area */}
        <div className="flex-1 overflow-hidden">
          {showFileManager ? (
            <FileManager
              initialFolderId={fileManagerFolderId ?? undefined}
              teamId={activeWorkspaceTeam?.id ?? null}
              initialPreviewFileId={pendingPreviewFileId}
              onFolderChange={setFileManagerFolderId}
              onPreviewFileChange={setPendingPreviewFileId}
              onInitialPreviewHandled={() => undefined}
            />
          ) : activeTab === 'teams' ? (
            <TeamWorkspace
              activeWorkspaceTeamId={activeWorkspaceTeam?.id ?? null}
              initialSelectedTeamId={selectedTeamsTabTeamId}
              onSelectedTeamChange={setSelectedTeamsTabTeamId}
              onEnterTeamSpace={handleEnterTeamSpace}
            />
          ) : activeTab === 'public' ? (
            <PublicLibrary
              currentUserId={user.id}
              onEditDocument={handleEditPublicDocument}
              onOpenFile={handleOpenPublicFile}
            />
          ) : activeTab === 'star' ? (
            <FavoritesPanel
              docTree={visibleDocTree}
              teamId={activeWorkspaceTeam?.id ?? null}
              onOpenDocument={(docId) => {
                void openDocumentById(docId);
              }}
              onOpenFile={(file) => {
                void handleOpenFileRecord(file);
              }}
            />
          ) : activeTab === 'docs' && selectedDoc ? (
            <div className="h-full flex">
              {/* Editor */}
              <div className="flex-1 overflow-y-auto">
                <RichTextEditor
                  content={content}
                  onChange={handleContentChange}
                  onSave={handleSave}
                />
              </div>

              {/* Side panel */}
              {showComments && (
                <div className="w-80 border-l border-gray-200 overflow-y-auto p-4 bg-gray-50">
                  <CommentSection
                    documentId={selectedDoc.id}
                    currentUser={user}
                  />
                </div>
              )}

              {showTodos && (
                <div className="w-80 border-l border-gray-200 overflow-y-auto p-4 bg-gray-50">
                  <TodoList
                    documentId={selectedDoc.id}
                    currentUser={user}
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-gray-400">
              <div className="text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gray-100 flex items-center justify-center">
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <p className="text-lg font-medium">选择一个文档</p>
                <p className="text-sm mt-1">或创建一个新的文档开始编辑</p>
                <button
                  onClick={() => void handleCreateDoc()}
                  className="mt-4 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                >
                  新建文档
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Share Modal */}
      <NameInputModal
        isOpen={!!nameDialog}
        title={
          nameDialog?.mode === 'rename'
            ? '重命名'
            : nameDialog?.mode === 'create_folder'
              ? '新建文件夹'
              : '新建笔记'
        }
        description={
          nameDialog?.mode === 'rename'
            ? '修改后会立即更新到文档树。'
            : '已生成默认名称，可直接修改后创建。'
        }
        label={nameDialog?.mode === 'create_folder' ? '文件夹名称' : '名称'}
        value={nameDialog?.value ?? ''}
        placeholder={nameDialog?.fallbackValue ?? ''}
        confirmText={nameDialog?.mode === 'rename' ? '保存' : '创建'}
        onChange={(value) => setNameDialog((prev) => (prev ? { ...prev, value } : prev))}
        onConfirm={() => void handleNameDialogConfirm()}
        onCancel={() => setNameDialog(null)}
      />

      {activeTab === 'docs' && selectedDoc && (
        <ResourceShareModal
          isOpen={showShareModal}
          onClose={() => setShowShareModal(false)}
          resourceType="document"
          resourceId={selectedDoc.id}
          resourceName={selectedDoc.title}
          initialTeamId={selectedDoc.team_id ?? null}
        />
      )}
    </div>
  );
}

export default App;

