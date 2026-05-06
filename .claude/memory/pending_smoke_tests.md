---
name: Pending manual smoke tests
description: Что нужно проверить руками — накопилось из последних фаз, пока не дошли руки
type: project
---

Список фич, написанных и закоммиченных, но не прошедших ручной smoke-тест на двух клиентах. Прогнать когда будет время; для каждого пункта — фаза/коммит, чтобы было откуда посмотреть код.

**Why:** автоматическое покрытие закрывает FSM/типы/lint, но WebRTC/native-OS/UI взаимодействие требуют живой машины. Я как AI не могу нажать кнопки — фиксирую открытые пункты чтобы не потерять.

**How to apply:** при следующей smoke-сессии пройти по списку, отметить ✓/✗, баги фиксить точечно.

## Фаза 4 — Voice 1:1 (`e8ab716` и до)

- [ ] **Decline**: A звонит, B жмёт красную кнопку до accept → у A плашка пропадает.
- [ ] **Cancel**: A звонит, до accept жмёт hangup → у B fullscreen-модал пропадает.
- [ ] **Disconnect during ringing**: A звонит → закрой Tauri окно через tray «Выйти» → у B incoming исчезает (`unreachable`).
- [ ] **Disconnect during active**: A и B говорят → закрой одно окно → у второго плашка пропадает.
- [ ] **Cross-guild forbidden**: создать гилду без admin'а во втором аккаунте, попробовать позвонить admin → ничего не должно произойти (`error: call_forbidden` на сервере).
- [ ] **PTT mode**: переключи в Voice settings → запусти 1:1 → mic muted по умолчанию, голос идёт пока зажат `Shift+Space`.
- [ ] **PTT rebind**: в Voice settings жми «Перебиндить» → нажми `Alt+Q` → проверь что новый shortcut работает.
- [ ] **VAD обратно**: переключи в «Голосовая активация» → mic всегда on, Shift+Space ничего не меняет.
- [ ] **Шумодав-флаги**: выруби Noise Suppression → собеседник слышит больше фоновых шумов; выруби Echo Cancellation → появится feedback (надень наушники чтобы оценить).
- [ ] **Persistence**: PTT + кастомный shortcut → закрой оба окна → открой → значения сохранились.
- [ ] **Connection state в плашке**: следи за статусом «Соединение… → В разговоре». При проблемах с ICE — «· разрыв».
- [ ] **Не сломали ли регрессии фаз 2–3**: текстовый чат realtime, @mention native toast, tray close-to-tray, presence зелёные точки.

## Фаза 5 — Voice channels через LiveKit (`5cbc6c3`, `e2ab5b5`, `18bdfb5`)

- [ ] **Базовый join**: оба клиента кликают Lounge → видят друг друга в списке participants под каналом.
- [ ] **Speaking-indicator**: говорящий имеет зелёное кольцо вокруг аватара.
- [ ] **VoiceChannelBar mute**: жми Mic в плашке (над user-card) → у собеседника твой Mic-icon в списке становится перечёркнутым (mic-off иконка от LiveKit `RoomEvent.TrackMuted`).
- [ ] **GlobalMute в UserCard**: тот же mic-toggle внизу левой колонки — должен синкаться с VoiceChannelBar.
- [ ] **Видимость без подключения** (`18bdfb5`): один заходит в Lounge → у второго (БЕЗ подключения) в sidebar под Lounge должен появиться список с одним участником. Зайдёт и второй — оба видят список из двух.
- [ ] **Снапшот при reconnect**: подключись к Lounge → закрой и заново открой второй клиент → он сразу должен увидеть тебя в Lounge (из voice.channel.state снапшота в ready).
- [ ] **Disconnect cleanup**: подключись к Lounge → закрой окно совсем → у второго клиента в течение секунды тебя нет в списке (onUserDisconnected → leave → broadcast пустого state).
- [ ] **Конфликт 1:1 ↔ group**: идёт 1:1 звонок → клик на Lounge должен быть disabled с tooltip. И наоборот — пока в Lounge, Phone-кнопка на участнике disabled.
- [ ] **PTT в group**: переключи на push-to-talk → подключись к Lounge → mic muted по умолчанию, голос идёт только пока зажат хоткей.
- [ ] **Несколько участников**: подключись с трёх клиентов (можно открыть третий браузерный таб) → все три аватара в списке + speaking-indicator переключается между ними.
- [ ] **Leave**: жми Leave → у тебя плашка пропадает, у других ты исчезаешь из списка.
- [ ] **audioCaptureDefaults**: выруби Noise Suppression в Voice settings → перезайди в Lounge → собеседники слышат больше шумов (флаги применяются при создании Room).

## Фаза 6 — Видео и screenshare

### 1:1 видео (peer-to-peer)

- [ ] **Camera в 1:1**: запусти звонок → жми camera-кнопку → собеседник видит твоё видео. Layout превращается в fullscreen video view с PiP внизу-справа.
- [ ] **Local mirror**: твой PiP-preview зеркальный (как в Discord/Zoom).
- [ ] **Camera off**: повторный клик по camera → видео исчезает у собеседника, layout возвращается к мини-плашке если у обоих видео off.
- [ ] **Screenshare в 1:1**: жми screenshare → Windows picker → выбери окно/экран → собеседник видит твой экран.
- [ ] **Screenshare-priority**: если кто-то screenshare'ит, остальные тайлы должны уйти в боковую strip (для group). Для 1:1 — main фрейм screenshare.
- [ ] **Camera + Screenshare одновременно**: оба track'а одновременно, у получателя оба попадают в правильные source'ы.
- [ ] **Auto-stop screenshare через системное «прекратить»**: закрой share через Windows-overlay → у тебя screenshare-state выключается, у собеседника пропадает.
- [ ] **Renegotiation flow**: оба клиента одновременно жмут camera. Должно сработать без glare (caller=impolite игнорит, callee=polite откатывает).

### Group видео (LiveKit)

- [ ] **Camera в Lounge**: подключись к каналу → жми camera в `VoiceChannelBar` → Windows promt → разреши → твой тайл появляется в `VoiceChannelGrid` с видео.
- [ ] **Несколько cameras**: ещё один участник включает камеру → grid auto-fit раскладывает оба.
- [ ] **Screenshare в Lounge**: жми screen → твой экран занимает main, остальные тайлы уходят в боковую strip.
- [ ] **Speaking-ring в video grid**: говорящий имеет зелёное кольцо вокруг тайла.
- [ ] **Mic-off бейдж**: muted participant имеет красный mic-off-overlay в углу тайла.
- [ ] **Leave с включённым видео**: leave-button корректно отрубает все tracks, у других ты исчезаешь.

### Известные ограничения

- **RNNoise WASM (слой 2 шумодава)** — фаза 5.1 / 7.
- **Background blur / virtual backgrounds** — фаза 7 (отдельный WebGL/WASM piece).
- **Screenshare audio** — отключено по умолчанию, toggle в settings отложен.
- **Promote 1:1 → group** при подключении третьего — нелинейный state-transition, отложено.
- **Deafen для group voice** — UI не выведен (leave работает как эквивалент).
- **TLS на LiveKit для prod** — фаза 7 (Caddy + wss://).
- **Тесты orchestrator после рефакторa в фазе 6** — старые удалены, новые писать с perfect-negotiation моком.
