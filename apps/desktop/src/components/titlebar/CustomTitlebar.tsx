import { Maximize2, Minimize2, Minus, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface WindowApi {
  minimize: () => Promise<void>;
  toggleMaximize: () => Promise<void>;
  close: () => Promise<void>;
  isMaximized: () => Promise<boolean>;
  onMaximizeChange: (cb: (v: boolean) => void) => () => void;
}

async function loadTauriWindowApi(): Promise<WindowApi | null> {
  try {
    // Динамический импорт — при запуске через `vite dev` без Tauri модуль может отсутствовать.
    const mod = await import('@tauri-apps/api/window');
    const win = mod.getCurrentWindow();
    return {
      minimize: () => win.minimize(),
      toggleMaximize: () => win.toggleMaximize(),
      close: () => win.close(),
      isMaximized: () => win.isMaximized(),
      onMaximizeChange: (cb) => {
        let unlisten: (() => void) | undefined;
        const subscribe = async (): Promise<void> => {
          unlisten = await win.onResized(() => {
            void win.isMaximized().then(cb);
          });
        };
        void subscribe();
        return () => unlisten?.();
      },
    };
  } catch {
    return null;
  }
}

export function CustomTitlebar(): JSX.Element {
  const [api, setApi] = useState<WindowApi | null>(null);
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    let dispose: (() => void) | undefined;
    void loadTauriWindowApi().then((loaded) => {
      if (!loaded) return;
      setApi(loaded);
      void loaded.isMaximized().then(setMaximized);
      dispose = loaded.onMaximizeChange(setMaximized);
    });
    return () => dispose?.();
  }, []);

  return (
    <div className="titlebar-drag flex h-[var(--titlebar-height)] shrink-0 items-stretch bg-bg-deepest select-none">
      <div className="flex-1" />
      <div className="titlebar-no-drag flex">
        <TitlebarButton aria-label="minimize" onClick={() => void api?.minimize()} disabled={!api}>
          <Minus size={14} strokeWidth={1.5} />
        </TitlebarButton>
        <TitlebarButton
          aria-label={maximized ? 'restore' : 'maximize'}
          onClick={() => void api?.toggleMaximize()}
          disabled={!api}
        >
          {maximized ? (
            <Minimize2 size={12} strokeWidth={1.5} />
          ) : (
            <Maximize2 size={12} strokeWidth={1.5} />
          )}
        </TitlebarButton>
        <TitlebarButton
          aria-label="close"
          onClick={() => void api?.close()}
          disabled={!api}
          danger
        >
          <X size={14} strokeWidth={1.5} />
        </TitlebarButton>
      </div>
    </div>
  );
}

interface TitlebarButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  danger?: boolean;
}

function TitlebarButton({
  danger,
  className,
  children,
  ...rest
}: TitlebarButtonProps): JSX.Element {
  return (
    <button
      type="button"
      className={cn(
        'flex h-full w-[46px] items-center justify-center text-text-secondary transition-colors',
        danger
          ? 'hover:bg-accent-danger hover:text-white'
          : 'hover:bg-bg-hover hover:text-text-primary',
        'disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-text-secondary',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
