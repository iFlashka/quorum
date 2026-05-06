/**
 * Прослойка из AudioContext + GainNode перед публикацией микрофона —
 * применяет `useVoicePrefs.inputVolume` к raw-track'у с микрофона.
 *
 * Возвращает `{ stream, dispose }`. Stream содержит один процессированный
 * audio-track, который уходит в peer/livekit. Изменения inputVolume
 * подхватываются реактивно через useVoicePrefs.subscribe — gain.value
 * меняется на лету.
 *
 * Применяется только в 1:1 (peer.ts), потому что LiveKit Track-API в group
 * voice сам делает getUserMedia и не даёт легко вклиниться. Для group voice
 * inputVolume пока остаётся UI-only.
 */

import { useVoicePrefs } from './prefs';

export interface MicGainPipeline {
  stream: MediaStream;
  dispose: () => void;
}

export function wrapMicWithGain(srcStream: MediaStream): MicGainPipeline {
  // Graceful fallback: jsdom-тесты, SSR или ограниченные среды не имеют
  // AudioContext / createMediaStreamSource — отдаём raw stream без обработки.
  if (typeof AudioContext === 'undefined') {
    return { stream: srcStream, dispose: () => undefined };
  }
  let ctx: AudioContext;
  let src: MediaStreamAudioSourceNode;
  let gain: GainNode;
  let dest: MediaStreamAudioDestinationNode;
  try {
    ctx = new AudioContext();
    src = ctx.createMediaStreamSource(srcStream);
    gain = ctx.createGain();
    gain.gain.value = clamp01(useVoicePrefs.getState().inputVolume);
    src.connect(gain);
    dest = ctx.createMediaStreamDestination();
    gain.connect(dest);
  } catch {
    return { stream: srcStream, dispose: () => undefined };
  }

  // Реактивно меняем gain если юзер двигает слайдер в Settings.
  let prevVol = gain.gain.value;
  const unsub = useVoicePrefs.subscribe((s) => {
    const next = clamp01(s.inputVolume);
    if (next !== prevVol) {
      prevVol = next;
      // Линейная rampToValueAtTime — без щелчков при резких сменах.
      const t = ctx.currentTime;
      gain.gain.cancelScheduledValues(t);
      gain.gain.setValueAtTime(gain.gain.value, t);
      gain.gain.linearRampToValueAtTime(next, t + 0.05);
    }
  });

  return {
    stream: dest.stream,
    dispose: () => {
      unsub();
      try {
        src.disconnect();
        gain.disconnect();
      } catch {
        // ignore — destruct ordering может рвать связи
      }
      void ctx.close();
    },
  };
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 1;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}
