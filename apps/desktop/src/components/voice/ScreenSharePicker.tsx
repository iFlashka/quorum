/**
 * Discord-style picker качества трансляции экрана. Используется в двух
 * местах:
 *   - popover из ▾-caret в VoiceChannelBar (mode='pre-stream' /
 *     'apply') — выбор перед стартом трансляции;
 *   - embedded в Settings → Голос (mode='settings') — без footer-action,
 *     меняет prefs прямо при выборе.
 *
 * Live-switch при активной трансляции (фаза C из плана) пока не
 * реализован — поэтому apply-режим только меняет prefs, на текущий
 * стрим не действует. Чтобы избежать недоразумений, при активной
 * трансляции текст кнопки = «Сохранить» с примечанием что применится
 * после рестарта стрима.
 */

import { useEffect, useState } from 'react';
import { Check, ChevronDown, Monitor } from 'lucide-react';
import {
  detectPreset,
  SCREEN_QUALITY_PRESETS,
  type ScreenQualityPreset,
  type ScreenQualitySettings,
} from '@quorum/shared';
import { useVoicePrefs } from '@/voice/prefs';
import { cn } from '@/lib/utils';

type Mode = 'settings' | 'pre-stream' | 'apply-when-restart';

interface ScreenSharePickerProps {
  mode: Mode;
  /** Вызывается с новым settings при «Сохранить» / «Начать». В settings-mode
   *  не используется — изменения уходят сразу в prefs. */
  onConfirm?: (settings: ScreenQualitySettings) => void;
  onCancel?: () => void;
}

const PRESET_ORDER: ScreenQualityPreset[] = ['smooth', 'balanced', 'quality', 'maximum'];

export function ScreenSharePicker({
  mode,
  onConfirm,
  onCancel,
}: ScreenSharePickerProps): JSX.Element {
  const prefs = useVoicePrefs();
  // Локальный draft в pre-stream/apply: применяется на confirm. В settings —
  // сразу синкаем с prefs.
  const [draft, setDraft] = useState<ScreenQualitySettings>(prefs.screenShare);
  const [advanced, setAdvanced] = useState(draft.preset === 'custom');

  // Если prefs обновились извне (другая вкладка settings) — синкаем draft.
  useEffect(() => {
    if (mode === 'settings') setDraft(prefs.screenShare);
  }, [mode, prefs.screenShare]);

  const apply = (next: ScreenQualitySettings): void => {
    setDraft(next);
    if (mode === 'settings') void prefs.update({ screenShare: next });
  };

  const onPickPreset = (id: ScreenQualityPreset): void => {
    const def = SCREEN_QUALITY_PRESETS[id];
    apply({
      preset: id,
      width: def.width,
      height: def.height,
      frameRate: def.frameRate,
      bitrateKbps: def.bitrateKbps,
    });
  };

  const onCustomPatch = (patch: Partial<Omit<ScreenQualitySettings, 'preset'>>): void => {
    const next: ScreenQualitySettings = {
      preset: 'custom',
      width: patch.width ?? draft.width,
      height: patch.height ?? draft.height,
      frameRate: patch.frameRate ?? draft.frameRate,
      bitrateKbps: patch.bitrateKbps ?? draft.bitrateKbps,
    };
    next.preset = detectPreset(next);
    apply(next);
  };

  const activePreset = draft.preset;

  return (
    <div className="w-[360px] space-y-3 rounded-md bg-bg-elevated p-4 shadow-elevated">
      <div className="flex items-center gap-2 text-text-primary">
        <Monitor size={16} strokeWidth={1.75} className="text-text-secondary" />
        <span className="text-[14px] font-semibold">Качество трансляции</span>
      </div>

      <div className="space-y-1">
        {PRESET_ORDER.map((id) => {
          const def = SCREEN_QUALITY_PRESETS[id];
          const checked = activePreset === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onPickPreset(id)}
              className={cn(
                'flex w-full items-start gap-3 rounded-md px-3 py-2 text-left transition-colors',
                checked ? 'bg-accent-primary/15' : 'hover:bg-bg-hover',
              )}
            >
              <span
                className={cn(
                  'mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                  checked
                    ? 'border-accent-primary bg-accent-primary text-white'
                    : 'border-text-muted/40',
                )}
              >
                {checked && <Check size={10} strokeWidth={3} />}
              </span>
              <div className="flex-1">
                <div className="text-[14px] font-medium text-text-primary">{def.label}</div>
                <div className="num-tabular text-[12px] text-text-muted">{def.hint}</div>
              </div>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => setAdvanced((v) => !v)}
        className="flex items-center gap-1 text-[12px] text-text-secondary hover:text-text-primary"
      >
        <ChevronDown
          size={12}
          className={cn('transition-transform', advanced ? '' : '-rotate-90')}
        />
        Расширенные настройки
      </button>

      {advanced && (
        <div className="space-y-2 rounded-md bg-bg-default px-3 py-2">
          <NumberRow
            label="Ширина (px)"
            value={draft.width}
            min={640}
            max={3840}
            step={1}
            onChange={(v) => onCustomPatch({ width: v })}
          />
          <NumberRow
            label="Высота (px)"
            value={draft.height}
            min={360}
            max={2160}
            step={1}
            onChange={(v) => onCustomPatch({ height: v })}
          />
          <SelectRow<15 | 30 | 60>
            label="Частота кадров"
            value={draft.frameRate}
            options={[
              { value: 15, label: '15 fps' },
              { value: 30, label: '30 fps' },
              { value: 60, label: '60 fps' },
            ]}
            onChange={(v) => onCustomPatch({ frameRate: v })}
          />
          <NumberRow
            label="Битрейт (Кбит/с)"
            value={draft.bitrateKbps}
            min={500}
            max={50000}
            step={500}
            onChange={(v) => onCustomPatch({ bitrateKbps: v })}
          />
        </div>
      )}

      {mode !== 'settings' && (
        <div className="flex items-center justify-end gap-2 pt-1">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md px-3 py-1.5 text-[13px] text-text-secondary hover:text-text-primary"
            >
              Отмена
            </button>
          )}
          <button
            type="button"
            onClick={() => onConfirm?.(draft)}
            className="rounded-md bg-accent-primary px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-accent-hover"
          >
            {mode === 'apply-when-restart' ? 'Сохранить' : 'Начать трансляцию'}
          </button>
        </div>
      )}

      {mode === 'apply-when-restart' && (
        <p className="text-[11px] text-text-muted">
          Изменения применятся при следующем включении трансляции.
        </p>
      )}
    </div>
  );
}

interface NumberRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}

function NumberRow({ label, value, min, max, step, onChange }: NumberRowProps): JSX.Element {
  return (
    <label className="flex items-center justify-between gap-3 text-[12px] text-text-secondary">
      <span>{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (!Number.isFinite(n)) return;
          if (n < min || n > max) return;
          onChange(n);
        }}
        className="num-tabular w-24 rounded border border-bg-active bg-bg-deepest px-2 py-1 text-right text-[12px] text-text-primary outline-none focus:border-accent-primary"
      />
    </label>
  );
}

interface SelectRowProps<T extends number | string> {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}

function SelectRow<T extends number | string>({
  label,
  value,
  options,
  onChange,
}: SelectRowProps<T>): JSX.Element {
  return (
    <label className="flex items-center justify-between gap-3 text-[12px] text-text-secondary">
      <span>{label}</span>
      <select
        value={String(value)}
        onChange={(e) => {
          const raw = e.target.value;
          const next = options.find((o) => String(o.value) === raw)?.value;
          if (next !== undefined) onChange(next);
        }}
        className="w-24 rounded border border-bg-active bg-bg-deepest px-2 py-1 text-[12px] text-text-primary outline-none focus:border-accent-primary"
      >
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
