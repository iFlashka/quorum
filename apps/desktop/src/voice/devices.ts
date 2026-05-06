/**
 * Audio input для звонков. WebRTC-флаги (echo cancellation / noise suppression /
 * AGC) — слой 1 шумодава по ADR-0003. RNNoise WASM (слой 2) — фаза 5.
 */

export interface MicrophoneOptions {
  /** Базовый шумодав через WebRTC API. По умолчанию ВКЛ. */
  noiseSuppression?: boolean;
  /** Эхокомпенсация. По умолчанию ВКЛ — без неё динамики ловят свой собственный звук. */
  echoCancellation?: boolean;
  /** Авто-усиление. По умолчанию ВКЛ. */
  autoGainControl?: boolean;
  /** ID конкретного устройства; если не задан — default OS. */
  deviceId?: string;
}

export async function getMicrophoneStream(opts: MicrophoneOptions = {}): Promise<MediaStream> {
  const constraints: MediaStreamConstraints = {
    audio: {
      noiseSuppression: opts.noiseSuppression ?? true,
      echoCancellation: opts.echoCancellation ?? true,
      autoGainControl: opts.autoGainControl ?? true,
      ...(opts.deviceId ? { deviceId: { exact: opts.deviceId } } : {}),
    },
    video: false,
  };
  return navigator.mediaDevices.getUserMedia(constraints);
}

export interface CameraOptions {
  deviceId?: string;
}

export async function getCameraStream(opts: CameraOptions = {}): Promise<MediaStream> {
  const constraints: MediaStreamConstraints = {
    audio: false,
    video: {
      ...(opts.deviceId ? { deviceId: { exact: opts.deviceId } } : {}),
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30, max: 30 },
    },
  };
  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  // contentHint = 'motion' — подсказка кодеку оптимизировать под движение.
  for (const track of stream.getVideoTracks()) {
    track.contentHint = 'motion';
  }
  return stream;
}

export interface ScreenShareOptions {
  /** Целевая ширина (ideal). Браузер может выдать ближайшее. */
  width?: number;
  /** Целевая высота (ideal). */
  height?: number;
  /** Целевые fps (ideal/max). */
  frameRate?: number;
}

/**
 * Получает экран через `getDisplayMedia`. На Windows — открывается system-picker
 * (выбор окна/экрана). По умолчанию — без системного звука.
 *
 * Если frameRate ≥ 60 → `contentHint=motion` (оптимизация под видео/игры),
 * иначе `detail` для UI/текста.
 */
export async function getScreenShareStream(
  opts: ScreenShareOptions = {},
): Promise<MediaStream> {
  const fps = opts.frameRate ?? 30;
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: {
      frameRate: { ideal: fps, max: fps },
      ...(opts.width ? { width: { ideal: opts.width } } : {}),
      ...(opts.height ? { height: { ideal: opts.height } } : {}),
    } as MediaTrackConstraints,
    audio: false,
  });
  for (const track of stream.getVideoTracks()) {
    track.contentHint = fps >= 60 ? 'motion' : 'detail';
  }
  return stream;
}

export function stopStream(stream: MediaStream | null): void {
  if (!stream) return;
  for (const track of stream.getTracks()) {
    try {
      track.stop();
    } catch {
      // ignore
    }
  }
}
