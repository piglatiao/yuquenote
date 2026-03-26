import { Editor } from '@tiptap/react';
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  List,
  ListOrdered,
  ListChecks,
  Quote,
  Minus,
  Link as LinkIcon,
  Image as ImageIcon,
  Table,
  Highlighter,
  Undo,
  Redo,
  RemoveFormatting,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Palette,
} from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

interface ToolbarButtonProps {
  onClick: () => void;
  isActive?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  title?: string;
}

function ToolbarButton({ onClick, isActive, disabled, children, title }: ToolbarButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`p-2 rounded-md transition-colors ${
        isActive
          ? 'bg-yuque-primary text-white'
          : 'hover:bg-yuque-hover text-yuque-textSecondary hover:text-yuque-text'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      {children}
    </button>
  );
}

function ToolbarDivider() {
  return <div className="w-px h-6 bg-yuque-border mx-1" />;
}

interface ColorPickerProps {
  onSelect: (color: string) => void;
  onClose: () => void;
}

function ColorPicker({ onSelect, onClose }: ColorPickerProps) {
  const colors = [
    '#EF4444', '#F97316', '#F59E0B', '#EAB308', '#84CC16',
    '#22C55E', '#10B981', '#14B8A6', '#06B6D4', '#0EA5E9',
    '#3B82F6', '#6366F1', '#8B5CF6', '#A855F7', '#D946EF',
    '#EC4899', '#F43F5E', '#000000', '#666666', '#999999',
  ];

  return (
    <div className="absolute top-full left-0 mt-1 p-3 bg-white rounded-lg shadow-dropdown z-50 animate-scale-in">
      <div className="grid grid-cols-10 gap-2">
        {colors.map((color) => (
          <button
            key={color}
            onClick={() => {
              onSelect(color);
              onClose();
            }}
            className="w-6 h-6 rounded-md hover:scale-110 transition-transform border border-gray-200"
            style={{ backgroundColor: color }}
          />
        ))}
      </div>
    </div>
  );
}

interface EditorToolbarProps {
  editor: Editor;
}

export default function EditorToolbar({ editor }: EditorToolbarProps) {
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const colorPickerRef = useRef<HTMLDivElement>(null);
  const linkInputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (colorPickerRef.current && !colorPickerRef.current.contains(event.target as Node)) {
        setShowColorPicker(false);
      }
      if (linkInputRef.current && !linkInputRef.current.contains(event.target as Node)) {
        setShowLinkInput(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const addLink = () => {
    if (linkUrl) {
      editor.chain().focus().setLink({ href: linkUrl }).run();
      setLinkUrl('');
      setShowLinkInput(false);
    }
  };

  const addImage = () => {
    const url = window.prompt('请输入图片URL:');
    if (url) {
      editor.chain().focus().setImage({ src: url }).run();
    }
  };

  const insertTable = () => {
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  };

  return (
    <div className="sticky top-0 z-40 bg-white border-b border-yuque-border px-4 py-2 flex items-center gap-1 flex-wrap shadow-sm">
      {/* 撤销/重做 */}
      <ToolbarButton
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
        title="撤销"
      >
        <Undo className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
        title="重做"
      >
        <Redo className="w-4 h-4" />
      </ToolbarButton>

      <ToolbarDivider />

      {/* 标题 */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        isActive={editor.isActive('heading', { level: 1 })}
        title="一级标题"
      >
        <Heading1 className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        isActive={editor.isActive('heading', { level: 2 })}
        title="二级标题"
      >
        <Heading2 className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        isActive={editor.isActive('heading', { level: 3 })}
        title="三级标题"
      >
        <Heading3 className="w-4 h-4" />
      </ToolbarButton>

      <ToolbarDivider />

      {/* 文本格式 */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        isActive={editor.isActive('bold')}
        title="加粗"
      >
        <Bold className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        isActive={editor.isActive('italic')}
        title="斜体"
      >
        <Italic className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        isActive={editor.isActive('underline')}
        title="下划线"
      >
        <Underline className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleStrike().run()}
        isActive={editor.isActive('strike')}
        title="删除线"
      >
        <Strikethrough className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleCode().run()}
        isActive={editor.isActive('code')}
        title="行内代码"
      >
        <Code className="w-4 h-4" />
      </ToolbarButton>

      {/* 高亮 */}
      <div ref={colorPickerRef} className="relative">
        <ToolbarButton
          onClick={() => setShowColorPicker(!showColorPicker)}
          isActive={editor.isActive('highlight')}
          title="高亮"
        >
          <Highlighter className="w-4 h-4" />
        </ToolbarButton>
        {showColorPicker && (
          <ColorPicker
            onSelect={(color) => editor.chain().focus().toggleHighlight({ color }).run()}
            onClose={() => setShowColorPicker(false)}
          />
        )}
      </div>

      <ToolbarDivider />

      {/* 列表 */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        isActive={editor.isActive('bulletList')}
        title="无序列表"
      >
        <List className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        isActive={editor.isActive('orderedList')}
        title="有序列表"
      >
        <ListOrdered className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleTaskList().run()}
        isActive={editor.isActive('taskList')}
        title="任务列表"
      >
        <ListChecks className="w-4 h-4" />
      </ToolbarButton>

      <ToolbarDivider />

      {/* 引用和分隔线 */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        isActive={editor.isActive('blockquote')}
        title="引用"
      >
        <Quote className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        title="分隔线"
      >
        <Minus className="w-4 h-4" />
      </ToolbarButton>

      <ToolbarDivider />

      {/* 链接和图片 */}
      <div ref={linkInputRef} className="relative">
        <ToolbarButton
          onClick={() => setShowLinkInput(!showLinkInput)}
          isActive={editor.isActive('link')}
          title="添加链接"
        >
          <LinkIcon className="w-4 h-4" />
        </ToolbarButton>
        {showLinkInput && (
          <div className="absolute top-full left-0 mt-1 p-3 bg-white rounded-lg shadow-dropdown z-50 animate-scale-in flex gap-2">
            <input
              type="url"
              placeholder="输入链接URL"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addLink()}
              className="px-3 py-1.5 border border-yuque-border rounded-md text-sm focus:outline-none focus:border-yuque-primary w-48"
            />
            <button
              onClick={addLink}
              className="px-3 py-1.5 bg-yuque-primary text-white rounded-md text-sm hover:bg-blue-600"
            >
              确认
            </button>
          </div>
        )}
      </div>
      <ToolbarButton onClick={addImage} title="添加图片">
        <ImageIcon className="w-4 h-4" />
      </ToolbarButton>

      {/* 表格 */}
      <ToolbarButton onClick={insertTable} title="插入表格">
        <Table className="w-4 h-4" />
      </ToolbarButton>

      <ToolbarDivider />

      {/* 清除格式 */}
      <ToolbarButton
        onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}
        title="清除格式"
      >
        <RemoveFormatting className="w-4 h-4" />
      </ToolbarButton>
    </div>
  );
}
