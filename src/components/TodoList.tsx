import { useState, useEffect } from 'react';
import {
  CheckCircle2,
  Circle,
  Clock,
  AlertCircle,
  Plus,
  MoreHorizontal,
  Trash2,
  Edit2,
  Calendar,
  Tag,
  X,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { todoService } from '../lib/servicesApi';
import type { Todo, User } from '../lib/types';

interface TodoListProps {
  documentId: string;
  currentUser: User | null;
}

const TAG_COLORS: Record<string, { bg: string; text: string }> = {
  重要: { bg: 'bg-red-100', text: 'text-red-600' },
  紧急: { bg: 'bg-orange-100', text: 'text-orange-600' },
  文档: { bg: 'bg-blue-100', text: 'text-blue-600' },
  代码: { bg: 'bg-green-100', text: 'text-green-600' },
  review: { bg: 'bg-purple-100', text: 'text-purple-600' },
  默认: { bg: 'bg-gray-100', text: 'text-gray-600' },
};

const PRIORITY_CONFIG = {
  high: { label: '高', color: 'text-red-500', bg: 'bg-red-50' },
  medium: { label: '中', color: 'text-orange-500', bg: 'bg-orange-50' },
  low: { label: '低', color: 'text-gray-500', bg: 'bg-gray-50' },
};

export default function TodoList({ documentId, currentUser }: TodoListProps) {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [newContent, setNewContent] = useState('');
  const [newPriority, setNewPriority] = useState<Todo['priority']>('medium');
  const [newDueDate, setNewDueDate] = useState('');
  const [newTags, setNewTags] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [expandedTags, setExpandedTags] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [stats, setStats] = useState({ total: 0, completed: 0, inProgress: 0, pending: 0 });

  useEffect(() => {
    loadTodos();
  }, [documentId]);

  const loadTodos = async () => {
    const data = await todoService.getByDocument(documentId);
    setTodos(data);
    const statsData = await todoService.getStats(documentId);
    setStats(statsData);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContent.trim()) return;

    setIsLoading(true);
    const tags = newTags.split(',').map(t => t.trim()).filter(Boolean);

    await todoService.create({
      document_id: documentId,
      content: newContent.trim(),
      priority: newPriority,
      due_date: newDueDate || null,
      tags,
      user_id: currentUser?.id || 'anonymous',
    });

    setNewContent('');
    setNewPriority('medium');
    setNewDueDate('');
    setNewTags('');
    setIsAdding(false);
    await loadTodos();
    setIsLoading(false);
  };

  const handleToggle = async (id: string) => {
    setIsLoading(true);
    await todoService.toggleStatus(id);
    await loadTodos();
    setIsLoading(false);
  };

  const handleEdit = async (id: string) => {
    if (!editContent.trim()) return;

    setIsLoading(true);
    await todoService.update(id, { content: editContent.trim() });
    setEditContent('');
    setEditingId(null);
    await loadTodos();
    setIsLoading(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个任务吗？')) return;

    setIsLoading(true);
    await todoService.delete(id);
    await loadTodos();
    setIsLoading(false);
  };

  const getTagStyle = (tag: string) => {
    return TAG_COLORS[tag] || TAG_COLORS['默认'];
  };

  const formatDueDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = date.getTime() - now.getTime();
    const days = Math.floor(diff / 86400000);

    if (days < 0) return { text: '已逾期', color: 'text-red-500' };
    if (days === 0) return { text: '今天', color: 'text-orange-500' };
    if (days === 1) return { text: '明天', color: 'text-orange-400' };
    if (days <= 7) return { text: `${days}天后`, color: 'text-yellow-600' };
    return { text: date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }), color: 'text-gray-500' };
  };

  const progress = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4 text-white" />
            </div>
            <h3 className="font-medium text-gray-900">滚花任务</h3>
            <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">
              {stats.completed}/{stats.total}
            </span>
          </div>
          <button
            onClick={() => setIsAdding(!isAdding)}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-blue-500 transition-colors"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>

        {/* Progress bar */}
        {stats.total > 0 && (
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
              <span>完成进度</span>
              <span>{progress}%</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-green-400 to-emerald-500 transition-all duration-500 rounded-full"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Add new todo form */}
      {isAdding && (
        <form onSubmit={handleAdd} className="p-4 bg-gray-50/50 border-b border-gray-100">
          <input
            type="text"
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder="输入任务内容..."
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            autoFocus
          />

          <div className="flex flex-wrap gap-3 mt-3">
            {/* Priority */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">优先级：</span>
              <div className="flex gap-1">
                {(['low', 'medium', 'high'] as const).map(p => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setNewPriority(p)}
                    className={`px-2 py-1 text-xs rounded-md transition-colors ${
                      newPriority === p
                        ? `${PRIORITY_CONFIG[p].bg} ${PRIORITY_CONFIG[p].color}`
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                  >
                    {PRIORITY_CONFIG[p].label}
                  </button>
                ))}
              </div>
            </div>

            {/* Due date */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">截止：</span>
              <input
                type="date"
                value={newDueDate}
                onChange={(e) => setNewDueDate(e.target.value)}
                className="px-2 py-1 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>

            {/* Tags */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">标签：</span>
              <input
                type="text"
                value={newTags}
                onChange={(e) => setNewTags(e.target.value)}
                placeholder="重要,紧急"
                className="px-2 py-1 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 w-24"
              />
            </div>
          </div>

          <div className="flex gap-2 mt-3">
            <button
              type="submit"
              disabled={isLoading || !newContent.trim()}
              className="px-4 py-1.5 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 disabled:opacity-50"
            >
              添加
            </button>
            <button
              type="button"
              onClick={() => setIsAdding(false)}
              className="px-4 py-1.5 bg-gray-100 text-gray-600 text-sm rounded-lg hover:bg-gray-200"
            >
              取消
            </button>
          </div>
        </form>
      )}

      {/* Todo list */}
      <div className="max-h-80 overflow-y-auto">
        {todos.length === 0 && !isAdding ? (
          <div className="py-8 text-center">
            <CheckCircle2 className="w-8 h-8 mx-auto text-gray-300 mb-2" />
            <p className="text-sm text-gray-500">暂无任务，添加一个吧</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {todos.map(todo => {
              const isCompleted = todo.status === 'completed';
              const isEditing = editingId === todo.id;
              const dueInfo = todo.due_date ? formatDueDate(todo.due_date) : null;
              const isOverdue = dueInfo && dueInfo.color === 'text-red-500';

              return (
                <div
                  key={todo.id}
                  className={`group flex items-start gap-3 p-3 hover:bg-gray-50/50 transition-colors ${
                    isCompleted ? 'opacity-60' : ''
                  }`}
                >
                  {/* Checkbox */}
                  <button
                    onClick={() => handleToggle(todo.id)}
                    disabled={isLoading}
                    className={`shrink-0 mt-0.5 ${
                      isCompleted
                        ? 'text-green-500'
                        : todo.status === 'in_progress'
                        ? 'text-orange-500'
                        : 'text-gray-300 hover:text-blue-500'
                    }`}
                  >
                    {isCompleted ? (
                      <CheckCircle2 className="w-5 h-5" />
                    ) : todo.status === 'in_progress' ? (
                      <Clock className="w-5 h-5" />
                    ) : (
                      <Circle className="w-5 h-5" />
                    )}
                  </button>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    {isEditing ? (
                      <div>
                        <input
                          type="text"
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          className="w-full px-2 py-1 border border-gray-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleEdit(todo.id);
                            if (e.key === 'Escape') { setEditingId(null); setEditContent(''); }
                          }}
                        />
                        <div className="flex gap-2 mt-2">
                          <button
                            onClick={() => handleEdit(todo.id)}
                            className="px-2 py-1 bg-blue-500 text-white text-xs rounded"
                          >
                            保存
                          </button>
                          <button
                            onClick={() => { setEditingId(null); setEditContent(''); }}
                            className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded"
                          >
                            取消
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className={`text-sm ${isCompleted ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                          {todo.content}
                        </p>

                        {/* Meta info */}
                        <div className="flex flex-wrap items-center gap-2 mt-1.5">
                          {/* Priority badge */}
                          <span className={`px-1.5 py-0.5 text-xs rounded ${PRIORITY_CONFIG[todo.priority].bg} ${PRIORITY_CONFIG[todo.priority].color}`}>
                            {PRIORITY_CONFIG[todo.priority].label}
                          </span>

                          {/* Due date */}
                          {dueInfo && (
                            <span className={`flex items-center gap-1 text-xs ${dueInfo.color}`}>
                              <Calendar className="w-3 h-3" />
                              {dueInfo.text}
                            </span>
                          )}

                          {/* Tags */}
                          {todo.tags.map(tag => (
                            <span
                              key={tag}
                              className={`px-1.5 py-0.5 text-xs rounded ${getTagStyle(tag).bg} ${getTagStyle(tag).text}`}
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      </>
                    )}
                  </div>

                  {/* Actions */}
                  {!isEditing && (
                    <div className="shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => {
                          setEditingId(todo.id);
                          setEditContent(todo.content);
                        }}
                        className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-blue-500"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(todo.id)}
                        className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-red-500"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer stats */}
      {stats.total > 0 && (
        <div className="px-4 py-2 bg-gray-50/50 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <Circle className="w-3 h-3 text-gray-300" />
              待办 {stats.pending}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3 text-orange-400" />
              进行中 {stats.inProgress}
            </span>
            <span className="flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-green-500" />
              已完成 {stats.completed}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
