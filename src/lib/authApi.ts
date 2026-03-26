import { apiRequest, toJsonRequest } from './api';
import type { LoginCredentials, RegisterData, User } from './types';

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
  async init(): Promise<User | null> {
    return readStoredUser();
  },

  async login(credentials: LoginCredentials): Promise<{ user?: User; error?: string }> {
    try {
      const response = await apiRequest<{ user: User }>('/auth/login', toJsonRequest(credentials, { method: 'POST' }));
      writeStoredUser(response.user, credentials.rememberMe);
      return { user: response.user };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Login failed.' };
    }
  },

  async register(data: RegisterData): Promise<{ user?: User; error?: string }> {
    try {
      const response = await apiRequest<{ user: User }>('/auth/register', toJsonRequest(data, { method: 'POST' }));
      writeStoredUser(response.user, true);
      return { user: response.user };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Register failed.' };
    }
  },

  async logout(): Promise<void> {
    writeStoredUser(null);
  },

  async getUserProfile(userId: string): Promise<User | null> {
    try {
      return await apiRequest<User>(`/users/${userId}`);
    } catch {
      return null;
    }
  },

  async updateProfile(updates: Partial<User>): Promise<{ user?: User; error?: string }> {
    const currentUser = readStoredUser();
    if (!currentUser) {
      return { error: 'User is not logged in.' };
    }

    try {
      const response = await apiRequest<{ user: User }>(
        `/users/${currentUser.id}`,
        toJsonRequest(updates, { method: 'PATCH' }),
      );
      writeStoredUser(response.user, Boolean(localStorage.getItem(AUTH_TOKEN_KEY)));
      return { user: response.user };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Update failed.' };
    }
  },

  subscribe(callback: (user: User | null) => void): () => void {
    const handleStorage = () => callback(readStoredUser());
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  },

  isAuthenticated(): boolean {
    return readStoredUser() !== null;
  },
};
