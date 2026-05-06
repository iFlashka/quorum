---
name: Phase 4 voice 1-on-1 decisions
description: WebRTC peer-to-peer, ephemeral TURN, voice FSM, push-to-talk через global-shortcut
type: project
---

Фаза 4 — голос 1-на-1. Полные мотивации в `docs/decisions/0006-voice-1on1.md`. Здесь — короткий ориентир для будущих правок.

**Why:** воспроизводить семантику Discord 1:1 без LiveKit (он подключится в фазе 5 для group voice). Хочется минимум серверной нагрузки и нативный peer-to-peer когда возможно, с TURN-relay только при NAT-блокировках.

**How to apply:** при изменениях voice/calls — сверять с этим списком; при отступлениях — обновлять и эту запись, и ADR-0006.

## Ключевое

### Сигналинг через тот же /ws

Все `call.*`-события (invite/accept/decline/cancel/hangup/offer/answer/ice + ringing/accepted/declined/cancelled/ended) ходят поверх существующего WebSocket. Дискретный signaling-сервер не понадобился. Authorization, reconnect, presence — всё бесплатно.

### TURN-creds через HMAC-SHA1 (RFC TURN REST API draft)

`apps/server/src/modules/turn/service.ts`. coturn в `lt-cred-mech + use-auth-secret`. Сервер Quorum выдаёт `username=<exp>:<userId>` + `credential=base64(HMAC-SHA1(secret, username))`. TTL=1 час, кешируется в orchestrator'е, перевыдача за 30s до истечения. Секрет в `apps/server/.env::TURN_SHARED_SECRET` дублируется в `infra/coturn/turnserver.conf::static-auth-secret` — менять синхронно.

### CallsService — in-memory FSM

`apps/server/src/modules/calls/service.ts`. `Map<callId, CallRecord>` + `Map<userId, callId>` (один активный звонок на юзера). 45s pickup-timeout. На WS-disconnect → `onUserDisconnected` отбивает звонки `unreachable` (ringing) или `ended` (active). Cross-guild check — нельзя звонить юзеру, с которым нет общей гилды.

### Voice FSM (frontend)

`apps/desktop/src/voice/store.ts` zustand: `idle → calling/ringing → connecting → active → idle`. Orchestrator (`voice/orchestrator.ts`) — единственный writer стора. Sub'ится на ws-events, делает все side-effects (getUserMedia, peer creation, signaling).

### offerer/answerer

Caller (тот кто invite) = offerer. Создаёт offer на `call.accepted`. Callee = answerer, ждёт offer и шлёт answer. Эхо собственного `call.ringing` (callId-attach) caller получает чтобы сохранить callId для будущих cancel/hangup.

### Push-to-talk

`tauri-plugin-global-shortcut` v2. Хоткей регистрируется только в фазе active/connecting + mode=PTT, снимается на teardown. Дефолт — voice-activity (PTT — опт-ин). Дефолтный PTT-shortcut = `Shift+Space`. PTT-press → `setMuted(false)`, release → `setMuted(true)`. Юзерский mute через UI имеет приоритет — PTT ничего не делает если phase != active/connecting.

### Шумодав слой 1

`navigator.mediaDevices.getUserMedia({ audio: { noiseSuppression, echoCancellation, autoGainControl } })`. Все три ВКЛ по дефолту. Toggle в `VoiceSettingsPopover` (`apps/desktop/src/components/shell/`). Слой 2 (RNNoise WASM) — фаза 5 (ADR-0003).

### UI

- `Phone`-кнопка в `MemberList` при hover на члене (на каждом, кроме себя, кто online).
- `CallOverlay` рендерится на уровне `App`-shell, видит phase и переключается между:
  - **fullscreen modal** при `ringing` — incoming с Accept/Decline.
  - **floating bar** снизу-по-центру при calling/connecting/active — mute / deafen / hangup, имя собеседника, состояние коннекта.
- Voice settings скрыты в UserCardMenu → пункт «Голос» → отдельный popover.

### Тесты

`orchestrator.test.ts` — 10 кейсов FSM с фейковым `VoicePeer` (через `vi.hoisted` чтобы поделить контейнер между mock factory и тестом). На сервере `calls.test.ts` — 5 end-to-end сценариев на реальном WS + `turn.test.ts` HMAC.

## Что НЕ закрыто в фазе 4

- DM/звонки оффлайн-юзерам (нужны DM-сущности).
- Call history.
- TURN-TCP fallback при заблокированном UDP — добавим в фазе 7 на VPS.
- macOS-специфичный UI (повторяет windows; полировка фаза 7).
- Recording — никогда без явного запроса.
- Playwright e2e WebRTC тест с fake-audio devices — отложен на фазу 7 (CI).

## Грабли, на которые наступили при smoke-тесте 1:1 (фикс `e8ab716`)

1. **React StrictMode + useMemo factory** — в dev StrictMode вызывает useMemo
   factory дважды; если factory имеет side-effect (`o.start()`), создаётся два
   orchestrator-инстанса, оба subscribed на ws, но в Context попадает только
   один. Click шёл в Context-instance, peer был в orphan-instance.
   **Лечение**: useMemo factory должна быть детерминированной (только конструктор);
   start/stop вынесены в `useEffect` чьи cleanup-ы парятся правильно.
2. **Race offer↔getUserMedia** — caller успевает отправить `call.offer` до того,
   как у callee завершилась `getUserMedia` (особенно если permission ещё
   запрашивается). offer приходил пока `peer` создан, но локального стрима
   ещё нет → applyOffer создавал ответ без send-track, связь рвалась.
   **Лечение**: orchestrator кэширует offer в `pendingOffer` пока `peerReady=false`,
   и применяет сразу после `attachLocalStream`.
3. **VoicePeer pre-emptive `addTransceiver`** — создавал sendrecv-transceiver
   до addTrack, что ломало SDP-симметрию с другой стороной. Убрал — addTrack
   создаёт правильный transceiver автоматически.
4. **`track.enabled` через `localStream` ненадёжен** — переписал `setMuted` на
   `pc.getSenders().forEach(s => s.track.enabled = false)`. Это единственный
   путь, который реально влияет на исходящие пакеты. Дополнительно дублируем
   на `localStream.getAudioTracks()` для случая если sender ещё не создан.
5. **Deafen toggle** — un-deafen не возвращал mic в исходное состояние. Теперь
   запоминаем `mutedBeforeDeafen` и восстанавливаем при undeafen.
