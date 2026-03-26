import { supabase } from './supabase';
import type { Comment, Todo, User } from './types';

// Demo mode flag
const USE_DEMO_MODE = true;

// Local storage keys
const COMMENTS_KEY = 'yuque_comments';
const TODOS_KEY = 'yuque_todos';

// Demo data
const DEMO_COMMENTS: Comment[] = [
  {
    id: 'comment-1',
    document_id: 'doc-1',
    parent_id: null,
    content: '这篇文档写得很好，内容很详细！',
    created_at: new Date(Date.now() - 3600000).toISOString(),
    updated_at: new Date(Date.now() - 3600000).toISOString(),
    user_id: 'user-2',
    user: {
      id: 'user-2',
      email: 'user2@example.com',
      nickname: '李四',
      avatar_url: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  },
];

const DEMO_TODOS: Todo[] = [
  {
    id: 'todo-1',
    document_id: 'doc-1',
    content: '完成文档初稿撰写',
    status: 'completed',
    priority: 'high',
    due_date: new Date(Date.now() - 86400000).toISOString(),
    tags: ['文档', '重要'],
    created_at: new Date(Date.now() - 86400000 * 3).toISOString(),
    updated_at: new Date(Date.now() - 3600000).toISOString(),
    user_id: 'demo-user-1',
    order_index: 0,
  },
  {
    id: 'todo-2',
    document_id: 'doc-1',
    content: '添加代码示例',
    status: 'in_progress',
    priority: 'medium',
    due_date: new Date(Date.now() + 86400000 * 2).toISOString(),
    tags: ['代码'],
    created_at: new Date(Date.now() - 86400000).toISOString(),
    updated_at: new Date(Date.now() - 1800000).toISOString(),
    user_id: 'demo-user-1',
    order_index: 1,
  },
  {
    id: 'todo-3',
    document_id: 'doc-1',
    content: 'review文档内容',
    status: 'pending',
    priority: 'low',
    due_date: new Date(Date.now() + 86400000 * 5).toISOString(),
    tags: ['review'],
    created_at: new Date(Date.now() - 3600000).toISOString(),
    updated_at: new Date(Date.now() - 3600000).toISOString(),
    user_id: 'demo-user-1',
    order_index: 2,
  },
];

// Initialize demo data
const initDemoData = () => {
  if (!localStorage.getItem(COMMENTS_KEY)) {
    localStorage.setItem(COMMENTS_KEY, JSON.stringify(DEMO_COMMENTS));
  }
  if (!localStorage.getItem(TODOS_KEY)) {
    localStorage.setItem(TODOS_KEY, JSON.stringify(DEMO_TODOS));
  }
};

// Comment Service
export const commentService = {
  // Initialize demo data
  init() {
    if (USE_DEMO_MODE) {
      initDemoData();
    }
  },

  // Get comments for a document
  async getByDocument(documentId: string): Promise<Comment[]> {
    if (USE_DEMO_MODE) {
      initDemoData();
      const allComments: Comment[] = JSON.parse(localStorage.getItem(COMMENTS_KEY) || '[]');
      const docComments = allComments.filter(c => c.document_id === documentId);

      // Organize into tree structure
      const rootComments = docComments.filter(c => !c.parent_id);
      const replies = docComments.filter(c => c.parent_id);

      return rootComments.map(comment => ({
        ...comment,
        replies: replies.filter(r => r.parent_id === comment.id),
      }));
    }

    const { data, error } = await supabase
      .from('comments')
      .select('*, user:users(*)')
      .eq('document_id', documentId)
      .order('created_at');

    if (error) {
      console.error('Error fetching comments:', error);
      return [];
    }

    // Organize into tree structure
    const rootComments = (data || []).filter((c: Comment) => !c.parent_id);
    const replies = (data || []).filter((c: Comment) => c.parent_id);

    return rootComments.map(comment => ({
      ...comment,
      replies: replies.filter(r => r.parent_id === comment.id),
    }));
  },

  // Add comment
  async create(comment: Partial<Comment>): Promise<Comment | null> {
    if (USE_DEMO_MODE) {
      initDemoData();
      const allComments: Comment[] = JSON.parse(localStorage.getItem(COMMENTS_KEY) || '[]');

      const newComment: Comment = {
        id: `comment-${Date.now()}`,
        document_id: comment.document_id || '',
        parent_id: comment.parent_id || null,
        content: comment.content || '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        user_id: comment.user_id || 'demo-user-1',
        user: {
          id: 'demo-user-1',
          email: 'demo@example.com',
          nickname: '演示用户',
          avatar_url: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      };

      allComments.push(newComment);
      localStorage.setItem(COMMENTS_KEY, JSON.stringify(allComments));
      return newComment;
    }

    const { data, error } = await supabase
      .from('comments')
      .insert([comment])
      .select('*, user:users(*)')
      .single();

    if (error) {
      console.error('Error creating comment:', error);
      return null;
    }

    return data;
  },

  // Update comment
  async update(id: string, content: string): Promise<Comment | null> {
    if (USE_DEMO_MODE) {
      const allComments: Comment[] = JSON.parse(localStorage.getItem(COMMENTS_KEY) || '[]');
      const index = allComments.findIndex(c => c.id === id);

      if (index !== -1) {
        allComments[index] = {
          ...allComments[index],
          content,
          updated_at: new Date().toISOString(),
        };
        localStorage.setItem(COMMENTS_KEY, JSON.stringify(allComments));
        return allComments[index];
      }
      return null;
    }

    const { data, error } = await supabase
      .from('comments')
      .update({ content, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*, user:users(*)')
      .single();

    if (error) {
      console.error('Error updating comment:', error);
      return null;
    }

    return data;
  },

  // Delete comment
  async delete(id: string): Promise<boolean> {
    if (USE_DEMO_MODE) {
      const allComments: Comment[] = JSON.parse(localStorage.getItem(COMMENTS_KEY) || '[]');
      const filtered = allComments.filter(c => c.id !== id && c.parent_id !== id);
      localStorage.setItem(COMMENTS_KEY, JSON.stringify(filtered));
      return true;
    }

    // Delete comment and its replies
    await supabase.from('comments').delete().eq('parent_id', id);
    const { error } = await supabase.from('comments').delete().eq('id', id);

    if (error) {
      console.error('Error deleting comment:', error);
      return false;
    }

    return true;
  },

  // Get comment count for a document
  async getCount(documentId: string): Promise<number> {
    if (USE_DEMO_MODE) {
      initDemoData();
      const allComments: Comment[] = JSON.parse(localStorage.getItem(COMMENTS_KEY) || '[]');
      return allComments.filter(c => c.document_id === documentId).length;
    }

    const { count, error } = await supabase
      .from('comments')
      .select('*', { count: 'exact', head: true })
      .eq('document_id', documentId);

    if (error) {
      return 0;
    }

    return count || 0;
  },
};

// Todo Service
export const todoService = {
  // Initialize demo data
  init() {
    if (USE_DEMO_MODE) {
      initDemoData();
    }
  },

  // Get todos for a document
  async getByDocument(documentId: string): Promise<Todo[]> {
    if (USE_DEMO_MODE) {
      initDemoData();
      const allTodos: Todo[] = JSON.parse(localStorage.getItem(TODOS_KEY) || '[]');
      return allTodos
        .filter(t => t.document_id === documentId)
        .sort((a, b) => a.order_index - b.order_index);
    }

    const { data, error } = await supabase
      .from('todos')
      .select('*')
      .eq('document_id', documentId)
      .order('order_index');

    if (error) {
      console.error('Error fetching todos:', error);
      return [];
    }

    return data || [];
  },

  // Create todo
  async create(todo: Partial<Todo>): Promise<Todo | null> {
    if (USE_DEMO_MODE) {
      initDemoData();
      const allTodos: Todo[] = JSON.parse(localStorage.getItem(TODOS_KEY) || '[]');

      const newTodo: Todo = {
        id: `todo-${Date.now()}`,
        document_id: todo.document_id || '',
        content: todo.content || '',
        status: todo.status || 'pending',
        priority: todo.priority || 'medium',
        due_date: todo.due_date || null,
        tags: todo.tags || [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        user_id: todo.user_id || 'demo-user-1',
        order_index: allTodos.length,
      };

      allTodos.push(newTodo);
      localStorage.setItem(TODOS_KEY, JSON.stringify(allTodos));
      return newTodo;
    }

    const { data, error } = await supabase
      .from('todos')
      .insert([{ ...todo, order_index: 0 }])
      .select()
      .single();

    if (error) {
      console.error('Error creating todo:', error);
      return null;
    }

    return data;
  },

  // Update todo
  async update(id: string, updates: Partial<Todo>): Promise<Todo | null> {
    if (USE_DEMO_MODE) {
      const allTodos: Todo[] = JSON.parse(localStorage.getItem(TODOS_KEY) || '[]');
      const index = allTodos.findIndex(t => t.id === id);

      if (index !== -1) {
        allTodos[index] = {
          ...allTodos[index],
          ...updates,
          updated_at: new Date().toISOString(),
        };
        localStorage.setItem(TODOS_KEY, JSON.stringify(allTodos));
        return allTodos[index];
      }
      return null;
    }

    const { data, error } = await supabase
      .from('todos')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating todo:', error);
      return null;
    }

    return data;
  },

  // Toggle todo status
  async toggleStatus(id: string): Promise<Todo | null> {
    if (USE_DEMO_MODE) {
      const allTodos: Todo[] = JSON.parse(localStorage.getItem(TODOS_KEY) || '[]');
      const index = allTodos.findIndex(t => t.id === id);

      if (index !== -1) {
        const currentStatus = allTodos[index].status;
        let newStatus: Todo['status'];

        switch (currentStatus) {
          case 'pending':
            newStatus = 'in_progress';
            break;
          case 'in_progress':
            newStatus = 'completed';
            break;
          default:
            newStatus = 'pending';
        }

        allTodos[index] = {
          ...allTodos[index],
          status: newStatus,
          updated_at: new Date().toISOString(),
        };
        localStorage.setItem(TODOS_KEY, JSON.stringify(allTodos));
        return allTodos[index];
      }
      return null;
    }

    const todo = await this.getById(id);
    if (!todo) return null;

    const statusOrder: Todo['status'][] = ['pending', 'in_progress', 'completed'];
    const currentIndex = statusOrder.indexOf(todo.status);
    const newStatus = statusOrder[(currentIndex + 1) % statusOrder.length];

    return this.update(id, { status: newStatus });
  },

  // Delete todo
  async delete(id: string): Promise<boolean> {
    if (USE_DEMO_MODE) {
      const allTodos: Todo[] = JSON.parse(localStorage.getItem(TODOS_KEY) || '[]');
      const filtered = allTodos.filter(t => t.id !== id);
      localStorage.setItem(TODOS_KEY, JSON.stringify(filtered));
      return true;
    }

    const { error } = await supabase.from('todos').delete().eq('id', id);

    if (error) {
      console.error('Error deleting todo:', error);
      return false;
    }

    return true;
  },

  // Get todo by ID
  async getById(id: string): Promise<Todo | null> {
    if (USE_DEMO_MODE) {
      const allTodos: Todo[] = JSON.parse(localStorage.getItem(TODOS_KEY) || '[]');
      return allTodos.find(t => t.id === id) || null;
    }

    const { data, error } = await supabase
      .from('todos')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      return null;
    }

    return data;
  },

  // Get todo statistics for a document
  async getStats(documentId: string): Promise<{ total: number; completed: number; inProgress: number; pending: number }> {
    const todos = await this.getByDocument(documentId);

    return {
      total: todos.length,
      completed: todos.filter(t => t.status === 'completed').length,
      inProgress: todos.filter(t => t.status === 'in_progress').length,
      pending: todos.filter(t => t.status === 'pending').length,
    };
  },
};
