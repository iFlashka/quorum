import { useEffect, useRef } from 'react';
import { useRuntime } from '@/auth/runtime-store';
import { useRealtime } from '@/realtime/store';

const DEBOUNCE_MS = 800;

/**
 * Авто-mark-read: когда последнее видимое сообщение в канале меняется,
 * через DEBOUNCE_MS отправляем POST /channels/:id/read с этим id и обновляем
 * lastReadByChannel в realtime-store (для unread-бейджей).
 *
 * Использование: вызывать с (channelId, lastMessageId) — эффект сам разберётся.
 */
export function useMarkRead(
  channelId: string | null | undefined,
  lastMessageId: string | undefined,
): void {
  const messagesApi = useRuntime((s) => s.runtime?.messagesApi);
  const lastSentRef = useRef<string | null>(null);

  useEffect(() => {
    if (!channelId || !messagesApi || !lastMessageId) return;
    if (lastSentRef.current === lastMessageId) return;

    const handle = setTimeout(() => {
      lastSentRef.current = lastMessageId;
      void messagesApi
        .markRead(channelId, { messageId: lastMessageId })
        .then(() => {
          useRealtime.getState().markRead(channelId, lastMessageId);
        })
        .catch(() => {
          // молчим: max — следующий раз попробуем снова
          lastSentRef.current = null;
        });
    }, DEBOUNCE_MS);

    return () => clearTimeout(handle);
  }, [channelId, lastMessageId, messagesApi]);
}
