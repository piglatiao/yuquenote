import { useState, useEffect } from 'react';
import { Save, Share2, MessageCircle, CheckCircle2, Clock, ChevronDown } from 'lucide-react';

interface HeaderProps {
  title: string;
  onTitleChange: (title: string) => void;
  isEditing: boolean;
  onSave: () => void;
  lastSaved?: Date;
  showShare?: boolean;
  onShare?: () => void;
  showComments?: boolean;
  onToggleComments?: () => void;
  showTodos?: boolean;
  onToggleTodos?: () => void;
}

export default function Header({
  title,
  onTitleChange,
  isEditing,
  onSave,
  lastSaved,
  showShare = false,
  onShare,
  showComments = false,
  onToggleComments,
  showTodos = false,
  onToggleTodos,
}: HeaderProps) {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(title);
  const [showSaveMenu, setShowSaveMenu] = useState(false);

  useEffect(() => {
    setTitleValue(title);
  }, [title]);

  const handleTitleSubmit = () => {
    if (titleValue.trim()) {
      onTitleChange(titleValue.trim());
    } else {
      setTitleValue(title);
    }
    setIsEditingTitle(false);
  };

  const formatLastSaved = () => {
    if (!lastSaved) return '';

    const now = new Date();
    const diff = now.getTime() - lastSaved.getTime();
    const minutes = Math.floor(diff / 60000);

    if (minutes < 1) return '刚刚保存';
    if (minutes < 60) return `${minutes}分钟前保存`;
    return lastSaved.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) + ' 保存';
  };

  return (
    <header className="h-14 bg-white border-b border-yuque-border flex items-center justify-between px-4 shrink-0">
      {/* Left side - Title */}
      <div className="flex items-center gap-4 flex-1 min-w-0">
        {isEditingTitle ? (
          <input
            type="text"
            value={titleValue}
            onChange={(e) => setTitleValue(e.target.value)}
            onBlur={handleTitleSubmit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleTitleSubmit();
              if (e.key === 'Escape') {
                setTitleValue(title);
                setIsEditingTitle(false);
              }
            }}
            className="text-lg font-semibold text-yuque-text bg-transparent border border-yuque-primary rounded px-2 py-1 focus:outline-none flex-1 min-w-0"
            autoFocus
          />
        ) : (
          <h1
            className="text-lg font-semibold text-yuque-text truncate cursor-pointer hover:text-yuque-primary transition-colors"
            onClick={() => setIsEditingTitle(true)}
          >
            {title || '未命名文档'}
          </h1>
        )}

        {/* Status indicator */}
        {isEditing && (
          <span className="shrink-0 flex items-center gap-1 px-2 py-1 bg-yellow-50 text-yellow-600 text-xs rounded-full">
            <span className="w-1.5 h-1.5 bg-yellow-500 rounded-full animate-pulse" />
            未保存
          </span>
        )}
      </div>

      {/* Right side - Actions */}
      <div className="flex items-center gap-2">
        {/* Save button */}
        {isEditing && (
          <button
            onClick={onSave}
            className="flex items-center gap-2 px-4 py-2 bg-yuque-primary text-white rounded-lg hover:bg-blue-600 transition-colors text-sm font-medium"
          >
            <Save className="w-4 h-4" />
            保存
          </button>
        )}

        {/* Last saved time */}
        {lastSaved && !isEditing && (
          <span className="flex items-center gap-1 text-xs text-yuque-textMuted">
            <Clock className="w-3 h-3" />
            {formatLastSaved()}
          </span>
        )}

        {/* Divider */}
        {showShare && <div className="w-px h-6 bg-gray-200 mx-2" />}

        {/* Toggle buttons */}
        {showComments && (
          <button
            onClick={onToggleComments}
            className={`p-2 rounded-lg transition-colors ${
              showComments
                ? 'bg-blue-50 text-blue-500'
                : 'text-gray-400 hover:text-blue-500 hover:bg-gray-100'
            }`}
            title="评论"
          >
            <MessageCircle className="w-5 h-5" />
          </button>
        )}

        {showTodos && (
          <button
            onClick={onToggleTodos}
            className={`p-2 rounded-lg transition-colors ${
              showTodos
                ? 'bg-green-50 text-green-500'
                : 'text-gray-400 hover:text-green-500 hover:bg-gray-100'
            }`}
            title="任务"
          >
            <CheckCircle2 className="w-5 h-5" />
          </button>
        )}

        {/* Share button */}
        {showShare && onShare && (
          <button
            onClick={onShare}
            className="flex items-center gap-2 px-4 py-2 text-yuque-textSecondary hover:text-yuque-primary hover:bg-gray-100 rounded-lg transition-colors text-sm"
          >
            <Share2 className="w-4 h-4" />
            分享
          </button>
        )}
      </div>
    </header>
  );
}
