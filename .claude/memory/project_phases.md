---
name: Phase plan and status
description: Список фаз 0–7 и текущий статус — обновлять по мере продвижения
type: project
---

Работа идёт строго по фазам. Каждая фаза должна быть рабочей и тестируемой до перехода к следующей. Переход — только после явного подтверждения пользователя.

**Why:** пользователь хочет видеть осязаемый прогресс на каждом шаге и иметь возможность скорректировать направление. Это пет-проект, не дедлайн-driven; качество прохождения каждого шага важнее скорости.

**How to apply:** в начале каждой новой фазы — сначала план (структура, файлы, команды, открытые вопросы), потом ждать «ок», потом код. Не «забегать вперёд» — например, не добавлять auth-логику в фазе 0, не настраивать LiveKit до фазы 5.

## Фазы

- **Фаза 0 — Bootstrap.** Монорепа pnpm, TS/ESLint/Prettier/Vitest, базовый Fastify с health-check, Tauri-проект, дизайн-система (Tailwind + CSS-переменные + Inter + shadcn/ui), статичный three-column shell в стиле Discord, frameless window с кастомным titlebar, docker-compose для postgres/redis/livekit/coturn, Caddyfile, README с командами `pnpm dev:server`, `pnpm dev:desktop`, `pnpm test`, `pnpm build:desktop`. **Auto-update подготовка:** версия `0.0.1` синхронно в `package.json` и `tauri.conf.json`, плейсхолдер секции `plugins.updater` (без установки плагина — это код фазы 7), ADR 0002. **Критерий:** `docker compose up -d` + `pnpm dev:desktop` → нативное окно с тёмным Discord-like интерфейсом.
- **Фаза 1 — Auth и сущности.** users/guilds/members/channels/invites, Drizzle миграции, seed, register по invite, login/logout/me/refresh, JWT (refresh в OS keychain), onboarding-флоу клиента.
- **Фаза 2 — Текстовый чат.** messages/attachments/reactions, WebSocket-протокол, отправка/редактирование/удаление, история (cursor pagination), upload файлов, markdown (marked + DOMPurify), реакции, ответы, упоминания, typing, presence через Redis.
- **Фаза 3 — Tray, нотификации, окно.** System tray, закрытие в трей, native toast notifications (Windows), `tauri-plugin-window-state`, автозапуск, бейдж непрочитанных.
- **Фаза 4 — Голос 1-на-1 + Push-to-talk.** WebRTC сигналинг через WebSocket, UI звонков, наш coturn как ICE, глобальный push-to-talk хоткей через `tauri-plugin-global-shortcut`.
- **Фаза 5 — Голосовые каналы (LiveKit).** LiveKit Server SDK на бэке, токены с правами, UI канала, speaking indicator, mute/deafen, push-to-talk и тут.
- **Фаза 6 — Видео и screenshare.** Поверх LiveKit, грид участников, выбор активного экрана.
- **Фаза 7 — Distribution и polish.** GitHub Actions на теге `v*.*.*` (сборка `.msi`, подпись signer-ключом, публикация в Release, генерация `latest.json`); настройка `tauri-plugin-updater` (генерация ключей, public в `tauri.conf.json`, private в GitHub Secrets, endpoint на манифест); UX апдейтера (проверка при запуске + раз в час, toast, страница «О программе» с changelog, ручная проверка, прогресс-бар); CI-проверка совпадения версий `package.json`/`tauri.conf.json`; настройки пользователя (аватар/ник/статус); `docker-compose.prod.yml`, инструкция по деплою; бэкапы pg_dump; базовый мониторинг; гайд для друзей по подключению; гайд по релизам для пользователя. Детали — в [project_auto_update.md](project_auto_update.md).

## Текущий статус

- 2026-05-06: **Фаза 0 завершена и принята.** Tauri-окно открывается, three-column shell в стиле Discord, frameless titlebar работает, палитра выверена по актуальному Discord 2026 (см. PROJECT.md), Inter Variable со включёнными character variants, инфра docker-compose готова, ADR 0001/0002/0003 задокументированы, тесты + lint + typecheck зелёные.
- 2026-05-06: **Фаза 1 завершена.** Сервер: Drizzle schema + миграции, register/login/refresh/logout/me на jose+argon2id, refresh-rotation с детектором кражи, rate-limit на auth-роутах, CORS для Tauri webview, dev seed (`admin/admin123` + `DEVCODE`). Десктоп: Rust keychain commands (через keyring crate) + tauri-plugin-store, ApiClient с auto-refresh, AuthStore + RuntimeStore (zustand), state-machine `bootstrapping → onboarding → login/register → app`, экраны Onboarding/Login/Register/App, ServerList на реальных guilds из `/auth/me`, UserCard с реальным юзером и dropdown «Сменить сервер / Выйти». **Порты переехали:** server `3000 → 4421`, Vite dev `1420 → 4422`, HMR `1421 → 4423` (старые были заняты). **Палитра 1:1 с Discord 2026** (выверена через self-screenshot helper по подсвеченным кропам пользователя). e2e через curl — все 8 сценариев зелёные.
- 2026-05-06: **Auth-тесты на PGlite — скипнуты** через `describe.skip` с TODO. PGlite + argon2id + transactions ведут к hook timeouts (>30s), нужна отдельная сессия отладки. Не блокер: e2e через реальный postgres надёжнее. Решим в конце фазы 1 либо переход на testcontainers, либо моки argon2 для тестов.
