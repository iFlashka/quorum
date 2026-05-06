import { Bell, Hash, Inbox, MessageSquare, Pin, Search, Users, Volume2 } from 'lucide-react';
import { useMemo } from 'react';
import { useGuildChannels, useGuildMembers } from '@/hooks/use-guild-data';
import { useTypersByChannel } from '@/realtime/store';
import { useSelection } from '@/state/selection';
import { MessageList } from '@/components/messages/MessageList';
import { MessageInput } from '@/components/messages/MessageInput';
import { EmptyState } from '@/components/EmptyState';
import { useChannelVoice } from '@/voice/channel-store';
import { VoiceChannelGrid } from '@/components/voice/VoiceChannelGrid';
import { InlineCallBanner } from '@/components/voice/InlineCallBanner';

export function ChatArea(): JSX.Element {
  const guildId = useSelection((s) => s.guildId);
  const channelId = useSelection((s) => s.channelId);
  const { data: channelsData } = useGuildChannels(guildId);
  const { data: membersData } = useGuildMembers(guildId);
  const channel = channelsData?.channels.find((c) => c.id === channelId);
  const members = useMemo(() => membersData?.members ?? [], [membersData]);

  const typers = useTypersByChannel(channelId ?? '');
  const typingNames = useMemo(() => {
    if (typers.length === 0) return [];
    return typers
      .map((id) => members.find((m) => m.userId === id))
      .filter((m): m is NonNullable<typeof m> => !!m)
      .map((m) => m.displayName || m.username);
  }, [typers, members]);

  return (
    <main className="flex min-w-0 flex-1 flex-col bg-bg-default">
      <header className="titlebar-drag relative z-10 flex h-12 shrink-0 items-center gap-2 px-4 shadow-[0_1px_0_0_rgba(0,0,0,0.2),0_2px_4px_0_rgba(0,0,0,0.18)]">
        {channel?.kind === 'voice' ? (
          <Volume2 size={24} strokeWidth={1.75} className="text-text-muted" />
        ) : (
          <Hash size={24} strokeWidth={1.75} className="text-text-muted" />
        )}
        <span className="text-[16px] font-semibold tracking-tight text-text-primary">
          {channel?.name ?? '—'}
        </span>
        {channel?.topic && (
          <>
            <span className="mx-2 hidden h-6 w-[2px] rounded-sm bg-bg-active md:block" />
            <span className="hidden truncate text-[14px] text-text-secondary md:block">
              {channel.topic}
            </span>
          </>
        )}
        <div className="titlebar-no-drag ml-auto flex items-center gap-0.5 text-text-secondary">
          <HeaderIcon title="Уведомления">
            <Bell size={20} strokeWidth={1.75} />
          </HeaderIcon>
          <HeaderIcon title="Закреплённые">
            <Pin size={20} strokeWidth={1.75} />
          </HeaderIcon>
          <HeaderIcon title="Участники">
            <Users size={20} strokeWidth={1.75} />
          </HeaderIcon>
          <div className="ml-2 flex h-7 cursor-text items-center gap-2 rounded-[4px] bg-bg-deepest px-2 text-[13px] text-text-muted">
            <span>Поиск</span>
            <Search size={14} strokeWidth={2} className="ml-auto" />
          </div>
          <HeaderIcon title="Входящие">
            <Inbox size={20} strokeWidth={1.75} />
          </HeaderIcon>
        </div>
      </header>

      <InlineCallBanner />

      {!channel ? (
        <EmptyState
          icon={MessageSquare}
          title="Выберите канал"
          description="Канал из боковой панели слева — здесь будут его сообщения."
        />
      ) : channel.kind === 'voice' ? (
        <VoiceChannelView channelId={channelId} channelName={channel.name} />
      ) : (
        <>
          <MessageList />
          {typingNames.length > 0 && (
            <div className="px-6 pb-1 text-[13px] text-text-muted">
              {formatTyping(typingNames)}
            </div>
          )}
          <MessageInput channelName={channel.name} />
        </>
      )}
    </main>
  );
}

function VoiceChannelView({
  channelId,
  channelName,
}: {
  channelId: string | null;
  channelName: string;
}): JSX.Element {
  const activeChannelId = useChannelVoice((s) => s.channelId);
  const isActive = activeChannelId === channelId;

  if (!isActive) {
    return (
      <EmptyState
        icon={Volume2}
        title={`#${channelName}`}
        description="Кликни по этому каналу в боковой панели слева, чтобы подключиться к голосу."
      />
    );
  }

  return (
    <div className="flex flex-1 flex-col bg-bg-deepest">
      <VoiceChannelGrid />
    </div>
  );
}

function formatTyping(names: string[]): string {
  if (names.length === 1) return `${names[0]} печатает…`;
  if (names.length === 2) return `${names[0]} и ${names[1]} печатают…`;
  if (names.length === 3) return `${names[0]}, ${names[1]} и ${names[2]} печатают…`;
  return 'Несколько участников печатают…';
}

interface HeaderIconProps {
  children: React.ReactNode;
  title?: string;
}

function HeaderIcon({ children, title }: HeaderIconProps): JSX.Element {
  return (
    <button
      type="button"
      title={title}
      className="flex h-7 w-7 items-center justify-center rounded text-text-secondary hover:bg-bg-hover hover:text-text-primary"
    >
      {children}
    </button>
  );
}
