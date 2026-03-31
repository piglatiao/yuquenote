interface ActionDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  tone?: 'default' | 'danger';
  confirmText?: string;
  cancelText?: string;
  showCancel?: boolean;
  isConfirming?: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
}

export default function ActionDialog({
  isOpen,
  title,
  message,
  tone = 'default',
  confirmText = '确认',
  cancelText = '取消',
  showCancel = true,
  isConfirming = false,
  onClose,
  onConfirm,
}: ActionDialogProps) {
  if (!isOpen) {
    return null;
  }

  const lines = message
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/45 p-4" onClick={onClose}>
      <div
        className="app-modal-enter app-soft-surface w-full max-w-md rounded-3xl bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-slate-200 px-6 py-5">
          <div className="text-lg font-semibold text-slate-900">{title}</div>
        </div>

        <div className="space-y-3 px-6 py-6">
          {lines.map((line, index) => (
            <p key={`${title}-${index}`} className="text-sm leading-6 text-slate-600">
              {line}
            </p>
          ))}
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-200 px-6 py-4">
          {showCancel ? (
            <button
              type="button"
              onClick={onClose}
              disabled={isConfirming}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
            >
              {cancelText}
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => void onConfirm()}
            disabled={isConfirming}
            className={`rounded-xl px-4 py-2 text-sm font-medium text-white transition disabled:opacity-60 ${
              tone === 'danger' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {isConfirming ? '处理中...' : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
