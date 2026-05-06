# Релиз новой версии клиента

Cборка `.msi`, подпись и публикация автоматизированы — вы только делаете тег.

## Pre-release checklist

1. Все запланированные изменения в `main` смержены и работают (smoke-тест на твоей машине).
2. CI зелёный на main: ![CI status](https://github.com/USER/quorum/actions/workflows/ci.yml/badge.svg).
3. Бамп версии **в обоих местах**:
   - `apps/desktop/package.json::version`
   - `apps/desktop/src-tauri/tauri.conf.json::version`
   Это проверяется в CI и в release-workflow перед сборкой — если разошлось, билд падает.
4. (опционально) Обнови changelog — `body:` в релизе сейчас generic, можно поправить под описание изменений в `release.yml::releaseBody`.

## Сделать релиз

```bash
# Например, выпускаем v0.1.0
git tag v0.1.0
git push origin v0.1.0
```

Дальше:

1. GitHub Actions запускает `.github/workflows/release.yml` (windows-latest runner).
2. Tauri-action ставит Rust + pnpm, билдит фронт, билдит `.msi` (~5–10 минут).
3. Билд подписывается приватным ключом из `secrets.TAURI_SIGNING_PRIVATE_KEY`.
4. Создаётся GitHub Release с прикреплёнными `quorum_X.Y.Z_x64-setup.exe` (NSIS), `quorum_X.Y.Z_x64_en-US.msi` и `latest.json`.
5. Уже установленные клиенты заметят новую версию в течение часа (или сразу при следующем запуске) и предложат установить через toast-уведомление.

## Если что-то пошло не так

**Workflow упал** — `gh run list --workflow=release.yml --limit 5` или открой Actions tab. Посмотри логи.

**Подпись валится** — `secret TAURI_SIGNING_PRIVATE_KEY` пустой/некорректный. Должен содержать **всё содержимое** файла `.tauri-keys/quorum-updater.key` (multi-line).

**Версии не совпадают с тегом** — workflow упадёт на pre-build шаге с понятным сообщением. Поправь package.json + tauri.conf.json + перезапиши тег:
```bash
git tag -d v0.1.0
git push origin :v0.1.0
# фикс версий → commit → push
git tag v0.1.0
git push origin v0.1.0
```

## Откат релиза

`tauri-plugin-updater` всегда смотрит на `latest.json` в latest-release. Чтобы откатить: удали "сломанный" Release в GitHub — клиенты на следующей проверке увидят предыдущий как latest и не будут пытаться обновиться.

(Те, кто уже установил кривую версию — должны переустановить руками. Это специфика тауро-апдейтера: в одну сторону.)

## Где живёт приватный ключ

- На локальной машине разработчика: `.tauri-keys/quorum-updater.key` (gitignored).
- В GitHub Actions: `secret TAURI_SIGNING_PRIVATE_KEY`.
- **Бэкап** в bitwarden / 1password / encrypted vault — обязательно. Потеря ключа = клиенты не примут будущие обновления, придётся выпускать новый клиент с новой парой ключей и просить всех переустановить.
