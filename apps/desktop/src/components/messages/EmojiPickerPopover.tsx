import { lazy, Suspense, useEffect, useRef, type ReactNode } from 'react';

// emoji-mart весит ~150 КБ — лениво грузим только когда пользователь открывает picker.
const EmojiPickerLazy = lazy(async () => {
  const [Picker, data] = await Promise.all([
    import('@emoji-mart/react'),
    import('@emoji-mart/data'),
  ]);
  const Component: React.FC<EmojiPickerInnerProps> = (props) => (
    <Picker.default
      data={data.default}
      onEmojiSelect={(e: { native: string }) => props.onSelect(e.native)}
      theme="dark"
      previewPosition="none"
      skinTonePosition="search"
      locale="ru"
      autoFocus
    />
  );
  return { default: Component };
});

interface EmojiPickerInnerProps {
  onSelect: (emoji: string) => void;
}

interface EmojiPickerPopoverProps {
  open: boolean;
  onClose: () => void;
  onSelect: (emoji: string) => void;
  /** Любой trigger, обычно кнопка с улыбкой. Picker появится позиционно над ним. */
  anchor: ReactNode;
  /** Позиционирование: вверх (input) или вниз (toolbar). По умолчанию up. */
  placement?: 'up' | 'down';
}

export function EmojiPickerPopover({
  open,
  onClose,
  onSelect,
  anchor,
  placement = 'up',
}: EmojiPickerPopoverProps): JSX.Element {
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent): void => {
      if (!wrapperRef.current?.contains(e.target as Node)) onClose();
    };
    const onEsc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open, onClose]);

  return (
    <div ref={wrapperRef} className="relative">
      {anchor}
      {open && (
        <div
          className={
            placement === 'up'
              ? 'absolute right-0 bottom-full z-50 mb-2'
              : 'absolute right-0 top-full z-50 mt-2'
          }
        >
          <Suspense
            fallback={
              <div className="rounded-md bg-bg-elevated px-4 py-3 text-[13px] text-text-muted shadow-elevated">
                Грузим эмодзи…
              </div>
            }
          >
            <EmojiPickerLazy onSelect={onSelect} />
          </Suspense>
        </div>
      )}
    </div>
  );
}
