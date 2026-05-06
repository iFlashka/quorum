/**
 * Discord-style настройки голоса. Layout:
 *
 *   1. Устройства — input/output dropdown + volume sliders + Test mic
 *   2. Профиль ввода — 3 radio (изоляция / студия / пользовательский)
 *   3. Активация микрофона — voice-activity / push-to-talk + клавиша
 *   4. Расширенные — отдельные NS/EC/AGC toggle'ы (видимы только при custom)
 *
 * Применение device-id'ов и volume'ов к real-time tracks делается ленивее:
 * на следующем `getUserMedia` (re-join voice/voice-channel). Под пользователя
 * выводим примечание чтобы он понимал, когда изменения вступят в силу.
 */

import { useEffect, useRef, useState } from 'react';
import { Check, Mic } from 'lucide-react';
import {
  useVoicePrefs,
  type InputProfile,
  type VoiceMode,
} from '@/voice/prefs';
import { cn } from '@/lib/utils';

const ACTIVATION_OPTIONS: { value: VoiceMode; label: string; hint: string }[] = [
  {
    value: 'voice-activity',
    label: 'Голосовая активация',
    hint: 'Микрофон всегда включён, шумодав работает',
  },
  {
    value: 'push-to-talk',
    label: 'Push-to-talk',
    hint: 'Микрофон работает только когда зажата клавиша',
  },
];

const PROFILE_OPTIONS: {
  value: InputProfile;
  label: string;
  hint: string;
  flags: { ns: boolean; ec: boolean; agc: boolean };
}[] = [
  {
    value: 'voice-isolation',
    label: 'Изоляция голоса',
    hint: 'WebRTC удалит фоновый шум и эхо',
    flags: { ns: true, ec: true, agc: true },
  },
  {
    value: 'studio',
    label: 'Студия',
    hint: 'Чистый звук: микрофон без обработки',
    flags: { ns: false, ec: false, agc: false },
  },
  {
    value: 'custom',
    label: 'Пользовательский',
    hint: 'Все тогглы руками',
    flags: { ns: true, ec: true, agc: true },
  },
];

export function VoiceSection(): JSX.Element {
  const prefs = useVoicePrefs();
  const [capturing, setCapturing] = useState(false);
  const [inputs, setInputs] = useState<MediaDeviceInfo[]>([]);
  const [outputs, setOutputs] = useState<MediaDeviceInfo[]>([]);

  // Подгрузка списка устройств. Чтобы вернулись labels, нужно permission;
  // если его ещё нет — labels пустые, юзер увидит «Микрофон 1/2/…».
  useEffect(() => {
    let cancelled = false;
    const refresh = async (): Promise<void> => {
      try {
        const list = await navigator.mediaDevices.enumerateDevices();
        if (cancelled) return;
        setInputs(list.filter((d) => d.kind === 'audioinput'));
        setOutputs(list.filter((d) => d.kind === 'audiooutput'));
      } catch {
        // ignore — web без permissions API
      }
    };
    void refresh();
    const onChange = (): void => void refresh();
    navigator.mediaDevices?.addEventListener?.('devicechange', onChange);
    return () => {
      cancelled = true;
      navigator.mediaDevices?.removeEventListener?.('devicechange', onChange);
    };
  }, []);

  const onPickKey = (e: React.KeyboardEvent<HTMLButtonElement>): void => {
    if (!capturing) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape') {
      setCapturing(false);
      return;
    }
    const parts: string[] = [];
    if (e.ctrlKey) parts.push('Control');
    if (e.metaKey) parts.push('Meta');
    if (e.altKey) parts.push('Alt');
    if (e.shiftKey) parts.push('Shift');
    const key = normalizeKey(e.key);
    if (!key) return;
    parts.push(key);
    void prefs.update({ pttShortcut: parts.join('+') });
    setCapturing(false);
  };

  const setProfile = (next: InputProfile): void => {
    if (next === 'custom') {
      void prefs.update({ inputProfile: next });
      return;
    }
    const f = PROFILE_OPTIONS.find((p) => p.value === next)?.flags;
    if (!f) return;
    void prefs.update({
      inputProfile: next,
      noiseSuppression: f.ns,
      echoCancellation: f.ec,
      autoGainControl: f.agc,
    });
  };

  return (
    <div className="max-w-[640px] space-y-8">
      {/* 1. Устройства */}
      <section>
        <h3 className="mb-3 text-[12px] font-semibold tracking-wide text-text-muted uppercase">
          Голос
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <DeviceColumn
            label="Микрофон"
            devices={inputs}
            value={prefs.inputDeviceId}
            onChange={(v) => void prefs.update({ inputDeviceId: v })}
            volume={prefs.inputVolume}
            onVolumeChange={(v) => void prefs.update({ inputVolume: v })}
          />
          <DeviceColumn
            label="Динамик"
            devices={outputs}
            value={prefs.outputDeviceId}
            onChange={(v) => void prefs.update({ outputDeviceId: v })}
            volume={prefs.outputVolume}
            onVolumeChange={(v) => void prefs.update({ outputVolume: v })}
          />
        </div>
        <MicTestRow inputDeviceId={prefs.inputDeviceId} />
        <p className="mt-2 text-[11px] text-text-muted">
          Изменения устройств вступят в силу при следующем подключении к
          голосовому каналу или звонку.
        </p>
      </section>

      {/* 2. Профиль ввода */}
      <section>
        <h3 className="mb-3 text-[12px] font-semibold tracking-wide text-text-muted uppercase">
          Профиль ввода
        </h3>
        <div className="space-y-1">
          {PROFILE_OPTIONS.map((opt) => {
            const checked = prefs.inputProfile === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setProfile(opt.value)}
                className={cn(
                  'flex w-full items-start gap-3 rounded px-3 py-2 text-left transition-colors',
                  checked ? 'bg-bg-active' : 'hover:bg-bg-hover',
                )}
              >
                <Radio checked={checked} />
                <div>
                  <div className="text-[14px] text-text-primary">{opt.label}</div>
                  <div className="text-[12px] text-text-muted">{opt.hint}</div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* 3. Активация */}
      <section>
        <h3 className="mb-3 text-[12px] font-semibold tracking-wide text-text-muted uppercase">
          Активация микрофона
        </h3>
        <div className="space-y-1">
          {ACTIVATION_OPTIONS.map((opt) => {
            const checked = prefs.mode === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => void prefs.update({ mode: opt.value })}
                className={cn(
                  'flex w-full items-start gap-3 rounded px-3 py-2 text-left transition-colors',
                  checked ? 'bg-bg-active' : 'hover:bg-bg-hover',
                )}
              >
                <Radio checked={checked} />
                <div>
                  <div className="text-[14px] text-text-primary">{opt.label}</div>
                  <div className="text-[12px] text-text-muted">{opt.hint}</div>
                </div>
              </button>
            );
          })}
        </div>

        {prefs.mode === 'push-to-talk' && (
          <div className="mt-4 flex items-center gap-3 rounded bg-bg-deepest px-3 py-2">
            <span className="text-[13px] text-text-secondary">Клавиша push-to-talk</span>
            <button
              type="button"
              onClick={() => setCapturing(true)}
              onKeyDown={onPickKey}
              className={cn(
                'rounded border px-3 py-1 font-mono text-[13px]',
                capturing
                  ? 'border-accent-primary text-accent-primary'
                  : 'border-text-muted/40 text-text-primary hover:border-accent-primary',
              )}
            >
              {capturing ? 'Нажмите клавишу…' : prefs.pttShortcut}
            </button>
          </div>
        )}
      </section>

      {/* 4. Расширенные — только в custom-профиле */}
      {prefs.inputProfile === 'custom' && (
        <section>
          <h3 className="mb-3 text-[12px] font-semibold tracking-wide text-text-muted uppercase">
            Расширенные
          </h3>
          <ToggleRow
            label="Подавление шума"
            hint="Алгоритм WebRTC удаляет фоновый шум"
            checked={prefs.noiseSuppression}
            onChange={(v) => void prefs.update({ noiseSuppression: v })}
          />
          <ToggleRow
            label="Эхокомпенсация"
            hint="Защита от обратной связи через динамики"
            checked={prefs.echoCancellation}
            onChange={(v) => void prefs.update({ echoCancellation: v })}
          />
          <ToggleRow
            label="Авто-усиление"
            hint="Поддерживает громкость голоса на стабильном уровне"
            checked={prefs.autoGainControl}
            onChange={(v) => void prefs.update({ autoGainControl: v })}
          />
        </section>
      )}
    </div>
  );
}

interface DeviceColumnProps {
  label: string;
  devices: MediaDeviceInfo[];
  value: string;
  onChange: (id: string) => void;
  volume: number;
  onVolumeChange: (v: number) => void;
}

function DeviceColumn({
  label,
  devices,
  value,
  onChange,
  volume,
  onVolumeChange,
}: DeviceColumnProps): JSX.Element {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-semibold tracking-wide text-text-muted uppercase">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-bg-active bg-bg-deepest px-2 py-2 text-[14px] text-text-primary outline-none focus:border-accent-primary"
      >
        <option value="">— системный —</option>
        {devices.map((d, i) => (
          <option key={d.deviceId || i} value={d.deviceId}>
            {d.label || `${label} ${i + 1}`}
          </option>
        ))}
      </select>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-[12px] text-text-muted">Громкость</span>
        <span className="num-tabular text-[12px] text-text-muted">
          {Math.round(volume * 100)}%
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={Math.round(volume * 100)}
        onChange={(e) => onVolumeChange(Number(e.target.value) / 100)}
        className="h-1 w-full cursor-pointer appearance-none rounded-full bg-text-muted/30 accent-accent-primary"
      />
    </div>
  );
}

/** Кнопка «Проверка микрофона» с visual-meter — запускает getUserMedia и
 *  через AudioContext+Analyser анимирует индикатор уровня. Stop по клику. */
function MicTestRow({ inputDeviceId }: { inputDeviceId: string }): JSX.Element {
  const [running, setRunning] = useState(false);
  const [level, setLevel] = useState(0);
  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);

  const stop = (): void => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (ctxRef.current) {
      void ctxRef.current.close();
      ctxRef.current = null;
    }
    setLevel(0);
    setRunning(false);
  };

  useEffect(() => stop, []); // cleanup на unmount

  const start = async (): Promise<void> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: inputDeviceId ? { deviceId: { exact: inputDeviceId } } : true,
      });
      streamRef.current = stream;
      const ctx = new AudioContext();
      ctxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = (): void => {
        analyser.getByteTimeDomainData(data);
        let max = 0;
        for (const v of data) {
          const dev = Math.abs(v - 128);
          if (dev > max) max = dev;
        }
        setLevel(Math.min(1, max / 64));
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
      setRunning(true);
    } catch {
      stop();
    }
  };

  return (
    <div className="mt-3 flex items-center gap-3">
      <button
        type="button"
        onClick={() => (running ? stop() : void start())}
        className={cn(
          'flex items-center gap-2 rounded-md px-3 py-2 text-[13px] font-semibold transition-colors',
          running
            ? 'bg-accent-danger text-white hover:bg-red-600'
            : 'bg-accent-primary text-white hover:bg-accent-hover',
        )}
      >
        <Mic size={14} />
        {running ? 'Остановить' : 'Проверка микрофона'}
      </button>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-bg-deepest">
        <div
          className="h-full bg-accent-success transition-[width] duration-75"
          style={{ width: `${Math.round(level * 100)}%` }}
        />
      </div>
    </div>
  );
}

function Radio({ checked }: { checked: boolean }): JSX.Element {
  return (
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
  );
}

interface ToggleRowProps {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}

function ToggleRow({ label, hint, checked, onChange }: ToggleRowProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-start gap-3 rounded px-3 py-2 text-left transition-colors hover:bg-bg-hover"
    >
      <span
        className={cn(
          'mt-1 flex h-4 w-7 shrink-0 items-center rounded-full transition-colors',
          checked ? 'bg-accent-primary' : 'bg-text-muted/30',
        )}
      >
        <span
          className={cn(
            'h-3 w-3 rounded-full bg-white transition-transform',
            checked ? 'translate-x-3.5' : 'translate-x-0.5',
          )}
        />
      </span>
      <div className="flex-1">
        <div className="text-[14px] text-text-primary">{label}</div>
        {hint && <div className="text-[12px] text-text-muted">{hint}</div>}
      </div>
    </button>
  );
}

function normalizeKey(key: string): string | null {
  if (key.length === 1) return key.toUpperCase();
  if (key === 'Shift' || key === 'Control' || key === 'Alt' || key === 'Meta') {
    return null;
  }
  return key;
}
