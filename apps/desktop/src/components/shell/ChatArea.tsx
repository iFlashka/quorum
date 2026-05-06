import { Bell, Hash, Inbox, Pin, Plus, Search, Smile, Users } from 'lucide-react';
import { MOCK_MESSAGES, type MockMessage } from '@/mock/fixtures';

export function ChatArea(): JSX.Element {
  return (
    <main className="flex min-w-0 flex-1 flex-col bg-bg-default">
      <header className="titlebar-drag relative z-10 flex h-12 shrink-0 items-center gap-2 px-4 shadow-[0_1px_0_0_rgba(0,0,0,0.2),0_2px_4px_0_rgba(0,0,0,0.18)]">
        <Hash size={24} strokeWidth={1.75} className="text-text-muted" />
        <span className="text-[16px] font-semibold tracking-tight text-text-primary">general</span>
        <span className="mx-2 hidden h-6 w-[2px] rounded-sm bg-bg-active md:block" />
        <span className="hidden truncate text-[14px] text-text-secondary md:block">
          Канал по умолчанию для всех разговоров
        </span>
        <div className="titlebar-no-drag ml-auto flex items-center gap-0.5 text-text-secondary">
          <HeaderIcon title="Уведомления">
            <Bell size={20} strokeWidth={1.75} />
          </HeaderIcon>
          <HeaderIcon title="Закреплённые">
            <Pin size={20} strokeWidth={1.75} />
          </HeaderIcon>
          <HeaderIcon title="Участники">
            <Users size={20} strokeWidth={1.75} />
          </HeaderIcon>
          <div className="ml-2 flex h-7 cursor-text items-center gap-2 rounded-[4px] bg-bg-deepest px-2 text-[13px] text-text-muted">
            <span>Поиск</span>
            <Search size={14} strokeWidth={2} className="ml-auto" />
          </div>
          <HeaderIcon title="Входящие">
            <Inbox size={20} strokeWidth={1.75} />
          </HeaderIcon>
        </div>
      </header>

      <section className="flex-1 overflow-y-auto px-2 py-4">
        <div>
          {MOCK_MESSAGES.map((m, i) => {
            const prev = MOCK_MESSAGES[i - 1];
            const grouped = prev?.authorId === m.authorId;
            return <MessageRow key={m.id} message={m} grouped={grouped} />;
          })}
        </div>
      </section>

      <footer className="px-4 pt-2 pb-6">
        <div className="flex items-center gap-3 rounded-lg bg-bg-elevated px-4 py-[11px]">
          <button
            type="button"
            aria-label="attach"
            className="flex h-6 w-6 items-center justify-center rounded-full bg-text-muted text-bg-elevated hover:bg-text-secondary"
          >
            <Plus size={18} strokeWidth={2.5} />
          </button>
          <span className="flex-1 text-[15px] text-text-muted">Сообщение в #general</span>
          <Smile size={20} strokeWidth={1.75} className="text-text-muted hover:text-text-secondary" />
        </div>
      </footer>
    </main>
  );
}

interface HeaderIconProps {
  children: React.ReactNode;
  title?: string;
}

function HeaderIcon({ children, title }: HeaderIconProps): JSX.Element {
  return (
    <button
      type="button"
      title={title}
      className="flex h-7 w-7 items-center justify-center rounded text-text-secondary hover:bg-bg-hover hover:text-text-primary"
    >
      {children}
    </button>
  );
}

interface MessageRowProps {
  message: MockMessage;
  grouped: boolean;
}

function MessageRow({ message, grouped }: MessageRowProps): JSX.Element {
  return (
    <div
      className={
        'group relative flex gap-4 px-4 hover:bg-bg-elevated ' +
        (grouped ? 'mt-0 py-[2px]' : 'mt-[17px] pt-[2px] pb-[2px]')
      }
    >
      {grouped ? (
        <div className="num-tabular flex w-10 shrink-0 justify-end pr-0.5 text-[10px] leading-[22px] text-text-muted opacity-0 group-hover:opacity-100">
          {message.timestamp}
        </div>
      ) : (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-primary text-[15px] font-semibold text-white">
          {message.authorInitials}
        </div>
      )}
      <div className="min-w-0 flex-1">
        {!grouped && (
          <div className="flex items-baseline gap-2">
            <span className="text-[15px] font-medium text-text-primary">{message.authorName}</span>
            <span className="num-tabular text-[12px] text-text-muted">Сегодня в {message.timestamp}</span>
          </div>
        )}
        <p className="text-[15px] leading-[1.375] whitespace-pre-wrap text-text-primary">
          {message.body}
        </p>
      </div>
    </div>
  );
}
