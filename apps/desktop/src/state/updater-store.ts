/**
 * Стор для UI-состояния автообновлений: «есть ли что обновить», «идёт
 * установка», «когда последняя проверка». Используется toast'ом и
 * Settings → «О программе» (фаза 7C).
 */

import { create } from 'zustand';
import type { UpdateInfo } from '@/lib/updater';

interface UpdaterState {
  /** Если есть — найдена новая версия. */
  pending: { info: UpdateInfo; install: () => Promise<void> } | null;
  /** Когда мы последний раз делали check (мс epoch). */
  lastCheckedAt: number | null;
  /** True пока install в процессе. */
  installing: boolean;
  /** Toast уже показан для этой версии — чтобы не дёргать каждый чек. */
  shownForVersion: string | null;

  setPending: (p: UpdaterState['pending']) => void;
  setLastChecked: (ts: number) => void;
  setInstalling: (v: boolean) => void;
  markShown: (version: string) => void;
}

export const useUpdater = create<UpdaterState>((set) => ({
  pending: null,
  lastCheckedAt: null,
  installing: false,
  shownForVersion: null,

  setPending: (pending) => set({ pending }),
  setLastChecked: (lastCheckedAt) => set({ lastCheckedAt }),
  setInstalling: (installing) => set({ installing }),
  markShown: (shownForVersion) => set({ shownForVersion }),
}));
