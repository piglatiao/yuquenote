import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { Camera, Loader2, X } from 'lucide-react';
import { apiRequest } from '../lib/api';
import { authService } from '../lib/authApi';
import { notify } from '../lib/notify';
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
  const [email, setEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  useEffect(() => {
    if (!isOpen || !user) return;

    setNickname(user.nickname || '');
    setAvatarUrl(user.avatar_url || '');
    setEmail(user.email || '');
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
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
      notify.error('上传失败', '请选择图片文件作为头像。');
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
      notify.success('头像已上传', '保存资料后会同步更新到侧边栏和个人资料。');
    } catch (uploadError) {
      const message = uploadError instanceof Error ? uploadError.message : '头像上传失败';
      setError(message);
      setNotice('');
      notify.error('头像上传失败', message);
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleSave = async () => {
    const nextNickname = nickname.trim();
    const nextEmail = email.trim().toLowerCase();
    const nextAvatarUrl = avatarUrl.trim() || null;

    if (!nextNickname) {
      setError('请输入昵称。');
      setNotice('');
      notify.info('请先输入昵称');
      return;
    }

    if (!nextEmail) {
      setError('请输入邮箱。');
      setNotice('');
      notify.info('请先输入邮箱');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
      setError('请输入正确的邮箱地址。');
      setNotice('');
      notify.info('邮箱格式不正确');
      return;
    }

    const isChangingPassword = Boolean(currentPassword || newPassword || confirmPassword);
    if (isChangingPassword) {
      if (!currentPassword) {
        setError('修改密码前请先输入当前密码。');
        setNotice('');
        notify.info('请先输入当前密码');
        return;
      }

      if (!newPassword) {
        setError('请输入新密码。');
        setNotice('');
        notify.info('请先输入新密码');
        return;
      }

      if (newPassword.length < 6) {
        setError('新密码至少需要 6 位。');
        setNotice('');
        notify.info('新密码至少需要 6 位');
        return;
      }

      if (newPassword !== confirmPassword) {
        setError('两次输入的新密码不一致。');
        setNotice('');
        notify.info('请确认两次输入的新密码一致');
        return;
      }
    }

    const hasBasicChanges =
      nextNickname !== user.nickname ||
      nextEmail !== user.email ||
      nextAvatarUrl !== (user.avatar_url || null);

    if (!hasBasicChanges && !isChangingPassword) {
      setError('');
      setNotice('');
      notify.info('资料没有变化');
      onClose();
      return;
    }

    setIsSaving(true);
    setError('');
    setNotice('');

    const result = await authService.updateProfile({
      nickname: nextNickname,
      avatar_url: nextAvatarUrl,
      email: nextEmail,
      current_password: isChangingPassword ? currentPassword : undefined,
      new_password: isChangingPassword ? newPassword : undefined,
    });

    setIsSaving(false);

    if (result.error) {
      setError(result.error);
      notify.error('保存失败', result.error);
      return;
    }

    notify.success('资料已保存', isChangingPassword ? '账号资料和密码都已经更新。' : '新的资料已经生效。');
    onSaved();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/45 backdrop-blur-[1px]" onClick={onClose} />

      <div
        className="app-modal-enter app-soft-surface relative w-full max-w-xl overflow-hidden rounded-[28px] bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
          <div>
            <div className="text-lg font-semibold text-slate-900">编辑个人资料</div>
            <div className="mt-1 text-sm text-slate-500">可以修改头像、昵称、邮箱和登录密码。</div>
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
          <div className="rounded-[28px] bg-slate-50 p-5">
            <div className="flex items-center gap-4">
              <label htmlFor="profile-avatar-upload" className="group relative cursor-pointer">
                {avatarUrl.trim() ? (
                  <>
                    <img
                      src={avatarUrl.trim()}
                      alt={nickname || user.nickname}
                      className="h-20 w-20 rounded-[22px] object-cover"
                    />
                    <button
                      type="button"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setAvatarUrl('');
                        setError('');
                        setNotice('头像已移除，保存资料后生效。');
                        notify.info('头像已移除', '保存资料后会恢复为默认头像。');
                      }}
                      disabled={isUploadingAvatar || isSaving}
                      className="absolute -right-2 -top-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white opacity-0 transition hover:bg-black/85 group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label="删除头像"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </>
                ) : (
                  <div className="flex h-20 w-20 items-center justify-center rounded-[22px] bg-gradient-to-br from-emerald-500 to-teal-500 text-2xl font-semibold text-white">
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

              <div className="min-w-0 flex-1">
                <div className="truncate text-lg font-semibold text-slate-900">{nickname || user.nickname}</div>
                <div className="mt-1 truncate text-sm text-slate-500">{email || user.email}</div>
                <div className="mt-2 text-xs text-slate-400">点击头像直接更换，右上角小叉可移除头像。</div>
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
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
              <div className="mb-2 text-sm font-medium text-slate-700">邮箱</div>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="请输入邮箱"
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15"
              />
            </label>
          </div>

          <div className="rounded-[24px] border border-slate-200 bg-white p-5">
            <div className="text-sm font-semibold text-slate-900">修改密码</div>
            <div className="mt-1 text-xs text-slate-500">不修改可以留空。修改时需要先输入当前密码。</div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="block">
                <div className="mb-2 text-sm font-medium text-slate-700">当前密码</div>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  placeholder="请输入当前密码"
                  autoComplete="current-password"
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15"
                />
              </label>

              <label className="block">
                <div className="mb-2 text-sm font-medium text-slate-700">新密码</div>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  placeholder="至少 6 位"
                  autoComplete="new-password"
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15"
                />
              </label>

              <label className="block md:col-span-2">
                <div className="mb-2 text-sm font-medium text-slate-700">确认新密码</div>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="请再次输入新密码"
                  autoComplete="new-password"
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15"
                />
              </label>
            </div>
          </div>

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
