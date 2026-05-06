import { useEffect, useMemo, useRef } from 'react';
import type { PublicMember, PublicMessage } from '@quorum/shared';
import { useChannelMessages } from '@/hooks/use-messages';
import { useGuildMembers } from '@/hooks/use-guild-data';
import { useSelection } from '@/state/selection';
import { Message } from './Message';

const FIVE_MINUTES = 5 * 60 * 1000;

export function MessageList(): JSX.Element {
  const channelId = useSelection((s) => s.channelId);
  const guildId = useSelection((s) => s.guildId);
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useChannelMessages(channelId);
  const { data: membersData } = useGuildMembers(guildId);

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
      {!hasNextPage && flat.length > 0 && (
        <div className="px-4 py-2 text-center text-[12px] text-text-muted">— начало канала —</div>
      )}
      {isLoading && flat.length === 0 && (
        <div className="px-4 py-8 text-center text-text-muted">Загрузка сообщений…</div>
      )}
      {!isLoading && flat.length === 0 && (
        <div className="px-4 py-8 text-center text-text-muted">
          Пока ничего не написали. Напиши первый!
        </div>
      )}
      <div>
        {flat.map((m, i) => {
          const prev = flat[i - 1];
          const grouped =
            !!prev &&
            prev.author.id === m.author.id &&
            new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < FIVE_MINUTES;
          return <Message key={m.id} message={m} grouped={grouped} userById={userById} />;
        })}
      </div>
    </section>
  );
}
