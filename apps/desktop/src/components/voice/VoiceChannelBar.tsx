import { Mic, MicOff, PhoneOff, Wifi } from 'lucide-react';
import { useShallow } from 'zustand/shallow';
import { useChannelVoice } from '@/voice/channel-store';
import { useChannelVoiceOrchestrator } from '@/voice/channel-context';
import { useAuth } from '@/auth/store';
import { cn } from '@/lib/utils';

/**
 * Активный voice-channel summary над user-card. Показывает статус, кнопки
 * Mute / Leave. Mute-индикатор берётся из `useChannelVoice.participants[meId]`
 * — обновляется на `RoomEvent.TrackMuted/Unmuted` в LivekitRoom-обёртке.
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

  return (
    <div className="border-t border-bg-default bg-bg-deepest px-2 py-2">
      <div className="flex items-center gap-2 rounded-md bg-bg-default/40 px-2 py-1.5">
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
        <button
          type="button"
          onClick={() => void orchestrator.toggleMute()}
          title={muted ? 'Включить микрофон' : 'Выключить микрофон'}
          disabled={phase !== 'joined'}
          className={cn(
            'flex h-7 w-7 shrink-0 items-center justify-center rounded transition-colors disabled:opacity-50',
            muted
              ? 'bg-accent-danger text-white hover:bg-red-600'
              : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary',
          )}
        >
          {muted ? <MicOff size={14} /> : <Mic size={14} />}
        </button>
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
