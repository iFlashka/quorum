# Memory index — Quorum

Этот индекс автозагружается. Каждая запись — одна строка с ссылкой и кратким хуком.

## Project

- [project_overview.md](project_overview.md) — что такое Quorum, аудитория, нефункциональные приоритеты
- [project_phases.md](project_phases.md) — список фаз 0–7 и что в них входит, статус продвижения
- [project_stack_decisions.md](project_stack_decisions.md) — почему выбраны Tauri / Fastify / LiveKit / Drizzle / pnpm
- [project_auto_update.md](project_auto_update.md) — сквозная архитектура auto-update, что закладывается с фазы 0, критика приватного ключа
- [project_audio_processing.md](project_audio_processing.md) — шумодав/AEC/AGC: WebRTC-флаги + RNNoise WASM, реализация в фазах 4–5
- [project_phase1_decisions.md](project_phase1_decisions.md) — конкретные решения фазы 1 (auth, refresh-rotation, ловушка с FK, keychain через keyring-rs)

## Feedback

- [feedback_workflow.md](feedback_workflow.md) — фазы, план перед кодом, ожидание подтверждения, малые коммиты
- [feedback_code_style.md](feedback_code_style.md) — TS strict, no any, ADR в docs/decisions, Tauri IPC через команды
- [feedback_communication.md](feedback_communication.md) — спрашивать при неоднозначности, пушбэкать на плохие требования

## User

- [user_profile.md](user_profile.md) — кто пользователь, на каком языке общаемся, контекст работы
