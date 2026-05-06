/**
 * Глобальный реестр HTMLAudioElement'ов, которые рендерят входящий
 * voice-стрим — нужен чтобы применить пользовательские настройки
 * `outputDeviceId` (через setSinkId) и `outputVolume` сразу ко всем
 * audio-элементам (1:1 звонок + LiveKit channel) и к новым при их
 * появлении.
 *
 * `setSinkId` нестандартный (Chromium-only), TS не знает о нём — поэтому
 * локальный type-cast.
 */

import { useVoicePrefs } from './prefs';

type SinkCapableAudio = HTMLAudioElement & {
  setSinkId?: (id: string) => Promise<void>;
};

const registered = new Set<HTMLAudioElement>();

/**
 * Регистрирует audio-element. Сразу применяет current prefs (sink + volume).
 * Возвращает unregister-функцию.
 */
export function registerOutputAudio(audio: HTMLAudioElement): () => void {
  registered.add(audio);
  applyTo(audio);
  return () => {
    registered.delete(audio);
  };
}

function applyTo(audio: HTMLAudioElement): void {
  const { outputDeviceId, outputVolume } = useVoicePrefs.getState();
  audio.volume = clamp01(outputVolume);
  const sinkable = audio as SinkCapableAudio;
  if (typeof sinkable.setSinkId === 'function') {
    sinkable.setSinkId(outputDeviceId).catch(() => {
      // Браузер мог отказать (нет permissions / unknown deviceId) — fall back
      // к системному дефолту: пробуем пустую строку, иначе игнор.
      if (outputDeviceId !== '') {
        sinkable.setSinkId?.('').catch(() => undefined);
      }
    });
  }
}

let subscribed = false;

/**
 * Включает реактивный re-apply при изменении outputDeviceId/outputVolume.
 * Идемпотентно — нужно вызвать один раз при старте приложения.
 */
export function startOutputAudioSync(): void {
  if (subscribed) return;
  subscribed = true;
  useVoicePrefs.subscribe((s, prev) => {
    if (
      s.outputDeviceId !== prev.outputDeviceId ||
      s.outputVolume !== prev.outputVolume
    ) {
      for (const a of registered) applyTo(a);
    }
  });
}

function clamp01(v: number): number {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}
