import type {
  ListChannelsResponse,
  ListGuildsResponse,
  ListMembersResponse,
} from '@quorum/shared';
import type { ApiClient } from './client';

export interface GuildsApi {
  list: () => Promise<ListGuildsResponse>;
  channels: (guildId: string) => Promise<ListChannelsResponse>;
  members: (guildId: string) => Promise<ListMembersResponse>;
}

export function makeGuildsApi(api: ApiClient): GuildsApi {
  return {
    list: () => api.request<ListGuildsResponse>('/guilds', { method: 'GET' }),
    channels: (guildId) =>
      api.request<ListChannelsResponse>(`/guilds/${guildId}/channels`, { method: 'GET' }),
    members: (guildId) =>
      api.request<ListMembersResponse>(`/guilds/${guildId}/members`, { method: 'GET' }),
  };
}
