import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  BookOpen,
  Download,
  File,
  FileArchive,
  FileText,
  Globe,
  Image,
  Lock,
  Music,
  ShieldAlert,
  Users,
  Video,
} from 'lucide-react';
import { ApiError } from '../lib/api';
import { shareService } from '../lib/databaseApi';
import type { Document, FileRecord, SharedResourcePayload } from '../lib/types';

interface ErrorState {
  status: number;
  title: string;
  message: string;
}

const visibilityMeta = {
  private: {
    label: '私有分享',
    icon: Lock,
    className: 'bg-amber-50 text-amber-700',
  },
  team: {
    label: '团队分享',
    icon: Users,
    className: 'bg-blue-50 text-blue-700',
  },
  public: {
    label: '公开分享',
    icon: Globe,
    className: 'bg-emerald-50 text-emerald-700',
  },
} as const;

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
};

const getFileIcon = (type: FileRecord['type']) => {
  switch (type) {
    case 'image':
      return <Image className="h-6 w-6 text-emerald-500" />;
    case 'video':
      return <Video className="h-6 w-6 text-indigo-500" />;
    case 'pdf':
      return <FileText className="h-6 w-6 text-rose-500" />;
    case 'document':
      return <FileText className="h-6 w-6 text-sky-500" />;
    case 'archive':
      return <FileArchive className="h-6 w-6 text-amber-500" />;
    case 'audio':
      return <Music className="h-6 w-6 text-fuchsia-500" />;
    default:
      return <File className="h-6 w-6 text-slate-500" />;
  }
};

function buildErrorState(status: number, message: string): ErrorState {
  if (status === 401) {
    return {
      status,
      title: '请先登录',
      message: message || '这个分享内容需要登录后才能访问。',
    };
  }

  if (status === 403) {
    return {
      status,
      title: '没有访问权限',
      message: message || '你当前没有权限查看这个分享内容。',
    };
  }

  if (status === 410) {
    return {
      status,
      title: '分享链接已失效',
      message: message || '这个分享链接已经过期，请联系分享者重新生成。',
    };
  }

  if (status === 404) {
    return {
      status,
      title: '分享内容不存在',
      message: message || '链接对应的资源已删除，或分享链接无效。',
    };
  }

  return {
    status,
    title: '加载失败',
    message: message || '分享内容暂时无法加载，请稍后重试。',
  };
}

export default function SharePageAccess() {
  const { token } = useParams<{ token: string }>();
  const [payload, setPayload] = useState<SharedResourcePayload | null>(null);
  const [document, setDocument] = useState<Document | null>(null);
  const [file, setFile] = useState<FileRecord | null>(null);
  const [error, setError] = useState<ErrorState | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      setError(null);
      setPayload(null);
      setDocument(null);
      setFile(null);

      if (!token) {
        setError(buildErrorState(404, '分享链接格式不正确。'));
        setIsLoading(false);
        return;
      }

      try {
        const nextPayload = await shareService.getSharedResource(token);
        setPayload(nextPayload);
        setDocument(nextPayload.document ?? null);
        setFile(nextPayload.file ?? null);
      } catch (loadError) {
        if (loadError instanceof ApiError) {
          setError(buildErrorState(loadError.status, loadError.message));
        } else if (loadError instanceof Error) {
          setError(buildErrorState(500, loadError.message));
        } else {
          setError(buildErrorState(500, '分享内容加载失败。'));
        }
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, [token]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-blue-500/30 border-t-blue-500" />
          <p className="text-gray-500">正在加载分享内容...</p>
        </div>
      </div>
    );
  }

  if (error || (!document && !file) || !payload) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-lg rounded-[32px] border border-slate-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-50 text-rose-500">
            <ShieldAlert className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-semibold text-slate-900">{error?.title || '分享内容不可用'}</h1>
          <p className="mt-3 text-sm leading-6 text-slate-500">
            {error?.message || '当前分享内容无法展示，请稍后重试。'}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link
              to="/"
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              <ArrowLeft className="h-4 w-4" />
              {error?.status === 401 ? '返回首页登录' : '返回首页'}
            </Link>
            <Link
              to="/public"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <Globe className="h-4 w-4" />
              查看公开资源
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const visibility = visibilityMeta[payload.link.visibility];
  const VisibilityIcon = visibility.icon;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600">
              <BookOpen className="h-6 w-6 text-white" />
            </div>
            <div>
              <div className="font-semibold text-slate-900">语雀笔记</div>
              <div className="mt-1 text-sm text-slate-500">{document ? '笔记分享' : '文件分享'}</div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm ${visibility.className}`}>
              <VisibilityIcon className="h-4 w-4" />
              {visibility.label}
            </span>
            {payload.team && (
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1.5 text-sm text-slate-600">
                <Users className="h-4 w-4" />
                {payload.team.name}
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
        {document && (
          <div className="overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-8 py-6">
              <h1 className="text-3xl font-bold text-slate-900">{document.title}</h1>
              <p className="mt-3 text-sm text-slate-500">
                更新时间：{new Date(document.updated_at).toLocaleString('zh-CN')}
              </p>
            </div>

            <div className="prose-yuque share-content max-w-none px-8 py-6" dangerouslySetInnerHTML={{ __html: document.content }} />
          </div>
        )}

        {file && (
          <div className="overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-4 border-b border-slate-100 px-8 py-6 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-slate-100 p-3">{getFileIcon(file.type)}</div>
                  <div className="min-w-0">
                    <h1 className="truncate text-2xl font-bold text-slate-900">{file.name}</h1>
                    <p className="mt-1 text-sm text-slate-500">
                      {formatFileSize(file.size)} · 上传于 {new Date(file.created_at).toLocaleString('zh-CN')}
                    </p>
                  </div>
                </div>
              </div>

              <a
                href={file.url}
                download={file.name}
                className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
              >
                <Download className="h-4 w-4" />
                下载文件
              </a>
            </div>

            <div className="bg-slate-950 px-8 py-8">
              {file.type === 'image' && (
                <img src={file.url} alt={file.name} className="mx-auto max-h-[70vh] max-w-full rounded-2xl object-contain" />
              )}

              {file.type === 'video' && (
                <video src={file.url} controls className="mx-auto max-h-[70vh] max-w-full rounded-2xl" />
              )}

              {file.type === 'audio' && (
                <div className="flex min-h-[240px] items-center justify-center">
                  <audio src={file.url} controls className="w-full max-w-2xl" />
                </div>
              )}

              {file.type === 'pdf' && (
                <iframe src={file.url} className="h-[70vh] w-full rounded-2xl bg-white" title={file.name} />
              )}

              {!['image', 'video', 'audio', 'pdf'].includes(file.type) && (
                <div className="rounded-3xl bg-white px-8 py-16 text-center">
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100">
                    {getFileIcon(file.type)}
                  </div>
                  <h2 className="text-lg font-semibold text-slate-900">当前文件类型暂不支持在线预览</h2>
                  <p className="mt-2 text-sm text-slate-500">文件已持久化保存到本地磁盘，可以直接下载查看。</p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
