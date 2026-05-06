import type { TurnCredentialsResponse } from '@quorum/shared';
import type { ApiClient } from './client';

export interface CallsApi {
  turnCredentials: () => Promise<TurnCredentialsResponse>;
}

export function makeCallsApi(api: ApiClient): CallsApi {
  return {
    turnCredentials: () => api.request<TurnCredentialsResponse>('/turn/credentials'),
  };
}
