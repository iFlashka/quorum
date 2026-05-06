import { ChevronDown, Hash, Headphones, Mic, Plus, Volume2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { PublicChannel } from '@quorum/shared';
import { useAuth } from '@/auth/store';
import { useGuilds, useGuildChannels } from '@/hooks/use-guild-data';
import { useChannelHasUnread } from '@/realtime/store';
import { useSelection } from '@/state/selection';
import { cn } from '@/lib/utils';
import { UserCardMenu } from './UserCardMenu';
import { useChannelVoice } from '@/voice/channel-store';
import { useChannelVoiceOrchestrator } from '@/voice/channel-context';
import { useVoice } from '@/voice/store';
import { VoiceChannelMembers } from '@/components/voice/VoiceChannelMembers';
import { VoiceChannelBar } from '@/components/voice/VoiceChannelBar';

export function ChannelSidebar(): JSX.Element {
  const guildId = useSelection((s) => s.guildId);
  const channelId = useSelection((s) => s.channelId);
  const setChannel = useSelection((s) => s.setChannel);
  const { data: guildsData } = useGuilds();
  const { data: channelsData, isLoading } = useGuildChannels(guildId);
  const channels = useMemo(() => channelsData?.channels ?? [], [channelsData]);

  const activeGuild = guildsData?.guilds.find((g) => g.id === guildId);

  // Авто-выбор первого text-канала при смене гилды.
  useEffect(() => {
    if (!channelId && channels.length > 0) {
      const firstText = channels.find((c) => c.kind === 'text') ?? channels[0]!;
      setChannel(firstText.id);
    }
  }, [channelId, channels, setChannel]);

  const grouped = useMemo(() => groupByKind(channels), [channels]);

  return (
    <aside className="flex w-[240px] shrink-0 flex-col bg-bg-darker">
      <header className="titlebar-drag relative z-10 flex h-12 shrink-0 items-center justify-between px-4 shadow-[0_1px_0_0_rgba(0,0,0,0.2),0_2px_4px_0_rgba(0,0,0,0.18)]">
        <span className="truncate text-[15px] font-semibold tracking-tight text-text-primary">
          {activeGuild?.name ?? 'Quorum'}
        </span>
        <ChevronDown size={18} className="titlebar-no-drag text-text-secondary" />
      </header>

      <nav className="flex-1 overflow-y-auto pt-2 pr-2 pl-2">
        {isLoading && channels.length === 0 && (
          <div className="px-2 py-2 text-[13px] text-text-muted">Загрузка каналов…</div>
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
          className="flex flex-1 items-center gap-0.5 py-0.5 text-[11px] font-semibold tracking-wide text-text-muted uppercase transition-colors hover:text-text-secondary"
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
          className="text-text-muted opacity-0 transition-opacity hover:text-text-secondary group-hover:opacity-100"
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
  const Icon = Hash;
  const hasUnread = useChannelHasUnread(channel.id);
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group flex w-full items-center gap-1.5 rounded px-2 py-[6px] text-[15px] transition-colors',
        active
          ? 'bg-bg-active text-text-primary'
          : hasUnread
            ? 'text-text-primary hover:bg-bg-hover'
            : 'text-text-muted hover:bg-bg-hover hover:text-text-secondary',
      )}
    >
      <Icon size={20} strokeWidth={1.75} className="shrink-0 text-text-muted" />
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
        'group flex w-full items-center gap-1.5 rounded px-2 py-[6px] text-[15px] transition-colors',
        inThisChannel
          ? 'text-accent-success'
          : active
            ? 'bg-bg-active text-text-primary'
            : 'text-text-muted hover:bg-bg-hover hover:text-text-secondary',
        (blockedByCall || blockedByOtherChannel) && 'cursor-not-allowed opacity-50',
      )}
    >
      <Volume2 size={20} strokeWidth={1.75} className="shrink-0 text-text-muted" />
      <span className="truncate">{channel.name}</span>
    </button>
  );
}

function UserCard(): JSX.Element {
  const user = useAuth((s) => s.user);
  const displayName = user?.displayName ?? user?.username ?? 'You';
  const handle = user?.username ? `@${user.username}` : 'В сети';
  const initials = avatarInitials(displayName);

  return (
    <div className="flex h-[52px] shrink-0 items-center gap-1 bg-bg-deepest px-2">
      <button
        type="button"
        className="flex flex-1 items-center gap-2 overflow-hidden rounded px-1 py-1 text-left hover:bg-bg-hover"
      >
        <div className="relative shrink-0">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-primary text-[13px] font-semibold text-white">
            {initials}
          </div>
          <span className="absolute -right-0.5 -bottom-0.5 h-[14px] w-[14px] rounded-full border-[2px] border-bg-deepest bg-accent-success" />
        </div>
        <div className="min-w-0 leading-[1.15]">
          <div className="truncate text-[14px] font-semibold text-text-primary">{displayName}</div>
          <div className="truncate text-[12px] text-text-muted">{handle}</div>
        </div>
      </button>
      <div className="flex shrink-0">
        <ControlButton aria-label="mute mic">
          <Mic size={16} strokeWidth={1.75} />
        </ControlButton>
        <ControlButton aria-label="deafen">
          <Headphones size={16} strokeWidth={1.75} />
        </ControlButton>
        <UserCardMenu />
      </div>
    </div>
  );
}

function avatarInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0]![0]! + words[1]![0]!).toUpperCase();
  return trimmed.slice(0, 2).toUpperCase();
}

function ControlButton({
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>): JSX.Element {
  return (
    <button
      type="button"
      className="flex h-8 w-8 items-center justify-center rounded text-text-secondary hover:bg-bg-hover hover:text-text-primary"
      {...rest}
    >
      {children}
    </button>
  );
}
