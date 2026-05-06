/**
 * Wrapper над `@tauri-apps/plugin-updater`. Проверяет наличие новой версии
 * через signed-manifest endpoint (см. tauri.conf.json::plugins.updater).
 *
 * - При успешной проверке отдаёт `Update`-объект (или null если up-to-date).
 * - Скачивание + установка триггерят перезапуск через `tauri-plugin-process`.
 * - В web-режиме (без Tauri runtime) тихо отдаёт null — не падаем.
 */

import { check as tauriCheck, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export interface UpdateInfo {
  version: string;
  currentVersion: string;
  date?: string;
  body?: string;
}

export async function checkForUpdate(): Promise<{
  info: UpdateInfo;
  install: () => Promise<void>;
} | null> {
  if (!isTauri) return null;
  let update: Update | null;
  try {
    update = await tauriCheck();
  } catch {
    return null;
  }
  if (!update) return null;

  const info: UpdateInfo = {
    version: update.version,
    currentVersion: update.currentVersion,
    date: update.date,
    body: update.body,
  };
  return {
    info,
    install: async (): Promise<void> => {
      // downloadAndInstall качает + устанавливает + (на Windows) перезапускает.
      // На Linux/Mac иногда нужен явный relaunch — делаем явно для надёжности.
      await update.downloadAndInstall();
      try {
        await relaunch();
      } catch {
        // Если процесс уже перезапускается — relaunch может выкинуть.
      }
    },
  };
}
