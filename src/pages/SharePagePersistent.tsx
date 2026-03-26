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
  Music,
  Video,
} from 'lucide-react';
import { fileService, shareService } from '../lib/databaseApi';
import { documentService } from '../lib/documentsApi';
import type { Document, FileRecord } from '../lib/types';

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
};

const getFileIcon = (type: FileRecord['type']) => {
  switch (type) {
    case 'image':
      return <Image className="w-6 h-6 text-emerald-500" />;
    case 'video':
      return <Video className="w-6 h-6 text-indigo-500" />;
    case 'pdf':
      return <FileText className="w-6 h-6 text-rose-500" />;
    case 'document':
      return <FileText className="w-6 h-6 text-sky-500" />;
    case 'archive':
      return <FileArchive className="w-6 h-6 text-amber-500" />;
    case 'audio':
      return <Music className="w-6 h-6 text-fuchsia-500" />;
    default:
      return <File className="w-6 h-6 text-slate-500" />;
  }
};

export default function SharePagePersistent() {
  const { token } = useParams<{ token: string }>();
  const [document, setDocument] = useState<Document | null>(null);
  const [file, setFile] = useState<FileRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      setError(null);
      setDocument(null);
      setFile(null);

      try {
        if (!token) {
          setError('Share link is invalid.');
          return;
        }

        const link = await shareService.getShareLink(token);
        if (!link) {
          setError('Share link not found or expired.');
          return;
        }

        if (link.document_id) {
          const sharedDocument = await documentService.getById(link.document_id);
          if (!sharedDocument) {
            setError('Document not found or share link expired.');
            return;
          }
          setDocument(sharedDocument);
          return;
        }

        if (link.file_id) {
          const sharedFile = await fileService.getById(link.file_id);
          if (!sharedFile) {
            setError('File not found or share link expired.');
            return;
          }
          setFile(sharedFile);
          return;
        }

        setError('Share target is missing.');
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Failed to load share content.');
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, [token]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

  if (error || (!document && !file)) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-red-100 flex items-center justify-center">
            <ArrowLeft className="w-8 h-8 text-red-500" />
          </div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">{error || 'Share content unavailable.'}</h1>
          <p className="text-gray-500 mb-6">The share link may have expired, or the content no longer exists.</p>
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center">
              <BookOpen className="w-6 h-6 text-white" />
            </div>
            <div>
              <span className="font-semibold text-gray-900">Yuque Notes</span>
              <span className="mx-2 text-gray-300">|</span>
              <span className="text-gray-500 text-sm">{document ? 'Shared Document' : 'Shared File'}</span>
            </div>
          </div>

          <span className="flex items-center gap-1 px-3 py-1.5 bg-green-50 text-green-600 text-sm rounded-full">
            <Globe className="w-4 h-4" />
            Shared
          </span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {document && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-8 py-6 border-b border-gray-100">
              <h1 className="text-2xl font-bold text-gray-900">{document.title}</h1>
              <p className="text-sm text-gray-500 mt-3">
                Last updated {new Date(document.updated_at).toLocaleDateString('zh-CN')}
              </p>
            </div>

            <div
              className="px-8 py-6 prose-yuque share-content max-w-none"
              dangerouslySetInnerHTML={{ __html: document.content }}
            />
          </div>
        )}

        {file && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-8 py-6 border-b border-gray-100 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-slate-100 p-3">{getFileIcon(file.type)}</div>
                  <div className="min-w-0">
                    <h1 className="truncate text-2xl font-bold text-gray-900">{file.name}</h1>
                    <p className="text-sm text-gray-500 mt-1">
                      {formatFileSize(file.size)} · Shared on {new Date(file.created_at).toLocaleDateString('zh-CN')}
                    </p>
                  </div>
                </div>
              </div>

              <a
                href={file.url}
                download={file.name}
                className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
              >
                <Download className="w-4 h-4" />
                Download
              </a>
            </div>

            <div className="px-8 py-8 bg-slate-950">
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
                  <h2 className="text-lg font-semibold text-slate-900">Preview is not available for this file type.</h2>
                  <p className="mt-2 text-sm text-slate-500">The file is stored on disk and can be downloaded directly.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
