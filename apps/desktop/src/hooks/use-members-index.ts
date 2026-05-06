/**
 * Реактивный peer-cache по всем гилдам пользователя. Используется в DM-UI
 * (DmSidebar, DmMessageList, DmChatArea) для резолва имени/аватара
 * автора DM-сообщения или peer'а в списке переписок.
 *
 * Раньше было `qc.getQueryCache().findAll({queryKey:['members']})` —
 * не реактивно: если members появились ПОСЛЕ первого рендера, компонент
 * не перерендеривался, имя оставалось placeholder'ом.
 */

import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import type { PublicMember } from '@quorum/shared';
import { useRuntime } from '@/auth/runtime-store';
import { useGuilds } from '@/hooks/use-guild-data';

/**
 * Мапа userId → PublicMember агрегированная по членству во ВСЕХ гилдах
 * пользователя. Если юзер встречается в нескольких — берётся первая
 * найденная запись.
 */
export function useMembersIndex(): Map<string, PublicMember> {
  const guildsApi = useRuntime((s) => s.runtime?.guildsApi);
  const { data: guildsData } = useGuilds();
  const guildIds = useMemo(
    () => guildsData?.guilds.map((g) => g.id) ?? [],
    [guildsData],
  );

  const membersQueries = useQueries({
    queries: guildIds.map((id) => ({
      queryKey: ['members', id],
      queryFn: () => {
        if (!guildsApi) throw new Error('runtime_not_ready');
        return guildsApi.members(id);
      },
      enabled: !!guildsApi,
    })),
  });

  return useMemo(() => {
    const map = new Map<string, PublicMember>();
    for (const q of membersQueries) {
      const data = q.data;
      if (!data?.members) continue;
      for (const m of data.members) {
        if (!map.has(m.userId)) map.set(m.userId, m);
      }
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- зависим от data всех queries, мап через ref-equality
  }, [membersQueries.map((q) => q.dataUpdatedAt).join('|')]);
}
