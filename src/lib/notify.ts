import { toast } from 'sonner';

type NotifyLevel = 'success' | 'error' | 'info';

function show(level: NotifyLevel, title: string, description?: string) {
  const action = level === 'success' ? toast.success : level === 'error' ? toast.error : toast;
  action(title, {
    description,
    duration: level === 'error' ? 3600 : 2600,
  });
}

export const notify = {
  success(title: string, description?: string) {
    show('success', title, description);
  },

  error(title: string, description?: string) {
    show('error', title, description);
  },

  info(title: string, description?: string) {
    show('info', title, description);
  },

  copied(label = '已复制到剪贴板', description?: string) {
    toast.success(label, {
      description,
      duration: 2200,
    });
  },
};
