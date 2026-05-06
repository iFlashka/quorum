import type {
  EditDmMessageRequest,
  EditDmMessageResponse,
  ListDmChannelsResponse,
  ListDmMessagesResponse,
  OpenDmChannelResponse,
  SendDmMessageRequest,
  SendDmMessageResponse,
} from '@quorum/shared';
import type { ApiClient } from './client';

export interface DmApi {
  list: () => Promise<ListDmChannelsResponse>;
  openWith: (userId: string) => Promise<OpenDmChannelResponse>;
  messages: (
    dmId: string,
    args?: { limit?: number; before?: string },
  ) => Promise<ListDmMessagesResponse>;
  send: (dmId: string, body: SendDmMessageRequest) => Promise<SendDmMessageResponse>;
  edit: (
    dmId: string,
    msgId: string,
    body: EditDmMessageRequest,
  ) => Promise<EditDmMessageResponse>;
  delete: (dmId: string, msgId: string) => Promise<void>;
}

export function makeDmApi(api: ApiClient): DmApi {
  return {
    list: () => api.request<ListDmChannelsResponse>('/dm', { method: 'GET' }),
    openWith: (userId) =>
      api.request<OpenDmChannelResponse>(`/dm/with/${userId}`, { method: 'POST' }),
    messages: (dmId, args = {}) => {
      const params = new URLSearchParams();
      if (args.limit) params.set('limit', String(args.limit));
      if (args.before) params.set('before', args.before);
      const qs = params.toString();
      return api.request<ListDmMessagesResponse>(
        `/dm/${dmId}/messages${qs ? '?' + qs : ''}`,
        { method: 'GET' },
      );
    },
    send: (dmId, body) =>
      api.request<SendDmMessageResponse>(`/dm/${dmId}/messages`, {
        method: 'POST',
        body,
      }),
    edit: (dmId, msgId, body) =>
      api.request<EditDmMessageResponse>(`/dm/${dmId}/messages/${msgId}`, {
        method: 'PATCH',
        body,
      }),
    delete: (dmId, msgId) =>
      api
        .request<void>(`/dm/${dmId}/messages/${msgId}`, { method: 'DELETE' })
        .then(() => undefined),
  };
}
