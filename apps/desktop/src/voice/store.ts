/**
 * Voice store — состояние одного 1-на-1 звонка.
 *
 *   idle → calling (we pressed Call)
 *        ↘ ringing (someone called us)
 *   calling/ringing → connecting (call.accepted получено)
 *   connecting → active (RTCPeerConnection state == 'connected')
 *   active → ending → idle (после hangup)
 */

import { create } from 'zustand';

export type CallPhase =
  | 'idle'
  | 'calling'
  | 'ringing'
  | 'connecting'
  | 'active'
  | 'ending';

export interface VoiceParticipant {
  userId: string;
  username: string;
  displayName: string;
}

interface VoiceState {
  phase: CallPhase;
  callId: string | null;
  peer: VoiceParticipant | null;
  /** True если мы offerer (мы инициировали invite). */
  isOfferer: boolean;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  /** Локальная камера (видео-stream от getUserMedia). */
  localCameraStream: MediaStream | null;
  /** Локальный screenshare-stream (от getDisplayMedia). */
  localScreenStream: MediaStream | null;
  /** Remote-стрим камеры собеседника. */
  remoteCameraStream: MediaStream | null;
  /** Remote-стрим экрана собеседника. */
  remoteScreenStream: MediaStream | null;
  muted: boolean;
  deafened: boolean;
  /** RTCPeerConnection state — для UI-индикатора качества. */
  connectionState: RTCPeerConnectionState | 'new';
  /** Последняя ошибка цикла звонка, если была. */
  errorMessage: string | null;

  setOutgoing: (peer: VoiceParticipant) => void;
  setIncoming: (callId: string, peer: VoiceParticipant) => void;
  setCallId: (callId: string) => void;
  setConnecting: () => void;
  setActive: () => void;
  setLocalStream: (s: MediaStream | null) => void;
  setRemoteStream: (s: MediaStream | null) => void;
  setLocalCamera: (s: MediaStream | null) => void;
  setLocalScreen: (s: MediaStream | null) => void;
  setRemoteCamera: (s: MediaStream | null) => void;
  setRemoteScreen: (s: MediaStream | null) => void;
  setMuted: (muted: boolean) => void;
  setDeafened: (deafened: boolean) => void;
  setConnectionState: (s: RTCPeerConnectionState | 'new') => void;
  setError: (msg: string | null) => void;
  reset: () => void;
}

const INITIAL: Pick<
  VoiceState,
  | 'phase'
  | 'callId'
  | 'peer'
  | 'isOfferer'
  | 'localStream'
  | 'remoteStream'
  | 'localCameraStream'
  | 'localScreenStream'
  | 'remoteCameraStream'
  | 'remoteScreenStream'
  | 'muted'
  | 'deafened'
  | 'connectionState'
  | 'errorMessage'
> = {
  phase: 'idle',
  callId: null,
  peer: null,
  isOfferer: false,
  localStream: null,
  remoteStream: null,
  localCameraStream: null,
  localScreenStream: null,
  remoteCameraStream: null,
  remoteScreenStream: null,
  muted: false,
  deafened: false,
  connectionState: 'new',
  errorMessage: null,
};

export const useVoice = create<VoiceState>((set) => ({
  ...INITIAL,

  setOutgoing: (peer) =>
    set({ phase: 'calling', peer, isOfferer: true, callId: null, errorMessage: null }),
  setIncoming: (callId, peer) =>
    set({ phase: 'ringing', callId, peer, isOfferer: false, errorMessage: null }),
  setCallId: (callId) => set({ callId }),
  setConnecting: () => set({ phase: 'connecting' }),
  setActive: () => set({ phase: 'active' }),
  setLocalStream: (localStream) => set({ localStream }),
  setRemoteStream: (remoteStream) => set({ remoteStream }),
  setLocalCamera: (localCameraStream) => set({ localCameraStream }),
  setLocalScreen: (localScreenStream) => set({ localScreenStream }),
  setRemoteCamera: (remoteCameraStream) => set({ remoteCameraStream }),
  setRemoteScreen: (remoteScreenStream) => set({ remoteScreenStream }),
  setMuted: (muted) => set({ muted }),
  setDeafened: (deafened) => set({ deafened }),
  setConnectionState: (connectionState) => set({ connectionState }),
  setError: (errorMessage) => set({ errorMessage }),
  reset: () => set({ ...INITIAL }),
}));

/** Phase агрегатор — true если есть какой-то активный звонок (любая фаза кроме idle). */
export function isCallInProgress(phase: CallPhase): boolean {
  return phase !== 'idle';
}
