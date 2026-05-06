---
name: Phase 6 video and screenshare
description: Камера и screenshare поверх 1:1 (peer-to-peer) и group (LiveKit). Perfect-negotiation, MediaStream.id-map для разделения camera/screen.
type: project
---

Фаза 6 — добавили видео и screenshare. ADR-0008 фиксирует архитектурные решения; здесь — короткий ориентир для будущих фаз/правок.

**Why:** пользователь явно попросил «качественное видео с минимальной задержкой, как сделать неважно». Минимальная latency для 1:1 = peer-to-peer (нет VPS-relay медиа). Group остался на LiveKit (full-mesh не масштабируется).

**How to apply:** при правке voice — определить транспорт. 1:1 → VoicePeer + perfect-negotiation. Group → LivekitRoom + LiveKit SDK API. Не смешивать.

## Ключевое

### 1:1 (VoicePeer)

- Перешёл на **perfect-negotiation pattern** (`onnegotiationneeded` + collision detection через `makingOffer` + `signalingState !== 'stable'`). caller = impolite, callee = polite.
- API: `setCameraStream(stream | null)`, `setScreenStream(stream | null)` — addTrack/removeTrack + auto-trigger negotiationneeded.
- `setRemoteStreamMap(cameraStreamId, screenStreamId)` принимает map от другой стороны (через WS-event `call.media`) для классификации входящих video-track'ов.
- На caller'е после initial setup — `forceOffer()` (явный initial offer). Дальнейшие renegotiations через `onnegotiationneeded`.
- Pending-queue для offer'ов и remote-stream-map которые приходят до `peerReady`.

### Group (LivekitRoom)

- LiveKit SDK сам делает getUserMedia/getDisplayMedia + simulcast. `setCameraEnabled(on)` / `setScreenShareEnabled(on)` — single-line API.
- На событиях `RoomEvent.TrackSubscribed/Unsubscribed` определяем по `pub.source` enum (`Track.Source.Camera` / `ScreenShare`) и кладём `track.mediaStream` в `useChannelVoice.participants[userId].cameraTrack/screenTrack`.
- audio-tracks по-прежнему attach'аются в скрытые `<audio>` элементы (mute/deafen работают через `RoomEvent.TrackMuted/Unmuted`).

### WS-протокол расширен

- `call.media { callId, cameraStreamId, screenStreamId }` — шлётся peer-side когда наша map streams изменилась. Сервер форвардит через `CallsService.forwardMedia`.
- Получатель → `peer.setRemoteStreamMap(...)` → классификация pending tracks.

### UI

- `CallOverlay`: три layout'а (ringing modal, active без видео — мини-плашка, active с видео — fullscreen video view с PiP local).
- `VideoTile`: универсальный компонент (stream | null → видео или аватар-инициалы), mirror toggle для local camera.
- `VoiceChannelGrid`: для group, рисуется в `ChatArea` когда `phase=joined` + есть хоть один video-track. Auto-fit camera grid либо main+strip layout если кто-то screen-share'ит.
- `VoiceChannelBar`: добавлены Camera/ScreenShare кнопки рядом с Mute/Leave.

### Devices

- `getCameraStream()`: 1280×720@30, `contentHint = 'motion'`.
- `getScreenShareStream()`: `getDisplayMedia({video, audio:false})`, `contentHint = 'detail'`. Без системного аудио.
- На Windows screenshare picker — нативный, через WebView2.
- Track-`ended` event при закрытии share через системный UI → автовыключение screenshare-state в orchestrator.

### Quality

- 1:1: peer-to-peer + WebRTC adaptive bitrate.
- Group: LiveKit simulcast (3 layers L/M/H) включён через `dynacast: true` + `adaptiveStream: true`.
- 1:1 НЕ делает simulcast — нет смысла когда один receiver.

## Что не закрыто

- **Background blur / virtual backgrounds** — отдельный WebGL/WASM piece, отложен на фазу 7.
- **Screenshare audio** — toggle в settings, отложен.
- **Promote 1:1 → group при подключении 3-го** — нелинейная state-machine, отложено.
- **Recording** — никогда без явного запроса.
- **Background tests на VoicePeer renegotiation flow** — старые orchestrator-тесты не покрывают новый perfect-negotiation. Pending-tests нужно переписать.
