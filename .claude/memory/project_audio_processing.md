---
name: Audio processing — noise suppression, echo cancel
description: Архитектура шумодава и аудио-обработки в Quorum — реализуется в фазах 4–5
type: project
---

Пользователь явно попросил «шумодав как в Discord». Реализуется в фазах 4 (1-на-1) и 5 (LiveKit-каналы).

**Why:** для голосового общения хороший шумодав — это разница между «приятно общаться» и «выключаю микрофон». Discord этим знаменит (использует Krisp). У нас бесплатный пет-проект, поэтому нужен open source путь.

**How to apply:**

## Слой 1 — встроенные WebRTC-флаги (минимум, без работы)

В `navigator.mediaDevices.getUserMedia()` всегда передавать:
```ts
{ audio: { noiseSuppression: true, echoCancellation: true, autoGainControl: true } }
```
Это базовый уровень от браузерного движка — работает из коробки, ничего не стоит, но качество среднее (классический speech-DSP, не нейросеть).

## Слой 2 — RNNoise WASM (как в Discord для бесплатных пользователей)

**Решение по умолчанию:** добавить нейросетевой шумодав через **RNNoise** — open source проект Mozilla/Xiph, нет лицензионных ограничений. WASM-сборка встраивается в браузер. Применяется как **AudioWorklet** между `MediaStream` и outbound transport.

- В фазе 4: своя обвязка `MediaStream → AudioWorkletNode (rnnoise) → MediaStreamDestination → RTCPeerConnection`.
- В фазе 5: LiveKit `LocalAudioTrack` поддерживает custom processors — встраиваем тот же AudioWorklet туда.
- Тогл в настройках голоса: «выкл / WebRTC встроенный / RNNoise (рекомендуется)».

## Слой 3 (НЕ берём) — Krisp

Лучшее качество, но Krisp NCSDK лицензионный и платный для коммерческого/распространяемого использования. Для пет-проекта на 5–10 друзей — overkill и юридическая морока. Не рассматриваем.

## Что НЕ делаем

- Не пишем свой шумодав — RNNoise покрывает потребность
- Не делаем серверную обработку звука (LiveKit P2P/SFU без перекодировки) — все обработки на клиенте
- Не добавляем «Voice Activity Detection» как отдельную фичу — RNNoise уже его делает
- Эхокомпенсацию полностью не отключаем — это нужно даже с push-to-talk на случай если включён

## Открытые решения (на момент фазы 4)

- Какой именно RNNoise WASM-пакет: `@jitsi/rnnoise-wasm` (стабильный, поддерживается) vs `@shiguredo/rnnoise-wasm` vs самосборка из исходников. Решим к фазе 4.
- AudioWorklet-обвязка: писать руками или использовать готовую обёртку (`rnnoise-runtime`, `noise-suppressor-worklet`).
