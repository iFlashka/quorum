/**
 * Wrapper над `@tauri-apps/plugin-autostart` — добавляет/убирает Quorum
 * из автозапуска ОС. Стартовый аргумент `--minimized` зашит в lib.rs:
 * запуск системой → клиент сразу уходит в трей.
 */

import { create } from 'zustand';
import { disable, enable, isEnabled } from '@tauri-apps/plugin-autostart';

interface AutostartState {
  enabled: boolean;
  ready: boolean;
  refresh: () => Promise<void>;
  toggle: () => Promise<void>;
}

export const useAutostart = create<AutostartState>((set, get) => ({
  enabled: false,
  ready: false,

  refresh: async () => {
    try {
      const enabled = await isEnabled();
      set({ enabled, ready: true });
    } catch {
      set({ ready: true });
    }
  },

  toggle: async () => {
    const target = !get().enabled;
    try {
      if (target) await enable();
      else await disable();
      set({ enabled: target });
    } catch {
      // На неподдерживаемых платформах — просто игнор. UI скрывается через ready.
    }
  },
}));
