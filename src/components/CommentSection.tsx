import { useState, useEffect } from 'react';
import { MessageCircle, Send, MoreHorizontal, Trash2, Edit2, CornerDownRight, ChevronDown, ChevronUp } from 'lucide-react';
import { commentService } from '../lib/servicesApi';
import type { Comment, User } from '../lib/types';

interface CommentSectionProps {
  documentId: string;
  currentUser: User | null;
}

export default function CommentSection({ documentId, currentUser }: CommentSectionProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadComments();
  }, [documentId]);

  const loadComments = async () => {
    const data = await commentService.getByDocument(documentId);
    setComments(data);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;

    setIsLoading(true);
    await commentService.create({
      document_id: documentId,
      content: newComment.trim(),
      user_id: currentUser?.id || 'anonymous',
    });
    setNewComment('');
    await loadComments();
    setIsLoading(false);
  };

  const handleReply = async (parentId: string) => {
    if (!replyContent.trim()) return;

    setIsLoading(true);
    await commentService.create({
      document_id: documentId,
      parent_id: parentId,
      content: replyContent.trim(),
      user_id: currentUser?.id || 'anonymous',
    });
    setReplyContent('');
    setReplyingTo(null);
    await loadComments();
    setIsLoading(false);
  };

  const handleEdit = async (id: string) => {
    if (!editContent.trim()) return;

    setIsLoading(true);
    await commentService.update(id, editContent.trim());
    setEditContent('');
    setEditingId(null);
    await loadComments();
    setIsLoading(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这条评论吗？')) return;

    setIsLoading(true);
    await commentService.delete(id);
    await loadComments();
    setIsLoading(false);
  };

  const toggleReplies = (id: string) => {
    const newExpanded = new Set(expandedReplies);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedReplies(newExpanded);
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return '刚刚';
    if (minutes < 60) return `${minutes}分钟前`;
    if (hours < 24) return `${hours}小时前`;
    if (days < 7) return `${days}天前`;
    return date.toLocaleDateString('zh-CN');
  };

  const getInitials = (name: string) => {
    return name.charAt(0).toUpperCase();
  };

  const CommentItem = ({ comment, isReply = false }: { comment: Comment; isReply?: boolean }) => {
    const isOwner = currentUser?.id === comment.user_id;
    const isExpanded = expandedReplies.has(comment.id);
    const hasReplies = comment.replies && comment.replies.length > 0;

    return (
      <div className={`${isReply ? 'ml-8 border-l-2 border-gray-100 pl-4' : ''}`}>
        <div className="group flex gap-3 py-3">
          {/* Avatar */}
          <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
            isReply ? 'bg-gray-100 text-gray-600' : 'bg-gradient-to-br from-blue-400 to-indigo-500 text-white'
          }`}>
            {comment.user?.nickname ? getInitials(comment.user.nickname) : '?'}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm text-gray-900">
                {comment.user?.nickname || '匿名用户'}
              </span>
              <span className="text-xs text-gray-400">
                {formatTime(comment.created_at)}
              </span>
              {comment.updated_at !== comment.created_at && (
                <span className="text-xs text-gray-400">(已编辑)</span>
              )}
            </div>

            {/* Comment text */}
            {editingId === comment.id ? (
              <div className="mt-1">
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="w-full p-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none"
                  rows={2}
                  autoFocus
                />
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => handleEdit(comment.id)}
                    disabled={isLoading}
                    className="px-3 py-1 bg-blue-500 text-white text-xs rounded-lg hover:bg-blue-600 disabled:opacity-50"
                  >
                    保存
                  </button>
                  <button
                    onClick={() => { setEditingId(null); setEditContent(''); }}
                    className="px-3 py-1 bg-gray-100 text-gray-600 text-xs rounded-lg hover:bg-gray-200"
                  >
                    取消
                  </button>
                </div>
              </div>
            ) : (
              <p className="mt-1 text-sm text-gray-700 whitespace-pre-wrap">
                {comment.content}
              </p>
            )}

            {/* Actions */}
            {editingId !== comment.id && (
              <div className="flex items-center gap-4 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                {!isReply && (
                  <button
                    onClick={() => setReplyingTo(replyingTo === comment.id ? null : comment.id)}
                    className="flex items-center gap-1 text-xs text-gray-500 hover:text-blue-500"
                  >
                    <CornerDownRight className="w-3 h-3" />
                    回复
                  </button>
                )}

                {hasReplies && (
                  <button
                    onClick={() => toggleReplies(comment.id)}
                    className="flex items-center gap-1 text-xs text-gray-500 hover:text-blue-500"
                  >
                    {isExpanded ? (
                      <>
                        <ChevronUp className="w-3 h-3" />
                        收起回复
                      </>
                    ) : (
                      <>
                        <ChevronDown className="w-3 h-3" />
                        {comment.replies!.length}条回复
                      </>
                    )}
                  </button>
                )}

                {isOwner && (
                  <>
                    <button
                      onClick={() => {
                        setEditingId(comment.id);
                        setEditContent(comment.content);
                      }}
                      className="flex items-center gap-1 text-xs text-gray-500 hover:text-blue-500"
                    >
                      <Edit2 className="w-3 h-3" />
                      编辑
                    </button>
                    <button
                      onClick={() => handleDelete(comment.id)}
                      className="flex items-center gap-1 text-xs text-gray-500 hover:text-red-500"
                    >
                      <Trash2 className="w-3 h-3" />
                      删除
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Reply input */}
            {replyingTo === comment.id && (
              <div className="mt-2">
                <textarea
                  value={replyContent}
                  onChange={(e) => setReplyContent(e.target.value)}
                  placeholder={`回复 ${comment.user?.nickname || '匿名用户'}...`}
                  className="w-full p-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none"
                  rows={2}
                  autoFocus
                />
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => handleReply(comment.id)}
                    disabled={isLoading || !replyContent.trim()}
                    className="px-3 py-1 bg-blue-500 text-white text-xs rounded-lg hover:bg-blue-600 disabled:opacity-50 flex items-center gap-1"
                  >
                    <Send className="w-3 h-3" />
                    发送
                  </button>
                  <button
                    onClick={() => { setReplyingTo(null); setReplyContent(''); }}
                    className="px-3 py-1 bg-gray-100 text-gray-600 text-xs rounded-lg hover:bg-gray-200"
                  >
                    取消
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Nested replies */}
        {isExpanded && hasReplies && (
          <div className="mt-1">
            {comment.replies!.map(reply => (
              <CommentItem key={reply.id} comment={reply} isReply />
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
        <MessageCircle className="w-4 h-4 text-gray-500" />
        <h3 className="font-medium text-gray-900">评论</h3>
        <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">
          {comments.length}
        </span>
      </div>

      {/* Comment list */}
      <div className="max-h-96 overflow-y-auto">
        {comments.length === 0 ? (
          <div className="py-8 text-center">
            <MessageCircle className="w-8 h-8 mx-auto text-gray-300 mb-2" />
            <p className="text-sm text-gray-500">暂无评论，来发表第一条评论吧</p>
          </div>
        ) : (
          <div className="px-4">
            {comments.map(comment => (
              <CommentItem key={comment.id} comment={comment} />
            ))}
          </div>
        )}
      </div>

      {/* New comment input */}
      <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/50">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-sm font-medium text-white shrink-0">
            {currentUser?.nickname ? getInitials(currentUser.nickname) : '?'}
          </div>
          <div className="flex-1 flex gap-2">
            <input
              type="text"
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="写下你的评论..."
              className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
            <button
              type="submit"
              disabled={isLoading || !newComment.trim()}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
