/**
 * Состояние reply-target по каналам. Когда юзер кликает «Ответить» на
 * сообщении — сюда пишется снапшот target'а (id + author + preview), а
 * MessageInput подхватывает его, рендерит reply-bar и при отправке
 * добавляет `replyToMessageId` в payload.
 *
 * Per-channel — потому что reply одного канала не должен «протекать» в
 * другой при переключении.
 */

import { create } from 'zustand';

export interface ReplyTarget {
  messageId: string;
  authorDisplayName: string;
  contentPreview: string;
}

interface ReplyState {
  byChannel: Map<string, ReplyTarget>;
  setReply: (channelId: string, target: ReplyTarget) => void;
  clearReply: (channelId: string) => void;
}

export const useReply = create<ReplyState>((set) => ({
  byChannel: new Map(),

  setReply: (channelId, target) =>
    set((s) => {
      const next = new Map(s.byChannel);
      next.set(channelId, target);
      return { byChannel: next };
    }),

  clearReply: (channelId) =>
    set((s) => {
      if (!s.byChannel.has(channelId)) return s;
      const next = new Map(s.byChannel);
      next.delete(channelId);
      return { byChannel: next };
    }),
}));
