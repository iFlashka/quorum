import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  ListMessagesResponse,
  PublicMessage,
  SendMessageRequest,
} from '@quorum/shared';
import { useRuntime } from '@/auth/runtime-store';

const PAGE_SIZE = 50;

/**
 * Infinite-query на `before` cursor: каждая страница — пакет сообщений старше предыдущего.
 * Pages в `data.pages` идут от **новых страниц к старым** (последняя страница — самая
 * свежая). Внутри страницы — порядок от старых к новым (server отдаёт asc).
 */
export function useChannelMessages(channelId: string | null | undefined) {
  const messagesApi = useRuntime((s) => s.runtime?.messagesApi);
  return useInfiniteQuery<
    ListMessagesResponse,
    Error,
    { pages: ListMessagesResponse[]; pageParams: unknown[] },
    [string, string | null | undefined],
    string | undefined
  >({
    queryKey: ['messages', channelId],
    queryFn: ({ pageParam }) => {
      if (!messagesApi || !channelId) throw new Error('runtime_or_channel_not_ready');
      return messagesApi.list(channelId, { before: pageParam, limit: PAGE_SIZE });
    },
    enabled: !!messagesApi && !!channelId,
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => {
      // "next" в TanStack-смысле — старые сообщения. Используем oldest id из первой страницы
      // (обратите внимание: pages в Tanstack идут в порядке вызова — первая страница
      // содержит САМЫЕ свежие, следующие — старее).
      if (!lastPage.hasMore || lastPage.messages.length === 0) return undefined;
      const oldest = lastPage.messages[0]; // в asc-порядке — первый
      return oldest?.id;
    },
  });
}

export function useSendMessage(channelId: string | null | undefined) {
  const messagesApi = useRuntime((s) => s.runtime?.messagesApi);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (req: SendMessageRequest): Promise<PublicMessage> => {
      if (!messagesApi || !channelId) throw new Error('runtime_or_channel_not_ready');
      const res = await messagesApi.send(channelId, req);
      return res.message;
    },
    onSuccess: () => {
      // realtime-bridge всё равно вставит message.create в кэш через WS,
      // но invalidate как страховка если WS лагает.
      void qc.invalidateQueries({ queryKey: ['messages', channelId] });
    },
  });
}

export function useEditMessage(channelId: string | null | undefined) {
  const messagesApi = useRuntime((s) => s.runtime?.messagesApi);
  return useMutation({
    mutationFn: async (args: { messageId: string; content: string }): Promise<PublicMessage> => {
      if (!messagesApi || !channelId) throw new Error('runtime_or_channel_not_ready');
      const res = await messagesApi.edit(channelId, args.messageId, { content: args.content });
      return res.message;
    },
  });
}

export function useDeleteMessage(channelId: string | null | undefined) {
  const messagesApi = useRuntime((s) => s.runtime?.messagesApi);
  return useMutation({
    mutationFn: async (messageId: string): Promise<void> => {
      if (!messagesApi || !channelId) throw new Error('runtime_or_channel_not_ready');
      await messagesApi.delete(channelId, messageId);
    },
  });
}

export function useToggleReaction(channelId: string | null | undefined) {
  const messagesApi = useRuntime((s) => s.runtime?.messagesApi);
  return useMutation({
    mutationFn: async (args: {
      messageId: string;
      emoji: string;
      add: boolean;
    }): Promise<void> => {
      if (!messagesApi || !channelId) throw new Error('runtime_or_channel_not_ready');
      if (args.add) {
        await messagesApi.reactionAdd(channelId, args.messageId, args.emoji);
      } else {
        await messagesApi.reactionRemove(channelId, args.messageId, args.emoji);
      }
    },
  });
}
