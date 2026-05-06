import { useEffect, useRef, useState } from 'react';
import { Bell, BellOff, Check, LogOut, Power, RefreshCw, Settings } from 'lucide-react';
import { useRuntime } from '@/auth/runtime-store';
import { useNotificationPrefs } from '@/state/notification-prefs';
import { useAutostart } from '@/lib/autostart';
import { cn } from '@/lib/utils';

/**
 * Кнопка-шестерёнка в нижней user-card с dropdown:
 *   - Уведомления (mute toggle)
 *   - Запускать с системой (autostart toggle)
 *   - Сменить сервер
 *   - Выйти
 *
 * Полноценный Settings-screen появится в фазе 7; здесь — самый частый минимум.
 */
export function UserCardMenu(): JSX.Element {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const logout = useRuntime((s) => s.logout);
  const switchServer = useRuntime((s) => s.switchServer);

  const muted = useNotificationPrefs((s) => s.muted);
  const setMuted = useNotificationPrefs((s) => s.setMuted);

  const autostartEnabled = useAutostart((s) => s.enabled);
  const autostartReady = useAutostart((s) => s.ready);
  const toggleAutostart = useAutostart((s) => s.toggle);

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
          className="absolute right-0 bottom-full z-50 mb-2 min-w-[220px] overflow-hidden rounded-md bg-bg-elevated py-1 shadow-elevated"
        >
          <ToggleItem
            icon={muted ? <BellOff size={16} strokeWidth={1.75} /> : <Bell size={16} strokeWidth={1.75} />}
            checked={!muted}
            onClick={() => void setMuted(!muted)}
          >
            Уведомления
          </ToggleItem>
          {autostartReady && (
            <ToggleItem
              icon={<Power size={16} strokeWidth={1.75} />}
              checked={autostartEnabled}
              onClick={() => void toggleAutostart()}
            >
              Запускать с системой
            </ToggleItem>
          )}
          <Divider />
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

interface ToggleItemProps {
  icon: React.ReactNode;
  checked: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

function ToggleItem({ icon, checked, onClick, children }: ToggleItemProps): JSX.Element {
  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={checked}
      onClick={onClick}
      className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-[14px] text-text-secondary transition-colors hover:bg-accent-primary hover:text-white"
    >
      <span className="shrink-0">{icon}</span>
      <span className="flex-1 truncate">{children}</span>
      <span
        className={cn(
          'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
          checked
            ? 'border-accent-primary bg-accent-primary text-white'
            : 'border-text-muted/40 bg-transparent',
        )}
      >
        {checked && <Check size={12} strokeWidth={2.5} />}
      </span>
    </button>
  );
}

function Divider(): JSX.Element {
  return <div className="my-1 h-px bg-text-muted/15" />;
}
