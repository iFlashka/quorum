---
name: Phase 1 — конкретные технические решения
description: Решения по auth-инфре, которые могут показаться неочевидными при перечитывании кода — и нюансы которые легко забыть
type: project
---

## Подбор библиотек

- **JWT — jose, не jsonwebtoken.** ESM-first, нет CJS-наследия, нативно работает в Node 20+. Подпись HS256 на симметричных секретах из env.
- **Пароли — argon2id через `@node-rs/argon2`.** Native bindings (через napi-rs), быстрее `argon2` (libargon2 + JS binding). Параметры по OWASP-2024: `memoryCost: 19456, timeCost: 2, parallelism: 1`. `algorithm` не указываем — argon2id это default в @node-rs/argon2.
- **Keychain — `keyring-rs` через свои `#[tauri::command]`-обёртки.** Не используем `tauri-plugin-stronghold` (требует пользовательский пароль для разблокировки vault → лишний шаг для пет-проекта). Не используем community `tauri-plugin-keychain` (мейнтенанс непредсказуем). `keyring-rs` обёрнут в три команды: `keychain_set/get/delete`.
- **Server URL persistence — `@tauri-apps/plugin-store`.** Хранится в `quorum.config.json` в app-data dir.
- **БД — postgres-js (`postgres`) + drizzle-orm/postgres-js.** В тестах — PGlite через `drizzle-orm/pglite`. Cast через `unknown` в `setup-db.ts`, потому что типы PgliteDatabase ≠ PostgresJsDatabase, но публичный query-API совпадает.

## Refresh-rotation и детектор кражи

При каждом `/auth/refresh`:
1. Находим refresh по sha256-хэшу.
2. Если уже `revokedAt !== null` → **TokenStolenError** → ревокается ВСЯ цепочка токенов этого пользователя.
3. Иначе помечаем revokedAt, выпускаем новую пару.

Это защита от replay: если злоумышленник украл refresh и использовал его, легитимный клиент при попытке rotate получит «уже использован» → клиент знает что токены скомпрометированы.

**Side-effect:** logout с последующим refresh выглядит как replay (потому что после logout токен помечен revoked). Это «приемлемо» — после logout refresh использовать всё равно нельзя, и paranoid-revocation цепочки не вреден. Если будет UX-проблема — различим logout vs revoke по отдельному полю `loggedOutAt`.

## Невидимая ловушка: register транзакция и FK

`AuthService.register` использует `db.transaction(async tx => { ... })`. Внутри создаются users + members, но **`tokens.issuePair()` нельзя звать внутри транзакции** — он использует `this.db` (root connection), а внутри незакоммиченной tx этот root не видит нового пользователя → FK на `refresh_tokens.user_id → users.id` падает с 23503.

**Решение:** транзакция возвращает `created` (Drizzle-row юзера), и `issuePair` зовётся **после** её коммита.

Если будем вызывать issuePair из других мест внутри транзакции — нужно прокидывать `tx` в TokenService. Пока не нужно.

## Constant-time login

`AuthService.login` всегда вызывает `verifyPassword`, даже если юзера нет — иначе timing-leak «такой пользователь существует». Заглушка-хэш считается лениво на старте через `getDummyHash()` (промис кэшируется в инстансе).

## Invite — атомарный инкремент с условием

`UPDATE invites SET uses = uses + 1 WHERE code = ? AND uses < max_uses`. Если параллельная регистрация уже исчерпала invite — UPDATE вернёт 0 строк, выкидываем `invite_exhausted` и откатываем транзакцию. Не нужны row-level locks (PGlite их и не любит).

## CORS для Tauri webview

В Tauri 2 webview origin зависит от платформы:
- Windows/Linux: `http://tauri.localhost`
- macOS: `tauri://localhost`
- В dev через Vite: `http://localhost:1420` (или другой порт)

Сервер в dev пускает любые `http://(localhost|127.0.0.1):PORT` + оба tauri origin'а. В проде — только tauri.

## Auth state-machine на клиенте

Не используем TanStack Router в фазе 1 (хотя зависимость в PROJECT.md). Вместо этого **state-machine в `App.tsx`** с пятью стейджами: `bootstrapping → onboarding → login | register → authed`. Router добавим в фазе 2 когда появятся каналы / settings (то есть нужен URL routing).

`bootstrap()` при старте:
1. Загружает server URL из tauri-plugin-store. Нет → onboarding.
2. Проверяет refresh-токен в keychain.
3. Если есть — пытается rotate; успех → `authenticated`, fail → чистит keychain и показывает login.

## Где живут токены

- **access** — только в памяти процесса (zustand store, `accessToken` поле). Никаких localStorage.
- **refresh** — в OS keychain через `keychain_set('refresh_token', ...)`. Запись пересоздаётся при каждой ротации.

Если приложение перезапускают — refresh достаётся из keychain, мы делаем `/auth/refresh` и оживаем.
