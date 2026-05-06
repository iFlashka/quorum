---
name: Phase 3 desktop integration decisions
description: Tray, native notifications, window-state, autostart, unread badge — конкретные решения и нюансы Tauri 2.x
type: project
---

Решения по desktop-фазе. Отвечают «почему так» — детали кода в `apps/desktop/src-tauri/src/tray.rs`, `apps/desktop/src/lib/notifications.ts`, `apps/desktop/src/state/notification-prefs.ts`. Полная мотивация — в `docs/decisions/0005-tray-and-notifications.md`.

**Why:** Tauri 2.x плагины и tray API не самые очевидные на первый взгляд (особенно нюансы с Wry runtime, lifetimes у Image, отсутствием менюшного API на TrayIcon); нужно зафиксировать чтобы не пере-открывать те же грабли при работе на ту же область в фазах 4–7.

**How to apply:** при правках tray, notifications, autostart или window-state в desktop — сверяться с этими решениями; если меняешь принцип, обновляй ADR 0005 и эту запись.

## Ключевые решения

### Tauri features для tray и иконок

`tauri = { version = "2", features = ["tray-icon", "image-png"] }`. Без `tray-icon` нет `tauri::tray`, без `image-png` нет `Image::from_bytes` для PNG. ICO для главных иконок собирается `pnpm tauri icon ./src-tauri/icons/source.svg` (генерит 32/128/256 + ico + дополнительные iOS/Android, последние не используются).

### Wry-конкретный TrayState (а не generic R: Runtime)

`TrayState` хранит `Mutex<Option<CheckMenuItem<Wry>>>` для зеркаления mute-toggle. `app.manage<T>(...)` требует `Send + Sync + 'static`, а с generic `R` пришлось бы прокидывать тип через всё дерево state-зависимостей. Бинарь только Wry — поэтому hardcode оправдан. `tauri::Wry` импортируется из `tauri`.

### Mute-toggle: источник истины в Rust, зеркало в zustand+tauri-store

Tray-меню видно когда окна нет → не может зависеть от React. Поэтому Rust `TrayState.muted` → событие `tray://mute-toggled` → фронт ловит и обновляет zustand + persist. Обратное направление: zustand → `invoke('set_mute_state')` → Rust обновляет state и `CheckMenuItem.set_checked()`.

### Mention-фильтр — единое место, bridge не знает контекст

`realtime-bridge` принимает `onMessageCreate(message)` колбэк. App.tsx зашивает: lookup channelName через `findChannelName(qc, channelId)` (обходит `['channels', *]` кеши) → `maybeNotifyMention(ctx, meId)`. Внутри `notifications.ts` цепочка фильтров: свой / не-mention / muted / окно сфокусировано / нет permission. `requestPermission` лениво один раз закешировано.

### Unread badge — подмена tray-иконки + setTitle

Tauri 2.x не даёт overlay-icon API. Готовим две PNG (`32x32.png` + сгенерированный `tray-unread.png` с красной точкой); `apply_unread(count)` подменяет icon и tooltip. Параллельно `getCurrentWindow().setTitle('Quorum • N')` — Windows автоматически отражает в taskbar. `applyBadge()` дедуплицирует по последнему значению.

### Autostart с `--minimized`

`tauri_plugin_autostart::init` принимает массив args. В `setup()` чекаем `std::env::args()` и при наличии флага сразу `window.hide()`. Иначе автозапуск каждое утро всплывал бы окном — антипаттерн.

### Иконки

- `apps/desktop/src-tauri/icons/source.svg` — фирменная статичная иконка (круг с разрывом + хвостик).
- `_gen.ps1` теперь только генерит `tray-unread.png` поверх `32x32.png` (наложение красной точки). Главные иконки делает `tauri icon`.
- Скрипт надо хранить в **UTF-16 LE с BOM** для Windows PowerShell 5.1, иначе ParseException на не-ASCII комментах.
- `apps/desktop/src/assets/splash-loop.svg` — анимированная версия для bootstrap-экрана. Подключена через `<img src>` (SMIL-анимация работает в WebView2 из коробки).

## Известные ограничения, отложенные на фазу 7

- Per-channel/per-guild mute (сейчас глобальный).
- Click-через-toast → конкретный канал (Tauri 2.x ограничение).
- macOS-специфическое close-vs-quit поведение.
- Native overlay-icon на window-icon (Windows ITaskbarList3) — Tauri не экспонирует.
