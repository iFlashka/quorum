import { useEffect, useRef } from 'react';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { useUpdater } from '@/state/updater-store';

/**
 * Слушает `useUpdater.pending` и показывает sonner-toast при появлении новой
 * версии. Toast НЕ автоисчезает — пользователь сам решает «Установить» или
 * «Позже». Per-version dedupe через `shownForVersion`.
 */
export function UpdaterToast(): null {
  const pending = useUpdater((s) => s.pending);
  const shownForVersion = useUpdater((s) => s.shownForVersion);
  const installing = useUpdater((s) => s.installing);
  const lastToastIdRef = useRef<string | number | null>(null);

  useEffect(() => {
    if (!pending) return;
    if (shownForVersion === pending.info.version) return;

    const id = toast(`Доступна версия ${pending.info.version}`, {
      description:
        pending.info.body && pending.info.body.length > 0
          ? truncate(pending.info.body, 240)
          : `Текущая: ${pending.info.currentVersion}`,
      icon: <Download size={16} />,
      duration: Infinity,
      action: {
        label: 'Установить',
        onClick: () => {
          useUpdater.getState().setInstalling(true);
          pending.install().catch(() => {
            useUpdater.getState().setInstalling(false);
            toast.error('Не удалось установить обновление');
          });
        },
      },
      cancel: {
        label: 'Позже',
        onClick: () => undefined,
      },
    });
    lastToastIdRef.current = id;
    useUpdater.getState().markShown(pending.info.version);
  }, [pending, shownForVersion]);

  // Если началась установка — поменяем toast на «Устанавливается…»
  useEffect(() => {
    if (!installing) return;
    if (lastToastIdRef.current !== null) {
      toast.dismiss(lastToastIdRef.current);
    }
    toast.loading('Устанавливаем обновление…', { duration: Infinity });
  }, [installing]);

  return null;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + '…';
}
