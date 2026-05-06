import { PhoneOff, Wifi } from 'lucide-react';
import { useChannelVoice } from '@/voice/channel-store';
import { useChannelVoiceOrchestrator } from '@/voice/channel-context';

/**
 * Активный voice-channel summary — сидит над user-card в левой колонке когда
 * мы подключены. Кнопка leave + индикатор «Подключено».
 */
export function VoiceChannelBar(): JSX.Element | null {
  const phase = useChannelVoice((s) => s.phase);
  const channelId = useChannelVoice((s) => s.channelId);
  const orchestrator = useChannelVoiceOrchestrator();

  if (phase === 'idle' || !channelId) return null;

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
