import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface NameInputModalProps {
  isOpen: boolean;
  title: string;
  description?: string;
  label?: string;
  value: string;
  error?: string;
  placeholder?: string;
  confirmText?: string;
  cancelText?: string;
  onChange: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function NameInputModal({
  isOpen,
  title,
  description,
  label = '名称',
  value,
  error,
  placeholder,
  confirmText = '确定',
  cancelText = '取消',
  onChange,
  onConfirm,
  onCancel,
}: NameInputModalProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const id = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });

    return () => window.cancelAnimationFrame(id);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/45 backdrop-blur-[1px]" onClick={onCancel} />

      <div
        className="relative w-full max-w-md rounded-2xl border border-gray-100 bg-white shadow-2xl animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-gray-900">{title}</h3>
            {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            aria-label="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            onConfirm();
          }}
          className="space-y-4 px-5 py-4"
        >
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">{label}</label>
            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={placeholder}
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          {error ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600">
              {error}
            </div>
          ) : null}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-50"
            >
              {cancelText}
            </button>
            <button
              type="submit"
              className="rounded-lg bg-yuque-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-600"
            >
              {confirmText}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
