import { useState, useEffect, useCallback, useRef } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import RichTextEditor from './components/RichTextEditor';
import FileManager from './components/FileManagerGallery';
import Login from './components/Login';
import CommentSection from './components/CommentSection';
import TodoList from './components/TodoList';
import ShareModal from './components/ShareModal';
import NameInputModal from './components/NameInputModal';
import { authService } from './lib/authApi';
import { documentService, DocTreeItem } from './lib/documentsApi';
import { commentService, todoService } from './lib/servicesApi';
import type { User, Document } from './lib/types';
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

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showFileManager, setShowFileManager] = useState(false);

  // Document state
  const [docTree, setDocTree] = useState<DocTreeItem[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
  const [content, setContent] = useState('');
  const [docTitle, setDocTitle] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | undefined>(new Date());

  // UI state
  const [activeTab, setActiveTab] = useState('docs');
  const [searchQuery, setSearchQuery] = useState('');
  const [showShareModal, setShowShareModal] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showTodos, setShowTodos] = useState(false);
  const [nameDialog, setNameDialog] = useState<NameDialogState | null>(null);
  const selectedDocIdRef = useRef<string | null>(null);
  const editVersionRef = useRef(0);
  const isSavingRef = useRef(false);
  const pendingSaveRef = useRef(false);

  useEffect(() => {
    selectedDocIdRef.current = selectedDoc?.id ?? null;
  }, [selectedDoc?.id]);

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

  const handleLogin = async () => {
    const currentUser = await authService.init();
    setUser(currentUser);
    await loadDocuments();
  };

  const handleLogout = async () => {
    await authService.logout();
    setUser(null);
    setDocTree([]);
    setSelectedDoc(null);
  };

  const handleDocSelect = useCallback(async (doc: DocTreeItem) => {
    const fullDoc = await documentService.getById(doc.id);
    if (fullDoc) {
      setSelectedDoc(fullDoc);
      setDocTitle(fullDoc.title);
      setContent(fullDoc.content);
      setIsEditing(false);
      editVersionRef.current = 0;
      pendingSaveRef.current = false;
      setLastSaved(new Date(fullDoc.updated_at));
      setShowFileManager(false);
      setShowComments(false);
      setShowTodos(false);
    }
  }, []);

  const handleFilesSelect = useCallback(() => {
    setShowFileManager(true);
    setSelectedDoc(null);
    setShowComments(false);
    setShowTodos(false);
  }, []);

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
    if (tab === 'files') {
      setShowFileManager(true);
      setSelectedDoc(null);
    } else {
      setShowFileManager(false);
    }
  }, []);

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
    const existingFolderId = findDefaultNotesFolderId(latestTree);
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
    const suggestedParentId = parentId ?? findDefaultNotesFolderId(latestTree);
    const suggestedName = suggestedParentId
      ? getAutoName(latestTree, suggestedParentId, 'file', '新建笔记')
      : '新建笔记';

    setNameDialog({
      mode: 'create_doc',
      value: suggestedName,
      fallbackValue: suggestedName,
      parentId,
    });
  };

  const handleCreateFolder = async (parentId: string | null = null) => {
    const latestTree = await documentService.getTree();
    const suggestedName = getAutoName(latestTree, parentId, 'folder', '新建文件夹');
    setNameDialog({
      mode: 'create_folder',
      value: suggestedName,
      fallbackValue: suggestedName,
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

    const targetParentId = dialog.parentId ?? (await ensureDefaultNotesFolderId());
    if (!targetParentId) return;

    const newDoc = await documentService.create({
      title: finalName,
      content: '<p></p>',
      parent_id: targetParentId,
      icon: 'file',
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
        docTree={docTree}
        onCreateDoc={handleCreateDoc}
        onCreateFolder={handleCreateFolder}
        onRequestRenameDoc={handleRequestRenameDoc}
        onDeleteDoc={handleDeleteDoc}
        onToggleStar={handleToggleStar}
        onLogout={handleLogout}
        user={user}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <Header
          title={showFileManager ? '鏂囦欢绠＄悊' : docTitle}
          onTitleChange={handleTitleChange}
          isEditing={isEditing}
          onSave={handleSave}
          lastSaved={lastSaved}
          showShare={!!selectedDoc}
          onShare={() => setShowShareModal(true)}
          showComments={!!selectedDoc}
          onToggleComments={() => setShowComments(!showComments)}
          showTodos={!!selectedDoc}
          onToggleTodos={() => setShowTodos(!showTodos)}
        />

        {/* Content area */}
        <div className="flex-1 overflow-hidden">
          {showFileManager ? (
            <FileManager />
          ) : selectedDoc ? (
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

      {selectedDoc && (
        <ShareModal
          isOpen={showShareModal}
          onClose={() => setShowShareModal(false)}
          documentId={selectedDoc.id}
          documentTitle={selectedDoc.title}
        />
      )}
    </div>
  );
}

export default App;

