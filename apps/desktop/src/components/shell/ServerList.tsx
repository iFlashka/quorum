import { Plus } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import type { PublicGuild } from '@quorum/shared';
import { useGuilds } from '@/hooks/use-guild-data';
import { useSelection } from '@/state/selection';
import { cn } from '@/lib/utils';

export function ServerList(): JSX.Element {
  const { data, isLoading } = useGuilds();
  const guilds = useMemo(() => data?.guilds ?? [], [data]);
  const activeGuildId = useSelection((s) => s.guildId);
  const setGuild = useSelection((s) => s.setGuild);

  // Авто-выбор первой гилды как только данные приехали.
  useEffect(() => {
    if (!activeGuildId && guilds.length > 0) {
      setGuild(guilds[0]!.id);
    }
  }, [activeGuildId, guilds, setGuild]);

  return (
    <nav className="flex w-[72px] shrink-0 flex-col items-center gap-2 bg-bg-deepest pt-3 pb-3">
      {isLoading && guilds.length === 0 && (
        <div className="h-12 w-12 animate-pulse rounded-3xl bg-bg-default" />
      )}
      {guilds.map((g) => (
        <ServerIcon
          key={g.id}
          guild={g}
          active={g.id === activeGuildId}
          onClick={() => setGuild(g.id)}
        />
      ))}
      {guilds.length > 0 && <div className="my-1 h-0.5 w-8 rounded-full bg-border-subtle" />}
      <button
        type="button"
        aria-label="add server"
        title="Добавить сервер"
        className="flex h-12 w-12 items-center justify-center rounded-3xl bg-bg-default text-accent-success transition-all duration-200 hover:rounded-2xl hover:bg-accent-success hover:text-white"
      >
        <Plus size={22} strokeWidth={2.5} />
      </button>
    </nav>
  );
}

interface ServerIconProps {
  guild: PublicGuild;
  active: boolean;
  onClick: () => void;
}

function ServerIcon({ guild, active, onClick }: ServerIconProps): JSX.Element {
  const initials = guildInitials(guild.name);
  return (
    <div className="group relative">
      <span
        className={cn(
          'absolute -left-3 top-1/2 w-1 -translate-y-1/2 rounded-r-full bg-text-primary transition-all duration-200',
          active ? 'h-10' : 'h-2 scale-y-0 group-hover:h-5 group-hover:scale-y-100',
        )}
      />
      <button
        type="button"
        onClick={onClick}
        title={guild.name}
        className={cn(
          'relative flex h-12 w-12 items-center justify-center text-[15px] font-semibold tracking-tight transition-all duration-200',
          active
            ? 'rounded-2xl bg-accent-primary text-white'
            : 'rounded-3xl bg-bg-default text-text-primary hover:rounded-2xl hover:bg-accent-primary hover:text-white',
        )}
      >
        {guild.iconUrl ? (
          <img
            src={guild.iconUrl}
            alt={guild.name}
            className={cn(
              'h-full w-full object-cover',
              active ? 'rounded-2xl' : 'rounded-3xl group-hover:rounded-2xl',
            )}
          />
        ) : (
          initials
        )}
      </button>
    </div>
  );
}

function guildInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return (words[0]![0]! + words[1]![0]!).toUpperCase();
  }
  return trimmed.slice(0, 2).toUpperCase();
}
