---
name: Stack decisions
description: Стек зафиксирован пользователем в PROJECT.md — список принятых решений и что из этого следует
type: project
---

Технологический стек **зафиксирован** в PROJECT.md и не подлежит обсуждению без явного запроса пользователя.

**Why:** пользователь уже принял эти решения сознательно и хочет, чтобы я работал в этих рамках, а не предлагал альтернативы каждый раз.

**How to apply:** не предлагать Express вместо Fastify, Prisma вместо Drizzle, Electron вместо Tauri, MediaSoup/Janus вместо LiveKit, Webpack вместо Vite, Yarn/npm вместо pnpm, Redux/Jotai вместо Zustand, MUI/Mantine вместо shadcn/ui. Если в коде попадается технически сомнительный аспект конкретного выбранного инструмента — указать на него, но не подменять стек.

## Зафиксированные решения

- **Сервер:** Node.js 20 LTS + TypeScript, Fastify + `@fastify/websocket`, PostgreSQL 16, Redis 7, Drizzle ORM, Zod (валидация и env), pino (структурированные JSON-логи), LiveKit Server SDK
- **Desktop:** Tauri 2.x, React 18 + TypeScript + Vite, TanStack Router, TanStack Query, Zustand, TailwindCSS, shadcn/ui, Lucide Icons, LiveKit Client SDK
- **Tauri plugins:** global-shortcut, notification, os, store, stronghold/keychain, autostart, updater, window-state
- **Realtime media:** self-hosted LiveKit + coturn (оба в docker-compose рядом с сервером)
- **Инфра:** Docker Compose, Caddy с автоматическим Let's Encrypt, GitHub Actions
- **Сборка:** `.msi` или `.exe` через GitHub Actions; релизы — GitHub Releases; updater подтягивает оттуда; **подписи кода нет** (платно, для друзей не критично — будут видеть SmartScreen)
- **Тесты:** Vitest, покрытие критичных частей (auth, права, отправка сообщений, WebSocket-обработчики)
- **Монорепа:** pnpm workspaces — `apps/server`, `apps/desktop`, `packages/shared`. Внутри `desktop`: `src/` фронт на React, `src-tauri/` Rust-обёртка
- **Auth:** invite-коды, login/пароль, JWT (access + refresh), refresh в OS keychain через Tauri-плагин — НЕ в localStorage
- **Файлы:** локальная директория с volume mount, абстрагировано за интерфейсом — в будущем легко перевести на S3/MinIO
- **Веб-UI:** не существует. Сервер не отдаёт HTML. Точка входа — только desktop-клиент
- **Палитра:** тёмная Discord-like, через CSS-переменные подключённые к Tailwind (`theme.extend.colors`); архитектурно готовы добавить светлую — но не сейчас
- **Шрифты:** Inter (`@fontsource/inter`) основной, JetBrains Mono для кода. **Не gg sans** (проприетарный)
- **Окно:** frameless с кастомным titlebar, минимум 1000×600, запоминание размера/позиции
