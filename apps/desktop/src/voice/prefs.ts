/**
 * Сохраняемые настройки голоса.
 *
 * - mode: voice-activity (мик всегда включён) или push-to-talk (включается только
 *   пока зажата клавиша pttShortcut).
 * - pttShortcut: строка в формате tauri-plugin-global-shortcut, например
 *   "Shift+Space", "Alt+Q", "F23". Дефолт — Shift+Space (как у Discord).
 * - noiseSuppression / echoCancellation / autoGainControl: WebRTC флаги
 *   (слой 1 шумодава по ADR-0003). RNNoise (слой 2) — фаза 5.
 *
 * Хранится в `voice-prefs.json` через tauri-plugin-store.
 */

import { create } from 'zustand';
import { LazyStore } from '@tauri-apps/plugin-store';

const STORE_FILE = 'voice-prefs.json';
const KEY = 'prefs';

export type VoiceMode = 'voice-activity' | 'push-to-talk';

export interface VoicePrefs {
  mode: VoiceMode;
  pttShortcut: string;
  noiseSuppression: boolean;
  echoCancellation: boolean;
  autoGainControl: boolean;
}

export const DEFAULT_PREFS: VoicePrefs = {
  mode: 'voice-activity',
  pttShortcut: 'Shift+Space',
  noiseSuppression: true,
  echoCancellation: true,
  autoGainControl: true,
};

interface VoicePrefsState extends VoicePrefs {
  ready: boolean;
  hydrate: () => Promise<void>;
  update: (patch: Partial<VoicePrefs>) => Promise<void>;
}

const persistent = new LazyStore(STORE_FILE);

export const useVoicePrefs = create<VoicePrefsState>((set, get) => ({
  ...DEFAULT_PREFS,
  ready: false,

  hydrate: async (): Promise<void> => {
    try {
      const stored = await persistent.get<VoicePrefs>(KEY);
      if (stored) set({ ...DEFAULT_PREFS, ...stored, ready: true });
      else set({ ready: true });
    } catch {
      set({ ready: true });
    }
  },

  update: async (patch): Promise<void> => {
    const next: VoicePrefs = {
      mode: patch.mode ?? get().mode,
      pttShortcut: patch.pttShortcut ?? get().pttShortcut,
      noiseSuppression: patch.noiseSuppression ?? get().noiseSuppression,
      echoCancellation: patch.echoCancellation ?? get().echoCancellation,
      autoGainControl: patch.autoGainControl ?? get().autoGainControl,
    };
    set(next);
    try {
      await persistent.set(KEY, next);
      await persistent.save();
    } catch {
      // ignore — настройки потеряются между запусками, но в текущем сеансе работают.
    }
  },
}));
