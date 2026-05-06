/**
 * Активная гилда + канал. Простой zustand-store пока без URL-routing.
 * Когда дойдут руки до TanStack Router — заменим на route params.
 */

import { create } from 'zustand';

interface SelectionState {
  guildId: string | null;
  channelId: string | null;
  setGuild: (guildId: string | null) => void;
  setChannel: (channelId: string | null) => void;
}

export const useSelection = create<SelectionState>((set) => ({
  guildId: null,
  channelId: null,
  setGuild: (guildId) => set({ guildId, channelId: null }),
  setChannel: (channelId) => set({ channelId }),
}));
