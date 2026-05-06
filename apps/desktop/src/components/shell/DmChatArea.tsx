/**
 * Main-area для DM-режима. Аналог ChatArea для гилд-канала, но:
 *   - header показывает peer-аватар, имя и иконки звонка/видео
 *   - вместо MessageList — DmMessageList (через useDmMessages)
 *   - вместо MessageInput — DmMessageInput
 *   - InlineCallBanner оставлен (1:1 звонок может идти параллельно)
 */

import { Phone, Pin, Search, UserPlus, Video } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import type { ListMembersResponse, PublicMember } from '@quorum/shared';
import { useAuth } from '@/auth/store';
import { useDmChannels } from '@/hooks/use-dm';
import { useSelection } from '@/state/selection';
import { useVoice } from '@/voice/store';
import { useVoiceOrchestrator } from '@/voice/context';
import { EmptyState } from '@/components/EmptyState';
import { ConnectionStatusBanner } from '@/components/ConnectionStatusBanner';
import { InlineCallBanner } from '@/components/voice/InlineCallBanner';
import { DmMessageList } from '@/components/messages/DmMessageList';
import { DmMessageInput } from '@/components/messages/DmMessageInput';
import { MemberAvatar } from './MemberAvatar';
import { MessageCircle } from 'lucide-react';

export function DmChatArea(): JSX.Element {
  const meId = useAuth((s) => s.user?.id);
  const dmChannelId = useSelection((s) => s.dmChannelId);
  const { data } = useDmChannels();
  const dm = data?.channels.find((c) => c.id === dmChannelId);

  const peerId = dm ? (dm.userAId === meId ? dm.userBId : dm.userAId) : null;
  const peer = useResolvePeer(peerId);
  const peerName = peer?.displayName ?? peer?.username ?? '@user';

  const callPhase = useVoice((s) => s.phase);
  const orchestrator = useVoiceOrchestrator();
  const callable = !!peerId && callPhase === 'idle';

  return (
    <main className="flex min-w-0 flex-1 flex-col bg-bg-default">
      <header className="titlebar-drag relative z-10 flex h-12 shrink-0 items-center gap-2 px-4 shadow-[0_1px_0_0_rgba(0,0,0,0.2),0_2px_4px_0_rgba(0,0,0,0.18)]">
        {peerId && peer && (
          <MemberAvatar
            user={{
              userId: peerId,
              username: peer.username,
              displayName: peer.displayName,
              avatarUrl: peer.avatarUrl,
            }}
            member={peer}
            size={24}
            ringColor="bg-default"
            disablePopover
          />
        )}
        <span className="text-[16px] font-semibold tracking-tight text-text-primary">
          {dm ? peerName : 'Личные сообщения'}
        </span>

        {dm && (
          <div className="titlebar-no-drag ml-auto flex items-center gap-0.5 text-text-secondary">
            <HeaderIcon
              title="Голосовой звонок"
              disabled={!callable}
              onClick={() => peerId && void orchestrator.placeCall(peerId)}
            >
              <Phone size={20} strokeWidth={1.75} />
            </HeaderIcon>
            <HeaderIcon
              title="Видеозвонок"
              disabled={!callable}
              onClick={() => peerId && void orchestrator.placeCall(peerId)}
            >
              <Video size={20} strokeWidth={1.75} />
            </HeaderIcon>
            <HeaderIcon title="Закреплённые">
              <Pin size={20} strokeWidth={1.75} />
            </HeaderIcon>
            <HeaderIcon title="Добавить">
              <UserPlus size={20} strokeWidth={1.75} />
            </HeaderIcon>
            <div className="ml-2 flex h-7 cursor-text items-center gap-2 rounded-[4px] bg-bg-deepest px-2 text-[13px] text-text-muted">
              <span>Поиск</span>
              <Search size={14} strokeWidth={2} className="ml-auto" />
            </div>
          </div>
        )}
      </header>

      <ConnectionStatusBanner />
      <InlineCallBanner />

      {!dm ? (
        <EmptyState
          icon={MessageCircle}
          title="Выберите беседу"
          description="Открой список слева, чтобы продолжить переписку, или напиши кому-нибудь из общего сервера."
        />
      ) : (
        <>
          <DmMessageList dmChannelId={dm.id} peerName={peerName} />
          <DmMessageInput dmChannelId={dm.id} peerName={peerName} />
        </>
      )}
    </main>
  );
}

function useResolvePeer(peerId: string | null): PublicMember | undefined {
  const qc = useQueryClient();
  if (!peerId) return undefined;
  const queries = qc.getQueryCache().findAll({ queryKey: ['members'] });
  for (const entry of queries) {
    const data = entry.state.data as ListMembersResponse | undefined;
    if (!data?.members) continue;
    const found = data.members.find((m) => m.userId === peerId);
    if (found) return found;
  }
  return undefined;
}

interface HeaderIconProps {
  children: React.ReactNode;
  title?: string;
  disabled?: boolean;
  onClick?: () => void;
}

function HeaderIcon({ children, title, disabled, onClick }: HeaderIconProps): JSX.Element {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className="flex h-7 w-7 items-center justify-center rounded text-text-secondary hover:bg-bg-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}
