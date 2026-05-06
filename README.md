# Quorum

Self-hosted Discord-аналог для близкого круга (5–10 друзей). Сервер на VPS + нативный desktop-клиент под Windows на Tauri.

Спецификация — [PROJECT.md](PROJECT.md). Архитектурный контекст для AI-ассистента — [CLAUDE.md](CLAUDE.md). Записи о решениях — [docs/decisions/](docs/decisions/).

## Текущий статус

**Фаза 0 — Bootstrap.** Скелет монорепы, статичный three-column shell, инфра в docker-compose, заготовки. Готовится к подтверждению.

См. полный план фаз в [PROJECT.md](PROJECT.md#план-работы--фазы).

## Требования к окружению

- **Node.js 20 LTS+** (рекомендуется через nvm-windows / fnm; см. [.nvmrc](.nvmrc))
- **pnpm 10.x** (включается через `corepack enable && corepack prepare pnpm@latest --activate`)
- **Docker Desktop** для локальной инфры (postgres/redis/livekit/coturn)
- **Rust toolchain** для сборки Tauri (только если запускаешь `pnpm dev:desktop`):
  - Скачать `rustup-init.exe` с https://rustup.rs и поставить (займёт ~2 ГБ).
  - На Windows нужен ещё **Microsoft C++ Build Tools** (Visual Studio Installer → "Desktop development with C++").
  - WebView2 уже стоит в Windows 11.
- **Git** (чтобы коммитить и пушить)

## Быстрый старт (фаза 0)

```sh
# 1. Установить зависимости
pnpm install

# 2. Поднять инфру
pnpm infra:up

# 3. Запустить сервер (в одном терминале) — проверка GET http://localhost:3000/health
pnpm dev:server

# 4. Запустить desktop-клиент (в другом терминале)
pnpm dev:desktop          # полноценный нативный запуск (нужен Rust)
pnpm dev:desktop-web      # быстрая отладка фронта в браузере без Rust
```

## Команды

| | |
|---|---|
| `pnpm dev:server` | Fastify-сервер с hot-reload (`tsx watch`) |
| `pnpm dev:desktop` | Tauri dev — нативное окно с hot-reload |
| `pnpm dev:desktop-web` | только фронт в браузере, без Tauri/Rust |
| `pnpm build:desktop` | собрать `.msi` инсталлятор (фаза 7 — добавится подпись и updater) |
| `pnpm build:server` | собрать сервер в `dist/` |
| `pnpm test` | все vitest-тесты по workspace |
| `pnpm lint` / `pnpm lint:fix` | ESLint flat config |
| `pnpm format` / `pnpm format:check` | Prettier |
| `pnpm typecheck` | `tsc --noEmit` по всем пакетам |
| `pnpm infra:up` / `pnpm infra:down` / `pnpm infra:logs` | docker compose в `infra/` |

## Структура

```
quorum/
├── apps/
│   ├── server/          # Node.js + Fastify + WebSocket + Drizzle
│   └── desktop/         # Tauri 2 + React 18 + Vite
│       └── src-tauri/   # Rust-обёртка
├── packages/
│   └── shared/          # общие типы, Zod-схемы, API-контракты
├── infra/               # docker-compose, LiveKit, coturn, Caddy
├── docs/decisions/      # ADR
├── .claude/memory/      # контекст для AI-ассистента (синкается через git)
├── PROJECT.md           # спек
└── CLAUDE.md            # auto-load контекст для Claude Code
```

## Auto-update (заложено сейчас, реализуется в фазе 7)

Версия `0.0.1` синхронно живёт в [apps/desktop/package.json](apps/desktop/package.json) и [apps/desktop/src-tauri/tauri.conf.json](apps/desktop/src-tauri/tauri.conf.json). В фазе 7 GitHub Actions начнёт собирать `.msi` на каждый тег `v*.*.*`, подписывать его Tauri signer-ключом и публиковать в GitHub Release.

См. [ADR-0002](docs/decisions/0002-auto-update-architecture.md) и [project_auto_update.md](.claude/memory/project_auto_update.md).

## Безопасность

- Refresh-токены хранятся в OS keychain через Tauri-плагин (фаза 1), не в localStorage.
- Code signing (`.msi` для Microsoft SmartScreen) **НЕ настроен** — друзья увидят предупреждение «Windows protected your PC» при первой установке. Это приемлемо для пет-проекта.
- Подпись манифеста updater (Ed25519) — обязательна, настраивается в фазе 7. Приватный ключ **не коммитится** в репо (см. [.gitignore](.gitignore)).

## Лицензия

`UNLICENSED` — приватный пет-проект. Не публикуй, не распространяй, не используй части этого кода в других проектах без разрешения.
