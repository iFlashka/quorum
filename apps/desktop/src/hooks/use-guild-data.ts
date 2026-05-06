import { useQuery } from '@tanstack/react-query';
import type {
  ListChannelsResponse,
  ListGuildsResponse,
  ListMembersResponse,
} from '@quorum/shared';
import { useRuntime } from '@/auth/runtime-store';

export function useGuilds() {
  const guildsApi = useRuntime((s) => s.runtime?.guildsApi);
  return useQuery<ListGuildsResponse>({
    queryKey: ['guilds'],
    queryFn: () => {
      if (!guildsApi) throw new Error('runtime_not_ready');
      return guildsApi.list();
    },
    enabled: !!guildsApi,
  });
}

export function useGuildChannels(guildId: string | null | undefined) {
  const guildsApi = useRuntime((s) => s.runtime?.guildsApi);
  return useQuery<ListChannelsResponse>({
    queryKey: ['channels', guildId],
    queryFn: () => {
      if (!guildsApi || !guildId) throw new Error('runtime_or_guild_not_ready');
      return guildsApi.channels(guildId);
    },
    enabled: !!guildsApi && !!guildId,
  });
}

export function useGuildMembers(guildId: string | null | undefined) {
  const guildsApi = useRuntime((s) => s.runtime?.guildsApi);
  return useQuery<ListMembersResponse>({
    queryKey: ['members', guildId],
    queryFn: () => {
      if (!guildsApi || !guildId) throw new Error('runtime_or_guild_not_ready');
      return guildsApi.members(guildId);
    },
    enabled: !!guildsApi && !!guildId,
  });
}
