/**
 * Discord-style горизонтальный разделитель между днями в ленте сообщений.
 * Тонкая линия + центральная подпись («Сегодня», «Вчера», «7 мая 2026 г.»).
 *
 * Стиль строго копирует Discord 2026: 1px линия в `bg-bg-active`, центральный
 * текст 12px semibold в text-secondary, фон-overlay у текста (чтобы линия
 * видимо обрывалась под подписью даже при прозрачных подложках).
 */

interface DateDividerProps {
  /** ISO timestamp первого сообщения нового дня. */
  iso: string;
}

export function DateDivider({ iso }: DateDividerProps): JSX.Element {
  const label = formatDateLabel(iso);
  return (
    <div
      role="separator"
      aria-label={label}
      className="mx-4 mt-4 mb-2 flex items-center"
    >
      <div className="h-px flex-1 bg-bg-active" />
      <span className="px-2 text-[12px] font-semibold text-text-secondary select-none">
        {label}
      </span>
      <div className="h-px flex-1 bg-bg-active" />
    </div>
  );
}

const MONTHS_RU = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

export function formatDateLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (sameDay(d, now)) return 'Сегодня';

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(d, yesterday)) return 'Вчера';

  return `${d.getDate()} ${MONTHS_RU[d.getMonth()]} ${d.getFullYear()} г.`;
}

export function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
