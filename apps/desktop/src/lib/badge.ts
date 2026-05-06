/**
 * Применяет unread-бейдж к двум видимым местам:
 *   1. Иконка в tray (Rust подменяет на «с красной точкой»).
 *   2. Заголовок окна `Quorum` ↔ `Quorum • N`. Это автоматически отражается
 *      в taskbar Windows.
 *
 * Дёргается из подписчика на realtime-store; селектор `useUnreadChannelsCount`
 * → этот wrapper.
 */

import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';

const BASE_TITLE = 'Quorum';

let lastApplied = -1;

export async function applyBadge(count: number): Promise<void> {
  if (count === lastApplied) return;
  lastApplied = count;

  await Promise.all([
    invoke('set_unread_count', { count }).catch(() => undefined),
    setWindowTitle(count).catch(() => undefined),
  ]);
}

async function setWindowTitle(count: number): Promise<void> {
  const title = count > 0 ? `${BASE_TITLE} • ${count}` : BASE_TITLE;
  try {
    await getCurrentWindow().setTitle(title);
  } catch {
    // На случай тестовой/web-среды без Tauri.
  }
}
