/**
 * Session-orchestrator: соединяет ApiClient, AuthApi, keychain и zustand-стор.
 *
 * Инкапсулирует операции login/register/logout/refresh с side-effects:
 *   - сохраняет refresh-токен в OS keychain
 *   - кладёт access в in-memory store
 *   - тянет /me + guilds после успешной аутентификации
 */

import type { ApiClient } from '@/api/client';
import { makeAuthApi, type AuthApi } from '@/api/auth';
import { keychain, KEYCHAIN_REFRESH_TOKEN } from '@/lib/keychain';
import { useAuth } from './store';
import type { LoginRequest, RegisterRequest } from '@quorum/shared';

export interface Session {
  api: ApiClient;
  auth: AuthApi;
  bootstrap: () => Promise<void>;
  login: (req: LoginRequest) => Promise<void>;
  register: (req: RegisterRequest) => Promise<void>;
  logout: () => Promise<void>;
}

export function createSession(api: ApiClient): Session {
  const auth = makeAuthApi(api);

  const finalizeAuthSuccess = async (
    accessToken: string,
    refreshToken: string,
    accessTokenExpiresAt: string,
  ): Promise<void> => {
    await keychain.set(KEYCHAIN_REFRESH_TOKEN, refreshToken);
    const expiresAtMs = Date.parse(accessTokenExpiresAt);

    // Сначала кладём access в store — иначе следующий вызов auth.me() пойдёт
    // через ApiClient.getAccessToken() и увидит null.
    useAuth.getState().setAccessToken(accessToken, expiresAtMs);

    const me = await auth.me().catch(() => null);
    if (me) {
      useAuth.getState().setAuthenticated({
        user: me.user,
        accessToken,
        accessExpiresAt: expiresAtMs,
        guilds: me.guilds,
      });
    }
  };

  return {
    api,
    auth,
    async bootstrap(): Promise<void> {
      useAuth.getState().setLoading();
      const stored = await keychain.get(KEYCHAIN_REFRESH_TOKEN).catch(() => null);
      if (!stored) {
        useAuth.getState().setUnauthenticated();
        return;
      }
      try {
        const res = await auth.refresh(stored);
        await finalizeAuthSuccess(
          res.tokens.accessToken,
          res.tokens.refreshToken,
          res.tokens.accessTokenExpiresAt,
        );
      } catch {
        await keychain.delete(KEYCHAIN_REFRESH_TOKEN).catch(() => undefined);
        useAuth.getState().setUnauthenticated();
      }
    },

    async login(req): Promise<void> {
      const res = await auth.login(req);
      await finalizeAuthSuccess(
        res.tokens.accessToken,
        res.tokens.refreshToken,
        res.tokens.accessTokenExpiresAt,
      );
    },

    async register(req): Promise<void> {
      const res = await auth.register(req);
      await finalizeAuthSuccess(
        res.tokens.accessToken,
        res.tokens.refreshToken,
        res.tokens.accessTokenExpiresAt,
      );
    },

    async logout(): Promise<void> {
      const stored = await keychain.get(KEYCHAIN_REFRESH_TOKEN).catch(() => null);
      if (stored) {
        await auth.logout(stored).catch(() => undefined);
      }
      await keychain.delete(KEYCHAIN_REFRESH_TOKEN).catch(() => undefined);
      useAuth.getState().setUnauthenticated();
    },
  };
}
