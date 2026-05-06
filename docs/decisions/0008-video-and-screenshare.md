# ADR-0008: Видео и screenshare — peer-to-peer для 1:1, LiveKit для group

- **Дата:** 2026-05-06
- **Статус:** Accepted (реализован в фазе 6)

## Контекст

Фаза 6 — добавляем видео и screenshare поверх существующего стека:

- 1:1 voice уже работает на чистом WebRTC peer-to-peer (фаза 4).
- Group voice через self-hosted LiveKit SFU (фаза 5).

Цель — качественное видео с **минимальной задержкой**.

## Решения

### 1. Видео в 1:1 — peer-to-peer (минимальная latency)

Peer-to-peer WebRTC даёт прямое соединение между двумя клиентами (или через TURN-relay coturn если NAT не сходится). Никаких VPS-relay'ев медиа, никаких caps по битрейту, никаких re-encode'ов на сервере. Latency в норме ~50-100ms RTT vs +50-100ms добавки если бы шло через LiveKit-SFU.

Цена — две имплементации (peer-to-peer + LiveKit), но это управляемо: видео-кнопки в UI общие, разница в transport-слое.

**Альтернатива отклонена:** «всё через LiveKit для унификации». Это унифицирует кодовую базу, но даёт лишнюю латентность и нагрузку на VPS даже когда два собеседника живут на соседних провайдерах. Для pet-проекта на 5–10 друзей это плохой компромисс.

### 2. Perfect-negotiation pattern для 1:1 renegotiation

Любая сторона может toggle камеру или screenshare → triggers `negotiationneeded` на `RTCPeerConnection` → peer делает `setLocalDescription` и шлёт offer через WS. Если у обоих одновременно outstanding offer — collision:

- **Caller (impolite)** — игнорирует чужой offer.
- **Callee (polite)** — делает rollback, принимает чужой, отвечает.

Стандартный pattern Mozilla: https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Perfect_negotiation. ICE-кандидаты при collision тоже фильтруются.

### 3. Различение camera vs screenshare на receiver-стороне

WebRTC SDP не несёт «source» semantics — track.kind = 'video' для обоих. Решение:

- Каждая сторона создаёт **отдельный** `MediaStream` под camera и screen.
- Через WS-event `call.media { cameraStreamId, screenStreamId }` шлём receiver'у текущую map.
- На приёме `RTCTrackEvent.streams[0].id` сравниваем с map'ой → отнесём track к camera или screen.
- Если track пришёл до map'ы — кладём в pending, дренируем как только map обновится.

**Альтернативы отклонены:**
- `RTCRtpTransceiver.mid` convention (camera = mid 1, screen = mid 2) — хрупкий: implicit-create transceiver'ы могут идти в неожиданном порядке.
- `track.contentHint` ('motion' / 'detail') — sender-only, через SDP не передаётся.
- `track.label` — platform-specific, ненадёжный.

### 4. Group video через LiveKit-нативный API

`room.localParticipant.setCameraEnabled(on)` и `setScreenShareEnabled(on)` делают всё: getUserMedia/getDisplayMedia, addTrack, simulcast, adaptive bitrate. Мы лишь bind'имся на `RoomEvent.TrackSubscribed/Unsubscribed` и кладём `MediaStream` в `useChannelVoice.participants[userId].cameraTrack/screenTrack`.

LiveKit ставит `Track.Source` enum (`Camera` / `ScreenShare` / `Microphone`) на каждый publication — не нужна map-трюк как для peer-to-peer.

### 5. UI

**1:1**: `CallOverlay` имеет три layout'а:
- `ringing` → fullscreen modal с Accept/Decline.
- `active` без видео → компактная плашка снизу с расширенным набором кнопок (mute/deafen/camera/screen/hangup).
- `active` с любым видео → fullscreen video view, главный фрейм + picture-in-picture local camera + control bar внизу.

**Group**: `VoiceChannelGrid` рисуется в `ChatArea` поверх chat когда у participants есть хоть один video-track:
- Если есть screenshare — растягиваем его на main, остальные тайлы в боковую strip.
- Иначе — auto-fit grid из camera-tile'ов.
- Тайлы со speaking-indicator (ring-2 ring-accent-success), mic-off бейдж когда muted.

**Local mirror**: local camera preview зеркалится через `transform: scaleX(-1)` (Discord/Zoom convention).

### 6. Quality settings

- 1:1: peer-to-peer полагается на WebRTC adaptive — bandwidth estimation сам подберёт битрейт.
- Group: LiveKit simulcast включён по дефолту (3 layers L/M/H), `videoCaptureDefaults: 1280×720@30`.
- Шумодав-флаги (NS/AEC/AGC) общие через `useVoicePrefs` для обоих транспортов.

### 7. Что НЕ в фазе 6

- **Recording** — никогда без явного запроса.
- **Background blur / virtual backgrounds** — отдельный WebGL/WASM-piece (как RNNoise для аудио). Отложен.
- **Screenshare audio** — на Windows `getDisplayMedia` может включить системный звук. Не делаем по дефолту, добавим toggle позже.
- **Promote 1:1 → group когда подключается третий** — нелинейная state-machine, как и в фазе 4 откладывается.

## Грабли

- **WebView2 permissions**: при первом включении камеры — Windows promt. У нас никаких отдельных `tauri capabilities` не нужно, наследуется от ОС.
- **Track.contentHint** — мы ставим `motion` для камеры и `detail` для экрана. Это hint кодеку (motion-vs-still tradeoff). На приёме hint не виден, но кодек на sender-стороне делает правильный выбор.
- **screen track ends** — если юзер закрывает share через системный picker, track эмитит `ended` event. Мы это слушаем и автоматически выключаем screenshare-state.
- **Local mirror только для camera, НЕ для screenshare** — screenshare юзер видит как есть.
