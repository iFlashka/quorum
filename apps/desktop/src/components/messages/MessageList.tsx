import { useEffect, useMemo, useRef, useState } from 'react';
import type { PublicMember, PublicMessage } from '@quorum/shared';
import { useChannelMessages } from '@/hooks/use-messages';
import { useGuildChannels, useGuildMembers } from '@/hooks/use-guild-data';
import { useMarkRead } from '@/hooks/use-mark-read';
import { useSelection } from '@/state/selection';
import { useAuth } from '@/auth/store';
import { useRealtime } from '@/realtime/store';
import { Message } from './Message';
import { DateDivider, sameDay } from './DateDivider';
import { NewMessageDivider } from './NewMessageDivider';
import { ChannelWelcome } from './ChannelWelcome';

const FIVE_MINUTES = 5 * 60 * 1000;

export function MessageList(): JSX.Element {
  const channelId = useSelection((s) => s.channelId);
  const guildId = useSelection((s) => s.guildId);
  const meId = useAuth((s) => s.user?.id);
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useChannelMessages(channelId);
  const { data: membersData } = useGuildMembers(guildId);
  const { data: channelsData } = useGuildChannels(guildId);
  const channel = channelsData?.channels.find((c) => c.id === channelId);

  // Snapshot lastReadId на момент входа в канал — divider «Новое» рисуется
  // перед первым сообщением, чей createdAt позже, чем у snapshot-сообщения.
  // Не сбрасывается на mark-read, чтобы divider оставался видимым пока
  // канал открыт.
  const [unreadSnapshot, setUnreadSnapshot] = useState<{
    channelId: string;
    lastReadId: string | undefined;
  } | null>(null);
  useEffect(() => {
    if (!channelId) {
      setUnreadSnapshot(null);
      return;
    }
    const lastReadId = useRealtime.getState().lastReadByChannel.get(channelId);
    setUnreadSnapshot({ channelId, lastReadId });
  }, [channelId]);

  const userById = useMemo(() => {
    const map = new Map<string, PublicMember>();
    for (const m of membersData?.members ?? []) map.set(m.userId, m);
    return map;
  }, [membersData]);

  // Все сообщения в правильном хронологическом порядке (старые → новые).
  // pages: первая = самая свежая страница, последняя = самые старые.
  const flat = useMemo(() => {
    if (!data) return [];
    const out: PublicMessage[] = [];
    // pages в TanStack-порядке: [page1=newest, page2=older, ...]; внутри страницы asc.
    for (let i = data.pages.length - 1; i >= 0; i--) {
      out.push(...(data.pages[i]?.messages ?? []));
    }
    return out;
  }, [data]);

  // Авто-скролл вниз при добавлении новых сообщений (если пользователь не отскроллил вверх).
  const containerRef = useRef<HTMLDivElement>(null);
  const lastCount = useRef(0);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const wasAtBottom =
      lastCount.current === 0 ||
      el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    lastCount.current = flat.length;
    if (wasAtBottom) {
      el.scrollTop = el.scrollHeight;
    }
  }, [flat.length]);

  // Авто-mark-read для последнего видимого сообщения.
  const lastMessageId = flat.length > 0 ? flat[flat.length - 1]!.id : undefined;
  useMarkRead(channelId, lastMessageId);

  // ID сообщения, перед которым нужно нарисовать «Новое»-divider.
  const newBoundaryId = useMemo(() => {
    if (!unreadSnapshot || unreadSnapshot.channelId !== channelId) return null;
    const { lastReadId } = unreadSnapshot;
    if (!lastReadId) return null;
    const lastReadIdx = flat.findIndex((m) => m.id === lastReadId);
    if (lastReadIdx === -1) return null;
    for (let i = lastReadIdx + 1; i < flat.length; i++) {
      const m = flat[i]!;
      if (m.author.id !== meId) return m.id;
    }
    return null;
  }, [unreadSnapshot, flat, channelId, meId]);

  // Загрузка более старых при scroll up.
  const onScroll = (): void => {
    const el = containerRef.current;
    if (!el) return;
    if (el.scrollTop < 100 && hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  };

  return (
    <section
      ref={containerRef}
      onScroll={onScroll}
      className="flex-1 overflow-y-auto px-2 py-4"
    >
      {hasNextPage && (
        <div className="px-4 py-2 text-center text-[12px] text-text-muted">
          {isFetchingNextPage ? 'Загружаем более старые…' : 'Прокрутите вверх для загрузки истории'}
        </div>
      )}
      {!hasNextPage && !isLoading && channel && (
        <ChannelWelcome
          channelName={channel.name}
          channelKind={channel.kind === 'voice' ? 'voice' : 'text'}
        />
      )}
      {isLoading && flat.length === 0 && (
        <div className="px-4 py-8 text-center text-text-muted">Загрузка сообщений…</div>
      )}
      <div>
        {flat.map((m, i) => {
          const prev = flat[i - 1];
          const prevDate = prev ? new Date(prev.createdAt) : null;
          const curDate = new Date(m.createdAt);
          const dayChanged = !prevDate || !sameDay(prevDate, curDate);
          const grouped =
            !!prev &&
            !dayChanged &&
            prev.author.id === m.author.id &&
            curDate.getTime() - new Date(prev.createdAt).getTime() < FIVE_MINUTES;
          const isNewBoundary = m.id === newBoundaryId;
          return (
            <div key={m.id}>
              {dayChanged && <DateDivider iso={m.createdAt} />}
              {isNewBoundary && <NewMessageDivider />}
              <Message
                message={m}
                grouped={grouped && !isNewBoundary}
                userById={userById}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
