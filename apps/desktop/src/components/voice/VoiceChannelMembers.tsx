import { Mic, MicOff, UserPlus } from 'lucide-react';
import { useShallow } from 'zustand/shallow';
import { toast } from 'sonner';
import type { PublicMember } from '@quorum/shared';
import { useChannelVoice } from '@/voice/channel-store';
import { useVoiceOccupancy } from '@/voice/occupancy-store';
import { useGuildMembers } from '@/hooks/use-guild-data';
import { useSelection } from '@/state/selection';
import { useAuth } from '@/auth/store';
import { MemberAvatar } from '@/components/shell/MemberAvatar';
import { cn } from '@/lib/utils';

interface VoiceChannelMembersProps {
  channelId: string;
}

interface RowData {
  userId: string;
  name: string;
  username: string;
  audioEnabled: boolean;
  speaking: boolean;
  isLocal: boolean;
  member?: PublicMember;
}

/**
 * Список участников голосового канала под voice-кнопкой в ChannelSidebar.
 *
 * Источники истины:
 *   - `useVoiceOccupancy` (server-broadcast `voice.channel.state`) — ВСЕГДА,
 *     даже если мы сами не в этом канале. Это закрывает Discord-feature
 *     «видеть кто в Lounge снаружи».
 *   - `useChannelVoice` — оверлей с speaking/audioEnabled для канала, в котором
 *     мы сами сидим (там есть real-time данные от LiveKit).
 *
 * Имена резолвим через members-cache гилды.
 */
export function VoiceChannelMembers({ channelId }: VoiceChannelMembersProps): JSX.Element | null {
  const guildId = useSelection((s) => s.guildId);
  const occupants = useVoiceOccupancy(
    useShallow((s) => s.byChannel.get(channelId) ?? EMPTY),
  );
  const myActiveChannelId = useChannelVoice((s) => s.channelId);
  const liveParticipants = useChannelVoice((s) => s.participants);
  const meId = useAuth((s) => s.user?.id);
  const { data: membersData } = useGuildMembers(guildId);
  const members = membersData?.members ?? [];

  if (occupants.length === 0) return null;

  const isInThisChannel = myActiveChannelId === channelId;
  const memberById = new Map<string, PublicMember>();
  for (const m of members) memberById.set(m.userId, m);

  const rows: RowData[] = occupants.map((userId) => {
    const live = isInThisChannel ? liveParticipants.get(userId) : undefined;
    const memberRow = memberById.get(userId);
    return {
      userId,
      name:
        live?.name ??
        memberRow?.displayName ??
        memberRow?.username ??
        userId.slice(0, 6),
      username: memberRow?.username ?? userId.slice(0, 6),
      audioEnabled: live?.audioEnabled ?? true,
      speaking: live?.speaking ?? false,
      isLocal: userId === meId,
      member: memberRow,
    };
  });

  return (
    <ul className="mt-0.5 space-y-0.5 pl-7">
      {rows.map((p) => (
        <li
          key={p.userId}
          className="flex items-center gap-2 px-2 py-1 text-[13px] text-text-secondary"
        >
          <span
            className={cn(
              'rounded-full transition-shadow',
              p.speaking && 'ring-2 ring-accent-success ring-offset-1 ring-offset-bg-darker',
            )}
          >
            <MemberAvatar
              user={{ userId: p.userId, username: p.username, displayName: p.name }}
              member={p.member}
              size={24}
              ringColor="bg-darker"
              disablePopover={p.isLocal}
              hideStatus
            />
          </span>
          <span className={cn('flex-1 truncate', p.isLocal && 'font-medium text-text-primary')}>
            {p.name}
            {p.isLocal && ' (вы)'}
          </span>
          {!p.audioEnabled && <MicOff size={12} className="text-accent-danger" />}
          {p.audioEnabled && p.speaking && <Mic size={12} className="text-accent-success" />}
        </li>
      ))}
      <li>
        <button
          type="button"
          onClick={() =>
            toast.info(
              'Пока пригласить можно invite-кодом — попроси его у владельца сервера.',
            )
          }
          className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-[13px] text-text-muted transition-colors hover:bg-bg-hover hover:text-text-secondary"
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-dashed border-text-muted/40">
            <UserPlus size={12} strokeWidth={2} />
          </span>
          <span>Пригласить в голосовой чат</span>
        </button>
      </li>
    </ul>
  );
}

const EMPTY: string[] = [];
