---
name: Phase 5 group voice (LiveKit) decisions
description: LiveKit SFU для голосовых каналов, JWT-токены, разделение peer-to-peer и SFU
type: project
---

Фаза 5 — групповой голос через self-hosted LiveKit. Полная мотивация — `docs/decisions/0007-livekit-group-voice.md`.

**Why:** мы уже сидим на LiveKit-контейнере с фазы 0; SFU нужен для 3+ участников (full-mesh плохо масштабируется). 1:1 остаётся на чистом WebRTC peer-to-peer (latency, без нагрузки на VPS). Граница транспортов: 1:1 = `call.*` сигналинг, group = `room=channelId` через LiveKit.

**How to apply:** при правках voice — определи к какому транспорту относится. Не смешивай — каждый orchestrator ведёт свой стор.

## Ключевое

### Backend

- `apps/server/src/modules/livekit/service.ts` использует `livekit-server-sdk` v2. Метод `issueToken({userId, displayName, channelId})` собирает JWT с грантами `roomJoin + canPublish + canSubscribe` (без admin).
- `POST /channels/:id/voice/token` — auth-protected, проверяет `kind=voice` + member гилды через `MessagesService.accessChannel` (переиспользуем уже существующую защиту).
- Конфиг — `LIVEKIT_API_KEY/SECRET/WS_URL` в `.env` сервера, дублируется с `infra/livekit/livekit.yaml::keys`. Меняешь секрет — обнови оба места.
- TTL JWT — 6 часов; LiveKit сам делает refresh при reconnect, специальной логики на бэке не нужно.

### Frontend

- `voice/channel-store.ts` — отдельный zustand стор от 1:1 `useVoice`. FSM `idle → joining → joined → leaving`. Один активный канал на сессию.
- `voice/livekit-room.ts` — обёртка над `Room` SDK; bind'ит `RoomEvent.ParticipantConnected/Disconnected/ActiveSpeakersChanged/TrackMuted/TrackSubscribed` в стор.
- `voice/channel-orchestrator.ts` — координирует токен + room.connect + PTT bind/unbind. Отдельный orchestrator от 1:1, потому что нет shared state и легче тестировать раздельно.
- Конфликт с 1:1: `if (useVoice.getState().phase !== 'idle') → setError('Сначала завершите текущий звонок')`. UI рисует disabled-кнопку. Auto-leave НЕ делаем (риск пропустить разговор).

### UI

- В `ChannelSidebar` voice-каналы — отдельный `VoiceChannelButton` с join/leave логикой (text-каналы остались `TextChannelButton`).
- `VoiceChannelMembers` (под кнопкой) — список participants со speaking-indicator (зелёное `ring-2` вокруг аватара).
- `VoiceChannelBar` (над UserCard) — статус-плашка с leave-кнопкой когда подключены.
- Speaking-indicator — реальное событие `RoomEvent.ActiveSpeakersChanged` (LiveKit считает RMS внутри). Не пишем свой VAD.

### audioCaptureDefaults

При создании `Room` передаём `audioCaptureDefaults: {NS, AEC, AGC}` из `useVoicePrefs`. Шумодав слой 1 (WebRTC флаги) работает и для 1:1 и для group без отдельной логики.

### PTT в group

Используется тот же `bindPtt`-механизм. Стартовое состояние мика — muted (через `localAudioTrack.mute()`, не `setMicrophoneEnabled(false)` — иначе track-publication пересоздаётся при unmute).

## Что НЕ закрыто в фазе 5

- **RNNoise WASM (слой 2 шумодава)** — отдельная подфаза 5.1 или 7. AudioWorklet preprocessor → LiveKit `LocalAudioTrack`.
- **Deafen для group** — UI не выведен. Leave-канал даёт тот же эффект. Добавим вместе с шумодавом.
- **Server-side «кто в Lounge»** для не-подключённых юзеров. Discord показывает; у нас участники видны только если ты внутри. Возможно через LiveKit webhooks или поллинг `RoomService.listRooms`.
- **Auto-promote 1:1 → group при подключении третьего**. Нелинейная state-machine.
- **Recording** — никогда без явного запроса пользователя.
- **TLS на LiveKit в prod** — обязателен `wss://`, иначе WebView2 заблокирует mixed-content. Настройка через Caddy в фазе 7.
