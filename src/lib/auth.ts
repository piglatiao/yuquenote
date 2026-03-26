import { apiRequest, toJsonRequest } from './api';
import type { LoginCredentials, RegisterData, User } from './types';

// Demo mode flag - set to false when backend is configured
const USE_DEMO_MODE = false;

// Demo user for testing
const DEMO_USER: User = {
  id: 'demo-user-1',
  email: 'demo@example.com',
  nickname: '演示用户',
  avatar_url: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

// Local storage keys
const AUTH_TOKEN_KEY = 'yuque_auth_token';
const USER_KEY = 'yuque_user';

function readStoredUser(): User | null {
  const stored = localStorage.getItem(USER_KEY);
  return stored ? JSON.parse(stored) : null;
}

function writeStoredUser(user: User | null, rememberMe = false) {
  if (user) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    if (rememberMe) {
      localStorage.setItem(AUTH_TOKEN_KEY, user.id);
    }
    return;
  }

  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(AUTH_TOKEN_KEY);
}

export const authService = {
  // Initialize auth state from storage
  async init(): Promise<User | null> {
    if (USE_DEMO_MODE) {
      const stored = localStorage.getItem(USER_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
      return null;
    }

    return readStoredUser();
  },

  // Login with email and password
  async login(credentials: LoginCredentials): Promise<{ user?: User; error?: string }> {
    if (USE_DEMO_MODE) {
      // Demo mode: accept any login with demo@example.com
      if (credentials.email === 'demo@example.com') {
        localStorage.setItem(USER_KEY, JSON.stringify(DEMO_USER));
        if (credentials.rememberMe) {
          localStorage.setItem(AUTH_TOKEN_KEY, 'demo-token');
        }
        return { user: DEMO_USER };
      }
      return { error: '演示模式：请使用 demo@example.com 登录' };
    }
    return { error: '请配置后端' };
  },

  // Register new user
  async register(data: RegisterData): Promise<{ user?: User; error?: string }> {
    if (USE_DEMO_MODE) {
      // Demo mode: simulate registration
      const newUser: User = {
        id: `user-${Date.now()}`,
        email: data.email,
        nickname: data.nickname,
        avatar_url: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      localStorage.setItem(USER_KEY, JSON.stringify(newUser));
      return { user: newUser };
    }
    return { error: '请配置后端' };
  },

  // Logout
  async logout(): Promise<void> {
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(AUTH_TOKEN_KEY);
  },

  // Get user profile
  async getUserProfile(userId: string): Promise<User | null> {
    const stored = localStorage.getItem(USER_KEY);
    return stored ? JSON.parse(stored) : null;
  },

  // Update user profile
  async updateProfile(updates: Partial<User>): Promise<{ user?: User; error?: string }> {
    const stored = localStorage.getItem(USER_KEY);
    if (stored) {
      const user = { ...JSON.parse(stored), ...updates, updated_at: new Date().toISOString() };
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      return { user };
    }
    return { error: '用户未登录' };
  },

  // Listen to auth state changes
  subscribe(callback: (user: User | null) => void): () => void {
    const handleStorage = () => {
      const stored = localStorage.getItem(USER_KEY);
      callback(stored ? JSON.parse(stored) : null);
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  },

  // Check if user is authenticated
  isAuthenticated(): boolean {
    return localStorage.getItem(USER_KEY) !== null;
  },
};
