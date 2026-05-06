/**
 * Тонкий wrapper над `@tauri-apps/plugin-notification`. Логика «когда показать
 * нативный toast» решается тут, чтобы realtime-bridge оставался без знаний
 * про окно, фокус, mute и т.п.
 *
 * Правило:
 *   - не шлём, если приложение запущено и окно сфокусировано
 *   - не шлём, если включён mute
 *   - не шлём для своих же сообщений
 *   - шлём только для @mention или reply-to-me (DM появятся в фазе 4+)
 */

import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { PublicMessage } from '@quorum/shared';
import { useNotificationPrefs } from '@/state/notification-prefs';

let permissionEnsured: Promise<boolean> | null = null;

async function ensurePermission(): Promise<boolean> {
  if (permissionEnsured) return permissionEnsured;
  permissionEnsured = (async () => {
    if (await isPermissionGranted()) return true;
    const result = await requestPermission();
    return result === 'granted';
  })();
  return permissionEnsured;
}

interface MentionContext {
  message: PublicMessage;
  /** Имя канала, например "general" — рендерим как "#general". */
  channelName: string;
  /** Авторские identity для заголовка. */
  authorDisplayName: string;
}

/**
 * Решает, надо ли уведомить пользователя, и шлёт нативный toast если да.
 * Безопасно вызывать на каждый message.create — внутри сам отфильтрует.
 */
export async function maybeNotifyMention(
  ctx: MentionContext,
  meId: string,
): Promise<void> {
  // Свои сообщения — никогда.
  if (ctx.message.author.id === meId) return;

  // Mention или reply-to-me?
  const isMention = ctx.message.mentionedUserIds.includes(meId);
  if (!isMention) return;

  // Mute от пользователя.
  if (useNotificationPrefs.getState().muted) return;

  // Окно живо и сфокусировано → юзер и так видит, тост лишний.
  if (await isWindowFocused()) return;

  if (!(await ensurePermission())) return;

  sendNotification({
    title: `${ctx.authorDisplayName} в #${ctx.channelName}`,
    body: previewText(ctx.message.content),
  });
}

/** Reset permission cache — для тестов. */
export function _resetPermissionCache(): void {
  permissionEnsured = null;
}

async function isWindowFocused(): Promise<boolean> {
  try {
    const win = getCurrentWindow();
    const [visible, focused] = await Promise.all([win.isVisible(), win.isFocused()]);
    return visible && focused;
  } catch {
    // На случай если окна нет (тестовая среда) — считаем что не сфокусировано.
    return false;
  }
}

const PREVIEW_LIMIT = 140;
function previewText(content: string): string {
  // Замьюшенные `<@uuid>` свернём в `@?` — пользователь не должен видеть UUID.
  const cleaned = content.replace(/<@[0-9a-f-]{36}>/gi, '@…').trim();
  if (cleaned.length <= PREVIEW_LIMIT) return cleaned;
  return cleaned.slice(0, PREVIEW_LIMIT - 1) + '…';
}
