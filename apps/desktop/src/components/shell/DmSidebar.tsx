/**
 * Discord-style sidebar для DM-режима. Заменяет ChannelSidebar когда
 * mode === 'dm'. Содержит:
 *   - header «Личные сообщения»
 *   - список DM-каналов с peer-аватаром, именем и last-message preview
 *   - UserCard внизу (как в guild-режиме)
 *
 * Friends/Active contacts/«Найти беседу» — отложено в T3.
 */

import type { PublicDmChannelListEntry, PublicMember } from '@quorum/shared';
import { useAuth } from '@/auth/store';
import { useDmChannels } from '@/hooks/use-dm';
import { useMembersIndex } from '@/hooks/use-members-index';
import { useSelection } from '@/state/selection';
import { Skeleton } from '@/components/Skeleton';
import { EmptyState } from '@/components/EmptyState';
import { MemberAvatar } from './MemberAvatar';
import { UserCard } from './UserCard';
import { cn } from '@/lib/utils';
import { MessageCircle } from 'lucide-react';

export function DmSidebar(): JSX.Element {
  const meId = useAuth((s) => s.user?.id);
  const dmChannelId = useSelection((s) => s.dmChannelId);
  const setDmChannel = useSelection((s) => s.setDmChannel);
  const { data, isLoading } = useDmChannels();
  const channels = data?.channels ?? [];
  const membersIndex = useMembersIndex();

  return (
    <aside className="flex w-[240px] shrink-0 flex-col bg-bg-darker">
      <header className="titlebar-drag relative z-10 flex h-12 shrink-0 items-center justify-between px-4 shadow-[0_1px_0_0_rgba(0,0,0,0.2),0_2px_4px_0_rgba(0,0,0,0.18)]">
        <span className="truncate text-[15px] font-semibold tracking-tight text-text-primary">
          Личные сообщения
        </span>
      </header>

      <nav className="flex-1 overflow-y-auto pt-3 pr-2 pl-2">
        {isLoading && channels.length === 0 && (
          <div className="space-y-1.5 px-1">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-2 py-1.5">
                <Skeleton className="h-8 w-8 rounded-full" />
                <Skeleton className="h-3 flex-1" style={{ maxWidth: 140 - i * 22 }} />
              </div>
            ))}
          </div>
        )}
        {!isLoading && channels.length === 0 && (
          <EmptyState
            icon={MessageCircle}
            title="Нет переписок"
            description="Откройте профиль любого участника гильдии и нажмите «Написать сообщение»."
            className="py-10"
          />
        )}
        {channels.length > 0 && (
          <ul className="space-y-0.5">
            {channels.map((dm) => (
              <li key={dm.id}>
                <DmChannelRow
                  dm={dm}
                  meId={meId}
                  membersIndex={membersIndex}
                  active={dm.id === dmChannelId}
                  onClick={() => setDmChannel(dm.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </nav>

      <UserCard />
    </aside>
  );
}

interface DmChannelRowProps {
  dm: PublicDmChannelListEntry;
  meId: string | undefined;
  membersIndex: Map<string, PublicMember>;
  active: boolean;
  onClick: () => void;
}

function DmChannelRow({
  dm,
  meId,
  membersIndex,
  active,
  onClick,
}: DmChannelRowProps): JSX.Element {
  const peerId = dm.userAId === meId ? dm.userBId : dm.userAId;
  const peer = membersIndex.get(peerId);
  const displayName = peer?.displayName ?? peer?.username ?? '...';

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left transition-colors',
        active
          ? 'bg-bg-active text-text-primary'
          : 'text-text-muted hover:bg-bg-hover hover:text-text-secondary',
      )}
    >
      <MemberAvatar
        user={{
          userId: peerId,
          username: peer?.username ?? '?',
          displayName,
          avatarUrl: peer?.avatarUrl,
        }}
        member={peer}
        size={32}
        ringColor="bg-darker"
        disablePopover
      />
      <div className="min-w-0 flex-1 leading-tight">
        <div
          className={cn(
            'truncate text-[16px] font-medium',
            active ? 'text-text-primary' : 'text-text-secondary',
          )}
        >
          {displayName}
        </div>
        {dm.lastMessagePreview && (
          <div className="truncate text-[13px] text-text-muted">{dm.lastMessagePreview}</div>
        )}
      </div>
    </button>
  );
}

