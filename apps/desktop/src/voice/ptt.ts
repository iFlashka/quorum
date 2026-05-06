/**
 * Push-to-talk через `tauri-plugin-global-shortcut`. Один глобальный хоткей
 * регистрируется только когда mode === 'push-to-talk' и есть активный звонок;
 * unregister когда нет.
 *
 * Поведение клавиши:
 *   keyDown → mic enabled (если был muted из-за PTT)
 *   keyUp   → mic disabled
 *
 * Mute из меню/UI — вне PTT логики и имеет приоритет: если юзер вручную ставит
 * mute, PTT всё равно его соблюдает (мик остаётся выключен пока пользователь
 * сам не разрешит).
 */

import {
  isRegistered,
  register,
  unregister,
  type ShortcutEvent,
} from '@tauri-apps/plugin-global-shortcut';

export interface PttBindingDeps {
  /** Зовётся когда юзер нажал клавишу (PTT down). */
  onPress: () => void;
  /** Зовётся когда юзер отпустил. */
  onRelease: () => void;
}

let activeShortcut: string | null = null;

export async function bindPtt(shortcut: string, deps: PttBindingDeps): Promise<void> {
  if (activeShortcut === shortcut) return;
  await unbindPtt();
  try {
    await register(shortcut, (event: ShortcutEvent) => {
      if (event.state === 'Pressed') deps.onPress();
      else if (event.state === 'Released') deps.onRelease();
    });
    activeShortcut = shortcut;
  } catch {
    // Хоткей занят другим приложением или недопустим — оставляем VAD.
  }
}

export async function unbindPtt(): Promise<void> {
  if (!activeShortcut) return;
  try {
    if (await isRegistered(activeShortcut)) {
      await unregister(activeShortcut);
    }
  } catch {
    // ignore
  }
  activeShortcut = null;
}
