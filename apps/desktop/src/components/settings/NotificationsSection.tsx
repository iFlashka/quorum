import { useNotificationPrefs } from '@/state/notification-prefs';
import { useSoundPrefs } from '@/state/sound-prefs';
import { useAutostart } from '@/lib/autostart';
import { soundManager, type SoundName } from '@/audio/sounds';
import { cn } from '@/lib/utils';

export function NotificationsSection(): JSX.Element {
  const muted = useNotificationPrefs((s) => s.muted);
  const setMuted = useNotificationPrefs((s) => s.setMuted);

  const autostartEnabled = useAutostart((s) => s.enabled);
  const autostartReady = useAutostart((s) => s.ready);
  const toggleAutostart = useAutostart((s) => s.toggle);

  const soundReady = useSoundPrefs((s) => s.ready);
  const masterVolume = useSoundPrefs((s) => s.masterVolume);
  const mentionEnabled = useSoundPrefs((s) => s.mentionEnabled);
  const messageEnabled = useSoundPrefs((s) => s.messageEnabled);
  const callEnabled = useSoundPrefs((s) => s.callEnabled);
  const voiceJoinLeaveEnabled = useSoundPrefs((s) => s.voiceJoinLeaveEnabled);
  const setMasterVolume = useSoundPrefs((s) => s.setMasterVolume);
  const setMentionEnabled = useSoundPrefs((s) => s.setMentionEnabled);
  const setMessageEnabled = useSoundPrefs((s) => s.setMessageEnabled);
  const setCallEnabled = useSoundPrefs((s) => s.setCallEnabled);
  const setVoiceJoinLeaveEnabled = useSoundPrefs((s) => s.setVoiceJoinLeaveEnabled);

  return (
    <div className="max-w-[640px] space-y-8">
      <section>
        <h3 className="mb-3 text-[12px] font-semibold tracking-wide text-text-muted uppercase">
          Глобальные
        </h3>
        <Switch
          label="Уведомления @упоминаний"
          hint="Native toast от Windows, когда тебя упоминают в чате и окно не сфокусировано"
          checked={!muted}
          onChange={(v) => void setMuted(!v)}
        />
      </section>

      <section>
        <h3 className="mb-3 text-[12px] font-semibold tracking-wide text-text-muted uppercase">
          Звуки
        </h3>
        {soundReady ? (
          <div className="space-y-2">
            <div className="px-3 py-2">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[14px] text-text-primary">Громкость</span>
                <span className="num-tabular text-[12px] text-text-muted">
                  {Math.round(masterVolume * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={Math.round(masterVolume * 100)}
                onChange={(e) => void setMasterVolume(Number(e.target.value) / 100)}
                className="h-1 w-full cursor-pointer appearance-none rounded-full bg-text-muted/30 accent-accent-primary"
              />
            </div>

            <SoundSwitch
              label="Звонки"
              hint="Гудок исходящего, входящий, соединение и завершение"
              soundPreview="ring-in"
              checked={callEnabled}
              onChange={(v) => void setCallEnabled(v)}
            />
            <SoundSwitch
              label="Упоминания"
              hint="Короткий звук при @me-mention"
              soundPreview="mention"
              checked={mentionEnabled}
              onChange={(v) => void setMentionEnabled(v)}
            />
            <SoundSwitch
              label="Каждое сообщение"
              hint="Тук на любое чужое сообщение (по умолчанию выключено)"
              soundPreview="message"
              checked={messageEnabled}
              onChange={(v) => void setMessageEnabled(v)}
            />
            <SoundSwitch
              label="Заход/выход в голосовом канале"
              hint="Когда кто-то зашёл или вышел из канала, в котором вы сейчас"
              soundPreview="join"
              checked={voiceJoinLeaveEnabled}
              onChange={(v) => void setVoiceJoinLeaveEnabled(v)}
            />
          </div>
        ) : (
          <p className="text-[13px] text-text-muted">Загрузка…</p>
        )}
      </section>

      <section>
        <h3 className="mb-3 text-[12px] font-semibold tracking-wide text-text-muted uppercase">
          Запуск
        </h3>
        {autostartReady ? (
          <Switch
            label="Запускать с системой"
            hint="Quorum стартует свёрнутым в трей при логине Windows"
            checked={autostartEnabled}
            onChange={() => void toggleAutostart()}
          />
        ) : (
          <p className="text-[13px] text-text-muted">Загрузка…</p>
        )}
      </section>

      <section>
        <h3 className="mb-3 text-[12px] font-semibold tracking-wide text-text-muted uppercase">
          Mute по каналам
        </h3>
        <p className="text-[13px] text-text-muted">
          Заглушать уведомления отдельных каналов появится в одном из следующих обновлений.
        </p>
      </section>
    </div>
  );
}

interface SwitchProps {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}

function Switch({ label, hint, checked, onChange }: SwitchProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-start gap-3 rounded px-3 py-2 text-left transition-colors hover:bg-bg-hover"
    >
      <SwitchTrack checked={checked} />
      <div className="flex-1">
        <div className="text-[14px] text-text-primary">{label}</div>
        {hint && <div className="text-[12px] text-text-muted">{hint}</div>}
      </div>
    </button>
  );
}

interface SoundSwitchProps extends SwitchProps {
  /** Имя семпла, проигрываемого по клику на кнопку «прослушать». */
  soundPreview: SoundName;
}

function SoundSwitch({ label, hint, checked, onChange, soundPreview }: SoundSwitchProps): JSX.Element {
  return (
    <div className="flex w-full items-start gap-3 rounded px-3 py-2 hover:bg-bg-hover">
      <button
        type="button"
        onClick={() => onChange(!checked)}
        aria-label={checked ? `Выключить ${label.toLowerCase()}` : `Включить ${label.toLowerCase()}`}
      >
        <SwitchTrack checked={checked} />
      </button>
      <div className="flex-1">
        <div className="text-[14px] text-text-primary">{label}</div>
        {hint && <div className="text-[12px] text-text-muted">{hint}</div>}
      </div>
      <button
        type="button"
        onClick={() => soundManager.play(soundPreview)}
        title="Прослушать"
        className="text-[12px] text-text-link transition-opacity hover:opacity-70"
      >
        Прослушать
      </button>
    </div>
  );
}

function SwitchTrack({ checked }: { checked: boolean }): JSX.Element {
  return (
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
  );
}
