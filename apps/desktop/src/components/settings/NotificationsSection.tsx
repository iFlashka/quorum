import { useNotificationPrefs } from '@/state/notification-prefs';
import { useAutostart } from '@/lib/autostart';
import { cn } from '@/lib/utils';

export function NotificationsSection(): JSX.Element {
  const muted = useNotificationPrefs((s) => s.muted);
  const setMuted = useNotificationPrefs((s) => s.setMuted);

  const autostartEnabled = useAutostart((s) => s.enabled);
  const autostartReady = useAutostart((s) => s.ready);
  const toggleAutostart = useAutostart((s) => s.toggle);

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
