import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { Camera, ImagePlus, Loader2, Trash2, X } from 'lucide-react';
import { apiRequest } from '../lib/api';
import { authService } from '../lib/authApi';
import type { User } from '../lib/types';

interface ProfileSettingsUploadModalProps {
  isOpen: boolean;
  user: User | null;
  onClose: () => void;
  onSaved: () => void;
}

function getInitials(name: string) {
  return name.trim().charAt(0).toUpperCase() || '?';
}

export default function ProfileSettingsUploadModal({
  isOpen,
  user,
  onClose,
  onSaved,
}: ProfileSettingsUploadModalProps) {
  const [nickname, setNickname] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  useEffect(() => {
    if (!isOpen || !user) return;

    setNickname(user.nickname || '');
    setAvatarUrl(user.avatar_url || '');
    setError('');
    setNotice('');
    setIsSaving(false);
    setIsUploadingAvatar(false);
  }, [isOpen, user]);

  const previewLabel = useMemo(
    () => getInitials(nickname || user?.nickname || ''),
    [nickname, user?.nickname],
  );

  if (!isOpen || !user) return null;

  const handleAvatarUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('请选择图片文件作为头像。');
      setNotice('');
      return;
    }

    setIsUploadingAvatar(true);
    setError('');
    setNotice('');

    try {
      const params = new URLSearchParams({
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
      });

      const upload = await apiRequest<{ url: string; path: string }>(
        `/files/upload?${params.toString()}`,
        {
          method: 'POST',
          body: file,
        },
      );

      setAvatarUrl(upload.url);
      setNotice('头像已上传，保存资料后生效。');
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : '头像上传失败');
      setNotice('');
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleSave = async () => {
    const nextNickname = nickname.trim();
    if (!nextNickname) {
      setError('请输入昵称。');
      setNotice('');
      return;
    }

    setIsSaving(true);
    setError('');
    setNotice('');

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
            <div className="mt-1 text-sm text-slate-500">可以修改昵称并上传个人头像。</div>
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
            <label htmlFor="profile-avatar-upload" className="group relative cursor-pointer">
              {avatarUrl.trim() ? (
                <>
                  <img
                    src={avatarUrl.trim()}
                    alt={nickname || user.nickname}
                    className="h-16 w-16 rounded-2xl object-cover"
                  />
                  <button
                    type="button"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setAvatarUrl('');
                      setError('');
                      setNotice('头像已清空，保存资料后生效。');
                    }}
                    disabled={isUploadingAvatar || isSaving}
                    className="absolute -right-2 -top-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white opacity-0 transition hover:bg-black/85 group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="清空头像"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </>
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 text-xl font-semibold text-white">
                  {previewLabel}
                </div>
              )}
              <input
                id="profile-avatar-upload"
                type="file"
                accept="image/*"
                className="hidden"
                disabled={isUploadingAvatar || isSaving}
                onChange={(event) => void handleAvatarUpload(event)}
              />
              <div className="absolute -bottom-2 -right-2 rounded-full bg-white p-2 text-slate-500 shadow-sm">
                {isUploadingAvatar ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
              </div>
            </label>
            <div className="min-w-0">
              <div className="truncate text-base font-semibold text-slate-900">{nickname || user.nickname}</div>
              <div className="mt-1 truncate text-sm text-slate-500">{user.email}</div>
              <div className="mt-1 text-xs text-slate-400">点击头像可直接上传或更换头像</div>
            </div>
          </div>

          <div className="hidden">
            <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 transition hover:bg-slate-50">
              {isUploadingAvatar ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
              {isUploadingAvatar ? '上传中...' : '上传头像'}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={isUploadingAvatar || isSaving}
                onChange={(event) => void handleAvatarUpload(event)}
              />
            </label>

            <button
              type="button"
              onClick={() => {
                setAvatarUrl('');
                setError('');
                setNotice('头像已清空，保存资料后生效。');
              }}
              disabled={isUploadingAvatar || isSaving}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Trash2 className="h-4 w-4" />
              清空头像
            </button>
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

          {notice ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {notice}
            </div>
          ) : null}

          {error ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
              {error}
            </div>
          ) : null}
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
            disabled={isSaving || isUploadingAvatar}
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
