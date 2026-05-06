import { Mic, MicOff } from 'lucide-react';
import { useShallow } from 'zustand/shallow';
import { selectParticipantsList, useChannelVoice } from '@/voice/channel-store';
import { cn } from '@/lib/utils';

interface VoiceChannelMembersProps {
  channelId: string;
}

/**
 * Список участников голосового канала, рисуемый прямо под voice-кнопкой
 * в ChannelSidebar (Discord-style). Показывается только если активный
 * channel совпадает с переданным `channelId`.
 */
export function VoiceChannelMembers({ channelId }: VoiceChannelMembersProps): JSX.Element | null {
  const activeChannelId = useChannelVoice((s) => s.channelId);
  const participants = useChannelVoice(useShallow(selectParticipantsList));

  if (activeChannelId !== channelId) return null;
  if (participants.length === 0) return null;

  return (
    <ul className="mt-0.5 space-y-0.5 pl-7">
      {participants.map((p) => (
        <li
          key={p.userId}
          className="flex items-center gap-2 px-2 py-1 text-[13px] text-text-secondary"
        >
          <span
            className={cn(
              'relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-primary text-[11px] font-semibold text-white',
              p.speaking && 'ring-2 ring-accent-success ring-offset-1 ring-offset-bg-darker',
            )}
          >
            {avatarInitials(p.name)}
          </span>
          <span className={cn('flex-1 truncate', p.isLocal && 'font-medium text-text-primary')}>
            {p.name}
            {p.isLocal && ' (вы)'}
          </span>
          {p.audioEnabled ? (
            <Mic size={12} className="text-text-muted" />
          ) : (
            <MicOff size={12} className="text-accent-danger" />
          )}
        </li>
      ))}
    </ul>
  );
}

function avatarInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0]![0]! + words[1]![0]!).toUpperCase();
  return trimmed.slice(0, 2).toUpperCase();
}
