---
name: Screen share quality picker — план
description: Discord-style выбор качества трансляции (пресеты + advanced). Фазы A+B реализованы 2026-05-07; фаза C (live switching) и фаза D (1:1) — отложены.
type: project
---

План добавления stream quality picker для screen share. **Фазы A+B
сделаны** в коммитах a4bbca6 / c29fc6a / dedd904 (2026-05-07). Дефолты по
открытым вопросам: balanced пресет, simulcast off, h264, 4 пресета
без 4K. Фазы C и D пока не нужны.

**Why:** пользователь хочет как у Discord — пресеты SD/HD/Quality + возможность кастомной настройки. У нас нет тиров (Nitro/free), поэтому даём всё сразу. Камера остаётся 720p30 (face video столько и нужно), трогаем только screen share.

**How to apply:** когда возвращаемся к этой задаче — сначала прочитать «Открытые вопросы» и задать их пользователю. Не начинать кодить с предположениями. Перед фазой A — проверить что reply-context работа закоммичена (на момент обсуждения была незакоммичена).

## Контекст уже сделанного (фаза 6)

- `LivekitRoom.setScreenShareEnabled(on)` сейчас без параметров качества — просто зовёт `room.localParticipant.setScreenShareEnabled(on)`.
- `videoCaptureDefaults: 1280×720@30` в Room-конструкторе — это **дефолт для камеры**, не трогать.
- LiveKit simulcast включён по дефолту (3 layers L/M/H) — для quality picker мы его выключаем.
- `useVoicePrefs` (zustand + tauri-plugin-store, файл `voice-prefs.json`) — куда дописываем `screenShare`.
- `VoiceChannelBar` имеет [💻] кнопку — рядом добавляем ▾ caret для popover.
- `VoiceSection` в Settings — туда добавляем embedded блок настроек качества.

## Решённые архитектурные моменты

- **Зона действия:** только group (LiveKit). 1:1 (peer-to-peer) — Phase D, отдельно.
- **Кодек:** H.264 хардкодом. AV1/VP9 — позже в advanced если захочется.
- **Simulcast:** выключаем (`simulcast: false`). 5–10 зрителей одного уровня железа, simulcast только режет качество на 3 слоя.
- **Камера:** quality picker НЕ применяется. Остаётся 720p30.
- **UI-якорь:** ▾ caret рядом с [💻] в VoiceChannelBar, плюс embedded блок в Settings → Голос и видео.
- **One-click flow:** прямой клик на 💻 = старт стрима с **последними сохранёнными** prefs. Pop-up через ▾ только когда хочется поменять.
- **Persist:** `useVoicePrefs.screenShare` через tauri-plugin-store (как остальные voice-prefs).

## Открытые вопросы (закрыть перед кодом)

1. **Конкретные значения пресетов.** Предложение:
   - Smooth: 1280×720, 30 fps, 2.5 Mbps
   - Balanced (default): 1920×1080, 30 fps, 5 Mbps
   - Quality: 1920×1080, 60 fps, 8 Mbps
   - Maximum: 2560×1440, 60 fps, 15 Mbps

   Подтвердить или скорректировать (например, добавить 4K в Maximum).

2. **Объём первой итерации.** Делать A+B (популяция + settings) сейчас, C (live switching) — отдельным заходом позже. ИЛИ сразу A+B+C.

3. **Phase C strategy для resolution/fps live-switching:**
   - a) re-publish (юзер заново выбирает источник в OS-picker — UX-минус)
   - b) `track.applyConstraints()` — без перезахвата, но не везде поддерживается
   - Предложение: пробовать b) с fallback на a).

## Декомпозиция по фазам и файлам

### Фаза A — пресеты + персист + pre-stream picker (~день)

1. **`packages/shared/src/domain/screen-quality.ts`** (новый) — типы `ScreenQualityPreset`, `ScreenQualitySettings`, константа `PRESETS`.
2. **`apps/desktop/src/voice/prefs.ts`** — добавить `screenShare: ScreenQualitySettings` в `VoicePrefs` и `DEFAULT_PREFS`. `update()` поддерживает patch для `screenShare`.
3. **`apps/desktop/src/voice/livekit-room.ts`** — `setScreenShareEnabled(on, quality?: ScreenQualitySettings)`. Собирает `captureOptions` (resolution, frameRate) + `publishOptions` (`videoEncoding.maxBitrate/maxFramerate`, `simulcast: false`, `videoCodec: 'h264'`). НЕ менять `videoCaptureDefaults` в Room-конструкторе.
4. **`apps/desktop/src/voice/channel-orchestrator.ts`** — `toggleScreenShare()` при on=true читает `useVoicePrefs.getState().screenShare` и передаёт в `room.setScreenShareEnabled(true, quality)`.
5. **`apps/desktop/src/components/voice/ScreenSharePicker.tsx`** (новый) — карточки-пресеты, раскрывающийся advanced (resolution/fps/bitrate). Используется как popover в фазе A и embedded в фазе B. Кнопка «Начать трансляцию» / «Готово» / «Применить» (фаза C).
6. **`apps/desktop/src/components/voice/VoiceChannelBar.tsx`** — ▾ caret рядом с [💻] открывающий popover. Прямой клик 💻 — без изменений.

Коммиты:
- `feat(shared): пресеты качества трансляции экрана`
- `feat(voice): screen share применяет qualtity-настройки из prefs`
- `feat(ui): ScreenSharePicker и ▾-caret в voice-баре`

### Фаза B — settings секция (~30 минут)

- **`apps/desktop/src/components/settings/VoiceSection.tsx`** — секция «Качество трансляции экрана», переиспользует `ScreenSharePicker` в embedded режиме.

Коммит: `feat(settings): раздел качества трансляции экрана`

### Фаза C — live switching (~полдня, отложено)

В `ScreenSharePicker` при активном стриме — кнопка «Применить» вместо «Начать», активна только если значения изменились.
- Только bitrate → `publication.videoTrack.sender.setParameters({ encodings: [{ maxBitrate }] })` без re-publish.
- Resolution/fps → стратегия из открытого вопроса 3.

Коммит: `feat(voice): live смена качества трансляции экрана`

### Фаза D (опционально) — quality для 1:1 screen share

ADR-0008: 1:1 идёт через peer-to-peer adaptive. Прокидываем те же настройки в peer-call `addScreenShare`. Trigger — если пользователи попросят.

## Технический бэкграунд для возврата к задаче

- Целевой максимум визуального качества по WebRTC: 1080p60 H.264 @ 20–25 Mbps. Дальше — диминишинг по перцепту + браузерные капы.
- Пиксель-в-пиксель невозможно (1080p60 raw = ~3 Gbps). «Visually lossless» = ~25 Mbps на H.264 / ~15 Mbps на HEVC / ~10–15 Mbps на AV1.
- Bottleneck в реальности: upload канал стримера (часто 10–50 Mbps asymmetric), а не VPS (Hetzner CX32 1 Gbps хватит).
- VPS sizing для 5–10 зрителей @ 10 Mbps: исходящий пик ~100 Mbps + ~5 TB/мес. **Hetzner CX32** (4 vCPU / 8 GB / 1 Gbps / 20 TB) — таргет.
