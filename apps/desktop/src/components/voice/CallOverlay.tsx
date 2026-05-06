import { useEffect, useMemo, useRef } from 'react';
import {
  Headphones,
  HeadphoneOff,
  Mic,
  MicOff,
  Monitor,
  MonitorOff,
  Phone,
  PhoneOff,
  Video,
  VideoOff,
} from 'lucide-react';
import { useVoice, type CallPhase } from '@/voice/store';
import { useVoiceOrchestrator } from '@/voice/context';
import { VideoTile } from './VideoTile';
import { cn } from '@/lib/utils';

const PHASE_LABEL: Record<Exclude<CallPhase, 'idle'>, string> = {
  calling: 'Звоним…',
  ringing: 'Входящий вызов',
  connecting: 'Соединение…',
  active: 'В разговоре',
  ending: 'Завершение…',
};

/**
 * Overlay для тех состояний 1:1 звонка, что НЕ умещаются в sidebar-плашке:
 *   - ringing → fullscreen modal с Accept/Decline.
 *   - active с видео/screenshare → fullscreen video view + control bar.
 *
 * Audio-only mini-режим живёт в `CallPlate` внутри ChannelSidebar (Discord-style).
 */
export function CallOverlay(): JSX.Element | null {
  const phase = useVoice((s) => s.phase);
  const peer = useVoice((s) => s.peer);
  const muted = useVoice((s) => s.muted);
  const deafened = useVoice((s) => s.deafened);
  const remoteStream = useVoice((s) => s.remoteStream);
  const localCamera = useVoice((s) => s.localCameraStream);
  const localScreen = useVoice((s) => s.localScreenStream);
  const remoteCamera = useVoice((s) => s.remoteCameraStream);
  const remoteScreen = useVoice((s) => s.remoteScreenStream);
  const connectionState = useVoice((s) => s.connectionState);
  const orchestrator = useVoiceOrchestrator();

  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    if (remoteStream && el.srcObject !== remoteStream) {
      el.srcObject = remoteStream;
      el.play().catch(() => undefined);
    }
    if (!remoteStream) el.srcObject = null;
  }, [remoteStream]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.muted = deafened;
  }, [deafened]);

  const peerName = peer?.displayName ?? peer?.username ?? '...';
  const initials = useMemoInitials(peerName);

  const hasVideo =
    localCamera !== null ||
    localScreen !== null ||
    remoteCamera !== null ||
    remoteScreen !== null;
  const cameraOn = localCamera !== null;
  const screenOn = localScreen !== null;

  if (phase === 'idle') return null;

  if (phase === 'ringing') {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 backdrop-blur-sm">
        <div className="w-[420px] rounded-2xl bg-bg-elevated p-8 text-center shadow-elevated">
          <PeerAvatar initials={initials} size={96} />
          <div className="mt-5 text-[13px] tracking-wide text-text-muted uppercase">
            Входящий вызов
          </div>
          <div className="mt-1 text-[22px] font-semibold text-text-primary">{peerName}</div>
          <div className="mt-8 flex justify-center gap-4">
            <button
              type="button"
              onClick={() => orchestrator.decline()}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-accent-danger text-white transition-colors hover:bg-red-600"
              title="Отклонить"
            >
              <PhoneOff size={22} strokeWidth={2.25} />
            </button>
            <button
              type="button"
              onClick={() => orchestrator.accept()}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-accent-success text-white transition-colors hover:bg-green-600"
              title="Принять"
            >
              <Phone size={22} strokeWidth={2.25} />
            </button>
          </div>
        </div>
        <audio ref={audioRef} autoPlay hidden />
      </div>
    );
  }

  if (hasVideo) {
    // Full-screen video view: главный фрейм + PiP local + controls внизу.
    const mainStream = remoteScreen ?? localScreen ?? remoteCamera;
    const mainName = remoteScreen
      ? `${peerName} — экран`
      : localScreen
        ? 'Ваш экран'
        : peerName;
    return (
      <div className="fixed inset-0 z-[55] flex flex-col bg-black">
        <div className="relative flex-1 p-4">
          <VideoTile
            stream={mainStream}
            name={mainName}
            speaking={false}
            large
            className="h-full"
          />
          {localCamera && (
            <div className="absolute right-6 bottom-24 w-48">
              <VideoTile
                stream={localCamera}
                name="Вы"
                mirror
                muted={muted}
              />
            </div>
          )}
        </div>
        <ControlsBar
          phase={phase}
          muted={muted}
          deafened={deafened}
          cameraOn={cameraOn}
          screenOn={screenOn}
          connectionState={connectionState}
          onMute={() => orchestrator.toggleMute()}
          onDeafen={() => orchestrator.toggleDeafen()}
          onCamera={() => void orchestrator.toggleCamera()}
          onScreen={() => void orchestrator.toggleScreenShare()}
          onHangup={() => orchestrator.hangup()}
        />
        <audio ref={audioRef} autoPlay hidden />
      </div>
    );
  }

  // Audio-only режим живёт в CallPlate внутри ChannelSidebar — overlay
  // нужен только для ringing-modal'а и fullscreen-video. В audio-mini рендерим
  // невидимый audio-tag, чтобы remoteStream проигрывался.
  return (
    <audio ref={audioRef} autoPlay hidden />
  );
}

interface ControlsBarProps {
  phase: CallPhase;
  muted: boolean;
  deafened: boolean;
  cameraOn: boolean;
  screenOn: boolean;
  connectionState: RTCPeerConnectionState | 'new';
  onMute: () => void;
  onDeafen: () => void;
  onCamera: () => void;
  onScreen: () => void;
  onHangup: () => void;
}

function ControlsBar(props: ControlsBarProps): JSX.Element {
  const {
    phase,
    muted,
    deafened,
    cameraOn,
    screenOn,
    connectionState,
    onMute,
    onDeafen,
    onCamera,
    onScreen,
    onHangup,
  } = props;
  return (
    <div className="flex items-center justify-center gap-3 bg-bg-deepest/90 px-4 py-3 backdrop-blur">
      <span className="absolute left-4 text-[12px] text-text-muted">
        {PHASE_LABEL[phase as Exclude<CallPhase, 'idle'>]}
        {connectionStateLabel(connectionState, phase)}
      </span>
      <CircleButton
        title={muted ? 'Включить микрофон' : 'Выключить микрофон'}
        active={muted}
        onClick={onMute}
      >
        {muted ? <MicOff size={18} /> : <Mic size={18} />}
      </CircleButton>
      <CircleButton
        title={deafened ? 'Включить звук' : 'Выключить звук'}
        active={deafened}
        onClick={onDeafen}
      >
        {deafened ? <HeadphoneOff size={18} /> : <Headphones size={18} />}
      </CircleButton>
      <CircleButton
        title={cameraOn ? 'Выключить камеру' : 'Включить камеру'}
        active={cameraOn}
        onClick={onCamera}
      >
        {cameraOn ? <Video size={18} /> : <VideoOff size={18} />}
      </CircleButton>
      <CircleButton
        title={screenOn ? 'Остановить трансляцию' : 'Транслировать экран'}
        active={screenOn}
        onClick={onScreen}
      >
        {screenOn ? <MonitorOff size={18} /> : <Monitor size={18} />}
      </CircleButton>
      <button
        type="button"
        onClick={onHangup}
        title="Завершить"
        className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-danger text-white transition-colors hover:bg-red-600"
      >
        <PhoneOff size={18} />
      </button>
    </div>
  );
}

function useMemoInitials(name: string): string {
  return useMemo(() => {
    const trimmed = name.trim();
    if (!trimmed) return '?';
    const words = trimmed.split(/\s+/).filter(Boolean);
    if (words.length >= 2) return (words[0]![0]! + words[1]![0]!).toUpperCase();
    return trimmed.slice(0, 2).toUpperCase();
  }, [name]);
}

function PeerAvatar({ initials, size }: { initials: string; size: number }): JSX.Element {
  return (
    <div
      style={{ height: size, width: size, fontSize: size * 0.32 }}
      className="flex shrink-0 items-center justify-center rounded-full bg-accent-primary font-semibold text-white"
    >
      {initials}
    </div>
  );
}

interface CircleButtonProps {
  title: string;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}

function CircleButton({
  title,
  active,
  onClick,
  disabled,
  children,
}: CircleButtonProps): JSX.Element {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex h-10 w-10 items-center justify-center rounded-full transition-colors disabled:opacity-50',
        active
          ? 'bg-accent-danger text-white hover:bg-red-600'
          : 'bg-bg-default text-text-secondary hover:bg-bg-hover hover:text-text-primary',
      )}
    >
      {children}
    </button>
  );
}

function connectionStateLabel(
  state: RTCPeerConnectionState | 'new',
  phase: CallPhase,
): string {
  if (phase !== 'active') return '';
  if (state === 'connected') return '';
  if (state === 'disconnected' || state === 'failed') return ' · разрыв';
  return ' · подключение';
}
