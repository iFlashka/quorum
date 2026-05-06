/**
 * Discord-style пресеты качества для screen-share. Применяется только в group
 * voice (LiveKit); 1:1 (peer-to-peer) пока adaptive — отдельный пресет-флоу
 * сделаем по запросу.
 *
 * Bitrate указан в kbps (LiveKit ожидает в bps в `videoEncoding.maxBitrate`).
 */

import { z } from 'zod';

export type ScreenQualityPreset = 'smooth' | 'balanced' | 'quality' | 'maximum';

export const ScreenQualitySettingsSchema = z.object({
  /** ID пресета — `custom` если пользователь руками поменял хоть одно значение. */
  preset: z.union([
    z.literal('smooth'),
    z.literal('balanced'),
    z.literal('quality'),
    z.literal('maximum'),
    z.literal('custom'),
  ]),
  /** Целевая ширина в пикселях. */
  width: z.number().int().min(640).max(3840),
  /** Целевая высота в пикселях. */
  height: z.number().int().min(360).max(2160),
  /** Целевые fps (захват + публикация). */
  frameRate: z.union([z.literal(15), z.literal(30), z.literal(60)]),
  /** Целевой bitrate в kbps (1000 → 1 Mbps). */
  bitrateKbps: z.number().int().min(500).max(50000),
});
export type ScreenQualitySettings = z.infer<typeof ScreenQualitySettingsSchema>;

interface PresetDef extends Omit<ScreenQualitySettings, 'preset'> {
  preset: Exclude<ScreenQualityPreset, never>;
  label: string;
  hint: string;
}

export const SCREEN_QUALITY_PRESETS: Record<ScreenQualityPreset, PresetDef> = {
  smooth: {
    preset: 'smooth',
    label: 'Плавно',
    hint: '720p · 30 fps · 2.5 Мбит/с',
    width: 1280,
    height: 720,
    frameRate: 30,
    bitrateKbps: 2500,
  },
  balanced: {
    preset: 'balanced',
    label: 'Сбалансировано',
    hint: '1080p · 30 fps · 5 Мбит/с',
    width: 1920,
    height: 1080,
    frameRate: 30,
    bitrateKbps: 5000,
  },
  quality: {
    preset: 'quality',
    label: 'Качество',
    hint: '1080p · 60 fps · 8 Мбит/с',
    width: 1920,
    height: 1080,
    frameRate: 60,
    bitrateKbps: 8000,
  },
  maximum: {
    preset: 'maximum',
    label: 'Максимум',
    hint: '1440p · 60 fps · 15 Мбит/с',
    width: 2560,
    height: 1440,
    frameRate: 60,
    bitrateKbps: 15000,
  },
};

/** Дефолт — Balanced. */
export const DEFAULT_SCREEN_QUALITY: ScreenQualitySettings = {
  preset: 'balanced',
  width: SCREEN_QUALITY_PRESETS.balanced.width,
  height: SCREEN_QUALITY_PRESETS.balanced.height,
  frameRate: SCREEN_QUALITY_PRESETS.balanced.frameRate,
  bitrateKbps: SCREEN_QUALITY_PRESETS.balanced.bitrateKbps,
};

/**
 * Возвращает preset-id по фактическим значениям; если ни один не совпадает —
 * `custom`. Используется для UI чтобы показать какая радио-кнопка активна
 * после ручного редактирования.
 */
export function detectPreset(s: Omit<ScreenQualitySettings, 'preset'>): ScreenQualityPreset | 'custom' {
  for (const p of ['smooth', 'balanced', 'quality', 'maximum'] as const) {
    const def = SCREEN_QUALITY_PRESETS[p];
    if (
      def.width === s.width &&
      def.height === s.height &&
      def.frameRate === s.frameRate &&
      def.bitrateKbps === s.bitrateKbps
    ) {
      return p;
    }
  }
  return 'custom';
}
