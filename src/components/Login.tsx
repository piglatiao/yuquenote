import { useState } from 'react';
import { ArrowRight, BookOpen, Eye, EyeOff, Lock, Mail, User } from 'lucide-react';
import { authService } from '../lib/authApi';
import { notify } from '../lib/notify';
import type { LoginCredentials, RegisterData } from '../lib/types';

interface LoginProps {
  onLogin: () => void;
}

export default function Login({ onLogin }: LoginProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const [loginForm, setLoginForm] = useState<LoginCredentials>({
    email: '',
    password: '',
    rememberMe: false,
  });

  const [registerForm, setRegisterForm] = useState<RegisterData>({
    email: '',
    password: '',
    nickname: '',
  });

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const result = await authService.login(loginForm);

      if (result.error) {
        setError(result.error);
        notify.error('登录失败', result.error);
        return;
      }

      if (result.user) {
        notify.success('登录成功', `欢迎回来，${result.user.nickname || result.user.email}`);
        onLogin();
      }
    } catch {
      setError('登录失败，请稍后重试');
      notify.error('登录失败', '请稍后重试。');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    if (registerForm.password.length < 6) {
      setError('密码至少需要 6 个字符');
      notify.info('密码至少需要 6 个字符');
      return;
    }

    setIsLoading(true);

    try {
      const result = await authService.register(registerForm);

      if (result.error) {
        setError(result.error);
        notify.error('注册失败', result.error);
        return;
      }

      if (result.user) {
        await authService.login({
          email: registerForm.email,
          password: registerForm.password,
        });
        notify.success('注册成功', '已自动登录当前账号。');
        onLogin();
      }
    } catch {
      setError('注册失败，请稍后重试');
      notify.error('注册失败', '请稍后重试。');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="app-page-enter flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 via-white to-indigo-50 p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-200">
            <BookOpen className="h-9 w-9 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">语雀笔记</h1>
          <p className="mt-1 text-gray-500">本地优先的知识库与文件协作系统</p>
        </div>

        <div className="app-card-hover app-soft-surface rounded-2xl bg-white p-8 shadow-xl shadow-gray-200/50">
          <div className="mb-6 flex rounded-lg bg-gray-100 p-1">
            <button
              type="button"
              onClick={() => {
                setIsLogin(true);
                setError('');
              }}
              className={`flex-1 rounded-md py-2 text-sm font-medium transition-all ${
                isLogin ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              登录
            </button>
            <button
              type="button"
              onClick={() => {
                setIsLogin(false);
                setError('');
              }}
              className={`flex-1 rounded-md py-2 text-sm font-medium transition-all ${
                !isLogin ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              注册
            </button>
          </div>

          {error ? (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
              {error}
            </div>
          ) : null}

          {isLogin ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">邮箱</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                  <input
                    type="email"
                    value={loginForm.email}
                    onChange={(event) => setLoginForm({ ...loginForm, email: event.target.value })}
                    placeholder="输入邮箱"
                    className="w-full rounded-lg border border-gray-200 py-2.5 pl-10 pr-4 transition-all focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">密码</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={loginForm.password}
                    onChange={(event) => setLoginForm({ ...loginForm, password: event.target.value })}
                    placeholder="输入密码"
                    className="w-full rounded-lg border border-gray-200 py-2.5 pl-10 pr-10 transition-all focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    aria-label={showPassword ? '隐藏密码' : '显示密码'}
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={Boolean(loginForm.rememberMe)}
                    onChange={(event) => setLoginForm({ ...loginForm, rememberMe: event.target.checked })}
                    className="h-4 w-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-600">记住我</span>
                </label>
                <button type="button" className="text-sm text-blue-500 hover:text-blue-600">
                  忘记密码？
                </button>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-blue-500 to-indigo-500 py-2.5 font-medium text-white transition-all hover:from-blue-600 hover:to-indigo-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isLoading ? (
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                ) : (
                  <>
                    登录
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">昵称</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={registerForm.nickname}
                    onChange={(event) => setRegisterForm({ ...registerForm, nickname: event.target.value })}
                    placeholder="设置昵称"
                    className="w-full rounded-lg border border-gray-200 py-2.5 pl-10 pr-4 transition-all focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">邮箱</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                  <input
                    type="email"
                    value={registerForm.email}
                    onChange={(event) => setRegisterForm({ ...registerForm, email: event.target.value })}
                    placeholder="输入邮箱"
                    className="w-full rounded-lg border border-gray-200 py-2.5 pl-10 pr-4 transition-all focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">密码</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={registerForm.password}
                    onChange={(event) => setRegisterForm({ ...registerForm, password: event.target.value })}
                    placeholder="至少 6 个字符"
                    className="w-full rounded-lg border border-gray-200 py-2.5 pl-10 pr-10 transition-all focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    required
                    minLength={6}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    aria-label={showPassword ? '隐藏密码' : '显示密码'}
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-blue-500 to-indigo-500 py-2.5 font-medium text-white transition-all hover:from-blue-600 hover:to-indigo-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isLoading ? (
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                ) : (
                  <>
                    注册
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>
          )}

          <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-center text-xs text-slate-500">
              首次使用请先注册账号，系统不再提供默认演示账号。
            </p>
          </div>
        </div>

        <p className="mt-6 text-center text-sm text-gray-400">
          登录即表示同意我们的
          <a href="#" className="mx-1 text-blue-500 hover:underline">服务条款</a>
          和
          <a href="#" className="mx-1 text-blue-500 hover:underline">隐私政策</a>
        </p>
      </div>
    </div>
  );
}