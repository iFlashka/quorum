# Quorum

Self-hosted Discord-аналог для близкого круга (5–10 друзей). Сервер на VPS + нативный desktop-клиент под Windows на Tauri.

Спецификация — [PROJECT.md](PROJECT.md). Архитектурный контекст для AI-ассистента — [CLAUDE.md](CLAUDE.md). Записи о решениях — [docs/decisions/](docs/decisions/).

## Текущий статус

**Все 7 фаз закрыты.**

- Auth (invite-only, refresh-rotation, OS keychain).
- Текстовый чат с реалтаймом (mentions, reactions, typing, attachments, read-states).
- Presence через Redis Pub/Sub.
- System tray + close-to-tray, native toast для @mentions, autostart, unread-бейдж.
- Голосовые звонки 1:1 на peer-to-peer WebRTC + наш coturn для TURN-relay.
- Push-to-talk через global-shortcut + WebRTC-шумодав.
- Голосовые каналы через self-hosted LiveKit SFU.
- Видео и screenshare для 1:1 (peer-to-peer) и group (LiveKit).
- Auto-update через `tauri-plugin-updater` с подписью.
- GitHub Actions: CI на push/PR + release на тег `v*.*.*`.
- Полноценный Settings screen (account / voice / notifications / about).
- Production docker-compose с Caddy + Let's Encrypt + ежедневный pg_dump.

## Документация

| Документ | Кому |
|---|---|
| [docs/deploy.md](docs/deploy.md) | Развернуть сервер на VPS |
| [docs/release.md](docs/release.md) | Выпустить новую версию клиента |
| [docs/friends-guide.md](docs/friends-guide.md) | Гайд для подключающегося друга |
| [docs/decisions/](docs/decisions/) | ADR — почему сделано именно так |

## Требования к окружению (для разработки)

- **Node.js 20 LTS+** (см. [.nvmrc](.nvmrc))
- **pnpm 10.x** (`corepack enable && corepack prepare pnpm@latest --activate`)
- **Docker Desktop** для локальной инфры (postgres / redis / livekit / coturn)
- **Rust toolchain** для Tauri (см. https://rustup.rs)
- На Windows ещё **Microsoft C++ Build Tools** (Visual Studio Installer → "Desktop development with C++")

## Быстрый старт

```sh
pnpm install
pnpm infra:up                # postgres + redis + livekit + coturn в docker
pnpm dev:server              # терминал 1: Fastify hot-reload на :4421
pnpm dev:desktop             # терминал 2: Tauri-окно с hot-reload фронта
```

Дефолтный логин в dev: `admin` / `admin123`. Invite-код для регистрации второго аккаунта: `DEVCODE`.

## Команды

| | |
|---|---|
| `pnpm dev:server` | Fastify с hot-reload (`tsx watch`) |
| `pnpm dev:desktop` | Tauri dev — нативное окно |
| `pnpm dev:desktop-web` | Только фронт в браузере (без Tauri-runtime — keychain/tray fallback'ятся) |
| `pnpm build:server` | Bundle сервера через tsup → `apps/server/dist/` |
| `pnpm build:desktop` | Сборка `.msi` через `tauri build` (нужен Rust) |
| `pnpm test` | vitest по всему workspace (server testcontainers + desktop jsdom) |
| `pnpm lint` / `pnpm lint:fix` | ESLint flat config |
| `pnpm typecheck` | `tsc --noEmit` по всем пакетам |
| `pnpm infra:up` / `pnpm infra:down` | docker compose в `infra/` |

## Структура

```
quorum/
├── apps/
│   ├── server/           # Node.js + Fastify + WebSocket + Drizzle
│   └── desktop/          # Tauri 2 + React 18 + Vite
│       └── src-tauri/    # Rust (keychain, tray, плагины)
├── packages/
│   └── shared/           # общие типы, Zod-схемы, WS-протокол
├── infra/
│   ├── docker-compose.yml          # dev
│   ├── docker-compose.prod.yml     # prod (Caddy + TLS + secrets)
│   ├── Caddyfile.prod              # reverse-proxy с auto Let's Encrypt
│   ├── backup.sh                   # ежедневный pg_dump
│   └── livekit / coturn            # конфиги
├── .github/workflows/    # CI + release
├── docs/
│   ├── decisions/        # ADR-0001..0008
│   ├── deploy.md         # как развернуть
│   ├── release.md        # как выпустить версию
│   └── friends-guide.md  # для пользователей
└── .claude/memory/       # контекст для AI (синкается через git)
```

## Безопасность

- Refresh-токены в **OS keychain** (Windows Credential Manager / macOS Keychain / Linux Secret Service) через `keyring-rs`.
- TURN-credentials выдаются на 1 час (HMAC-SHA1 по RFC TURN REST API draft).
- LiveKit-токены — JWT на 6 часов с минимальными правами (canPublish + canSubscribe, без admin).
- Auto-update подпись минизайн-ключом — клиенты не примут не-подписанный update.
- Code signing для `.msi` пока **не настроен** — друзья увидят «Windows protected your PC» при первой установке. Это приемлемо для пет-проекта.

## Лицензия

`UNLICENSED` — приватный пет-проект. Не публикуй, не распространяй, не используй части этого кода в других проектах без разрешения.
