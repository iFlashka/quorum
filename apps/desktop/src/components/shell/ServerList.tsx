import { Plus } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { ListChannelsResponse, PublicGuild } from '@quorum/shared';
import { useRuntime } from '@/auth/runtime-store';
import { useGuilds, useGuildChannels } from '@/hooks/use-guild-data';
import { useAnyChannelHasUnread, useTotalMentionsAcross } from '@/realtime/store';
import { useSelection } from '@/state/selection';
import { cn } from '@/lib/utils';

export function ServerList(): JSX.Element {
  const { data, isLoading } = useGuilds();
  const guilds = useMemo(() => data?.guilds ?? [], [data]);
  const activeGuildId = useSelection((s) => s.guildId);
  const setGuild = useSelection((s) => s.setGuild);
  const guildsApi = useRuntime((s) => s.runtime?.guildsApi);
  const queryClient = useQueryClient();

  // Авто-выбор первой гилды как только данные приехали.
  useEffect(() => {
    if (!activeGuildId && guilds.length > 0) {
      setGuild(guilds[0]!.id);
    }
  }, [activeGuildId, guilds, setGuild]);

  // Prefetch каналы для всех неактивных гилд — нужно чтобы unread/mention
  // индикаторы на ServerList работали без открытия гилды.
  useEffect(() => {
    if (!guildsApi) return;
    for (const g of guilds) {
      if (g.id === activeGuildId) continue;
      void queryClient.prefetchQuery<ListChannelsResponse>({
        queryKey: ['channels', g.id],
        queryFn: () => guildsApi.channels(g.id),
      });
    }
  }, [guildsApi, guilds, activeGuildId, queryClient]);

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
  const { data: channelsData } = useGuildChannels(guild.id);
  const channelIds = useMemo(
    () => channelsData?.channels.map((c) => c.id) ?? EMPTY_IDS,
    [channelsData],
  );
  const hasUnread = useAnyChannelHasUnread(channelIds);
  const mentionsCount = useTotalMentionsAcross(channelIds);

  // Discord-style: тонкая белая pill слева от иконки, если в гилде есть
  // непрочитанное (но не активна — иначе высокая синяя pill перекрывает).
  // Mentions count в красном кружке снизу-справа.
  const showUnreadPill = !active && hasUnread;
  return (
    <div className="group relative">
      <span
        className={cn(
          'absolute -left-3 top-1/2 w-1 -translate-y-1/2 rounded-r-full bg-text-primary transition-all duration-200',
          active
            ? 'h-10'
            : showUnreadPill
              ? 'h-2 scale-y-100 group-hover:h-5'
              : 'h-2 scale-y-0 group-hover:h-5 group-hover:scale-y-100',
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
        {mentionsCount > 0 && (
          <span className="num-tabular pointer-events-none absolute -right-0.5 -bottom-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-[3px] border-bg-deepest bg-accent-danger px-[5px] text-[11px] font-bold leading-none text-white">
            {mentionsCount > 99 ? '99+' : mentionsCount}
          </span>
        )}
      </button>
    </div>
  );
}

const EMPTY_IDS: string[] = [];

function guildInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return (words[0]![0]! + words[1]![0]!).toUpperCase();
  }
  return trimmed.slice(0, 2).toUpperCase();
}
