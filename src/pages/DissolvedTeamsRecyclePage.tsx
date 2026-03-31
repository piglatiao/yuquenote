import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Archive,
  ArrowLeft,
  Clock,
  FolderOpen,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { teamService } from '../lib/databaseApi';
import { notify } from '../lib/notify';
import type { Team } from '../lib/types';

function formatDateTime(value?: string | null) {
  if (!value) {
    return '--';
  }
  return new Date(value).toLocaleString('zh-CN');
}

function formatDate(value?: string | null) {
  if (!value) {
    return '--';
  }
  return new Date(value).toLocaleDateString('zh-CN');
}

export default function DissolvedTeamsRecyclePage() {
  const navigate = useNavigate();
  const [dissolvedTeams, setDissolvedTeams] = useState<Team[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const handleBack = () => {
    // 回收站列表页面直接返回首页
    navigate('/');
  };

  const load = async () => {
    setIsLoading(true);
    setError('');
    try {
      const result = await teamService.getDissolvedTeams();
      setDissolvedTeams(result);
    } catch (loadError) {
      setDissolvedTeams([]);
      setError(loadError instanceof Error ? loadError.message : '回收站列表加载失败');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="app-page-enter min-h-screen bg-slate-50">
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-6 py-8">
        <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <button
                type="button"
                onClick={handleBack}
                className="inline-flex shrink-0 items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2.5 text-sm text-slate-700 transition hover:bg-slate-50"
              >
                <ArrowLeft className="h-4 w-4" />
                返回上一级
              </button>

              <div className="hidden h-10 w-px bg-slate-200 lg:block" />

              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <Archive className="h-6 w-6 text-slate-400" />
                  <div className="text-2xl font-semibold text-slate-900">
                    回收站
                  </div>
                </div>
                <div className="mt-1 text-sm text-slate-500">
                  已解散空间的内容仅保留查看与转存，不恢复原空间。
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void load()}
              disabled={isLoading}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2.5 text-sm text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              刷新
            </button>
          </div>
        </section>

        <main className="mt-6 flex-1">
          {isLoading ? (
            <div className="rounded-[32px] border border-slate-200 bg-white px-6 py-20 text-center shadow-sm">
              <div className="inline-flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                正在加载回收站列表...
              </div>
            </div>
          ) : error ? (
            <div className="rounded-[32px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
              {error}
            </div>
          ) : dissolvedTeams.length === 0 ? (
            <div className="rounded-[32px] border border-slate-200 bg-white px-6 py-20 text-center shadow-sm">
              <Archive className="mx-auto h-12 w-12 text-slate-300" />
              <div className="mt-4 text-sm font-medium text-slate-900">
                没有已解散的空间
              </div>
              <div className="mt-2 text-sm text-slate-500">
                你创建或加入的空间解散后会显示在这里
              </div>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {dissolvedTeams.map((team) => (
                <button
                  key={team.id}
                  type="button"
                  onClick={() => navigate(`/spaces/${encodeURIComponent(team.id)}/recycle?from=list`)}
                  className="rounded-[32px] border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:border-emerald-200 hover:bg-emerald-50/50"
                >
                  <div className="flex items-start gap-4">
                    {team.avatar_url ? (
                      <img
                        src={team.avatar_url}
                        alt={team.name}
                        className="h-12 w-12 shrink-0 rounded-2xl object-cover"
                      />
                    ) : (
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-400 to-slate-500 text-white">
                        <FolderOpen className="h-5 w-5" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-base font-semibold text-slate-900">
                        {team.name}
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                        <Clock className="h-3.5 w-3.5" />
                        保留至 {formatDate(team.retention_until)}
                      </div>
                      <div className="mt-1 text-xs text-slate-400">
                        解散时间：{formatDateTime(team.dissolved_at)}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
