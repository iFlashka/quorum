import { useState } from 'react';
import { Check, ChevronLeft, Headphones, Mic } from 'lucide-react';
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

interface VoiceSettingsPopoverProps {
  onBack: () => void;
}

export function VoiceSettingsPopover({ onBack }: VoiceSettingsPopoverProps): JSX.Element {
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
    <div className="space-y-3 p-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="flex h-6 w-6 items-center justify-center rounded text-text-muted hover:bg-bg-hover hover:text-text-primary"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="text-[12px] font-semibold tracking-wide text-text-secondary uppercase">
          Голос
        </span>
      </div>

      <Section title="Режим" icon={<Mic size={14} />}>
        {MODE_OPTIONS.map((opt) => {
          const checked = prefs.mode === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => void prefs.update({ mode: opt.value })}
              className="flex w-full items-start gap-2 rounded px-2 py-1.5 text-left hover:bg-bg-hover"
            >
              <span
                className={cn(
                  'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                  checked
                    ? 'border-accent-primary bg-accent-primary text-white'
                    : 'border-text-muted/40',
                )}
              >
                {checked && <Check size={10} strokeWidth={3} />}
              </span>
              <span className="flex-1">
                <span className="block text-[14px] text-text-primary">{opt.label}</span>
                <span className="block text-[12px] text-text-muted">{opt.hint}</span>
              </span>
            </button>
          );
        })}

        {prefs.mode === 'push-to-talk' && (
          <div className="mt-1 flex items-center gap-2 px-2">
            <span className="flex-1 text-[12px] text-text-muted">Клавиша</span>
            <button
              type="button"
              onClick={() => setCapturing(true)}
              onKeyDown={onPickKey}
              className={cn(
                'rounded border px-2 py-1 text-[12px]',
                capturing
                  ? 'border-accent-primary text-accent-primary'
                  : 'border-text-muted/40 text-text-secondary hover:border-accent-primary',
              )}
            >
              {capturing ? 'Нажмите клавишу…' : prefs.pttShortcut}
            </button>
          </div>
        )}
      </Section>

      <Section title="Шумодав" icon={<Headphones size={14} />}>
        <ToggleRow
          label="Шумоподавление"
          checked={prefs.noiseSuppression}
          onChange={(v) => void prefs.update({ noiseSuppression: v })}
        />
        <ToggleRow
          label="Эхокомпенсация"
          checked={prefs.echoCancellation}
          onChange={(v) => void prefs.update({ echoCancellation: v })}
        />
        <ToggleRow
          label="Авто-усиление"
          checked={prefs.autoGainControl}
          onChange={(v) => void prefs.update({ autoGainControl: v })}
        />
      </Section>
    </div>
  );
}

interface SectionProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}

function Section({ title, icon, children }: SectionProps): JSX.Element {
  return (
    <div>
      <div className="mb-1 flex items-center gap-1.5 px-2 text-[11px] font-semibold tracking-wide text-text-muted uppercase">
        {icon}
        {title}
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

interface ToggleRowProps {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}

function ToggleRow({ label, checked, onChange }: ToggleRowProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-bg-hover"
    >
      <span className="flex-1 text-[14px] text-text-secondary">{label}</span>
      <span
        className={cn(
          'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
          checked
            ? 'border-accent-primary bg-accent-primary text-white'
            : 'border-text-muted/40',
        )}
      >
        {checked && <Check size={10} strokeWidth={3} />}
      </span>
    </button>
  );
}

function normalizeKey(key: string): string | null {
  if (key.length === 1) return key.toUpperCase();
  // tauri-plugin-global-shortcut использует синтаксис вроде "Space", "F1", "ArrowUp".
  if (
    key === 'Shift' ||
    key === 'Control' ||
    key === 'Alt' ||
    key === 'Meta'
  ) {
    return null;
  }
  return key;
}
