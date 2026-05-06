/**
 * TanStack Query-хуки для DM-каналов и сообщений в них.
 * Cache keys:
 *   ['dm-list']                            — список моих DM
 *   ['dm-messages', dmChannelId]           — infinite-список сообщений
 */

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import type {
  ListDmChannelsResponse,
  ListDmMessagesResponse,
  PublicDmMessage,
  SendDmMessageRequest,
} from '@quorum/shared';
import { useRuntime } from '@/auth/runtime-store';

export function useDmChannels() {
  const dmApi = useRuntime((s) => s.runtime?.dmApi);
  return useQuery<ListDmChannelsResponse>({
    queryKey: ['dm-list'],
    queryFn: () => {
      if (!dmApi) throw new Error('runtime_not_ready');
      return dmApi.list();
    },
    enabled: !!dmApi,
  });
}

export function useOpenDm() {
  const dmApi = useRuntime((s) => s.runtime?.dmApi);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      if (!dmApi) throw new Error('runtime_not_ready');
      return dmApi.openWith(userId);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['dm-list'] });
    },
  });
}

const PAGE_SIZE = 50;

export function useDmMessages(dmChannelId: string | null | undefined) {
  const dmApi = useRuntime((s) => s.runtime?.dmApi);
  return useInfiniteQuery<ListDmMessagesResponse>({
    queryKey: ['dm-messages', dmChannelId],
    queryFn: async ({ pageParam }) => {
      if (!dmApi || !dmChannelId) throw new Error('runtime_or_dm_not_ready');
      return dmApi.messages(dmChannelId, {
        limit: PAGE_SIZE,
        before: typeof pageParam === 'string' ? pageParam : undefined,
      });
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => {
      if (!lastPage.hasMore) return undefined;
      return lastPage.messages[0]?.id;
    },
    enabled: !!dmApi && !!dmChannelId,
  });
}

export function useSendDm(dmChannelId: string | null | undefined) {
  const dmApi = useRuntime((s) => s.runtime?.dmApi);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (req: SendDmMessageRequest) => {
      if (!dmApi || !dmChannelId) throw new Error('runtime_or_dm_not_ready');
      return dmApi.send(dmChannelId, req);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['dm-messages', dmChannelId] });
      void qc.invalidateQueries({ queryKey: ['dm-list'] });
    },
  });
}

export function useEditDmMessage(dmChannelId: string | null | undefined) {
  const dmApi = useRuntime((s) => s.runtime?.dmApi);
  return useMutation({
    mutationFn: async (args: { messageId: string; content: string }) => {
      if (!dmApi || !dmChannelId) throw new Error('runtime_or_dm_not_ready');
      return dmApi.edit(dmChannelId, args.messageId, { content: args.content });
    },
  });
}

export function useDeleteDmMessage(dmChannelId: string | null | undefined) {
  const dmApi = useRuntime((s) => s.runtime?.dmApi);
  return useMutation({
    mutationFn: async (messageId: string) => {
      if (!dmApi || !dmChannelId) throw new Error('runtime_or_dm_not_ready');
      await dmApi.delete(dmChannelId, messageId);
    },
  });
}

/** Helper-тип для патча infinite-cache с message-нотификациями. */
export type DmInfinitePages = InfiniteData<ListDmMessagesResponse>;

export function patchDmInfinite(
  data: DmInfinitePages,
  patch: (m: ListDmMessagesResponse) => ListDmMessagesResponse,
): DmInfinitePages {
  return { ...data, pages: data.pages.map(patch) };
}

export function upsertDmMessageAtTail(
  data: DmInfinitePages | undefined,
  msg: PublicDmMessage,
): DmInfinitePages | undefined {
  if (!data) return data;
  if (data.pages.length === 0) {
    return { ...data, pages: [{ messages: [msg], hasMore: false }] };
  }
  for (const page of data.pages) {
    if (page.messages.some((m) => m.id === msg.id)) {
      return patchDmInfinite(data, (p) => ({
        ...p,
        messages: p.messages.map((m) => (m.id === msg.id ? msg : m)),
      }));
    }
  }
  const lastIdx = data.pages.length - 1;
  const lastPage = data.pages[lastIdx]!;
  const nextPages = [...data.pages];
  nextPages[lastIdx] = { ...lastPage, messages: [...lastPage.messages, msg] };
  return { ...data, pages: nextPages };
}
