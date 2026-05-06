# Quorum — гайд для Claude

Этот файл загружается автоматически в начале каждой сессии. Он краткий — детали в [PROJECT.md](PROJECT.md) и в [.claude/memory/](.claude/memory/).

## Что это

**Quorum** — self-hosted Discord-аналог для 5–10 друзей. Сервер на VPS (~4 vCPU / 8 GB), нативный desktop-клиент под Windows на Tauri. Это пет-проект, не SaaS. Полный спек — в [PROJECT.md](PROJECT.md).

## Стек (фиксирован — не предлагай альтернативы без явного запроса)

- **Сервер:** Node.js 20 LTS + TypeScript, Fastify, `@fastify/websocket`, PostgreSQL 16, Redis 7, Drizzle ORM, Zod, pino, LiveKit Server SDK
- **Desktop:** Tauri 2.x + React 18 + Vite + TanStack Router/Query + Zustand + Tailwind + shadcn/ui + Lucide + LiveKit Client SDK
- **Realtime media:** self-hosted LiveKit (SFU) + coturn
- **Инфра:** Docker Compose, Caddy (Let's Encrypt), GitHub Actions
- **Тесты:** Vitest
- **Монорепа:** pnpm workspaces — `apps/server`, `apps/desktop`, `packages/shared`

## Как работаем

Основные правила задаются в самом PROJECT.md (секция «Как мне работать с тобой»). Из ключевого:

1. **Работа по фазам.** Не начинай следующую фазу, пока я не подтвердил, что текущая работает.
2. **Сначала план — потом код.** В начале каждой фазы покажи структуру/файлы/команды и дождись «ок».
3. **Маленькие коммиты, Conventional Commits** (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`).
4. **Не угадывай.** Если есть несколько разумных решений — спроси.
5. **Если моё требование технически плохое — скажи.**
6. **Не пиши код в чат.** Чат для обсуждения, код — в файлы.
7. **TypeScript strict mode везде.** Никаких `any` без комментария почему.
8. **Tauri IPC только через `#[tauri::command]`,** никакой эмуляции в JS, если есть нативный путь.
9. **Неочевидные решения** — ADR в [docs/decisions/](docs/decisions/).

## Память и синк через репо

Память о проекте лежит в [.claude/memory/](.claude/memory/) и коммитится в git. Так контекст переживает сессии и доступен на любой машине после клона. Индекс — [.claude/memory/MEMORY.md](.claude/memory/MEMORY.md).

**Когда сохранять:** новые решения по архитектуре, обратная связь от меня по стилю работы, договорённости по фазам, отказ от каких-то идей с обоснованием. Не дублируй то, что уже в PROJECT.md.
