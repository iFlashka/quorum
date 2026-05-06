import { useShallow } from 'zustand/shallow';
import { selectParticipantsList, useChannelVoice } from '@/voice/channel-store';
import { VideoTile } from './VideoTile';

/**
 * Видео-сетка для активного voice-канала. Показывается над ChatArea когда у
 * кого-то из participants включена камера или screenshare.
 *
 * Layout:
 *   - если есть screenshare — он растягивается на main, остальные тайлы в strip справа.
 *   - иначе — auto-fit grid из camera-tile'ов.
 */
export function VoiceChannelGrid(): JSX.Element | null {
  const phase = useChannelVoice((s) => s.phase);
  const participants = useChannelVoice(useShallow(selectParticipantsList));

  if (phase !== 'joined') return null;

  const hasAnyVideo = participants.some(
    (p) => p.cameraTrack !== null || p.screenTrack !== null,
  );
  if (!hasAnyVideo) return null;

  const screenSharer = participants.find((p) => p.screenTrack !== null);

  if (screenSharer?.screenTrack) {
    return (
      <div className="flex h-full gap-2 p-3">
        <div className="flex-1">
          <VideoTile
            stream={screenSharer.screenTrack}
            name={`${screenSharer.name} — экран`}
            large
            className="h-full"
          />
        </div>
        <div className="flex w-56 shrink-0 flex-col gap-2 overflow-y-auto">
          {participants.map((p) => (
            <VideoTile
              key={p.userId}
              stream={p.cameraTrack}
              name={p.name + (p.isLocal ? ' (вы)' : '')}
              mirror={p.isLocal}
              muted={!p.audioEnabled}
              speaking={p.speaking}
            />
          ))}
        </div>
      </div>
    );
  }

  // Только cameras → auto-fit grid.
  return (
    <div
      className="grid h-full content-start gap-2 p-3"
      style={{
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
      }}
    >
      {participants.map((p) => (
        <VideoTile
          key={p.userId}
          stream={p.cameraTrack}
          name={p.name + (p.isLocal ? ' (вы)' : '')}
          mirror={p.isLocal}
          muted={!p.audioEnabled}
          speaking={p.speaking}
        />
      ))}
    </div>
  );
}
