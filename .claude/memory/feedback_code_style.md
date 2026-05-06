---
name: Code style and quality bar
description: Стандарты качества кода для Quorum — TS strict, типизация, ADR, Tauri IPC
type: feedback
---

**Правило:** TypeScript strict mode везде, типизация end-to-end, неочевидные решения документируются ADR, Tauri IPC только через типизированные команды.

**Why:** это пет-проект, но пользователь хочет, чтобы код был «настоящим продуктом» — структурно чистым, переживающим расширение, и чтобы будущий он сам мог разобраться без боли. Типизация — основная защита от регрессий, ADR — память о «почему так».

**How to apply:**
- **TypeScript strict** во всех `tsconfig.json` (`"strict": true`, `"noUncheckedIndexedAccess": true`, `"noImplicitOverride": true`). Никаких `any` без явного `// reason: ...` комментария.
- **API-эндпоинты типизированы end-to-end** — общие типы и Zod-схемы живут в `packages/shared`, импортируются и сервером, и клиентом.
- **Логирование через pino,** структурированное JSON. Никаких `console.log` в проде.
- **Конфигурация через env,** валидируется Zod при старте сервера. В репо обязательно `.env.example`.
- **ESLint + Prettier** конфиги в репо, гоняются в CI.
- **Tauri IPC только через `#[tauri::command]`.** Никаких хаков типа `window.__TAURI__.something`, никакой эмуляции в JS того, что есть нативно. Если нужен нативный API — типизированная команда.
- **Безопасность:** все эндпоинты под auth (whitelist для login/register), rate limiting на login и register, sanitize HTML (DOMPurify на клиенте + сервере), refresh-токены в OS keychain (не localStorage).
- **Неочевидные решения** (выбор библиотеки при наличии нескольких разумных, нестандартный паттерн, обход известного бага) — фиксировать как ADR в `docs/decisions/NNNN-title.md`.
