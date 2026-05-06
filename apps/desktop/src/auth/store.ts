import { create } from 'zustand';
import type { PrivateUser, PublicGuild } from '@quorum/shared';

export type AuthStatus = 'idle' | 'loading' | 'authenticated' | 'unauthenticated';

interface AuthState {
  status: AuthStatus;
  user: PrivateUser | null;
  guilds: PublicGuild[];
  /** Access-токен живёт только в памяти процесса (StrictMode → одна копия). */
  accessToken: string | null;
  /** Время истечения access — для проактивного refresh за 30s до. Не строгий контракт. */
  accessExpiresAt: number | null;
  setLoading: () => void;
  setAuthenticated: (args: {
    user: PrivateUser;
    accessToken: string;
    accessExpiresAt: number;
    guilds?: PublicGuild[];
  }) => void;
  setGuilds: (guilds: PublicGuild[]) => void;
  setAccessToken: (token: string, expiresAt: number) => void;
  setUnauthenticated: () => void;
}

export const useAuth = create<AuthState>((set) => ({
  status: 'idle',
  user: null,
  guilds: [],
  accessToken: null,
  accessExpiresAt: null,

  setLoading: () => set({ status: 'loading' }),

  setAuthenticated: ({ user, accessToken, accessExpiresAt, guilds }) =>
    set({
      status: 'authenticated',
      user,
      accessToken,
      accessExpiresAt,
      guilds: guilds ?? [],
    }),

  setGuilds: (guilds) => set({ guilds }),

  setAccessToken: (accessToken, accessExpiresAt) => set({ accessToken, accessExpiresAt }),

  setUnauthenticated: () =>
    set({
      status: 'unauthenticated',
      user: null,
      guilds: [],
      accessToken: null,
      accessExpiresAt: null,
    }),
}));

/** Селектор для не-React кода (api-client) — просто читает текущее значение. */
export function getCurrentAccessToken(): string | null {
  return useAuth.getState().accessToken;
}
