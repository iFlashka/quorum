---
name: UI polish + sounds (post-фаза-7, 2026-05-06)
description: Discord-style правки UI и звуковая система — что сделано, какие места могут потребовать продолжения
type: project
---

После закрытия 7 фаз пользователь попросил «UI как у Discord» + банальные звуки.
Сделано серией коммитов d443a97 → 1a0b925 (7 коммитов).

**Why:** требование — приблизить визуал/UX к актуальному Discord 2026, плюс
закрыть полностью отсутствующую звуковую обратную связь (события голоса, ping
на @mention, etc).

**How to apply:**
- Звуки — собственный синтез в `scripts/gen-sounds.mjs`, регенерируется через
  `pnpm gen:sounds`. WAV-файлы коммитятся в `apps/desktop/public/sounds/`.
- SoundManager: `apps/desktop/src/audio/sounds.ts` (preload, play/playLoop).
- Per-event toggles + master volume: `apps/desktop/src/state/sound-prefs.ts`,
  персистится через `tauri-plugin-store` (sound-prefs.json).
- Привязки к событиям: `apps/desktop/src/audio/effects.ts` — subscribe-функции
  на `useVoice` (1:1 phase), `useChannelVoice` (join/leave), плюс `maybePlay*Sound`
  для message/mention из onMessageCreate в App.tsx.
- Все звуки уважают глобальный `useNotificationPrefs.muted`.
- Discord-овские sample использовать НЕЛЬЗЯ (копирайт). Можно подменить файлы в
  `public/sounds/*.wav` своими.

UI-сдвиги:
- mention pill: `<span class="mention">` → синий pill, `<span class="mention mention-me">`
  → янтарный pill. Сообщение с mention-me получает жёлтую полосу слева
  (см. globals.css + Message.tsx).
- MemberAvatar (`apps/desktop/src/components/shell/MemberAvatar.tsx`) — единый
  компонент аватара с Discord-style portal-popover (банер, имя, статус, роль,
  кнопка «Позвонить»). Используется в Message, MemberList, VoiceChannelMembers.
  Свой аватар → disablePopover.
- ServerList: prefetch'ит каналы всех гилд, рисует короткую белую pill для
  unread (если не активная) + красный mention-badge с числом @me-mentions.
  Mentions хранятся в `useRealtime.mentionsByChannel` и обнуляются на markRead.
- CallPlate (`apps/desktop/src/components/voice/CallPlate.tsx`) — переезд audio-only
  1:1-плашки из bottom-floating в нижнюю часть ChannelSidebar (как у Discord).
  CallOverlay теперь — только ringing-modal и fullscreen-video.

Settings → «Уведомления»: добавлен подраздел «Звуки» со слайдером громкости и
тогглами (call/mention/message/voice-join-leave) + кнопка «Прослушать» каждого
семпла.

Потенциальные продолжения если запросит юзер:
- Reply-функция (требует server-side replyToId колонки + миграции) — НЕ сделано.
- Threads — нет.
- Member popover показывает только role/status; banner/bio/«в общих серверах»
  отсутствуют.
- Search в ChatArea header не работает — кнопка декоративная.
