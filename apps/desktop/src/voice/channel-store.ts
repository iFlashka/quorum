/**
 * Состояние подключения к голосовому каналу LiveKit. Один активный канал на
 * сессию (нельзя одновременно быть в двух voice-channel'ах).
 *
 * Поток:
 *   idle → joining → joined → leaving → idle
 *
 * `participants` — карта присутствующих в комнате (включая нас самих).
 * Обновляется LiveKitRoom-обёрткой через `room.on(...)`.
 */

import { create } from 'zustand';

export type ChannelPhase = 'idle' | 'joining' | 'joined' | 'leaving';

export interface ChannelParticipant {
  /** identity = userId, как мы выдаём в JWT. */
  userId: string;
  /** Имя для отображения — то, что пришло в `name` JWT-claim. */
  name: string;
  /** Текущее состояние audio: ВКЛ/выкл (микрофон). */
  audioEnabled: boolean;
  /** True пока LiveKit детектит активный голос (used for speaking-indicator). */
  speaking: boolean;
  /** True для нас самих — UI рисует «вы». */
  isLocal: boolean;
}

interface ChannelState {
  phase: ChannelPhase;
  channelId: string | null;
  guildId: string | null;
  participants: Map<string, ChannelParticipant>;
  /** Поднятая ошибка цикла join, если была. */
  errorMessage: string | null;

  setJoining: (channelId: string, guildId: string) => void;
  setJoined: () => void;
  setLeaving: () => void;
  reset: () => void;
  upsertParticipant: (p: ChannelParticipant) => void;
  removeParticipant: (userId: string) => void;
  patchParticipant: (
    userId: string,
    patch: Partial<Omit<ChannelParticipant, 'userId' | 'isLocal'>>,
  ) => void;
  setError: (msg: string | null) => void;
}

const INITIAL = {
  phase: 'idle' as ChannelPhase,
  channelId: null,
  guildId: null,
  participants: new Map<string, ChannelParticipant>(),
  errorMessage: null,
};

export const useChannelVoice = create<ChannelState>((set) => ({
  ...INITIAL,

  setJoining: (channelId, guildId) =>
    set({ phase: 'joining', channelId, guildId, errorMessage: null }),
  setJoined: () => set({ phase: 'joined' }),
  setLeaving: () => set({ phase: 'leaving' }),
  reset: () => set({ ...INITIAL, participants: new Map() }),

  upsertParticipant: (p) =>
    set((s) => {
      const next = new Map(s.participants);
      next.set(p.userId, p);
      return { participants: next };
    }),
  removeParticipant: (userId) =>
    set((s) => {
      if (!s.participants.has(userId)) return s;
      const next = new Map(s.participants);
      next.delete(userId);
      return { participants: next };
    }),
  patchParticipant: (userId, patch) =>
    set((s) => {
      const existing = s.participants.get(userId);
      if (!existing) return s;
      const next = new Map(s.participants);
      next.set(userId, { ...existing, ...patch });
      return { participants: next };
    }),
  setError: (errorMessage) => set({ errorMessage }),
}));

/** Селектор: список participants в стабильном порядке (мы первые, потом по имени). */
export function selectParticipantsList(s: ChannelState): ChannelParticipant[] {
  const arr = Array.from(s.participants.values());
  arr.sort((a, b) => {
    if (a.isLocal !== b.isLocal) return a.isLocal ? -1 : 1;
    return a.name.localeCompare(b.name, 'ru');
  });
  return arr;
}
