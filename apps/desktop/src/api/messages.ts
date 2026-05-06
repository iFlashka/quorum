import type {
  EditMessageRequest,
  ListMessagesQuery,
  ListMessagesResponse,
  MarkReadRequest,
  MessageResponse,
  SendMessageRequest,
} from '@quorum/shared';
import type { ApiClient } from './client';

export interface MessagesApi {
  list: (channelId: string, query?: Partial<ListMessagesQuery>) => Promise<ListMessagesResponse>;
  send: (channelId: string, req: SendMessageRequest) => Promise<MessageResponse>;
  edit: (channelId: string, msgId: string, req: EditMessageRequest) => Promise<MessageResponse>;
  delete: (channelId: string, msgId: string) => Promise<void>;
  reactionAdd: (channelId: string, msgId: string, emoji: string) => Promise<void>;
  reactionRemove: (channelId: string, msgId: string, emoji: string) => Promise<void>;
  markRead: (channelId: string, req: MarkReadRequest) => Promise<void>;
}

export function makeMessagesApi(api: ApiClient): MessagesApi {
  return {
    list: (channelId, query = {}) => {
      const params = new URLSearchParams();
      if (query.before) params.set('before', query.before);
      if (query.after) params.set('after', query.after);
      if (query.limit !== undefined) params.set('limit', String(query.limit));
      const qs = params.toString();
      return api.request<ListMessagesResponse>(
        `/channels/${channelId}/messages${qs ? `?${qs}` : ''}`,
        { method: 'GET' },
      );
    },
    send: (channelId, req) =>
      api.request<MessageResponse>(`/channels/${channelId}/messages`, {
        method: 'POST',
        body: req,
      }),
    edit: (channelId, msgId, req) =>
      api.request<MessageResponse>(`/channels/${channelId}/messages/${msgId}`, {
        method: 'PATCH',
        body: req,
      }),
    delete: (channelId, msgId) =>
      api.request<void>(`/channels/${channelId}/messages/${msgId}`, { method: 'DELETE' }),
    reactionAdd: (channelId, msgId, emoji) =>
      api.request<void>(
        `/channels/${channelId}/messages/${msgId}/reactions/${encodeURIComponent(emoji)}`,
        { method: 'PUT' },
      ),
    reactionRemove: (channelId, msgId, emoji) =>
      api.request<void>(
        `/channels/${channelId}/messages/${msgId}/reactions/${encodeURIComponent(emoji)}`,
        { method: 'DELETE' },
      ),
    markRead: (channelId, req) =>
      api.request<void>(`/channels/${channelId}/read`, { method: 'POST', body: req }),
  };
}
