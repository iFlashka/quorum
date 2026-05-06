# ADR-0003: Шумоподавление — WebRTC флаги + RNNoise WASM

- **Дата:** 2026-05-06
- **Статус:** Accepted (реализуется в фазах 4–5)

## Контекст

Пользователь явно попросил «шумодав как в Discord». Discord для бесплатных пользователей использует встроенный нейросетевой шумодав (раньше — Krisp лицензированный, сейчас встроенная их разработка). Нам нужно сравнимое качество без лицензионных платежей.

Варианты:

1. **Только встроенные WebRTC-флаги** (`noiseSuppression`, `echoCancellation`, `autoGainControl` в `getUserMedia`).
2. **WebRTC флаги + RNNoise WASM** — open source нейросетевой шумодав от Mozilla/Xiph, AudioWorklet поверх MediaStream.
3. **Krisp NCSDK** — лучшее качество, но лицензия и платно.
4. **Своя обёртка над DeepFilterNet / FRCRN / другие SOTA** — overkill, поддержка дорогая.

## Решение

**Слой 1 (всегда включён):** WebRTC-флаги в `getUserMedia` constraints — `noiseSuppression: true`, `echoCancellation: true`, `autoGainControl: true`. Базовый уровень от движка браузера.

**Слой 2 (опционально, по умолчанию ВКЛ):** **RNNoise WASM** через AudioWorklet. Применяется к input MediaStream до того как трек попадёт в RTCPeerConnection (фаза 4) или в LiveKit `LocalAudioTrack` через preprocessor API (фаза 5).

В настройках голоса будет тогл «Шумодав»: `Выкл` / `Базовый (WebRTC)` / `RNNoise (рекомендуется)`.

## Последствия

**+ Плюсы:**
- Качество близко к Discord-free-tier — RNNoise это сильный нейросетевой шумодав.
- Open source, никаких лицензий.
- WASM-обработка идёт на клиенте, сервер ничего не знает про звук — масштабируется бесплатно.

**− Минусы:**
- ~5–10% дополнительной CPU-нагрузки на каждом голосовом треке. Для целевой аудитории (≤8 человек в комнате, современные ПК) — некритично.
- RNNoise оптимизирован под 48kHz mono — нужно ресемплить если устройство выдаёт другое.
- WASM-блоб ~150 КБ — добавляется к bundle.

## Альтернативы и почему отвергнуты

- **Krisp** — нельзя по лицензии для open distribution без платного контракта. Не подходит.
- **Своё решение** — нет смысла переписывать RNNoise.
- **Только WebRTC-флаги** — заметно хуже на фоне Discord, пользователь специально просил «как в Discord».

## Открытые подвопросы (закрываются в фазе 4)

- Какой именно WASM-пакет: `@jitsi/rnnoise-wasm` (стабильный, поддерживается Jitsi) vs `@shiguredo/rnnoise-wasm` vs самосборка из исходников. Дефолт — Jitsi-версия.
- Готовый AudioWorklet-обвязчик (`noise-suppressor-worklet`, `rnnoise-runtime`) или писать руками — оценим в фазе 4.

## Связанные

- [project_audio_processing.md](../../.claude/memory/project_audio_processing.md) — сквозное описание аудио-обработки
- [PROJECT.md](../../PROJECT.md) — секции фаз 4 и 5
