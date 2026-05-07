import { Search } from 'lucide-react';
import { Glyph } from '@/components/Glyph';
import { useAuth } from '@/auth/store';
import { useDmChannels } from '@/hooks/use-dm';
import { useMembersIndex } from '@/hooks/use-members-index';
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
import { IconButton } from '@/components/ui/icon-button';

export function DmChatArea(): JSX.Element {
  const meId = useAuth((s) => s.user?.id);
  const dmChannelId = useSelection((s) => s.dmChannelId);
  const { data } = useDmChannels();
  const dm = data?.channels.find((c) => c.id === dmChannelId);
  const membersIndex = useMembersIndex();

  const peerId = dm ? (dm.userAId === meId ? dm.userBId : dm.userAId) : null;
  const peer = peerId ? membersIndex.get(peerId) : undefined;
  const peerName = peer?.displayName ?? peer?.username ?? '...';

  const callPhase = useVoice((s) => s.phase);
  const orchestrator = useVoiceOrchestrator();
  const callable = !!peerId && callPhase === 'idle';

  return (
    <main className="flex min-w-0 flex-1 flex-col bg-bg-5">
      <header className="titlebar-drag relative z-10 flex h-12 shrink-0 items-center gap-2 px-4 shadow-low">
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
        <span className="text-[16px] font-bold text-text-strong">
          {dm ? peerName : 'Личные сообщения'}
        </span>

        {dm && (
          <div className="titlebar-no-drag ml-auto flex items-center gap-0.5">
            <IconButton
              title="Голосовой звонок"
              disabled={!callable}
              onClick={() => peerId && void orchestrator.placeCall(peerId)}
            >
              <Glyph name="phone" size={20} />
            </IconButton>
            <IconButton
              title="Видеозвонок"
              disabled={!callable}
              onClick={() => peerId && void orchestrator.placeCall(peerId)}
            >
              <Glyph name="video" size={20} />
            </IconButton>
            <IconButton title="Закреплённые">
              <Glyph name="pin" size={20} />
            </IconButton>
            <IconButton title="Добавить">
              <Glyph name="addFriend" size={20} />
            </IconButton>
            <div className="ml-2 flex h-[28px] cursor-text items-center gap-2 rounded-[4px] bg-bg-3 px-2 text-[13px] text-int-muted">
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
