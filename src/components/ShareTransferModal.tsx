import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, FolderOpen, Loader2 } from 'lucide-react';
import { folderService } from '../lib/databaseApi';
import { documentService } from '../lib/documentsApi';
import type { Document, Folder } from '../lib/types';

interface FolderOption {
  id: string;
  label: string;
  path: string;
}

interface ShareTransferModalProps {
  isOpen: boolean;
  resourceType: 'document' | 'file';
  resourceName: string;
  isSubmitting?: boolean;
  onClose: () => void;
  onConfirm: (targetId: string | null) => void | Promise<void>;
}

function buildDocumentFolderOptions(documents: Document[]): FolderOption[] {
  const folders = documents.filter((document) => document.icon === 'folder' && !document.is_deleted && !document.team_id);
  const map = new Map(folders.map((folder) => [folder.id, folder]));

  const buildPath = (folder: Document) => {
    const parts: string[] = [folder.title];
    let currentParentId = folder.parent_id;

    while (currentParentId) {
      const parent = map.get(currentParentId);
      if (!parent) {
        break;
      }
      parts.unshift(parent.title);
      currentParentId = parent.parent_id;
    }

    return parts.join(' / ');
  };

  return folders
    .map((folder) => ({
      id: folder.id,
      label: folder.title,
      path: buildPath(folder),
    }))
    .sort((left, right) => left.path.localeCompare(right.path, 'zh-CN'));
}

function buildFileFolderOptions(folders: Folder[]): FolderOption[] {
  const personalFolders = folders.filter((folder) => !folder.team_id);
  const map = new Map(personalFolders.map((folder) => [folder.id, folder]));

  const buildPath = (folder: Folder) => {
    const parts: string[] = [folder.name];
    let currentParentId = folder.parent_id;

    while (currentParentId) {
      const parent = map.get(currentParentId);
      if (!parent) {
        break;
      }
      parts.unshift(parent.name);
      currentParentId = parent.parent_id;
    }

    return parts.join(' / ');
  };

  return personalFolders
    .map((folder) => ({
      id: folder.id,
      label: folder.name,
      path: buildPath(folder),
    }))
    .sort((left, right) => left.path.localeCompare(right.path, 'zh-CN'));
}

export default function ShareTransferModal({
  isOpen,
  resourceType,
  resourceName,
  isSubmitting = false,
  onClose,
  onConfirm,
}: ShareTransferModalProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [documentFolders, setDocumentFolders] = useState<Document[]>([]);
  const [fileFolders, setFileFolders] = useState<Folder[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) {
      setSelectedId(null);
      setError('');
      return;
    }

    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      setError('');

      try {
        if (resourceType === 'document') {
          const documents = await documentService.getAll();
          if (!cancelled) {
            setDocumentFolders(documents);
          }
        } else {
          const folders = await folderService.getAll(null);
          if (!cancelled) {
            setFileFolders(folders);
          }
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : '目标文件夹加载失败');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [isOpen, resourceType]);

  const options = useMemo(
    () =>
      resourceType === 'document'
        ? buildDocumentFolderOptions(documentFolders)
        : buildFileFolderOptions(fileFolders),
    [documentFolders, fileFolders, resourceType],
  );

  const defaultDescription =
    resourceType === 'document' ? '默认保存到“转存笔记文件夹”' : '默认保存到“转存文件文件夹”';

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/45 p-4" onClick={onClose}>
      <div
        className="app-modal-enter app-soft-surface w-full max-w-2xl rounded-[32px] bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-slate-200 px-6 py-5">
          <div className="text-lg font-semibold text-slate-900">转存到我的{resourceType === 'document' ? '笔记' : '文件'}</div>
          <div className="mt-1 text-sm text-slate-500">
            {resourceName}
            <ArrowRight className="mx-2 inline h-4 w-4 text-slate-300" />
            选择保存位置
          </div>
        </div>

        <div className="max-h-[65vh] overflow-y-auto px-6 py-5">
          <button
            type="button"
            onClick={() => setSelectedId(null)}
            className={`flex w-full items-start gap-3 rounded-2xl border px-4 py-4 text-left transition ${
              selectedId === null
                ? 'border-emerald-300 bg-emerald-50 shadow-sm'
                : 'border-slate-200 bg-slate-50 hover:bg-white'
            }`}
          >
            <div className="rounded-xl bg-white p-2 text-slate-500">
              <FolderOpen className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium text-slate-900">使用默认转存文件夹</div>
              <div className="mt-1 text-xs text-slate-500">{defaultDescription}</div>
            </div>
          </button>

          {isLoading ? (
            <div className="mt-4 flex items-center justify-center gap-2 rounded-2xl bg-slate-50 px-4 py-8 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              正在加载可用文件夹...
            </div>
          ) : error ? (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
              {error}
            </div>
          ) : options.length === 0 ? (
            <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-8 text-sm text-slate-500">
              当前还没有可选文件夹，确认后会自动创建默认转存文件夹。
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {options.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setSelectedId(option.id)}
                  className={`flex w-full items-start gap-3 rounded-2xl border px-4 py-4 text-left transition ${
                    selectedId === option.id
                      ? 'border-emerald-300 bg-emerald-50 shadow-sm'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className="rounded-xl bg-slate-50 p-2 text-slate-500">
                    <FolderOpen className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-slate-900">{option.label}</div>
                    <div className="mt-1 break-all text-xs text-slate-500">{option.path}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-200 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => void onConfirm(selectedId)}
            disabled={isSubmitting || isLoading}
            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-60"
          >
            {isSubmitting ? '转存中...' : '确认转存'}
          </button>
        </div>
      </div>
    </div>
  );
}
