/**
 * Связывает WebSocketManager с TanStack Query (cache patching) и Realtime-store
 * (typing/presence). Запускается один раз после login и живёт пока есть auth.
 *
 * Распределение ответственности по событиям:
 *   - message.create / update / delete   → patch infinite-query cache
 *     `['messages', channelId]`
 *   - reaction.add / remove              → patch конкретного message внутри
 *     того же cache
 *   - typing                              → useRealtime.noteTyping
 *   - presence.update                     → useRealtime.setPresence
 *   - ready                               → setManyPresence + чистка typing
 */

import type { QueryClient } from '@tanstack/react-query';
import type {
  ListMessagesResponse,
  PublicMessage,
  ServerEvent,
  ServerReactionAdd,
  ServerReactionRemove,
} from '@quorum/shared';
import type { WebSocketManager } from './WebSocketManager';
import { useRealtime } from './store';

interface InfinitePages {
  pageParams: unknown[];
  pages: ListMessagesResponse[];
}

export interface RealtimeBridgeOptions {
  /**
   * Вызывается на каждое входящее `message.create`. Решение «уведомлять/нет»
   * принимает caller (App.tsx) — он знает meId, lookup имени канала и т.п.
   */
  onMessageCreate?: (message: PublicMessage) => void;
}

export function attachRealtimeBridge(
  ws: WebSocketManager,
  queryClient: QueryClient,
  options: RealtimeBridgeOptions = {},
): () => void {
  const off = ws.subscribe((event) => {
    handleEvent(event, queryClient, options);
  });
  // Чистим typing-state каждую секунду, чтобы expired-entries не залипали в UI.
  const pruneInterval = setInterval(() => {
    useRealtime.getState().pruneExpired();
  }, 1_000);
  return () => {
    off();
    clearInterval(pruneInterval);
  };
}

function handleEvent(
  event: ServerEvent,
  qc: QueryClient,
  options: RealtimeBridgeOptions,
): void {
  switch (event.t) {
    case 'ready':
      useRealtime.getState().setManyPresence(event.presence);
      return;

    case 'presence.update':
      useRealtime.getState().setPresence(event.userId, event.status);
      return;

    case 'typing':
      useRealtime.getState().noteTyping(event);
      return;

    case 'message.create':
      patchMessages(qc, event.message.channelId, (data) =>
        upsertMessageAtTail(data, event.message),
      );
      useRealtime.getState().noteIncoming(event.message.channelId, event.message.id);
      options.onMessageCreate?.(event.message);
      return;

    case 'message.update':
      patchMessages(qc, event.message.channelId, (data) =>
        replaceMessage(data, event.message),
      );
      return;

    case 'message.delete':
      patchMessages(qc, event.channelId, (data) =>
        removeMessage(data, event.messageId),
      );
      return;

    case 'reaction.add':
      patchMessages(qc, event.channelId, (data) =>
        applyReactionDelta(data, event, +1),
      );
      return;

    case 'reaction.remove':
      patchMessages(qc, event.channelId, (data) =>
        applyReactionDelta(data, event, -1),
      );
      return;

    case 'pong':
    case 'auth_failed':
    case 'error':
      return;
  }
}

/** Поиск имени канала по id в кеше TanStack Query (`['channels', guildId]`). */
export function findChannelName(qc: QueryClient, channelId: string): string | null {
  const entries = qc.getQueryCache().findAll({ queryKey: ['channels'] });
  for (const entry of entries) {
    const data = entry.state.data as ListChannelsCache | undefined;
    if (!data || !Array.isArray(data.channels)) continue;
    const found = data.channels.find((c) => c.id === channelId);
    if (found) return found.name;
  }
  return null;
}

interface ListChannelsCache {
  channels: { id: string; name: string }[];
}

function patchMessages(
  qc: QueryClient,
  channelId: string,
  patch: (data: InfinitePages) => InfinitePages,
): void {
  qc.setQueryData<InfinitePages>(['messages', channelId], (prev) => {
    if (!prev) return prev;
    return patch(prev);
  });
}

function upsertMessageAtTail(data: InfinitePages, msg: PublicMessage): InfinitePages {
  // Pages в порядке от новых страниц к старым (last page = newest).
  // Внутри каждой страницы messages — от старых к новым.
  if (data.pages.length === 0) {
    return { ...data, pages: [{ messages: [msg], hasMore: false }] };
  }
  // Если уже есть (echo от собственного POST) — заменим.
  for (const page of data.pages) {
    if (page.messages.some((m) => m.id === msg.id)) {
      return replaceMessage(data, msg);
    }
  }
  const lastIdx = data.pages.length - 1;
  const lastPage = data.pages[lastIdx]!;
  const newLast: ListMessagesResponse = {
    ...lastPage,
    messages: [...lastPage.messages, msg],
  };
  const nextPages = [...data.pages];
  nextPages[lastIdx] = newLast;
  return { ...data, pages: nextPages };
}

function replaceMessage(data: InfinitePages, msg: PublicMessage): InfinitePages {
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      messages: page.messages.map((m) => (m.id === msg.id ? msg : m)),
    })),
  };
}

function removeMessage(data: InfinitePages, messageId: string): InfinitePages {
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      messages: page.messages.filter((m) => m.id !== messageId),
    })),
  };
}

function applyReactionDelta(
  data: InfinitePages,
  event: ServerReactionAdd | ServerReactionRemove,
  delta: 1 | -1,
): InfinitePages {
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      messages: page.messages.map((m) => {
        if (m.id !== event.messageId) return m;
        const reactions = [...m.reactions];
        const idx = reactions.findIndex((r) => r.emoji === event.emoji);
        if (delta === 1) {
          if (idx === -1) {
            reactions.push({
              emoji: event.emoji,
              count: 1,
              reactedByMe: false,
              userIds: [event.userId],
            });
          } else {
            const existing = reactions[idx]!;
            if (existing.userIds.includes(event.userId)) return m; // уже учтено
            reactions[idx] = {
              ...existing,
              count: existing.count + 1,
              userIds: [...existing.userIds, event.userId],
            };
          }
        } else {
          if (idx === -1) return m;
          const existing = reactions[idx]!;
          const userIds = existing.userIds.filter((u) => u !== event.userId);
          if (userIds.length === 0) {
            reactions.splice(idx, 1);
          } else {
            reactions[idx] = {
              ...existing,
              count: Math.max(0, existing.count - 1),
              userIds,
            };
          }
        }
        return { ...m, reactions };
      }),
    })),
  };
}
