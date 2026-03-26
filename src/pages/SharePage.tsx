import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { BookOpen, Lock, Users, Globe, ArrowLeft, MessageCircle, CheckCircle2 } from 'lucide-react';
import { shareService } from '../lib/databaseApi';
import { documentService } from '../lib/documentsApi';
import type { Document } from '../lib/types';

export default function SharePage() {
  const { token } = useParams<{ token: string }>();
  const [document, setDocument] = useState<Document | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSharedDocument();
  }, [token]);

  const loadSharedDocument = async () => {
    setIsLoading(true);
    setError(null);

    try {
      if (!token) {
        setError('Share link is invalid.');
        return;
      }

      const link = await shareService.getShareLink(token);
      if (!link?.document_id) {
        setError('Document not found or share link expired.');
        return;
      }

      const sharedDoc = await documentService.getById(link.document_id);

      if (sharedDoc) {
        setDocument(sharedDoc);
      } else {
        setError('文档不存在或已失效');
      }
    } catch (err) {
      setError('加载文档失败');
    }

    setIsLoading(false);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500">加载中...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-red-100 flex items-center justify-center">
            <Lock className="w-8 h-8 text-red-500" />
          </div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">{error}</h1>
          <p className="text-gray-500 mb-6">该分享链接可能已失效或文档已被删除</p>
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            返回首页
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center">
              <BookOpen className="w-6 h-6 text-white" />
            </div>
            <div>
              <span className="font-semibold text-gray-900">语雀笔记</span>
              <span className="mx-2 text-gray-300">|</span>
              <span className="text-gray-500 text-sm">分享文档</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 px-3 py-1.5 bg-green-50 text-green-600 text-sm rounded-full">
              <Globe className="w-4 h-4" />
              公开分享
            </span>
            <Link
              to="/"
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm font-medium"
            >
              登录使用
            </Link>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          {/* Document header */}
          <div className="px-8 py-6 border-b border-gray-100">
            <h1 className="text-2xl font-bold text-gray-900">{document?.title}</h1>
            <div className="flex items-center gap-4 mt-3 text-sm text-gray-500">
              <span className="flex items-center gap-1">
                <MessageCircle className="w-4 h-4" />
                3 条评论
              </span>
              <span className="flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" />
                2/3 任务完成
              </span>
              <span>
                最后更新于 {new Date(document?.updated_at || '').toLocaleDateString('zh-CN')}
              </span>
            </div>
          </div>

          {/* Document content */}
          <div
            className="px-8 py-6 prose prose-gray max-w-none"
            dangerouslySetInnerHTML={{ __html: document?.content || '' }}
          />

          {/* Footer */}
          <div className="px-8 py-4 bg-gray-50 border-t border-gray-100 text-center">
            <p className="text-sm text-gray-500">
              这是通过语雀笔记分享的文档
              <Link to="/" className="text-blue-500 hover:underline ml-1">
                登录语雀笔记
              </Link>
              获得更好的编辑体验
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
