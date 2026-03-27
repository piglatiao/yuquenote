import { useEffect, useMemo, useState } from 'react';
import { Camera, Loader2, X } from 'lucide-react';
import { authService } from '../lib/authApi';
import type { User } from '../lib/types';

interface ProfileSettingsModalProps {
  isOpen: boolean;
  user: User | null;
  onClose: () => void;
  onSaved: () => void;
}

function getInitials(name: string) {
  return name.trim().charAt(0).toUpperCase() || '?';
}

export default function ProfileSettingsModal({
  isOpen,
  user,
  onClose,
  onSaved,
}: ProfileSettingsModalProps) {
  const [nickname, setNickname] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isOpen || !user) return;
    setNickname(user.nickname || '');
    setAvatarUrl(user.avatar_url || '');
    setError('');
    setIsSaving(false);
  }, [isOpen, user]);

  const previewLabel = useMemo(
    () => getInitials(nickname || user?.nickname || ''),
    [nickname, user?.nickname],
  );

  if (!isOpen || !user) return null;

  const handleSave = async () => {
    const nextNickname = nickname.trim();
    if (!nextNickname) {
      setError('请输入昵称');
      return;
    }

    setIsSaving(true);
    setError('');

    const result = await authService.updateProfile({
      nickname: nextNickname,
      avatar_url: avatarUrl.trim() || null,
    });

    setIsSaving(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    onSaved();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/45 backdrop-blur-[1px]" onClick={onClose} />

      <div
        className="relative w-full max-w-lg overflow-hidden rounded-[28px] bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
          <div>
            <div className="text-lg font-semibold text-slate-900">编辑个人资料</div>
            <div className="mt-1 text-sm text-slate-500">更新昵称和头像地址，右上角账号菜单会同步刷新。</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            aria-label="关闭"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-6 px-6 py-6">
          <div className="flex items-center gap-4 rounded-3xl bg-slate-50 p-4">
            <div className="relative">
              {avatarUrl.trim() ? (
                <img
                  src={avatarUrl.trim()}
                  alt={nickname || user.nickname}
                  className="h-16 w-16 rounded-2xl object-cover"
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 text-xl font-semibold text-white">
                  {previewLabel}
                </div>
              )}
              <div className="absolute -bottom-2 -right-2 rounded-full bg-white p-2 text-slate-500 shadow-sm">
                <Camera className="h-4 w-4" />
              </div>
            </div>
            <div className="min-w-0">
              <div className="truncate text-base font-semibold text-slate-900">{nickname || user.nickname}</div>
              <div className="mt-1 truncate text-sm text-slate-500">{user.email}</div>
            </div>
          </div>

          <label className="block">
            <div className="mb-2 text-sm font-medium text-slate-700">昵称</div>
            <input
              type="text"
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              placeholder="请输入昵称"
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15"
            />
          </label>

          <label className="block">
            <div className="mb-2 text-sm font-medium text-slate-700">头像地址</div>
            <input
              type="text"
              value={avatarUrl}
              onChange={(event) => setAvatarUrl(event.target.value)}
              placeholder="https://example.com/avatar.jpg"
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15"
            />
            <div className="mt-2 text-xs text-slate-400">可留空，留空时会自动使用昵称首字母作为头像。</div>
          </label>

          {error && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-200 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={isSaving}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
            保存资料
          </button>
        </div>
      </div>
    </div>
  );
}
