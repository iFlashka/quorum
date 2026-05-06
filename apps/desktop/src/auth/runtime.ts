/**
 * Связка: server URL → ApiClient → Session.
 * Меняется один раз при старте (после onboarding) и переинициализируется
 * если пользователь сменит сервер через настройки.
 */

import { ApiClient } from '@/api/client';
import { makeAttachmentsApi, type AttachmentsApi } from '@/api/attachments';
import { makeCallsApi, type CallsApi } from '@/api/calls';
import { makeGuildsApi, type GuildsApi } from '@/api/guilds';
import { makeLivekitApi, type LivekitApi } from '@/api/livekit';
import { makeMessagesApi, type MessagesApi } from '@/api/messages';
import { keychain, KEYCHAIN_REFRESH_TOKEN } from '@/lib/keychain';
import { WebSocketManager } from '@/realtime/WebSocketManager';
import { createSession, type Session } from './session';
import { getCurrentAccessToken, useAuth } from './store';
import type { RefreshResponse } from '@quorum/shared';

export interface AppRuntime {
  serverUrl: string;
  api: ApiClient;
  session: Session;
  guildsApi: GuildsApi;
  messagesApi: MessagesApi;
  attachmentsApi: AttachmentsApi;
  callsApi: CallsApi;
  livekitApi: LivekitApi;
  ws: WebSocketManager;
}

export function createAppRuntime(serverUrl: string): AppRuntime {
  // Объявляем api заранее, чтобы closure внутри `refreshTokens` могла на него ссылаться.
  // Сам refreshTokens не запускается синхронно — к моменту первого вызова api уже инициализирован.
  // eslint-disable-next-line prefer-const -- ленивая инициализация ниже
  let api: ApiClient;

  const refreshTokens = async (): Promise<string | null> => {
    const stored = await keychain.get(KEYCHAIN_REFRESH_TOKEN).catch(() => null);
    if (!stored) return null;
    try {
      const res = await api.request<RefreshResponse>('/auth/refresh', {
        method: 'POST',
        body: { refreshToken: stored },
        skipRefresh: true,
      });
      await keychain.set(KEYCHAIN_REFRESH_TOKEN, res.tokens.refreshToken);
      const expiresAtMs = Date.parse(res.tokens.accessTokenExpiresAt);
      useAuth.getState().setAccessToken(res.tokens.accessToken, expiresAtMs);
      return res.tokens.accessToken;
    } catch {
      await keychain.delete(KEYCHAIN_REFRESH_TOKEN).catch(() => undefined);
      return null;
    }
  };

  api = new ApiClient({
    baseUrl: serverUrl,
    getAccessToken: getCurrentAccessToken,
    refreshTokens,
    onAuthLost: () => {
      useAuth.getState().setUnauthenticated();
    },
  });

  const ws = new WebSocketManager({
    baseUrl: serverUrl,
    getAccessToken: getCurrentAccessToken,
    refreshAccess: async () => refreshTokens(),
    onAuthLost: () => {
      useAuth.getState().setUnauthenticated();
    },
  });

  return {
    serverUrl,
    api,
    session: createSession(api),
    guildsApi: makeGuildsApi(api),
    messagesApi: makeMessagesApi(api),
    attachmentsApi: makeAttachmentsApi(api, serverUrl),
    callsApi: makeCallsApi(api),
    livekitApi: makeLivekitApi(api),
    ws,
  };
}
