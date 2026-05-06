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

/**
 * Получает экран через `getDisplayMedia`. На Windows — открывается system-picker
 * (выбор окна/экрана). По умолчанию — без системного звука.
 */
export async function getScreenShareStream(): Promise<MediaStream> {
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: {
      frameRate: { ideal: 30, max: 30 },
    } as MediaTrackConstraints,
    audio: false,
  });
  // contentHint = 'detail' для текста/UI; 'motion' если игра/видео. По дефолту detail.
  for (const track of stream.getVideoTracks()) {
    track.contentHint = 'detail';
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
