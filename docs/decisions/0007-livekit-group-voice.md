# ADR-0007: Group voice — LiveKit SFU, разделение с 1:1 (peer-to-peer)

- **Дата:** 2026-05-06
- **Статус:** Accepted (реализован в фазе 5)

## Контекст

Voice 1:1 уже работает на чистом WebRTC peer-to-peer (фаза 4): без сервера-медиа, дешёво, минимум задержек. Для group-voice (3+ участников) это не масштабируется: full-mesh даёт O(N²) связей и неприемлемо нагружает client-CPU при 4+ participants.

Нужен SFU. Варианты:

1. **LiveKit** (open source, self-hosted, активный maintain, есть TypeScript-клиент и сервер-SDK).
2. **Mediasoup** — низкоуровневый SFU, мощный, но писать поверх — много кода.
3. **Janus** — старичок, рабочий, но отдалённый dev-experience.
4. **Свой SFU на webrtc-rs** — overkill для пет-проекта.

LiveKit уже сидит в `infra/docker-compose.yml` с фазы 0; `livekit-server-sdk` и `livekit-client` — production-grade, с reconnect, simulcast (для будущего видео) и speaking-detection из коробки.

## Решения

### 1. Раздельные транспорты для 1:1 и group voice

- **1:1** — peer-to-peer WebRTC через TURN-relay (фаза 4). Нет промежуточного сервера, нет затрат CPU на VPS.
- **3+ (voice-channel)** — LiveKit SFU. Каждый клиент publish'ит свой track в room, subscribe'ится на остальные.

Граница — простая: 1:1 = `call.invite` между двумя userId, voice-channel = `room=<channelId>`. Не пытаемся «промоутить» 1:1 в group когда подключается третий — это нелинейная state-машина, отложена на потом.

**Альтернатива отклонена.** Гонять и 1:1 через LiveKit — лишний роундтрип через VPS, ненужная нагрузка. Pet-сервер ~4 vCPU на 5–10 пользователей выдержит и 1:1 через SFU, но peer-to-peer лучше с точки зрения latency.

### 2. Token-based авторизация в LiveKit

Сервер Quorum выдаёт JWT через `POST /channels/:id/voice/token`:
- `room = channelId` — каждый канал своя комната.
- `identity = userId` — LiveKit видит юзера тем же id что и наш бэк.
- `name = displayName` — для отображения в UI.
- грант `roomJoin + canPublish + canSubscribe` (без admin: клиент не может kick'ать других).
- TTL 6 часов; LiveKit сам делает refresh при reconnect.

Валидация перед выдачей: канал voice-kind, юзер — member гилды.

**Альтернативы отклонены.**
- Хардкод-токен в `.env` для всех — секрет утекает в любой клиент, нет identity.
- LiveKit webhook/keypair проверка на клиенте — клиент не должен генерить свои токены.

### 3. Конфликт 1:1 ↔ group: блокировать UI

Если идёт 1:1 — voice-channel join disabled с tooltip «Сначала завершите текущий звонок» и наоборот. Auto-leave одного при входе в другой опасен: можно случайно пропустить окончание разговора.

### 4. Один общий `useVoicePrefs` для 1:1 и group

PTT-mode, shortcut, шумодав-флаги — одни и те же. UX: пользователь настраивает один раз. Group voice использует ту же `bindPtt` логику и те же `audioCaptureDefaults`.

### 5. Speaking indicator через `RoomEvent.ActiveSpeakersChanged`

LiveKit уже считает RMS audio level и эмитит. UI рисует зелёное кольцо вокруг аватара. Нет необходимости в собственном VAD.

### 6. Конфигурация через `.env`

`LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` / `LIVEKIT_WS_URL` — на сервере. Совпадают с `infra/livekit/livekit.yaml::keys` (dev: `devkey:secret-please-change-in-phase-5`). На prod LIVEKIT поднимется отдельно с TLS, ws → wss.

## Что НЕ в фазе 5

- **RNNoise WASM (слой 2 шумодава)** — отложен на 5.1 / 7. WebRTC-флаги (слой 1) уже работают через `audioCaptureDefaults`.
- **Видео и screenshare** — фаза 6 поверх того же LiveKit.
- **Server-side список «кто в Lounge»** для тех, кто не подключён — Discord так делает, но для нашего use-case (каналы видны только members гилды) можно отложить.
- **Recording** — никогда без явного запроса.
- **Auto-promote 1:1 → group при появлении третьего** — нелинейный state-transition, отложен.

## Грабли, на которые наступим

- **LiveKit-server в dev на http (`ws://localhost:7880`)**. На prod — обязательно `wss://` через Caddy/reverse-proxy, иначе WebView2 не пустит mixed-content.
- **Audio elements в `document.body`** — для пользователей deafen-режим должен учитывать ВСЕ remote-audio. Сейчас deafen работает в 1:1 на `<audio>` через ref; для group voice нужен отдельный wrapper. Реализуем при необходимости (сейчас deafen для group-канала не выведен в UI — leave даёт тот же эффект).
- **PTT-mode и `setMicrophoneEnabled(true)` на старте**: мы публикуем микрофон, потом сразу мьютим через `localAudioTrack.mute()`. Это правильнее чем `setMicrophoneEnabled(false)` — не пересоздаётся track-publication при unmute.
