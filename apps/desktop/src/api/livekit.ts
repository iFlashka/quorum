import type { LivekitTokenResponse } from '@quorum/shared';
import type { ApiClient } from './client';

export interface LivekitApi {
  voiceToken: (channelId: string) => Promise<LivekitTokenResponse>;
}

export function makeLivekitApi(api: ApiClient): LivekitApi {
  return {
    voiceToken: (channelId: string) =>
      api.request<LivekitTokenResponse>(`/channels/${channelId}/voice/token`, {
        method: 'POST',
      }),
  };
}
