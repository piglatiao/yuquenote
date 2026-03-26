import { apiRequest, toJsonRequest } from './api';
import type { Comment, Todo } from './types';

function buildCommentTree(comments: Comment[]): Comment[] {
  const roots = comments.filter((comment) => !comment.parent_id);
  const replies = comments.filter((comment) => comment.parent_id);

  return roots.map((comment) => ({
    ...comment,
    replies: replies.filter((reply) => reply.parent_id === comment.id),
  }));
}

export const commentService = {
  init() {},

  async getByDocument(documentId: string): Promise<Comment[]> {
    const comments = await apiRequest<Comment[]>(`/comments?documentId=${encodeURIComponent(documentId)}`);
    return buildCommentTree(comments);
  },

  async create(comment: Partial<Comment>): Promise<Comment | null> {
    try {
      return await apiRequest<Comment>('/comments', toJsonRequest(comment, { method: 'POST' }));
    } catch {
      return null;
    }
  },

  async update(id: string, content: string): Promise<Comment | null> {
    try {
      return await apiRequest<Comment>(`/comments/${id}`, toJsonRequest({ content }, { method: 'PATCH' }));
    } catch {
      return null;
    }
  },

  async delete(id: string): Promise<boolean> {
    try {
      await apiRequest<void>(`/comments/${id}`, { method: 'DELETE' });
      return true;
    } catch {
      return false;
    }
  },

  async getCount(documentId: string): Promise<number> {
    return (await apiRequest<Comment[]>(`/comments?documentId=${encodeURIComponent(documentId)}`)).length;
  },
};

export const todoService = {
  init() {},

  async getByDocument(documentId: string): Promise<Todo[]> {
    return apiRequest<Todo[]>(`/todos?documentId=${encodeURIComponent(documentId)}`);
  },

  async create(todo: Partial<Todo>): Promise<Todo | null> {
    try {
      return await apiRequest<Todo>('/todos', toJsonRequest(todo, { method: 'POST' }));
    } catch {
      return null;
    }
  },

  async update(id: string, updates: Partial<Todo>): Promise<Todo | null> {
    try {
      return await apiRequest<Todo>(`/todos/${id}`, toJsonRequest(updates, { method: 'PATCH' }));
    } catch {
      return null;
    }
  },

  async toggleStatus(id: string): Promise<Todo | null> {
    const todo = await this.getById(id);
    if (!todo) {
      return null;
    }

    const statusOrder: Todo['status'][] = ['pending', 'in_progress', 'completed'];
    const currentIndex = statusOrder.indexOf(todo.status);
    const nextStatus = statusOrder[(currentIndex + 1) % statusOrder.length];
    return this.update(id, { status: nextStatus });
  },

  async delete(id: string): Promise<boolean> {
    try {
      await apiRequest<void>(`/todos/${id}`, { method: 'DELETE' });
      return true;
    } catch {
      return false;
    }
  },

  async getById(id: string): Promise<Todo | null> {
    try {
      return await apiRequest<Todo>(`/todos/${id}`);
    } catch {
      return null;
    }
  },

  async getStats(documentId: string): Promise<{ total: number; completed: number; inProgress: number; pending: number }> {
    const todos = await this.getByDocument(documentId);
    return {
      total: todos.length,
      completed: todos.filter((todo) => todo.status === 'completed').length,
      inProgress: todos.filter((todo) => todo.status === 'in_progress').length,
      pending: todos.filter((todo) => todo.status === 'pending').length,
    };
  },
};
