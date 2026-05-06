import { ChevronDown, Hash, Headphones, Mic, Plus, Settings, Volume2 } from 'lucide-react';
import { useState } from 'react';
import { MOCK_CATEGORIES, MOCK_CURRENT_USER, type MockChannel } from '@/mock/fixtures';
import { cn } from '@/lib/utils';

export function ChannelSidebar(): JSX.Element {
  return (
    <aside className="flex w-[240px] shrink-0 flex-col bg-bg-darker">
      <header className="titlebar-drag relative flex h-12 shrink-0 items-center justify-between border-b border-border-subtle px-4 shadow-sm">
        <span className="truncate text-[15px] font-semibold tracking-tight text-text-primary">
          Quorum
        </span>
        <ChevronDown size={18} className="titlebar-no-drag text-text-secondary" />
      </header>

      <nav className="flex-1 overflow-y-auto pt-2 pr-2 pl-2">
        {MOCK_CATEGORIES.map((cat) => (
          <CategorySection key={cat.id} name={cat.name} channels={cat.channels} />
        ))}
      </nav>

      <UserCard />
    </aside>
  );
}

function CategorySection({
  name,
  channels,
}: {
  name: string;
  channels: MockChannel[];
}): JSX.Element {
  const [open, setOpen] = useState(true);
  return (
    <div className="mt-4 first:mt-1">
      <div className="group flex items-center justify-between pr-1 pl-0.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex flex-1 items-center gap-0.5 py-0.5 text-[11px] font-semibold tracking-wide text-text-muted uppercase transition-colors hover:text-text-secondary"
        >
          <ChevronDown
            size={10}
            strokeWidth={3}
            className={cn('transition-transform duration-150', open ? '' : '-rotate-90')}
          />
          <span className="truncate">{name}</span>
        </button>
        <button
          type="button"
          aria-label="add channel"
          className="text-text-muted opacity-0 transition-opacity hover:text-text-secondary group-hover:opacity-100"
        >
          <Plus size={16} strokeWidth={2} />
        </button>
      </div>
      {open && (
        <ul className="mt-0.5 space-y-0.5">
          {channels.map((ch) => (
            <li key={ch.id}>
              <ChannelButton channel={ch} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ChannelButton({ channel }: { channel: MockChannel }): JSX.Element {
  const Icon = channel.kind === 'text' ? Hash : Volume2;
  return (
    <button
      type="button"
      className={cn(
        'group flex w-full items-center gap-1.5 rounded px-2 py-[6px] text-[15px] transition-colors',
        channel.active
          ? 'bg-bg-active text-text-primary'
          : channel.unread
            ? 'text-text-primary hover:bg-bg-hover'
            : 'text-text-muted hover:bg-bg-hover hover:text-text-secondary',
      )}
    >
      <Icon size={20} strokeWidth={1.75} className="shrink-0 text-text-muted" />
      <span className={cn('truncate', channel.unread && !channel.active && 'font-medium')}>
        {channel.name}
      </span>
    </button>
  );
}

function UserCard(): JSX.Element {
  return (
    <div className="flex h-[52px] shrink-0 items-center gap-1 bg-bg-deepest px-2">
      <div className="flex flex-1 items-center gap-2 rounded px-1 py-1 hover:bg-bg-hover">
        <div className="relative">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-primary text-[13px] font-semibold text-white">
            {MOCK_CURRENT_USER.initials}
          </div>
          <span className="absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full border-[3px] border-bg-deepest bg-accent-success" />
        </div>
        <div className="min-w-0 leading-tight">
          <div className="truncate text-[14px] font-semibold text-text-primary">
            {MOCK_CURRENT_USER.name}
          </div>
          <div className="num-tabular truncate text-[12px] text-text-muted">#0001</div>
        </div>
      </div>
      <div className="flex">
        <ControlButton aria-label="mute mic">
          <Mic size={18} strokeWidth={2} />
        </ControlButton>
        <ControlButton aria-label="deafen">
          <Headphones size={18} strokeWidth={2} />
        </ControlButton>
        <ControlButton aria-label="settings">
          <Settings size={18} strokeWidth={2} />
        </ControlButton>
      </div>
    </div>
  );
}

function ControlButton({
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>): JSX.Element {
  return (
    <button
      type="button"
      className="flex h-8 w-8 items-center justify-center rounded text-text-secondary hover:bg-bg-hover hover:text-text-primary"
      {...rest}
    >
      {children}
    </button>
  );
}
