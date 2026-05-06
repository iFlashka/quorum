import {
  Mic,
  MicOff,
  Monitor,
  MonitorOff,
  PhoneOff,
  Video,
  VideoOff,
  Wifi,
} from 'lucide-react';
import { useShallow } from 'zustand/shallow';
import { useChannelVoice } from '@/voice/channel-store';
import { useChannelVoiceOrchestrator } from '@/voice/channel-context';
import { useAuth } from '@/auth/store';
import { cn } from '@/lib/utils';

/**
 * Активный voice-channel summary над user-card. Mute / Camera / Screenshare /
 * Leave. Состояние читаем из participants[meId] чтобы синкаться с
 * RoomEvent.TrackMuted/Subscribed.
 */
export function VoiceChannelBar(): JSX.Element | null {
  const phase = useChannelVoice((s) => s.phase);
  const channelId = useChannelVoice((s) => s.channelId);
  const meId = useAuth((s) => s.user?.id);
  const myParticipant = useChannelVoice(
    useShallow((s) => (meId ? s.participants.get(meId) : undefined)),
  );
  const orchestrator = useChannelVoiceOrchestrator();

  if (phase === 'idle' || !channelId) return null;

  const muted = myParticipant ? !myParticipant.audioEnabled : false;
  const cameraOn = !!myParticipant?.cameraTrack;
  const screenOn = !!myParticipant?.screenTrack;
  const disabled = phase !== 'joined';

  return (
    <div className="border-t border-bg-default bg-bg-deepest px-2 py-2">
      <div className="flex items-center gap-1.5 rounded-md bg-bg-default/40 px-2 py-1.5">
        <Wifi size={14} className="shrink-0 text-accent-success" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12px] font-semibold text-accent-success">
            {phase === 'joining'
              ? 'Подключение…'
              : phase === 'leaving'
                ? 'Отключение…'
                : 'Голосовой канал'}
          </div>
        </div>
        <BarButton
          title={muted ? 'Включить микрофон' : 'Выключить микрофон'}
          active={muted}
          danger={muted}
          disabled={disabled}
          onClick={() => void orchestrator.toggleMute()}
        >
          {muted ? <MicOff size={14} /> : <Mic size={14} />}
        </BarButton>
        <BarButton
          title={cameraOn ? 'Выключить камеру' : 'Включить камеру'}
          active={cameraOn}
          disabled={disabled}
          onClick={() => void orchestrator.toggleCamera()}
        >
          {cameraOn ? <Video size={14} /> : <VideoOff size={14} />}
        </BarButton>
        <BarButton
          title={screenOn ? 'Остановить трансляцию' : 'Транслировать экран'}
          active={screenOn}
          disabled={disabled}
          onClick={() => void orchestrator.toggleScreenShare()}
        >
          {screenOn ? <MonitorOff size={14} /> : <Monitor size={14} />}
        </BarButton>
        <button
          type="button"
          onClick={() => void orchestrator.leave()}
          title="Покинуть канал"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-text-muted hover:bg-bg-hover hover:text-accent-danger"
        >
          <PhoneOff size={14} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}

interface BarButtonProps {
  title: string;
  active: boolean;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

function BarButton({
  title,
  active,
  danger,
  disabled,
  onClick,
  children,
}: BarButtonProps): JSX.Element {
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
