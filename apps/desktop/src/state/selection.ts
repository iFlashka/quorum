/**
 * Активная навигация. Два режима:
 *   - 'guild' — выбрана гилда (`guildId`) + опц. канал внутри неё (`channelId`)
 *   - 'dm'   — Home/DM-режим, опц. конкретный DM-канал (`dmChannelId`)
 *
 * Установка `setGuild()` переключает в guild-mode; `setHome()` — в dm-mode.
 */

import { create } from 'zustand';

export type SelectionMode = 'guild' | 'dm';

interface SelectionState {
  mode: SelectionMode;
  guildId: string | null;
  channelId: string | null;
  dmChannelId: string | null;
  setGuild: (guildId: string | null) => void;
  setChannel: (channelId: string | null) => void;
  setHome: () => void;
  setDmChannel: (dmChannelId: string | null) => void;
}

export const useSelection = create<SelectionState>((set) => ({
  mode: 'guild',
  guildId: null,
  channelId: null,
  dmChannelId: null,
  setGuild: (guildId) => set({ mode: 'guild', guildId, channelId: null }),
  setChannel: (channelId) => set({ channelId }),
  setHome: () => set({ mode: 'dm', guildId: null, channelId: null }),
  setDmChannel: (dmChannelId) => set({ dmChannelId }),
}));
