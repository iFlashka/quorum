/**
 * Discord-style плашка активного 1:1 звонка в нижней части ChannelSidebar
 * (над VoiceChannelBar и UserCard).
 *
 * Покрывает фазы calling / connecting / active без видео — это «mini»-режим.
 * При phase=ringing показывается полноэкранная модалка (CallOverlay), при
 * включении видео — fullscreen video view (тоже CallOverlay).
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
  Wifi,
} from 'lucide-react';
import { useVoice, type CallPhase } from '@/voice/store';
import { useVoiceOrchestrator } from '@/voice/context';
import { cn } from '@/lib/utils';

const PHASE_LABEL: Partial<Record<CallPhase, string>> = {
  calling: 'Звоним…',
  connecting: 'Соединение…',
  active: 'Голосовое подключение',
  ending: 'Завершение…',
};

export function CallPlate(): JSX.Element | null {
  const phase = useVoice((s) => s.phase);
  const peer = useVoice((s) => s.peer);
  const muted = useVoice((s) => s.muted);
  const deafened = useVoice((s) => s.deafened);
  const localCamera = useVoice((s) => s.localCameraStream);
  const localScreen = useVoice((s) => s.localScreenStream);
  const remoteCamera = useVoice((s) => s.remoteCameraStream);
  const remoteScreen = useVoice((s) => s.remoteScreenStream);
  const connectionState = useVoice((s) => s.connectionState);
  const orchestrator = useVoiceOrchestrator();

  // Не рендерим в idle (нет звонка), ringing (там модалка), и в video-режиме —
  // тогда CallOverlay развёрнут на весь экран и плашка не нужна.
  const hasVideo =
    localCamera !== null ||
    localScreen !== null ||
    remoteCamera !== null ||
    remoteScreen !== null;
  if (phase === 'idle' || phase === 'ringing' || hasVideo) return null;

  const peerName = peer?.displayName ?? peer?.username ?? '...';
  const cameraOn = localCamera !== null;
  const screenOn = localScreen !== null;
  const disabled = phase !== 'active' && phase !== 'connecting';
  const statusLabel = PHASE_LABEL[phase] ?? '';
  const isLive = phase === 'active' && connectionState === 'connected';

  return (
    <div className="border-t border-bg-default bg-bg-deepest px-2 py-2">
      <div className="rounded-md bg-bg-default/40 px-2 py-1.5">
        <div className="flex items-center gap-1.5">
          <Wifi
            size={14}
            className={cn('shrink-0', isLive ? 'text-accent-success' : 'text-text-muted')}
          />
          <div className="min-w-0 flex-1">
            <div
              className={cn(
                'truncate text-[12px] font-semibold',
                isLive ? 'text-accent-success' : 'text-text-secondary',
              )}
            >
              {statusLabel}
            </div>
            <div className="truncate text-[11px] text-text-muted">{peerName}</div>
          </div>
        </div>
        <div className="mt-1.5 flex items-center gap-0.5">
          <PlateButton
            title={muted ? 'Включить микрофон' : 'Выключить микрофон'}
            active={muted}
            danger={muted}
            disabled={disabled}
            onClick={() => orchestrator.toggleMute()}
          >
            {muted ? <MicOff size={14} /> : <Mic size={14} />}
          </PlateButton>
          <PlateButton
            title={deafened ? 'Включить звук' : 'Выключить звук'}
            active={deafened}
            danger={deafened}
            disabled={disabled}
            onClick={() => orchestrator.toggleDeafen()}
          >
            {deafened ? <HeadphoneOff size={14} /> : <Headphones size={14} />}
          </PlateButton>
          <PlateButton
            title={cameraOn ? 'Выключить камеру' : 'Включить камеру'}
            active={cameraOn}
            disabled={phase !== 'active'}
            onClick={() => void orchestrator.toggleCamera()}
          >
            {cameraOn ? <Video size={14} /> : <VideoOff size={14} />}
          </PlateButton>
          <PlateButton
            title={screenOn ? 'Остановить трансляцию' : 'Транслировать экран'}
            active={screenOn}
            disabled={phase !== 'active'}
            onClick={() => void orchestrator.toggleScreenShare()}
          >
            {screenOn ? <MonitorOff size={14} /> : <Monitor size={14} />}
          </PlateButton>
          <button
            type="button"
            onClick={() => orchestrator.hangup()}
            title="Завершить звонок"
            className="ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded text-text-muted hover:bg-bg-hover hover:text-accent-danger"
          >
            <PhoneOff size={14} strokeWidth={2} />
          </button>
        </div>
      </div>
    </div>
  );
}

interface PlateButtonProps {
  title: string;
  active: boolean;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

function PlateButton({
  title,
  active,
  danger,
  disabled,
  onClick,
  children,
}: PlateButtonProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        'flex h-7 w-7 shrink-0 items-center justify-center rounded transition-colors disabled:opacity-50',
        active && danger
          ? 'bg-accent-danger text-white hover:bg-red-600'
          : active
            ? 'bg-accent-primary text-white hover:bg-accent-hover'
            : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary',
      )}
    >
      {children}
    </button>
  );
}
