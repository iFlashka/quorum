import { useState } from 'react';
import { getVersion } from '@tauri-apps/api/app';
import { useEffect } from 'react';
import { checkForUpdate } from '@/lib/updater';
import { useUpdater } from '@/state/updater-store';

export function AboutSection(): JSX.Element {
  const [version, setVersion] = useState<string>('—');
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<string | null>(null);
  const lastChecked = useUpdater((s) => s.lastCheckedAt);
  const pending = useUpdater((s) => s.pending);

  useEffect(() => {
    void getVersion()
      .then((v) => setVersion(v))
      .catch(() => setVersion('dev'));
  }, []);

  const onCheck = async (): Promise<void> => {
    setChecking(true);
    setCheckResult(null);
    try {
      const result = await checkForUpdate();
      useUpdater.getState().setLastChecked(Date.now());
      useUpdater.getState().setPending(result);
      setCheckResult(
        result
          ? `Доступна версия ${result.info.version}`
          : 'У вас актуальная версия',
      );
    } catch {
      setCheckResult('Не удалось проверить обновления');
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="max-w-[640px] space-y-8">
      <section>
        <h3 className="mb-2 text-[12px] font-semibold tracking-wide text-text-muted uppercase">
          Quorum
        </h3>
        <div className="rounded bg-bg-deepest p-4">
          <div className="text-[18px] font-semibold text-text-primary">Quorum {version}</div>
          <div className="mt-1 text-[13px] text-text-muted">
            Self-hosted Discord-аналог для близкого круга
          </div>
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-[12px] font-semibold tracking-wide text-text-muted uppercase">
          Обновления
        </h3>
        <button
          type="button"
          onClick={() => void onCheck()}
          disabled={checking}
          className="rounded bg-accent-primary px-4 py-2 text-[14px] font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {checking ? 'Проверяем…' : 'Проверить обновления'}
        </button>
        {checkResult && (
          <p className="mt-2 text-[13px] text-text-secondary">{checkResult}</p>
        )}
        {pending && (
          <div className="mt-3 rounded border border-accent-success/30 bg-accent-success/5 p-3">
            <div className="text-[14px] font-medium text-accent-success">
              Готова версия {pending.info.version}
            </div>
            {pending.info.body && (
              <pre className="mt-2 overflow-x-auto text-[12px] whitespace-pre-wrap text-text-secondary">
                {pending.info.body}
              </pre>
            )}
            <button
              type="button"
              onClick={() => {
                useUpdater.getState().setInstalling(true);
                pending.install().catch(() => {
                  useUpdater.getState().setInstalling(false);
                });
              }}
              className="mt-3 rounded bg-accent-success px-3 py-1.5 text-[13px] font-medium text-white hover:bg-green-700"
            >
              Установить и перезапустить
            </button>
          </div>
        )}
        {lastChecked && (
          <p className="mt-3 text-[12px] text-text-muted">
            Последняя проверка: {new Date(lastChecked).toLocaleString('ru-RU')}
          </p>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-[12px] font-semibold tracking-wide text-text-muted uppercase">
          Лицензия
        </h3>
        <p className="text-[13px] text-text-muted">
          Приватный пет-проект (UNLICENSED). Не для распространения.
        </p>
      </section>
    </div>
  );
}
