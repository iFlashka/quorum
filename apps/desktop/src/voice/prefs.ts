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
import { DEFAULT_SCREEN_QUALITY, type ScreenQualitySettings } from '@quorum/shared';

const STORE_FILE = 'voice-prefs.json';
const KEY = 'prefs';

export type VoiceMode = 'voice-activity' | 'push-to-talk';

/**
 * Профиль ввода — preset поверх индивидуальных WebRTC-toggle'ов:
 *   - voice-isolation: всё включено (стандарт Discord для шумных мест)
 *   - studio: всё выключено (raw mic, для гитары/pro-микрофона)
 *   - custom: каждый toggle руками
 *
 * UI рендерит 3 radio'а; при выборе voice-isolation/studio мы автоматически
 * перезатираем флаги в нужные значения, при выборе custom — оставляем как есть.
 */
export type InputProfile = 'voice-isolation' | 'studio' | 'custom';

export interface VoicePrefs {
  mode: VoiceMode;
  pttShortcut: string;
  noiseSuppression: boolean;
  echoCancellation: boolean;
  autoGainControl: boolean;
  inputProfile: InputProfile;
  /** deviceId выбранного микрофона. Пусто — system default. */
  inputDeviceId: string;
  /** deviceId выбранного динамика. Пусто — system default. */
  outputDeviceId: string;
  /** Громкость микрофона 0..1 (применяется как gain в getUserMedia constraints). */
  inputVolume: number;
  /** Громкость динамика 0..1 (применяется к remote-audio через volume property). */
  outputVolume: number;
  /** Настройки screen-share — пресет/resolution/fps/bitrate. */
  screenShare: ScreenQualitySettings;
}

export const DEFAULT_PREFS: VoicePrefs = {
  mode: 'voice-activity',
  pttShortcut: 'Shift+Space',
  noiseSuppression: true,
  echoCancellation: true,
  autoGainControl: true,
  inputProfile: 'voice-isolation',
  inputDeviceId: '',
  outputDeviceId: '',
  inputVolume: 1,
  outputVolume: 1,
  screenShare: DEFAULT_SCREEN_QUALITY,
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
    const cur = get();
    const next: VoicePrefs = {
      mode: patch.mode ?? cur.mode,
      pttShortcut: patch.pttShortcut ?? cur.pttShortcut,
      noiseSuppression: patch.noiseSuppression ?? cur.noiseSuppression,
      echoCancellation: patch.echoCancellation ?? cur.echoCancellation,
      autoGainControl: patch.autoGainControl ?? cur.autoGainControl,
      inputProfile: patch.inputProfile ?? cur.inputProfile,
      inputDeviceId: patch.inputDeviceId ?? cur.inputDeviceId,
      outputDeviceId: patch.outputDeviceId ?? cur.outputDeviceId,
      inputVolume: patch.inputVolume ?? cur.inputVolume,
      outputVolume: patch.outputVolume ?? cur.outputVolume,
      screenShare: patch.screenShare ?? cur.screenShare,
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
