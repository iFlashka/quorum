import { useState } from 'react';
import { Check } from 'lucide-react';
import type { UserStatus } from '@quorum/shared';
import { useAuth } from '@/auth/store';
import { useRuntime } from '@/auth/runtime-store';
import { ApiError } from '@/api/client';
import { cn } from '@/lib/utils';

const STATUS_OPTIONS: { value: Exclude<UserStatus, 'offline'>; label: string; hint: string }[] = [
  { value: 'online', label: 'В сети', hint: 'Виден всем как online' },
  { value: 'idle', label: 'Не активен', hint: 'Жёлтая метка вместо зелёной' },
  { value: 'dnd', label: 'Не беспокоить', hint: 'Скрыть всплывающие уведомления' },
];

export function AccountSection(): JSX.Element {
  const user = useAuth((s) => s.user);
  const runtime = useRuntime((s) => s.runtime);

  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [status, setStatus] = useState<Exclude<UserStatus, 'offline'>>(
    (user?.status as Exclude<UserStatus, 'offline'>) ?? 'online',
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const dirty =
    displayName !== (user?.displayName ?? '') || status !== (user?.status ?? 'online');

  const onSave = async (): Promise<void> => {
    if (!runtime || !user) return;
    setSaving(true);
    setError(null);
    try {
      const res = await runtime.session.auth.updateMe({
        displayName: displayName !== user.displayName ? displayName : undefined,
        status: status !== user.status ? status : undefined,
      });
      useAuth.setState({ user: res.user });
      setSavedAt(Date.now());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-[640px] space-y-8">
      <section>
        <h3 className="mb-2 text-[12px] font-semibold tracking-wide text-text-muted uppercase">
          Имя для отображения
        </h3>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={48}
          className="w-full rounded bg-bg-deepest px-3 py-2 text-[15px] text-text-primary outline-none focus:ring-2 focus:ring-accent-primary"
        />
        <p className="mt-2 text-[13px] text-text-muted">
          Логин: <span className="font-mono text-text-secondary">@{user?.username}</span> — изменить нельзя.
        </p>
      </section>

      <section>
        <h3 className="mb-2 text-[12px] font-semibold tracking-wide text-text-muted uppercase">
          Статус
        </h3>
        <div className="space-y-1">
          {STATUS_OPTIONS.map((opt) => {
            const checked = status === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setStatus(opt.value)}
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
      </section>

      <section>
        <h3 className="mb-2 text-[12px] font-semibold tracking-wide text-text-muted uppercase">
          Аватар
        </h3>
        <p className="text-[13px] text-text-muted">
          Загрузка аватарок появится в одном из следующих обновлений.
        </p>
      </section>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void onSave()}
          disabled={!dirty || saving}
          className="rounded bg-accent-primary px-4 py-2 text-[14px] font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {saving ? 'Сохраняем…' : 'Сохранить изменения'}
        </button>
        {savedAt && !dirty && !saving && (
          <span className="text-[13px] text-accent-success">Сохранено ✓</span>
        )}
        {error && <span className="text-[13px] text-accent-danger">{error}</span>}
      </div>
    </div>
  );
}
