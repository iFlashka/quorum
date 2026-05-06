/**
 * Глобальный стор runtime — чтобы любой компонент мог получить session
 * без prop-drilling и инициировать logout / switch server.
 */

import { create } from 'zustand';
import { clearServerConfig } from '@/lib/server-config';
import type { AppRuntime } from './runtime';

interface RuntimeState {
  runtime: AppRuntime | null;
  setRuntime: (rt: AppRuntime | null) => void;
  /** Логаут: session.logout (revoke refresh) → unauthenticated. */
  logout: () => Promise<void>;
  /** Сменить сервер: чистим store + сбрасываем runtime → App вернёт на onboarding. */
  switchServer: () => Promise<void>;
}

export const useRuntime = create<RuntimeState>((set, get) => ({
  runtime: null,
  setRuntime: (runtime) => set({ runtime }),

  async logout(): Promise<void> {
    const rt = get().runtime;
    if (rt) await rt.session.logout();
  },

  async switchServer(): Promise<void> {
    await clearServerConfig().catch(() => undefined);
    const rt = get().runtime;
    if (rt) await rt.session.logout().catch(() => undefined);
    set({ runtime: null });
  },
}));
