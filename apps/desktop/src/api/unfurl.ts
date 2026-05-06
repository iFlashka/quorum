import type { UnfurlResponse } from '@quorum/shared';
import { ApiError, type ApiClient } from './client';

export interface UnfurlApi {
  fetch: (url: string) => Promise<UnfurlResponse | null>;
}

export function makeUnfurlApi(api: ApiClient): UnfurlApi {
  return {
    fetch: async (url) => {
      try {
        return await api.request<UnfurlResponse>(
          `/unfurl?url=${encodeURIComponent(url)}`,
          { method: 'GET' },
        );
      } catch (err) {
        if (err instanceof ApiError && (err.status === 404 || err.status === 400)) {
          return null;
        }
        throw err;
      }
    },
  };
}
