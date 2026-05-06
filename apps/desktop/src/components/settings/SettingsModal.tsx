import { useEffect } from 'react';
import { Bell, Info, Mic, User, X } from 'lucide-react';
import { useSettings, type SettingsSection } from '@/state/settings-store';
import { AccountSection } from './AccountSection';
import { VoiceSection } from './VoiceSection';
import { NotificationsSection } from './NotificationsSection';
import { AboutSection } from './AboutSection';
import { cn } from '@/lib/utils';

interface SectionDef {
  id: SettingsSection;
  label: string;
  icon: React.ReactNode;
}

const SECTIONS: SectionDef[] = [
  { id: 'account', label: 'Аккаунт', icon: <User size={16} /> },
  { id: 'voice', label: 'Голос и видео', icon: <Mic size={16} /> },
  { id: 'notifications', label: 'Уведомления', icon: <Bell size={16} /> },
  { id: 'about', label: 'О программе', icon: <Info size={16} /> },
];

export function SettingsModal(): JSX.Element | null {
  const open = useSettings((s) => s.open);
  const section = useSettings((s) => s.section);
  const setSection = useSettings((s) => s.setSection);
  const close = useSettings((s) => s.close);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex bg-bg-default text-text-primary">
      <aside className="flex w-[240px] shrink-0 flex-col border-r border-bg-darker bg-bg-darker px-2 pt-12">
        <h2 className="mb-2 px-2 text-[11px] font-semibold tracking-wide text-text-muted uppercase">
          Настройки
        </h2>
        <nav className="flex-1 space-y-0.5">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSection(s.id)}
              className={cn(
                'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[14px] transition-colors',
                s.id === section
                  ? 'bg-bg-active text-text-primary'
                  : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary',
              )}
            >
              {s.icon}
              <span>{s.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <main className="flex flex-1 flex-col overflow-y-auto">
        <div className="flex items-start justify-between px-10 pt-12 pb-2">
          <h1 className="text-[20px] font-semibold">
            {SECTIONS.find((s) => s.id === section)?.label}
          </h1>
          <button
            type="button"
            onClick={close}
            title="Закрыть (Esc)"
            className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-text-muted/40 text-text-muted hover:border-text-secondary hover:text-text-secondary"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 px-10 pb-12">
          {section === 'account' && <AccountSection />}
          {section === 'voice' && <VoiceSection />}
          {section === 'notifications' && <NotificationsSection />}
          {section === 'about' && <AboutSection />}
        </div>
      </main>
    </div>
  );
}
