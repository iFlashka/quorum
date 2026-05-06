import { useState } from 'react';
import { Check } from 'lucide-react';
import { useVoicePrefs, type VoiceMode } from '@/voice/prefs';
import { cn } from '@/lib/utils';

const MODE_OPTIONS: { value: VoiceMode; label: string; hint: string }[] = [
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

export function VoiceSection(): JSX.Element {
  const prefs = useVoicePrefs();
  const [capturing, setCapturing] = useState(false);

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

  return (
    <div className="max-w-[640px] space-y-8">
      <section>
        <h3 className="mb-3 text-[12px] font-semibold tracking-wide text-text-muted uppercase">
          Режим микрофона
        </h3>
        <div className="space-y-1">
          {MODE_OPTIONS.map((opt) => {
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
                'rounded border px-3 py-1 text-[13px] font-mono',
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

      <section>
        <h3 className="mb-3 text-[12px] font-semibold tracking-wide text-text-muted uppercase">
          Шумодав (WebRTC)
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
        <p className="mt-3 text-[12px] text-text-muted">
          RNNoise (нейросетевой шумодав) появится в одном из следующих обновлений.
        </p>
      </section>
    </div>
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
