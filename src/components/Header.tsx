import { useEffect, useState } from 'react';
import { CheckCircle2, Clock, MessageCircle, Save, Share2 } from 'lucide-react';

interface HeaderProps {
  title: string;
  onTitleChange: (title: string) => void;
  isEditing: boolean;
  onSave: () => void;
  lastSaved?: Date;
  canEditTitle?: boolean;
  showShare?: boolean;
  onShare?: () => void;
  showCommentAction?: boolean;
  isCommentsActive?: boolean;
  onToggleComments?: () => void;
  showTodoAction?: boolean;
  isTodosActive?: boolean;
  onToggleTodos?: () => void;
}

export default function Header({
  title,
  onTitleChange,
  isEditing,
  onSave,
  lastSaved,
  canEditTitle = true,
  showShare = false,
  onShare,
  showCommentAction = false,
  isCommentsActive = false,
  onToggleComments,
  showTodoAction = false,
  isTodosActive = false,
  onToggleTodos,
}: HeaderProps) {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(title);

  useEffect(() => {
    setTitleValue(title);
  }, [title]);

  useEffect(() => {
    if (!canEditTitle) {
      setIsEditingTitle(false);
    }
  }, [canEditTitle]);

  const handleTitleSubmit = () => {
    const nextTitle = titleValue.trim();
    if (nextTitle) {
      onTitleChange(nextTitle);
    } else {
      setTitleValue(title);
    }
    setIsEditingTitle(false);
  };

  const formatLastSaved = () => {
    if (!lastSaved) return '';

    const diff = Date.now() - lastSaved.getTime();
    const minutes = Math.floor(diff / 60000);

    if (minutes < 1) return '刚刚保存';
    if (minutes < 60) return `${minutes} 分钟前保存`;
    return `${lastSaved.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })} 保存`;
  };

  const hasDocActions = showShare || showCommentAction || showTodoAction;

  return (
    <header className="app-soft-surface flex h-14 shrink-0 items-center justify-between gap-4 border-b border-yuque-border/70 bg-white/92 px-4">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {isEditingTitle && canEditTitle ? (
          <input
            type="text"
            value={titleValue}
            onChange={(event) => setTitleValue(event.target.value)}
            onBlur={handleTitleSubmit}
            onKeyDown={(event) => {
              if (event.key === 'Enter') handleTitleSubmit();
              if (event.key === 'Escape') {
                setTitleValue(title);
                setIsEditingTitle(false);
              }
            }}
            className="min-w-0 flex-1 rounded-lg border border-yuque-primary bg-transparent px-2 py-1 text-lg font-semibold text-yuque-text focus:outline-none"
            autoFocus
          />
        ) : (
          <h1
            className={`truncate text-lg font-semibold text-yuque-text transition-colors ${
              canEditTitle ? 'cursor-pointer hover:text-yuque-primary' : ''
            }`}
            onClick={() => {
              if (canEditTitle) {
                setIsEditingTitle(true);
              }
            }}
          >
            {title || '未命名文档'}
          </h1>
        )}

        {isEditing && (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-yellow-50 px-2 py-1 text-xs text-yellow-600 shadow-sm">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-yellow-500" />
            未保存
          </span>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {lastSaved && !isEditing && (
          <span className="hidden items-center gap-1 text-xs text-yuque-textMuted sm:flex">
            <Clock className="h-3 w-3" />
            {formatLastSaved()}
          </span>
        )}

        {isEditing && (
          <button
            type="button"
            onClick={onSave}
            className="inline-flex items-center gap-2 rounded-xl bg-yuque-primary px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-blue-600 hover:shadow-md"
          >
            <Save className="h-4 w-4" />
            保存
          </button>
        )}

        {hasDocActions && <div className="mx-1 h-6 w-px bg-gray-200" />}

        {showCommentAction && onToggleComments && (
          <button
            type="button"
            onClick={onToggleComments}
            className={`rounded-xl p-2 transition ${
              isCommentsActive
                ? 'bg-blue-50 text-blue-500 shadow-sm'
                : 'text-gray-400 hover:bg-gray-100 hover:text-blue-500'
            }`}
            aria-label="评论"
          >
            <MessageCircle className="h-5 w-5" />
          </button>
        )}

        {showTodoAction && onToggleTodos && (
          <button
            type="button"
            onClick={onToggleTodos}
            className={`rounded-xl p-2 transition ${
              isTodosActive
                ? 'bg-green-50 text-green-500 shadow-sm'
                : 'text-gray-400 hover:bg-gray-100 hover:text-green-500'
            }`}
            aria-label="待办"
          >
            <CheckCircle2 className="h-5 w-5" />
          </button>
        )}

        {showShare && onShare && (
          <button
            type="button"
            onClick={onShare}
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm text-yuque-textSecondary transition hover:-translate-y-0.5 hover:bg-gray-100 hover:text-yuque-primary"
          >
            <Share2 className="h-4 w-4" />
            分享
          </button>
        )}
      </div>
    </header>
  );
}
