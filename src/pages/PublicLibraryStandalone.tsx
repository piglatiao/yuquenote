import { Link } from 'react-router-dom';
import { ArrowLeft, BookOpen } from 'lucide-react';
import { useEffect, useState } from 'react';
import ShareCenterPanel from '../components/ShareCenterPanel';
import { authService } from '../lib/authApi';

export default function PublicLibraryStandalone() {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    const loadUser = async () => {
      const currentUser = await authService.init();
      setCurrentUserId(currentUser?.id ?? null);
    };

    void loadUser();
  }, []);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-blue-600 p-2 text-white">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <div className="font-semibold text-slate-900">语雀笔记</div>
              <div className="text-sm text-slate-500">空间分享中心</div>
            </div>
          </div>
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" />
            返回首页
          </Link>
        </div>
      </header>
      <ShareCenterPanel currentUserId={currentUserId} currentWorkspaceTeamId={null} workspaceLabel="个人空间" />
    </div>
  );
}
