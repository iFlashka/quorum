/**
 * Достаёт `VoiceParticipant` (минимальная инфа: id, username, displayName)
 * из TanStack Query cache по userId, обходя все `['members', guildId]`-кеши.
 */

import type { QueryClient } from '@tanstack/react-query';
import type { VoiceParticipant } from './store';

interface MembersCache {
  members: { userId: string; username: string; displayName: string }[];
}

export function lookupParticipantInCache(
  qc: QueryClient,
  userId: string,
): VoiceParticipant | null {
  const entries = qc.getQueryCache().findAll({ queryKey: ['members'] });
  for (const entry of entries) {
    const data = entry.state.data as MembersCache | undefined;
    if (!data || !Array.isArray(data.members)) continue;
    const found = data.members.find((m) => m.userId === userId);
    if (found) {
      return {
        userId: found.userId,
        username: found.username,
        displayName: found.displayName,
      };
    }
  }
  return null;
}
