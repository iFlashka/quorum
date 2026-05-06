/**
 * Глобальный store для realtime-состояния, дополняющего TanStack Query:
 *   - typing: какие пользователи печатают в каком канале (ttl 8s)
 *   - presence: текущий status каждого user-id
 *
 * Сами сообщения хранятся в TanStack Query infinite cache; WS-события
 * патчат этот cache через QueryClient (не зависят от этого стора).
 */

import { create } from 'zustand';
import { useShallow } from 'zustand/shallow';
import type { UserStatus } from '@quorum/shared';

const TYPING_TTL_MS = 8_000;

interface RealtimeState {
  typing: Map<string, Map<string, number>>; // channelId → userId → expiresAt
  presence: Map<string, UserStatus>; // userId → status
  setPresence: (userId: string, status: UserStatus) => void;
  setManyPresence: (entries: { userId: string; status: UserStatus }[]) => void;
  /** Регистрирует typing-сигнал; expiresAt выставляется автоматически на now+TTL. */
  noteTyping: (entry: { channelId: string; userId: string }) => void;
  clearTyping: (channelId: string, userId: string) => void;
  /** Чистка истёкших typing-entries. */
  pruneExpired: (now?: number) => void;
}

export const useRealtime = create<RealtimeState>((set) => ({
  typing: new Map(),
  presence: new Map(),

  setPresence: (userId, status) =>
    set((s) => {
      const next = new Map(s.presence);
      next.set(userId, status);
      return { presence: next };
    }),

  setManyPresence: (entries) =>
    set((s) => {
      const next = new Map(s.presence);
      for (const { userId, status } of entries) next.set(userId, status);
      return { presence: next };
    }),

  noteTyping: ({ channelId, userId }) =>
    set((s) => {
      const next = new Map(s.typing);
      const inner = new Map(next.get(channelId) ?? []);
      inner.set(userId, Date.now() + TYPING_TTL_MS);
      next.set(channelId, inner);
      return { typing: next };
    }),

  clearTyping: (channelId, userId) =>
    set((s) => {
      const next = new Map(s.typing);
      const inner = new Map(next.get(channelId) ?? []);
      inner.delete(userId);
      if (inner.size === 0) next.delete(channelId);
      else next.set(channelId, inner);
      return { typing: next };
    }),

  pruneExpired: (now = Date.now()) =>
    set((s) => {
      let changed = false;
      const next = new Map(s.typing);
      for (const [channelId, inner] of next) {
        const filtered = new Map(inner);
        for (const [userId, expiresAt] of filtered) {
          if (expiresAt <= now) {
            filtered.delete(userId);
            changed = true;
          }
        }
        if (filtered.size === 0) {
          next.delete(channelId);
        } else if (filtered.size !== inner.size) {
          next.set(channelId, filtered);
        }
      }
      return changed ? { typing: next } : s;
    }),
}));

/**
 * Хук, возвращающий массив user-id печатающих в канале. Использует useShallow
 * чтобы новый массив с теми же id не вызывал re-render — иначе компонент
 * при каждом рендере получает новый референс и попадает в infinite loop.
 */
export function useTypersByChannel(channelId: string): string[] {
  return useRealtime(
    useShallow((s: RealtimeState) => {
      const inner = s.typing.get(channelId);
      if (!inner) return EMPTY_ARRAY;
      const now = Date.now();
      const out: string[] = [];
      for (const [userId, expiresAt] of inner) {
        if (expiresAt > now) out.push(userId);
      }
      return out;
    }),
  );
}

const EMPTY_ARRAY: string[] = [];
