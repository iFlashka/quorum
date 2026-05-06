/**
 * SoundManager — лёгкая обёртка над HTMLAudioElement для preload и воспроизведения
 * статических WAV-файлов из `public/sounds/`.
 *
 * Каждое имя имеет два экземпляра: один для one-shot (`play`), второй —
 * для loop'а (`playLoop` / `stopLoop`). Это нужно потому что HTMLAudio не
 * умеет одновременно играть один тег как loop и вне loop.
 *
 * Громкость и per-event toggle решаются на стороне callers (через
 * `useSoundPrefs`) — SoundManager просто проигрывает то, что попросили,
 * с переданным volume.
 */

import { useSoundPrefs } from '@/state/sound-prefs';

export type SoundName =
  | 'ring-out'
  | 'ring-in'
  | 'connect'
  | 'disconnect'
  | 'mention'
  | 'message'
  | 'join'
  | 'leave';

const ALL_SOUNDS: SoundName[] = [
  'ring-out',
  'ring-in',
  'connect',
  'disconnect',
  'mention',
  'message',
  'join',
  'leave',
];

interface SoundEntry {
  shot: HTMLAudioElement;
  loop: HTMLAudioElement;
}

class SoundManager {
  private cache = new Map<SoundName, SoundEntry>();
  private looping = new Set<SoundName>();
  private preloaded = false;

  /** Прогружает все WAV в память. Безопасно вызывать многократно. */
  preload(): void {
    if (this.preloaded) return;
    if (typeof Audio === 'undefined') return; // SSR / vitest без jsdom
    for (const name of ALL_SOUNDS) {
      const url = `/sounds/${name}.wav`;
      const shot = new Audio(url);
      shot.preload = 'auto';
      const loop = new Audio(url);
      loop.preload = 'auto';
      loop.loop = true;
      this.cache.set(name, { shot, loop });
    }
    this.preloaded = true;
  }

  /** Однократное воспроизведение. Не блокирует, не ждёт. */
  play(name: SoundName): void {
    if (typeof Audio === 'undefined') return;
    if (!this.preloaded) this.preload();
    const entry = this.cache.get(name);
    if (!entry) return;
    const volume = useSoundPrefs.getState().masterVolume;
    if (volume <= 0) return;
    try {
      entry.shot.currentTime = 0;
      entry.shot.volume = volume;
      void entry.shot.play().catch(() => undefined);
    } catch {
      // Аудио-движок отказался (autoplay policy и т.п.) — без падений.
    }
  }

  /**
   * Запускает звук в loop'е. Идемпотентно: повторный вызов не рестартит уже
   * играющий loop. Громкость патчится «вживую» если изменили слайдер.
   */
  playLoop(name: SoundName): void {
    if (typeof Audio === 'undefined') return;
    if (!this.preloaded) this.preload();
    const entry = this.cache.get(name);
    if (!entry) return;
    const volume = useSoundPrefs.getState().masterVolume;
    entry.loop.volume = volume;
    if (this.looping.has(name)) return;
    this.looping.add(name);
    try {
      entry.loop.currentTime = 0;
      void entry.loop.play().catch(() => undefined);
    } catch {
      this.looping.delete(name);
    }
  }

  /** Останавливает loop. Без шума если не играл. */
  stopLoop(name: SoundName): void {
    const entry = this.cache.get(name);
    if (!entry) return;
    if (!this.looping.has(name)) {
      try {
        entry.loop.pause();
      } catch {
        // ignore
      }
      return;
    }
    this.looping.delete(name);
    try {
      entry.loop.pause();
      entry.loop.currentTime = 0;
    } catch {
      // ignore
    }
  }

  /** Останавливает все активные loops. Используется при logout/reset. */
  stopAllLoops(): void {
    for (const name of [...this.looping]) this.stopLoop(name);
  }

  /** Применяет master volume ко всем сейчас играющим loops. */
  applyVolumeToLoops(): void {
    const volume = useSoundPrefs.getState().masterVolume;
    for (const name of this.looping) {
      const entry = this.cache.get(name);
      if (entry) entry.loop.volume = volume;
    }
  }
}

export const soundManager = new SoundManager();
