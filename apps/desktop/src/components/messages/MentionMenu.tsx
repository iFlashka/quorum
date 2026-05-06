import { useEffect, useState } from 'react';
import type { PublicMember } from '@quorum/shared';
import { cn } from '@/lib/utils';

interface MentionMenuProps {
  members: PublicMember[];
  /** Текущий префикс после `@` без самого `@`. */
  query: string;
  /** Колбэк при выборе — клиент должен заменить `@<query>` на `<@uuid>{пробел}` в textarea. */
  onSelect: (member: PublicMember) => void;
  onClose: () => void;
}

const MAX_VISIBLE = 8;

export function MentionMenu({
  members,
  query,
  onSelect,
  onClose,
}: MentionMenuProps): JSX.Element | null {
  const filtered = filterMembers(members, query).slice(0, MAX_VISIBLE);
  const [highlight, setHighlight] = useState(0);

  // Сбрасываем highlight при изменении query.
  useEffect(() => {
    setHighlight(0);
  }, [query]);

  // Глобальные хоткеи: ↑/↓ — навигация, Enter — выбор, Escape — закрыть.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (filtered.length === 0) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlight((h) => (h + 1) % filtered.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlight((h) => (h - 1 + filtered.length) % filtered.length);
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        onSelect(filtered[highlight]!);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [filtered, highlight, onSelect, onClose]);

  if (filtered.length === 0) return null;

  return (
    <div className="absolute right-0 bottom-full left-0 z-40 mb-2 max-h-[280px] overflow-auto rounded-md bg-bg-elevated p-1 shadow-elevated">
      <div className="px-2 pt-1 pb-2 text-[11px] font-semibold tracking-wide text-text-muted uppercase">
        Участники, совпадающие с @{query}
      </div>
      {filtered.map((m, i) => (
        <button
          key={m.id}
          type="button"
          onMouseEnter={() => setHighlight(i)}
          onClick={() => onSelect(m)}
          className={cn(
            'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[14px]',
            i === highlight ? 'bg-accent-primary text-white' : 'text-text-secondary',
          )}
        >
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-primary/80 text-[11px] font-semibold text-white">
            {avatarInitials(m.displayName || m.username)}
          </div>
          <span className="truncate">{m.displayName || m.username}</span>
          <span
            className={cn(
              'ml-auto truncate text-[12px]',
              i === highlight ? 'text-white/80' : 'text-text-muted',
            )}
          >
            @{m.username}
          </span>
        </button>
      ))}
    </div>
  );
}

function filterMembers(members: PublicMember[], q: string): PublicMember[] {
  const lower = q.toLowerCase();
  if (!lower) return members.slice(0, MAX_VISIBLE);
  const score = (m: PublicMember): number => {
    const u = m.username.toLowerCase();
    const d = (m.displayName || '').toLowerCase();
    if (u === lower || d === lower) return 0;
    if (u.startsWith(lower) || d.startsWith(lower)) return 1;
    if (u.includes(lower) || d.includes(lower)) return 2;
    return 3;
  };
  return members
    .map((m) => ({ m, s: score(m) }))
    .filter(({ s }) => s < 3)
    .sort((a, b) => a.s - b.s)
    .map(({ m }) => m);
}

function avatarInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0]![0]! + words[1]![0]!).toUpperCase();
  return trimmed.slice(0, 2).toUpperCase();
}
