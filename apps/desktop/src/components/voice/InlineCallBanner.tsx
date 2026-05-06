/**
 * Discord-style inline-плашка активного 1:1 звонка, рендерится поверх ChatArea
 * между header'ом и MessageList. Покрывает audio-only состояния:
 *   calling — «Звоним…», ring-out играет (звук в effects.ts)
 *   connecting / active без видео — два аватара + ряд контролов
 *
 * Ringing (incoming) — отдельная full-screen модалка в CallOverlay.
 * Active с видео/screenshare — fullscreen video view в CallOverlay.
 */

import {
  Headphones,
  HeadphoneOff,
  Mic,
  MicOff,
  Monitor,
  MonitorOff,
  PhoneOff,
  Video,
  VideoOff,
} from 'lucide-react';
import { useAuth } from '@/auth/store';
import { useVoice, type CallPhase } from '@/voice/store';
import { useVoiceOrchestrator } from '@/voice/context';
import { cn } from '@/lib/utils';

const PHASE_LABEL: Partial<Record<CallPhase, string>> = {
  calling: 'Звоним…',
  connecting: 'Соединение…',
  active: 'В разговоре',
  ending: 'Завершение…',
};

export function InlineCallBanner(): JSX.Element | null {
  const phase = useVoice((s) => s.phase);
  const peer = useVoice((s) => s.peer);
  const muted = useVoice((s) => s.muted);
  const deafened = useVoice((s) => s.deafened);
  const localCamera = useVoice((s) => s.localCameraStream);
  const localScreen = useVoice((s) => s.localScreenStream);
  const remoteCamera = useVoice((s) => s.remoteCameraStream);
  const remoteScreen = useVoice((s) => s.remoteScreenStream);
  const orchestrator = useVoiceOrchestrator();
  const me = useAuth((s) => s.user);

  const hasVideo =
    localCamera !== null ||
    localScreen !== null ||
    remoteCamera !== null ||
    remoteScreen !== null;

  // idle / ringing / video-mode — не показываем (другие layouts).
  if (phase === 'idle' || phase === 'ringing' || hasVideo) return null;

  const meName = me?.displayName ?? me?.username ?? 'Вы';
  const peerName = peer?.displayName ?? peer?.username ?? '...';
  const cameraOn = localCamera !== null;
  const screenOn = localScreen !== null;
  const disabled = phase !== 'active' && phase !== 'connecting';

  return (
    <div className="flex shrink-0 flex-col items-center justify-center bg-bg-deepest pt-6 pb-3">
      <div className="flex items-center gap-3">
        <BigAvatar name={meName} />
        <BigAvatar name={peerName} />
      </div>
      <div className="mt-3 text-[12px] tracking-wide text-text-muted uppercase">
        {PHASE_LABEL[phase]}
      </div>
      <div className="mt-1 text-[16px] font-semibold text-text-primary">{peerName}</div>

      <div className="mt-4 flex items-center gap-2">
        <CircleControl
          title={muted ? 'Включить микрофон' : 'Выключить микрофон'}
          active={muted}
          danger={muted}
          disabled={disabled}
          onClick={() => orchestrator.toggleMute()}
        >
          {muted ? <MicOff size={18} /> : <Mic size={18} />}
        </CircleControl>
        <CircleControl
          title={deafened ? 'Включить звук' : 'Выключить звук'}
          active={deafened}
          danger={deafened}
          disabled={disabled}
          onClick={() => orchestrator.toggleDeafen()}
        >
          {deafened ? <HeadphoneOff size={18} /> : <Headphones size={18} />}
        </CircleControl>
        <CircleControl
          title={cameraOn ? 'Выключить камеру' : 'Включить камеру'}
          active={cameraOn}
          disabled={phase !== 'active'}
          onClick={() => void orchestrator.toggleCamera()}
        >
          {cameraOn ? <Video size={18} /> : <VideoOff size={18} />}
        </CircleControl>
        <CircleControl
          title={screenOn ? 'Остановить трансляцию' : 'Транслировать экран'}
          active={screenOn}
          disabled={phase !== 'active'}
          onClick={() => void orchestrator.toggleScreenShare()}
        >
          {screenOn ? <MonitorOff size={18} /> : <Monitor size={18} />}
        </CircleControl>
        <button
          type="button"
          onClick={() => orchestrator.hangup()}
          title="Завершить звонок"
          className="ml-2 flex h-10 w-10 items-center justify-center rounded-full bg-accent-danger text-white transition-colors hover:bg-red-600"
        >
          <PhoneOff size={18} />
        </button>
      </div>
    </div>
  );
}

function BigAvatar({ name }: { name: string }): JSX.Element {
  return (
    <div
      className="flex h-[80px] w-[80px] items-center justify-center rounded-full bg-accent-primary text-[26px] font-semibold text-white shadow-elevated"
      title={name}
    >
      {avatarInitials(name)}
    </div>
  );
}

interface CircleControlProps {
  title: string;
  active: boolean;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

function CircleControl({
  title,
  active,
  danger,
  disabled,
  onClick,
  children,
}: CircleControlProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        'flex h-10 w-10 items-center justify-center rounded-full transition-colors disabled:opacity-50',
        active && danger
          ? 'bg-accent-danger text-white hover:bg-red-600'
          : active
            ? 'bg-accent-primary text-white hover:bg-accent-hover'
            : 'bg-bg-default text-text-secondary hover:bg-bg-hover hover:text-text-primary',
      )}
    >
      {children}
    </button>
  );
}

function avatarInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0]![0]! + words[1]![0]!).toUpperCase();
  return trimmed.slice(0, 2).toUpperCase();
}
