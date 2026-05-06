/**
 * Глобальный mute-toggle для нативных уведомлений. Источник истины —
 * Rust-сторона (tray-меню тоже его меняет). Здесь храним кеш для рендера UI
 * + persist-копию в tauri-store, чтобы при следующем запуске не моргало.
 *
 * Поток:
 *   1. На старте: загружаем из tauri-plugin-store; зеркалим в Rust.
 *   2. Tray-меню или JS-toggle меняет → set_mute_state(rust) + persist в store.
 *   3. Rust эмитит `tray://mute-toggled` когда юзер кликнул в tray.
 */

import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { LazyStore } from '@tauri-apps/plugin-store';

const STORE_FILE = 'notification-prefs.json';
const STORE_KEY_MUTED = 'muted';
const RUST_EVENT_MUTE_TOGGLED = 'tray://mute-toggled';

interface MutePayload {
  muted: boolean;
}

interface NotificationPrefsState {
  muted: boolean;
  /** Был ли стор инициализирован: до этого UI не должен показывать toggle. */
  ready: boolean;
  /** Меняет mute локально + в Rust + persistent. Безопасно вызывать многократно. */
  setMuted: (muted: boolean) => Promise<void>;
}

const persistentStore = new LazyStore(STORE_FILE);

export const useNotificationPrefs = create<NotificationPrefsState>((set, get) => ({
  muted: false,
  ready: false,

  setMuted: async (muted) => {
    if (get().muted === muted && get().ready) return;
    set({ muted });
    await Promise.all([
      invoke('set_mute_state', { muted }).catch(() => undefined),
      persistentStore.set(STORE_KEY_MUTED, muted).then(() => persistentStore.save()),
    ]);
  },
}));

let initStarted = false;

/**
 * Вызывается один раз при старте приложения. Восстанавливает muted из persistent
 * store, синкает в Rust (tray-чекбокс) и подписывается на событие из tray-меню.
 */
export async function initNotificationPrefs(): Promise<() => void> {
  if (initStarted) return () => undefined;
  initStarted = true;

  const stored = (await persistentStore.get<boolean>(STORE_KEY_MUTED)) ?? false;
  useNotificationPrefs.setState({ muted: stored, ready: true });
  await invoke('set_mute_state', { muted: stored }).catch(() => undefined);

  const unlisten = await listen<MutePayload>(RUST_EVENT_MUTE_TOGGLED, (event) => {
    useNotificationPrefs.setState({ muted: event.payload.muted });
    void persistentStore.set(STORE_KEY_MUTED, event.payload.muted).then(() => persistentStore.save());
  });
  return unlisten;
}
