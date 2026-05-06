/**
 * Discord-style плашка активного voice-канала, рендерится над UserCard
 * в нижней части ChannelSidebar. Two-row layout:
 *
 *   ┌─────────────────────────────────────┐
 *   │ ▰▰▰ Голосовая связь подключена   ✕  │ ← header + disconnect
 *   │     {channelName} / {guildName}     │
 *   ├─────────────────────────────────────┤
 *   │  [📺]  [💻]  [🎤]  [🎧]               │ ← controls row
 *   └─────────────────────────────────────┘
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
import { useShallow } from 'zustand/shallow';
import { useChannelVoice } from '@/voice/channel-store';
import { useChannelVoiceOrchestrator } from '@/voice/channel-context';
import { useAuth } from '@/auth/store';
import { useGuildChannels, useGuilds } from '@/hooks/use-guild-data';
import { cn } from '@/lib/utils';

export function VoiceChannelBar(): JSX.Element | null {
  const phase = useChannelVoice((s) => s.phase);
  const channelId = useChannelVoice((s) => s.channelId);
  const guildId = useChannelVoice((s) => s.guildId);
  const deafened = useChannelVoice((s) => s.deafened);
  const meId = useAuth((s) => s.user?.id);
  const myParticipant = useChannelVoice(
    useShallow((s) => (meId ? s.participants.get(meId) : undefined)),
  );
  const orchestrator = useChannelVoiceOrchestrator();

  const { data: guildsData } = useGuilds();
  const { data: channelsData } = useGuildChannels(guildId);

  if (phase === 'idle' || !channelId) return null;

  const channel = channelsData?.channels.find((c) => c.id === channelId);
  const guild = guildsData?.guilds.find((g) => g.id === guildId);
  const channelLabel = channel?.name ?? '...';
  const guildLabel = guild?.name ?? '';

  const muted = myParticipant ? !myParticipant.audioEnabled : false;
  const cameraOn = !!myParticipant?.cameraTrack;
  const screenOn = !!myParticipant?.screenTrack;
  const speaking = myParticipant?.speaking ?? false;
  const disabled = phase !== 'joined';
  const live = phase === 'joined';

  const headerLabel =
    phase === 'joining'
      ? 'Подключение…'
      : phase === 'leaving'
        ? 'Отключение…'
        : 'Голосовая связь подключена';

  return (
    <div className="border-t border-bg-active bg-bg-deepest px-2 py-2">
      {/* Top row: meter + status + disconnect */}
      <div className="flex items-center gap-2 px-1">
        <AudioMeter active={live && speaking} />
        <div className="min-w-0 flex-1 leading-tight">
          <div
            className={cn(
              'truncate text-[14px] font-semibold',
              live ? 'text-accent-success' : 'text-text-secondary',
            )}
          >
            {headerLabel}
          </div>
          {live && (channelLabel || guildLabel) && (
            <div className="num-tabular truncate text-[11px] text-text-muted">
              <span className="font-medium text-text-secondary">{channelLabel}</span>
              {guildLabel && <span> / {guildLabel}</span>}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => void orchestrator.leave()}
          title="Покинуть канал"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-bg-default text-text-secondary transition-colors hover:bg-accent-danger hover:text-white"
        >
          <PhoneOff size={14} strokeWidth={2} />
        </button>
      </div>

      {/* Bottom row: cam / screen / mic / deafen */}
      <div className="mt-1.5 grid grid-cols-4 gap-1 px-1">
        <BarButton
          title={cameraOn ? 'Выключить камеру' : 'Включить камеру'}
          active={cameraOn}
          disabled={disabled}
          onClick={() => void orchestrator.toggleCamera()}
        >
          {cameraOn ? <Video size={16} /> : <VideoOff size={16} />}
        </BarButton>
        <BarButton
          title={screenOn ? 'Остановить трансляцию' : 'Транслировать экран'}
          active={screenOn}
          disabled={disabled}
          onClick={() => void orchestrator.toggleScreenShare()}
        >
          {screenOn ? <MonitorOff size={16} /> : <Monitor size={16} />}
        </BarButton>
        <BarButton
          title={muted ? 'Включить микрофон' : 'Выключить микрофон'}
          active={muted}
          danger={muted}
          disabled={disabled}
          onClick={() => void orchestrator.toggleMute()}
        >
          {muted ? <MicOff size={16} /> : <Mic size={16} />}
        </BarButton>
        <BarButton
          title={deafened ? 'Включить звук' : 'Выключить звук'}
          active={deafened}
          danger={deafened}
          disabled={disabled}
          onClick={() => orchestrator.toggleDeafen()}
        >
          {deafened ? <HeadphoneOff size={16} /> : <Headphones size={16} />}
        </BarButton>
      </div>
    </div>
  );
}

/**
 * Маленький audio-meter (4 вертикальные полоски). При active анимация —
 * полоски пульсируют с разными фазами через CSS scaleY-keyframes; при
 * idle полоски статично средней высоты.
 */
function AudioMeter({ active }: { active: boolean }): JSX.Element {
  return (
    <div
      aria-hidden
      className="flex h-[14px] w-[14px] shrink-0 items-end justify-between"
      title={active ? 'Голос активен' : 'Тишина'}
    >
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className={cn(
            'block w-[2px] rounded-sm bg-accent-success origin-bottom transition-all',
            active ? 'animate-meter-bar' : 'h-[5px]',
          )}
          style={
            active
              ? {
                  animationDelay: `${i * 90}ms`,
                  animationDuration: '700ms',
                }
              : undefined
          }
        />
      ))}
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
        'flex h-8 items-center justify-center rounded-md transition-colors disabled:opacity-50',
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
