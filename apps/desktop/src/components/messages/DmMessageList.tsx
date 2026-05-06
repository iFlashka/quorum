/**
 * MessageList для DM-каналов. Аналог MessageList для гилд-каналов, но
 * работает через useDmMessages и не имеет членства/typing/markRead логики.
 *
 * Пока без mark-read — для пет-проекта 5–10 friends достаточно отсутствия
 * unread-индикатора; добавим в отдельной фазе если попросят.
 */

import { useEffect, useMemo, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type {
  ListMembersResponse,
  PublicDmMessage,
  PublicMember,
} from '@quorum/shared';
import { useDmMessages } from '@/hooks/use-dm';
import { Skeleton } from '@/components/Skeleton';
import { Message } from './Message';
import { DateDivider, sameDay } from './DateDivider';
import { ChannelWelcome } from './ChannelWelcome';
import { SystemCallMessage } from './SystemCallMessage';

const FIVE_MINUTES = 5 * 60 * 1000;

interface DmMessageListProps {
  dmChannelId: string;
  peerName: string;
}

export function DmMessageList({ dmChannelId, peerName }: DmMessageListProps): JSX.Element {
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useDmMessages(dmChannelId);
  const qc = useQueryClient();

  const userById = useMemo(() => {
    // Резолвим имя автора через members-кеши всех гилд (DM-сообщения от
    // юзеров которые точно в общей гилде с нами).
    const map = new Map<string, PublicMember>();
    const queries = qc.getQueryCache().findAll({ queryKey: ['members'] });
    for (const entry of queries) {
      const r = entry.state.data as ListMembersResponse | undefined;
      if (!r?.members) continue;
      for (const m of r.members) if (!map.has(m.userId)) map.set(m.userId, m);
    }
    return map;
  }, [qc]);

  const flat = useMemo(() => {
    if (!data) return [];
    const out: PublicDmMessage[] = [];
    for (let i = data.pages.length - 1; i >= 0; i--) {
      out.push(...(data.pages[i]?.messages ?? []));
    }
    return out;
  }, [data]);

  // Авто-скролл вниз при появлении новых сообщений.
  const containerRef = useRef<HTMLDivElement>(null);
  const lastCount = useRef(0);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const wasAtBottom =
      lastCount.current === 0 || el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    lastCount.current = flat.length;
    if (wasAtBottom) {
      el.scrollTop = el.scrollHeight;
    }
  }, [flat.length]);

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
      {!hasNextPage && !isLoading && (
        <ChannelWelcome channelName={peerName} channelKind="text" />
      )}
      {isLoading && flat.length === 0 && (
        <div className="space-y-5 px-4 py-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex gap-4">
              <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3" style={{ width: `${85 - i * 12}%` }} />
              </div>
            </div>
          ))}
        </div>
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
            !m.replyToMessageId &&
            prev.author.id === m.author.id &&
            curDate.getTime() - new Date(prev.createdAt).getTime() < FIVE_MINUTES;

          // System-сообщения (call_started/ended) рендерим отдельным компонентом.
          if (m.kind !== 'text') {
            return (
              <div key={m.id}>
                {dayChanged && <DateDivider iso={m.createdAt} />}
                <SystemCallMessage message={m} />
              </div>
            );
          }
          // Адаптируем DmMessage → PublicMessage для переиспользования
          // существующего Message.tsx. Подменяем dmChannelId → channelId
          // (компонент его использует только для reply-state-keying).
          const adapted = {
            ...m,
            channelId: m.dmChannelId,
          };
          return (
            <div key={m.id}>
              {dayChanged && <DateDivider iso={m.createdAt} />}
              <Message message={adapted} grouped={grouped} userById={userById} />
            </div>
          );
        })}
      </div>
    </section>
  );
}
