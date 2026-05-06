/**
 * Кто в каком voice-channel — Discord-style видимость "кто в Lounge" даже
 * когда ты сам не подключён. Источник истины — сервер; обновляется через
 * `voice.channel.state` WS-события.
 */

import { create } from 'zustand';

interface OccupancyState {
  /** channelId → отсортированный массив userId. */
  byChannel: Map<string, string[]>;
  setChannel: (channelId: string, participantIds: string[]) => void;
  reset: () => void;
}

export const useVoiceOccupancy = create<OccupancyState>((set) => ({
  byChannel: new Map(),
  setChannel: (channelId, participantIds) =>
    set((s) => {
      const next = new Map(s.byChannel);
      if (participantIds.length === 0) next.delete(channelId);
      else next.set(channelId, [...participantIds]);
      return { byChannel: next };
    }),
  reset: () => set({ byChannel: new Map() }),
}));
