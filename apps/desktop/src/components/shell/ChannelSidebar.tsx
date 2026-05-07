import { ChevronDown, Hash, Plus, Volume2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { PublicChannel } from '@quorum/shared';
import { useGuilds, useGuildChannels } from '@/hooks/use-guild-data';
import { useChannelHasUnread } from '@/realtime/store';
import { useSelection } from '@/state/selection';
import { cn } from '@/lib/utils';
import { useChannelVoice } from '@/voice/channel-store';
import { useChannelVoiceOrchestrator } from '@/voice/channel-context';
import { useVoice } from '@/voice/store';
import { VoiceChannelMembers } from '@/components/voice/VoiceChannelMembers';
import { VoiceChannelBar } from '@/components/voice/VoiceChannelBar';
import { Skeleton } from '@/components/Skeleton';
import { UserCard } from './UserCard';

export function ChannelSidebar(): JSX.Element {
  const guildId = useSelection((s) => s.guildId);
  const channelId = useSelection((s) => s.channelId);
  const setChannel = useSelection((s) => s.setChannel);
  const { data: guildsData } = useGuilds();
  const { data: channelsData, isLoading } = useGuildChannels(guildId);
  const channels = useMemo(() => channelsData?.channels ?? [], [channelsData]);

  const activeGuild = guildsData?.guilds.find((g) => g.id === guildId);

  useEffect(() => {
    if (!channelId && channels.length > 0) {
      const firstText = channels.find((c) => c.kind === 'text') ?? channels[0]!;
      setChannel(firstText.id);
    }
  }, [channelId, channels, setChannel]);

  const grouped = useMemo(() => groupByKind(channels), [channels]);

  return (
    <aside className="flex w-[240px] shrink-0 flex-col bg-bg-4">
      <header className="titlebar-drag relative z-10 flex h-12 shrink-0 items-center justify-between px-4 shadow-low">
        <span className="truncate text-[15px] font-bold text-text-strong">
          {activeGuild?.name ?? 'Quorum'}
        </span>
        <ChevronDown size={18} className="titlebar-no-drag text-int-normal" />
      </header>

      <nav className="flex-1 overflow-y-auto px-2 pt-2">
        {isLoading && channels.length === 0 && (
          <div className="space-y-1.5 px-2 py-2">
            <Skeleton className="h-3 w-24" />
            <div className="space-y-1 pt-1">
              <Skeleton className="h-[34px] w-full" />
              <Skeleton className="h-[34px] w-[85%]" />
              <Skeleton className="h-[34px] w-[60%]" />
            </div>
            <Skeleton className="mt-3 h-3 w-28" />
            <div className="space-y-1 pt-1">
              <Skeleton className="h-[34px] w-[75%]" />
              <Skeleton className="h-[34px] w-[55%]" />
            </div>
          </div>
        )}
        {!isLoading && channels.length === 0 && (
          <p className="px-3 pt-6 text-center text-[13px] text-text-muted">
            В этой гилде пока нет каналов.
          </p>
        )}
        {grouped.text.length > 0 && (
          <CategorySection name="Текстовые каналы" channels={grouped.text} activeId={channelId} onSelect={setChannel} />
        )}
        {grouped.voice.length > 0 && (
          <CategorySection name="Голосовые каналы" channels={grouped.voice} activeId={channelId} onSelect={setChannel} />
        )}
      </nav>

      <VoiceChannelBar />
      <UserCard />
    </aside>
  );
}

function groupByKind(channels: PublicChannel[]): { text: PublicChannel[]; voice: PublicChannel[] } {
  const text: PublicChannel[] = [];
  const voice: PublicChannel[] = [];
  for (const c of channels) {
    if (c.kind === 'voice') voice.push(c);
    else text.push(c);
  }
  return { text, voice };
}

interface CategoryProps {
  name: string;
  channels: PublicChannel[];
  activeId: string | null;
  onSelect: (id: string) => void;
}

function CategorySection({ name, channels, activeId, onSelect }: CategoryProps): JSX.Element {
  const [open, setOpen] = useState(true);
  return (
    <div className="mt-4 first:mt-1">
      <div className="group flex items-center justify-between pr-1 pl-0.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex flex-1 items-center gap-0.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.04em] text-int-normal transition-colors hover:text-int-hover"
        >
          <ChevronDown
            size={10}
            strokeWidth={3}
            className={cn('transition-transform duration-150', open ? '' : '-rotate-90')}
          />
          <span className="truncate">{name}</span>
        </button>
        <button
          type="button"
          aria-label="add channel"
          className="text-int-normal opacity-0 transition-opacity hover:text-int-hover group-hover:opacity-100"
        >
          <Plus size={16} strokeWidth={2} />
        </button>
      </div>
      {open && (
        <ul className="mt-0.5 space-y-0.5">
          {channels.map((ch) => (
            <li key={ch.id}>
              <ChannelButton
                channel={ch}
                active={ch.id === activeId}
                onClick={() => onSelect(ch.id)}
              />
              {ch.kind === 'voice' && <VoiceChannelMembers channelId={ch.id} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface ChannelButtonProps {
  channel: PublicChannel;
  active: boolean;
  onClick: () => void;
}

function ChannelButton({ channel, active, onClick }: ChannelButtonProps): JSX.Element {
  if (channel.kind === 'voice') {
    return <VoiceChannelButton channel={channel} active={active} onClick={onClick} />;
  }
  return <TextChannelButton channel={channel} active={active} onClick={onClick} />;
}

function TextChannelButton({ channel, active, onClick }: ChannelButtonProps): JSX.Element {
  const hasUnread = useChannelHasUnread(channel.id);
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group flex h-[34px] w-full items-center gap-1.5 rounded-[4px] px-2 text-[15px] transition-colors',
        active
          ? 'bg-white/[0.12] text-int-active'
          : hasUnread
            ? 'text-text-strong hover:bg-white/[0.06]'
            : 'text-int-normal hover:bg-white/[0.06] hover:text-int-hover',
      )}
    >
      <Hash
        size={20}
        strokeWidth={1.75}
        className={cn(
          'shrink-0 transition-opacity',
          active ? 'opacity-100' : 'opacity-70 group-hover:opacity-100',
        )}
      />
      <span className={cn('truncate', hasUnread && !active && 'font-semibold')}>
        {channel.name}
      </span>
    </button>
  );
}

function VoiceChannelButton({ channel, active }: ChannelButtonProps): JSX.Element {
  const guildId = useSelection((s) => s.guildId);
  const channelPhase = useChannelVoice((s) => s.phase);
  const channelActiveId = useChannelVoice((s) => s.channelId);
  const callPhase = useVoice((s) => s.phase);
  const orchestrator = useChannelVoiceOrchestrator();

  const inThisChannel =
    channelActiveId === channel.id && (channelPhase === 'joined' || channelPhase === 'joining');
  const blockedByCall = callPhase !== 'idle';
  const blockedByOtherChannel = !!channelActiveId && channelActiveId !== channel.id;

  const onClick = (): void => {
    if (inThisChannel) {
      void orchestrator.leave();
      return;
    }
    if (blockedByCall || blockedByOtherChannel || !guildId) return;
    void orchestrator.join(channel.id, guildId);
  };

  const title = blockedByCall
    ? 'Сначала завершите текущий звонок'
    : blockedByOtherChannel
      ? 'Сначала покиньте текущий голосовой канал'
      : inThisChannel
        ? 'Покинуть канал'
        : 'Войти в канал';

  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        'group flex h-[34px] w-full items-center gap-1.5 rounded-[4px] px-2 text-[15px] transition-colors',
        inThisChannel
          ? 'text-status-online'
          : active
            ? 'bg-white/[0.12] text-int-active'
            : 'text-int-normal hover:bg-white/[0.06] hover:text-int-hover',
        (blockedByCall || blockedByOtherChannel) && 'cursor-not-allowed opacity-50',
      )}
    >
      <Volume2
        size={20}
        strokeWidth={1.75}
        className={cn(
          'shrink-0 transition-opacity',
          active || inThisChannel ? 'opacity-100' : 'opacity-70 group-hover:opacity-100',
        )}
      />
      <span className="truncate">{channel.name}</span>
    </button>
  );
}
