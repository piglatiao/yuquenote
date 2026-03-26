import { useEffect, useState } from 'react';
import { X, Link2, Copy, Check, Globe, Users, Lock, ExternalLink, Trash2 } from 'lucide-react';
import { shareService } from '../lib/databaseApi';
import type { ShareLink } from '../lib/types';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentId: string;
  documentTitle: string;
}

export default function ShareModal({ isOpen, onClose, documentId, documentTitle }: ShareModalProps) {
  const [visibility, setVisibility] = useState<'private' | 'team' | 'public'>('private');
  const [shareLinks, setShareLinks] = useState<ShareLink[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [newLink, setNewLink] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const loadLinks = async () => {
      try {
        setShareLinks(await shareService.listByDocument(documentId));
      } catch (error) {
        console.error('Failed to load share links:', error);
      }
    };

    void loadLinks();
  }, [documentId, isOpen]);

  if (!isOpen) return null;

  const handleCreateLink = async () => {
    setIsCreating(true);

    try {
      const link = await shareService.createShareLink(documentId, undefined, visibility);
      if (link) {
        setShareLinks([...shareLinks, link]);
        setNewLink(`${window.location.origin}/share/${link.share_token}`);
      }
    } catch (err) {
      console.error('Failed to create share link:', err);
    }

    setIsCreating(false);
  };

  const handleCopy = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleDelete = async (id: string) => {
    const deleted = await shareService.deleteShareLink(id);
    if (deleted) {
      setShareLinks(shareLinks.filter(l => l.id !== id));
    }
  };

  const getVisibilityIcon = (v: 'private' | 'team' | 'public') => {
    switch (v) {
      case 'private':
        return <Lock className="w-4 h-4" />;
      case 'team':
        return <Users className="w-4 h-4" />;
      case 'public':
        return <Globe className="w-4 h-4" />;
    }
  };

  const getVisibilityLabel = (v: 'private' | 'team' | 'public') => {
    switch (v) {
      case 'private':
        return '私有';
      case 'team':
        return '团队';
      case 'public':
        return '公开';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">分享文档</h2>
            <p className="text-sm text-gray-500 mt-0.5">{documentTitle}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Visibility selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              分享权限
            </label>
            <div className="grid grid-cols-3 gap-3">
              {(['private', 'team', 'public'] as const).map(v => (
                <button
                  key={v}
                  onClick={() => setVisibility(v)}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                    visibility === v
                      ? 'border-blue-500 bg-blue-50 text-blue-600'
                      : 'border-gray-200 hover:border-gray-300 text-gray-600'
                  }`}
                >
                  {getVisibilityIcon(v)}
                  <span className="text-sm font-medium">{getVisibilityLabel(v)}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Visibility description */}
          <div className={`p-3 rounded-lg text-sm ${
            visibility === 'private'
              ? 'bg-gray-50 text-gray-600'
              : visibility === 'team'
              ? 'bg-blue-50 text-blue-600'
              : 'bg-green-50 text-green-600'
          }`}>
            {visibility === 'private' && '只有您自己可以访问此文档'}
            {visibility === 'team' && '您团队中的成员可以访问此文档'}
            {visibility === 'public' && '任何人可以通过链接访问此文档（只读）'}
          </div>

          {/* Create link button */}
          <button
            onClick={handleCreateLink}
            disabled={isCreating}
            className="w-full py-3 bg-gradient-to-r from-blue-500 to-indigo-500 text-white font-medium rounded-xl hover:from-blue-600 hover:to-indigo-600 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
          >
            {isCreating ? (
              <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <Link2 className="w-5 h-5" />
                生成分享链接
              </>
            )}
          </button>

          {/* New link */}
          {newLink && (
            <div className="p-4 bg-green-50 rounded-xl border border-green-200">
              <div className="flex items-center gap-2 mb-2">
                <Check className="w-4 h-4 text-green-500" />
                <span className="text-sm font-medium text-green-700">链接已创建</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newLink}
                  readOnly
                  className="flex-1 px-3 py-2 bg-white border border-green-200 rounded-lg text-sm text-gray-700"
                />
                <button
                  onClick={() => handleCopy(newLink, 'new')}
                  className={`px-4 py-2 rounded-lg transition-colors ${
                    copied === 'new'
                      ? 'bg-green-500 text-white'
                      : 'bg-green-500 text-white hover:bg-green-600'
                  }`}
                >
                  {copied === 'new' ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
                <a
                  href={newLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            </div>
          )}

          {/* Existing links */}
          {shareLinks.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                已有的分享链接
              </label>
              <div className="space-y-2">
                {shareLinks.map(link => (
                  <div
                    key={link.id}
                    className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg"
                  >
                    <div className={`shrink-0 p-2 rounded-lg ${
                      link.visibility === 'public'
                        ? 'bg-green-100 text-green-600'
                        : link.visibility === 'team'
                        ? 'bg-blue-100 text-blue-600'
                        : 'bg-gray-200 text-gray-600'
                    }`}>
                      {getVisibilityIcon(link.visibility)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-700 truncate">
                        {getVisibilityLabel(link.visibility)}链接
                      </p>
                      <p className="text-xs text-gray-400">
                        创建于 {new Date(link.created_at).toLocaleDateString('zh-CN')}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleCopy(`${window.location.origin}/share/${link.share_token}`, link.id)}
                        className={`p-2 rounded-lg transition-colors ${
                          copied === link.id
                            ? 'bg-blue-500 text-white'
                            : 'bg-white border border-gray-200 text-gray-500 hover:text-blue-500'
                        }`}
                      >
                        {copied === link.id ? (
                          <Check className="w-4 h-4" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>
                      <button
                        onClick={() => handleDelete(link.id)}
                        className="p-2 rounded-lg bg-white border border-gray-200 text-gray-500 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 rounded-b-2xl border-t border-gray-100">
          <p className="text-xs text-gray-500 text-center">
            分享链接仅限文档内容分享，不包含编辑权限
          </p>
        </div>
      </div>
    </div>
  );
}
