import { Plus } from 'lucide-react';
import { MOCK_GUILDS, type MockGuild } from '@/mock/fixtures';
import { cn } from '@/lib/utils';
import { useState } from 'react';

export function ServerList(): JSX.Element {
  const [activeId, setActiveId] = useState<string>(MOCK_GUILDS[0]?.id ?? '');

  return (
    <nav className="flex w-[72px] shrink-0 flex-col items-center gap-2 bg-bg-deepest pt-3 pb-3">
      {MOCK_GUILDS.map((g) => (
        <ServerIcon
          key={g.id}
          guild={g}
          active={g.id === activeId}
          onClick={() => setActiveId(g.id)}
        />
      ))}
      <div className="my-1 h-0.5 w-8 rounded-full bg-border-subtle" />
      <button
        type="button"
        aria-label="add server"
        title="Добавить сервер"
        className="flex h-12 w-12 items-center justify-center rounded-3xl bg-bg-default text-accent-success transition-all duration-200 hover:rounded-2xl hover:bg-accent-success hover:text-white"
      >
        <Plus size={22} strokeWidth={2.5} />
      </button>
    </nav>
  );
}

interface ServerIconProps {
  guild: MockGuild;
  active: boolean;
  onClick: () => void;
}

function ServerIcon({ guild, active, onClick }: ServerIconProps): JSX.Element {
  return (
    <div className="group relative">
      {/* Pill-индикатор слева — белый, скруглённый, появляется по ховеру / unread / active */}
      <span
        className={cn(
          'absolute -left-3 top-1/2 w-1 -translate-y-1/2 rounded-r-full bg-text-primary transition-all duration-200',
          active ? 'h-10' : guild.unread ? 'h-2' : 'h-2 scale-y-0 group-hover:h-5 group-hover:scale-y-100',
        )}
      />
      <button
        type="button"
        onClick={onClick}
        title={guild.name}
        className={cn(
          'relative flex h-12 w-12 items-center justify-center text-[15px] font-semibold tracking-tight transition-all duration-200',
          active
            ? 'rounded-2xl bg-accent-primary text-white'
            : 'rounded-3xl bg-bg-default text-text-primary hover:rounded-2xl hover:bg-accent-primary hover:text-white',
        )}
      >
        {guild.initials}
      </button>
    </div>
  );
}
