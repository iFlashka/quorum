# ADR-0006: 1-на-1 голос — peer-to-peer WebRTC, ephemeral TURN credentials

- **Дата:** 2026-05-06
- **Статус:** Accepted (реализован в фазе 4)

## Контекст

Фаза 4 — голосовое 1-на-1. Под групповой voice (фаза 5) у нас будет LiveKit (SFU). Для one-to-one можно тоже использовать LiveKit, но это означает гонять весь медиа-трафик через VPS даже когда два собеседника живут на соседних провайдерах. WebRTC peer-to-peer с STUN+TURN-fallback решает это малой кровью и без дополнительной нагрузки на сервер.

Открытые точки:

1. Через что гонять сигналинг (offer/answer/ice).
2. Как авторизовать клиента в TURN, не светя shared-secret.
3. Где живёт state звонка.
4. Что делает orchestrator при крашах (нода сервера падает; webrtc ICE failed; собеседник потерял WS).
5. Push-to-talk vs voice-activity по умолчанию.

## Решения

### 1. Сигналинг через существующий WebSocket, а не отдельный канал

Все `call.*` события идут поверх /ws вместе с мессаджами и presence. Это бесплатно даёт нам auth, reconnect, presence-семантику (если собеседник offline → call.declined:unreachable сразу).

**Альтернативы отклонены.** Отдельный signaling-сервер (matchmaker) — не нужен для 5–10 друзей, добавил бы лишний компонент. WebSocket-namespace раздельно — соблазнительно, но не оправдано: кода почти нет.

### 2. TURN — ephemeral creds через HMAC-SHA1 (RFC TURN REST API draft)

coturn в `lt-cred-mech` + `use-auth-secret`. Сервер Quorum по `GET /turn/credentials` (auth-protected) выдаёт `username = <unix_exp>:<userId>` + `credential = base64(HMAC-SHA1(static_auth_secret, username))`. coturn проверяет HMAC и `exp > now` без лишних round-trip'ов в БД.

TTL = 1 час. Клиент кеширует `iceServers` в памяти orchestrator'а и перезапрашивает за 30s до истечения.

**Альтернативы отклонены.**

- *Один статический логин/пароль для всех* — секрет сразу попадает в любой WebRTC-клиент, утёкший пользователь получает relay без аккаунта. Отказ.
- *coturn с REST endpoint в БД* — coturn-fronted DB-плагин или PostgreSQL → лишняя нагрузка на схему БД ради того, что HMAC-SHA1 решает в одной строке.

### 3. Server-side state — in-memory FSM на одной ноде

`CallsService.calls: Map<callId, CallRecord>` + `callByUser: Map<userId, callId>`. Один юзер — максимум одна активная сессия (ringing или active). Для 5–10 друзей одна нода Quorum заведомо хватит; в multi-node будущем (LiveKit, фаза 5) звонок 1:1 либо мигрирует туда, либо state поедет в Redis (как presence).

**Защита.** Звонить можно только пользователям, с которыми есть общая гилда (`members`-join). Иначе → `error: call_forbidden`.

**Pickup timeout.** 45s на ringing → `call.declined:timeout` для обеих сторон.

### 4. Disconnect = end call

WS-плагин на disconnect зовёт `calls.onUserDisconnected(userId)`. Если у юзера был ringing-звонок — отбой `unreachable`; если active — `ended`. Это закрывает дыру когда clients ICE-лагает на другой стороне и не получает `hangup`.

### 5. Стейт-машина клиента

```
idle ──placeCall──▶ calling ──ringing(echo) → callId сохранён
                       ↓ accepted
                   connecting ──RTC connected──▶ active ──hangup──▶ idle
                       ↓ offer/answer/ice
                       (peer построен; offerer шлёт offer)

idle ──ringing(other)──▶ ringing ──accept──▶ connecting → ...
                              ↓ decline → idle
```

Phase'ы хранятся в zustand `useVoice`. Orchestrator — единственный writer.

### 6. WebRTC details

- `RTCPeerConnection({iceServers})` с динамически выданными creds.
- Один `addTransceiver('audio', {direction: 'sendrecv'})` — двусторонний голос.
- ICE-кандидаты гоняются через `call.ice` (JSON-сериализованный candidateInit).
- Pending-ICE-queue — кандидаты, пришедшие до `setRemoteDescription`, очередь дренируется при flush.
- `connectionstatechange === 'failed'` → tearDown с `error='ice_failed'`.
- На теще `connected` — phase из connecting в active.

### 7. Push-to-talk через global-shortcut, mode-default = voice-activity

`tauri-plugin-global-shortcut`: один хоткей регистрируется только при mode=PTT и активной фазе звонка, снимается на teardown. По дефолту — voice-activity (мик всегда включён). Дефолтный PTT-shortcut = `Shift+Space` (как в Discord).

**Why VAD by default.** В 1:1 PTT почти не используется; для voice-channels (фаза 5) PTT станет полезнее — можно поменять дефолт там.

### 8. Шумодав слой 1

`getUserMedia` с `noiseSuppression / echoCancellation / autoGainControl` (флаги WebRTC API). Все три ВКЛ по дефолту. Toggle для каждого — в Voice settings popup. RNNoise WASM (слой 2) — фаза 5 (см. ADR-0003).

## Что отложено

- **DM/звонки в офлайн-юзеров** — нужны DM-сущности, ringtone-when-offline (push?), call history. Фаза 4+ или 7.
- **Mute-from-tray-during-call** — сейчас только из CallOverlay/PTT.
- **Фоллбэк на TURN-TCP** при заблокированном UDP — хочется, но требует второй endpoint в coturn-config. На VPS добавим в фазе 7.
- **Click-to-call-back** на пропущенный — у нас сейчас даже call history нет.
- **Recording / transcription** — никогда без явного запроса пользователя.

## Риски

- **WebView2 quirks с MediaDevices.** На некоторых корпоративных Windows-сборках getUserMedia может требовать разрешения через `webview2.permissionRequested`. Обрабатываем graceful: ловим `NotAllowedError` → toast, кладём звонок.
- **NAT hairpinning у одного провайдера.** Если два юзера за одним NAT и роутер не делает hairpin, прямой коннект через STUN не пойдёт; relay через TURN на тот же IP — работает. coturn тут спасает.
- **Audio-permission в Tauri.** WebView2 наследует permission от Windows; первый звонок попросит разрешение. Никаких отдельных capabilities не нужно.
