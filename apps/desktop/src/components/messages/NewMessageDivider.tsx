/**
 * Discord-style маркер «здесь начинается непрочитанное» — красная линия
 * через всю ширину чата + pill «НОВОЕ» в правом углу. Рендерится один раз
 * за сессию открытия канала, перед первым непрочитанным сообщением.
 *
 * Snapshot фиксируется при mount/смене канала (см. MessageList) — divider
 * не «переезжает» при mark-read, остаётся на месте до следующего открытия
 * канала.
 */

export function NewMessageDivider(): JSX.Element {
  return (
    <div
      role="separator"
      aria-label="Начало непрочитанных сообщений"
      className="relative mx-4 mt-2 mb-1 flex items-center"
    >
      <div className="h-px flex-1 bg-accent-danger" />
      <span className="rounded-sm bg-accent-danger px-1 py-[1px] text-[10px] font-bold tracking-wider text-white uppercase select-none">
        Новое
      </span>
    </div>
  );
}
