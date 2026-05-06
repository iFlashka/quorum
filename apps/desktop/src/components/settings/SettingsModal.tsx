import { useEffect, useMemo, useState } from 'react';
import { Bell, Info, Mic, Pencil, Search, User, X } from 'lucide-react';
import { useAuth } from '@/auth/store';
import { useRuntime } from '@/auth/runtime-store';
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
  /** Слова для поиска: подразделы и ключевые понятия — совпадение фильтрует. */
  keywords: string[];
}

const SECTIONS: SectionDef[] = [
  {
    id: 'account',
    label: 'Аккаунт',
    icon: <User size={16} />,
    keywords: ['аккаунт', 'имя', 'логин', 'пароль', 'email', 'почта', 'выйти'],
  },
  {
    id: 'voice',
    label: 'Голос и видео',
    icon: <Mic size={16} />,
    keywords: [
      'голос',
      'видео',
      'микрофон',
      'динамик',
      'камера',
      'push-to-talk',
      'ptt',
      'шумодав',
      'эхо',
      'трансляция',
      'screen',
      'качество',
      'битрейт',
      'fps',
      'разрешение',
    ],
  },
  {
    id: 'notifications',
    label: 'Уведомления',
    icon: <Bell size={16} />,
    keywords: [
      'уведомления',
      'звуки',
      'звонок',
      'упоминание',
      'mention',
      'mute',
      'автозапуск',
      'автостарт',
      'трей',
    ],
  },
  {
    id: 'about',
    label: 'О программе',
    icon: <Info size={16} />,
    keywords: ['версия', 'обновление', 'about', 'лицензия'],
  },
];

export function SettingsModal(): JSX.Element | null {
  const open = useSettings((s) => s.open);
  const section = useSettings((s) => s.section);
  const setSection = useSettings((s) => s.setSection);
  const close = useSettings((s) => s.close);

  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  // Сбрасываем поиск при закрытии модалки.
  useEffect(() => {
    if (!open) setSearch('');
  }, [open]);

  const filteredSections = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return SECTIONS;
    return SECTIONS.filter(
      (s) =>
        s.label.toLowerCase().includes(q) ||
        s.keywords.some((k) => k.toLowerCase().includes(q)),
    );
  }, [search]);

  if (!open) return null;

  return (
    <div className="animate-overlay-fade-in fixed inset-0 z-[80] flex bg-bg-default text-text-primary">
      <aside className="flex w-[240px] shrink-0 flex-col border-r border-bg-darker bg-bg-darker px-2 pt-10">
        <ProfileCard onClick={() => setSection('account')} />
        <SearchInput value={search} onChange={setSearch} />
        <h2 className="mt-3 mb-2 px-2 text-[11px] font-semibold tracking-wide text-text-muted uppercase">
          Настройки
        </h2>
        <nav className="flex-1 space-y-0.5">
          {filteredSections.map((s) => (
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
          {filteredSections.length === 0 && (
            <p className="px-2 pt-3 text-[13px] text-text-muted">
              Ничего не нашлось.
            </p>
          )}
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

/**
 * Discord-style мини-card в верху Settings sidebar: avatar + displayName +
 * «Редактировать профиль». Клик переключает section на account.
 */
function ProfileCard({ onClick }: { onClick: () => void }): JSX.Element {
  const user = useAuth((s) => s.user);
  const displayName = user?.displayName ?? user?.username ?? 'You';
  const initials = avatarInitials(displayName);
  const avatarsApi = useRuntime((s) => s.runtime?.avatarsApi);
  const imgUrl = avatarsApi ? avatarsApi.resolveUrl(user?.avatarUrl ?? null) : null;
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-2 rounded-md bg-bg-default/40 px-2 py-2 text-left transition-colors hover:bg-bg-default/70"
      title="Редактировать профиль"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent-primary text-[14px] font-semibold text-white">
        {imgUrl ? (
          <img src={imgUrl} alt="avatar" className="h-full w-full object-cover" />
        ) : (
          initials
        )}
      </div>
      <div className="min-w-0 flex-1 leading-tight">
        <div className="truncate text-[14px] font-semibold text-text-primary">
          {displayName}
        </div>
        <div className="flex items-center gap-1 text-[11px] text-text-muted group-hover:text-text-secondary">
          <Pencil size={10} strokeWidth={2} />
          <span>Редактировать профиль</span>
        </div>
      </div>
    </button>
  );
}

function avatarInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0]![0]! + words[1]![0]!).toUpperCase();
  return trimmed.slice(0, 2).toUpperCase();
}

/**
 * Search над списком секций. Discord использует input под profile-card,
 * fade-выглядящий, без border. Совпадение по label или keywords секции.
 */
function SearchInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}): JSX.Element {
  return (
    <div className="relative mt-3">
      <Search
        size={14}
        strokeWidth={2}
        className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-text-muted"
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Поиск"
        className="w-full rounded bg-bg-deepest py-1.5 pr-2 pl-7 text-[13px] text-text-primary outline-none placeholder:text-text-muted focus:ring-1 focus:ring-accent-primary"
      />
    </div>
  );
}
