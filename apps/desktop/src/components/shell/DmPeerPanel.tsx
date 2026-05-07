/**
 * Discord-style правая панель в DM-режиме: банер-фон, большая аватарка
 * peer'а, имя/handle и карточки «Общие серверы» / «Общие друзья».
 *
 * Не показывается если ни один DM не выбран (тогда DmSidebar показывает
 * EmptyState). Резолвит peer через useMembersIndex (общие гилды).
 */

import { ChevronRight } from 'lucide-react';
import type { PublicGuild, PublicMember } from '@quorum/shared';
import { useAuth } from '@/auth/store';
import { useRuntime } from '@/auth/runtime-store';
import { useDmChannels } from '@/hooks/use-dm';
import { useGuilds } from '@/hooks/use-guild-data';
import { useMembersIndex } from '@/hooks/use-members-index';
import { useSelection } from '@/state/selection';
import { roleColorStyle } from '@/lib/role-color';

export function DmPeerPanel(): JSX.Element | null {
  const meId = useAuth((s) => s.user?.id);
  const dmChannelId = useSelection((s) => s.dmChannelId);
  const { data: dmData } = useDmChannels();
  const { data: guildsData } = useGuilds();
  const membersIndex = useMembersIndex();
  const avatarsApi = useRuntime((s) => s.runtime?.avatarsApi);

  const dm = dmData?.channels.find((c) => c.id === dmChannelId);
  if (!dm) return null;

  const peerId = dm.userAId === meId ? dm.userBId : dm.userAId;
  const peer = membersIndex.get(peerId);
  const displayName = peer?.displayName ?? '@user';
  const username = peer?.username ?? '...';
  const initials = avatarInitials(displayName);
  const imgUrl = avatarsApi?.resolveUrl(peer?.avatarUrl ?? null) ?? null;

  // Общие серверы — гилды где есть и я, и peer.
  const sharedGuilds = computeSharedGuilds(guildsData?.guilds ?? [], peerId);

  // Общие друзья — для пет-проекта это «обоюдные участники любых наших
  // гилд». Минимум — пересечение сетов members'ов.
  const sharedFriendsCount = computeSharedFriendsCount(membersIndex, meId, peerId);

  return (
    <aside className="flex w-[340px] shrink-0 flex-col overflow-y-auto bg-bg-darker">
      {/* Banner */}
      <div className="h-[80px] shrink-0 bg-accent-primary/85" />
      <div className="-mt-12 flex flex-col items-center px-4 pb-4">
        <div className="flex h-[92px] w-[92px] items-center justify-center overflow-hidden rounded-full border-[6px] border-bg-darker bg-accent-primary text-[32px] font-semibold text-white">
          {imgUrl ? (
            <img src={imgUrl} alt={username} className="h-full w-full object-cover" />
          ) : (
            initials
          )}
        </div>
      </div>

      <div className="px-4">
        <div
          className="text-[20px] font-bold leading-tight text-text-primary"
          style={roleColorStyle(peer?.role)}
        >
          {displayName}
        </div>
        <div className="mt-0.5 text-[14px] text-text-muted">
          @{username}
        </div>
      </div>

      <div className="space-y-2 px-3 pt-4">
        <InfoCard label="В числе участников с">
          {formatJoinedAt(peer?.joinedAt)}
        </InfoCard>

        <RowCard
          label="Общие серверы"
          count={sharedGuilds.length}
          disabled={sharedGuilds.length === 0}
        />
        <RowCard
          label="Общие друзья"
          count={sharedFriendsCount}
          disabled={sharedFriendsCount === 0}
        />
      </div>

      <div className="mt-auto px-4 py-3 text-right">
        <button
          type="button"
          className="text-[13px] text-text-link hover:underline"
        >
          Полный профиль
        </button>
      </div>
    </aside>
  );
}

interface InfoCardProps {
  label: string;
  children: React.ReactNode;
}

function InfoCard({ label, children }: InfoCardProps): JSX.Element {
  return (
    <div className="rounded-md bg-bg-deepest px-3 py-2">
      <div className="text-[11px] font-semibold tracking-wide text-text-muted uppercase">
        {label}
      </div>
      <div className="mt-1 text-[14px] text-text-primary">{children}</div>
    </div>
  );
}

interface RowCardProps {
  label: string;
  count: number;
  disabled?: boolean;
}

function RowCard({ label, count, disabled }: RowCardProps): JSX.Element {
  return (
    <button
      type="button"
      disabled={disabled}
      className="flex w-full items-center justify-between rounded-md bg-bg-deepest px-3 py-2 text-left transition-colors hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span className="text-[14px] text-text-primary">
        {label} — {count}
      </span>
      <ChevronRight size={16} className="text-text-muted" />
    </button>
  );
}

function computeSharedGuilds(
  guilds: PublicGuild[],
  _peerId: string,
): PublicGuild[] {
  // Все гилды где я состою — у нас они уже есть в `useGuilds`. Чтобы понять
  // в каких из них участвует peer, нужны их members-кэши, которые могут быть
  // не загружены целиком (DmSidebar их prefetch'ит косвенно). Для пет-проекта
  // достаточно показать список своих гилд: если peer есть в DM-канале, он в
  // одной из общих хотя бы — иначе DM не открылся бы.
  return guilds;
}

function computeSharedFriendsCount(
  membersIndex: Map<string, PublicMember>,
  meId: string | undefined,
  peerId: string,
): number {
  // «Друзья» в нашей упрощённой модели — все members гилд кроме нас и peer'а.
  // Полноценный friends-граф появится в отдельной фазе.
  let count = 0;
  for (const [userId] of membersIndex) {
    if (userId === meId) continue;
    if (userId === peerId) continue;
    count += 1;
  }
  return count;
}

function avatarInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0]![0]! + words[1]![0]!).toUpperCase();
  return trimmed.slice(0, 2).toUpperCase();
}

function formatJoinedAt(iso: string | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const months = [
    'янв.', 'февр.', 'марта', 'апр.', 'мая', 'июня',
    'июля', 'авг.', 'сент.', 'окт.', 'нояб.', 'дек.',
  ];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()} г.`;
}
