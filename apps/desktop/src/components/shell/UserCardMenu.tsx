import { useEffect, useRef, useState } from 'react';
import { LogOut, RefreshCw, Settings } from 'lucide-react';
import { useRuntime } from '@/auth/runtime-store';
import { cn } from '@/lib/utils';

/**
 * Кнопка-шестерёнка в нижней user-card с dropdown «Выйти / Сменить сервер».
 * Phase 7 расширим: настройки, профиль, статус, audio device picker.
 */
export function UserCardMenu(): JSX.Element {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const logout = useRuntime((s) => s.logout);
  const switchServer = useRuntime((s) => s.switchServer);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent): void => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="settings"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex h-8 w-8 items-center justify-center rounded text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary',
          open && 'bg-bg-hover text-text-primary',
        )}
      >
        <Settings size={16} strokeWidth={1.75} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 bottom-full z-50 mb-2 min-w-[200px] overflow-hidden rounded-md bg-bg-elevated py-1 shadow-elevated"
        >
          <MenuItem
            icon={<RefreshCw size={16} strokeWidth={1.75} />}
            onClick={() => {
              setOpen(false);
              void switchServer();
            }}
          >
            Сменить сервер
          </MenuItem>
          <MenuItem
            icon={<LogOut size={16} strokeWidth={1.75} />}
            danger
            onClick={() => {
              setOpen(false);
              void logout();
            }}
          >
            Выйти
          </MenuItem>
        </div>
      )}
    </div>
  );
}

interface MenuItemProps {
  icon: React.ReactNode;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

function MenuItem({ icon, danger, onClick, children }: MenuItemProps): JSX.Element {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 px-2 py-1.5 text-left text-[14px] transition-colors',
        danger
          ? 'text-accent-danger hover:bg-accent-danger hover:text-white'
          : 'text-text-secondary hover:bg-accent-primary hover:text-white',
      )}
    >
      <span className="shrink-0">{icon}</span>
      <span className="truncate">{children}</span>
    </button>
  );
}
