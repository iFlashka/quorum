/**
 * Префы для воспроизведения звуковых эффектов. Источник истины — tauri-store
 * (LazyStore), в Zustand храним кеш для быстрого рендера тогглов в Settings.
 *
 * Настройки разделены по видам, как в Discord:
 *   - mentionEnabled — `@me` или reply-to-me в любом канале
 *   - messageEnabled — каждое сообщение в активном канале (off по дефолту)
 *   - callEnabled    — все звонковые звуки (ring, connect, disconnect)
 *   - voiceJoinLeaveEnabled — кто-то зашёл/вышел из текущего голосового канала
 *   - masterVolume   — общий множитель 0..1
 */

import { create } from 'zustand';
import { LazyStore } from '@tauri-apps/plugin-store';

const STORE_FILE = 'sound-prefs.json';

interface PrefsShape {
  mentionEnabled: boolean;
  messageEnabled: boolean;
  callEnabled: boolean;
  voiceJoinLeaveEnabled: boolean;
  masterVolume: number;
}

const DEFAULTS: PrefsShape = {
  mentionEnabled: true,
  messageEnabled: false,
  callEnabled: true,
  voiceJoinLeaveEnabled: true,
  masterVolume: 0.7,
};

interface SoundPrefsState extends PrefsShape {
  /** True после первого hydrate из persistent store. */
  ready: boolean;
  hydrate: () => Promise<void>;
  setMentionEnabled: (v: boolean) => Promise<void>;
  setMessageEnabled: (v: boolean) => Promise<void>;
  setCallEnabled: (v: boolean) => Promise<void>;
  setVoiceJoinLeaveEnabled: (v: boolean) => Promise<void>;
  setMasterVolume: (v: number) => Promise<void>;
}

const persistentStore = new LazyStore(STORE_FILE);

let hydrateStarted = false;

async function persist<K extends keyof PrefsShape>(key: K, value: PrefsShape[K]): Promise<void> {
  try {
    await persistentStore.set(key, value);
    await persistentStore.save();
  } catch {
    // web/dev-без-tauri — игнор; UI продолжит работать с in-memory копией.
  }
}

export const useSoundPrefs = create<SoundPrefsState>((set) => ({
  ...DEFAULTS,
  ready: false,

  hydrate: async () => {
    if (hydrateStarted) return;
    hydrateStarted = true;
    try {
      const loaded: Partial<PrefsShape> = {};
      for (const key of Object.keys(DEFAULTS) as (keyof PrefsShape)[]) {
        const stored = await persistentStore.get(key);
        if (typeof stored === typeof DEFAULTS[key]) {
          (loaded as Record<string, unknown>)[key] = stored;
        }
      }
      set({ ...DEFAULTS, ...loaded, ready: true });
    } catch {
      set({ ready: true });
    }
  },

  setMentionEnabled: async (v) => {
    set({ mentionEnabled: v });
    await persist('mentionEnabled', v);
  },
  setMessageEnabled: async (v) => {
    set({ messageEnabled: v });
    await persist('messageEnabled', v);
  },
  setCallEnabled: async (v) => {
    set({ callEnabled: v });
    await persist('callEnabled', v);
  },
  setVoiceJoinLeaveEnabled: async (v) => {
    set({ voiceJoinLeaveEnabled: v });
    await persist('voiceJoinLeaveEnabled', v);
  },
  setMasterVolume: async (v) => {
    const clamped = Math.max(0, Math.min(1, v));
    set({ masterVolume: clamped });
    await persist('masterVolume', clamped);
  },
}));
