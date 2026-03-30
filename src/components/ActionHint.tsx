import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface ActionHintProps {
  label: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

export default function ActionHint({
  label,
  description,
  children,
  className = '',
}: ActionHintProps) {
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useLayoutEffect(() => {
    if (!isOpen || !anchorRef.current || !bubbleRef.current) {
      return;
    }

    const updatePosition = () => {
      if (!anchorRef.current || !bubbleRef.current) {
        return;
      }

      const anchorRect = anchorRef.current.getBoundingClientRect();
      const bubbleRect = bubbleRef.current.getBoundingClientRect();
      const viewportPadding = 12;
      const gap = 12;

      let left = anchorRect.left + anchorRect.width / 2 - bubbleRect.width / 2;
      left = Math.max(viewportPadding, Math.min(left, window.innerWidth - bubbleRect.width - viewportPadding));

      let top = anchorRect.top - bubbleRect.height - gap;
      if (top < viewportPadding) {
        top = Math.min(anchorRect.bottom + gap, window.innerHeight - bubbleRect.height - viewportPadding);
      }

      setPosition({ left, top });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen, label, description]);

  return (
    <div
      ref={anchorRef}
      className={`app-action-hint relative inline-flex ${className}`}
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
      onFocusCapture={() => setIsOpen(true)}
      onBlurCapture={(event) => {
        if (!anchorRef.current?.contains(event.relatedTarget as Node | null)) {
          setIsOpen(false);
        }
      }}
    >
      {children}
      {isMounted && isOpen
        ? createPortal(
            <div
              ref={bubbleRef}
              className="app-action-hint-bubble"
              style={{
                left: `${position.left}px`,
                top: `${position.top}px`,
              }}
            >
              <div className="app-action-hint-title">{label}</div>
              {description ? <div className="app-action-hint-description">{description}</div> : null}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
