/**
 * Discord-style user-card в нижней части обоих sidebar'ов (channel или dm).
 * Avatar + динамический статус («В сети» / «В звонке — X» / «В голосовом — Y»),
 * + три кнопки справа: Mic / Headphones (deafen) / Settings.
 */

import { Headphones, HeadphoneOff, Mic, MicOff } from 'lucide-react';
import { useAuth } from '@/auth/store';
import { useRuntime } from '@/auth/runtime-store';
import { useChannelVoice } from '@/voice/channel-store';
import { useChannelVoiceOrchestrator } from '@/voice/channel-context';
import { useVoice } from '@/voice/store';
import { useGuildChannels } from '@/hooks/use-guild-data';
import { UserCardMenu } from './UserCardMenu';
import { cn } from '@/lib/utils';

export function UserCard(): JSX.Element {
  const user = useAuth((s) => s.user);
  const displayName = user?.displayName ?? user?.username ?? 'You';
  const initials = avatarInitials(displayName);
  const avatarsApi = useRuntime((s) => s.runtime?.avatarsApi);
  const imgUrl = avatarsApi ? avatarsApi.resolveUrl(user?.avatarUrl ?? null) : null;

  const callPhase = useVoice((s) => s.phase);
  const callPeer = useVoice((s) => s.peer);
  const channelPhase = useChannelVoice((s) => s.phase);
  const voiceChannelId = useChannelVoice((s) => s.channelId);
  const voiceGuildId = useChannelVoice((s) => s.guildId);
  const { data: channelsForVoiceGuild } = useGuildChannels(voiceGuildId);
  const voiceChannel = channelsForVoiceGuild?.channels.find(
    (c) => c.id === voiceChannelId,
  );

  const status = computeStatus({
    callPhase,
    callPeerName: callPeer?.displayName ?? callPeer?.username ?? null,
    channelPhase,
    voiceChannelName: voiceChannel?.name ?? null,
  });

  return (
    <div className="flex h-[52px] shrink-0 items-center gap-1 bg-bg-deepest px-2">
      <button
        type="button"
        className="flex flex-1 items-center gap-2 overflow-hidden rounded px-1 py-1 text-left hover:bg-bg-hover"
      >
        <div className="relative shrink-0">
          <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-accent-primary text-[13px] font-semibold text-white">
            {imgUrl ? (
              <img src={imgUrl} alt="avatar" className="h-full w-full object-cover" />
            ) : (
              initials
            )}
          </div>
          <span className="absolute -right-0.5 -bottom-0.5 h-[14px] w-[14px] rounded-full border-[2px] border-bg-deepest bg-accent-success" />
        </div>
        <div className="min-w-0 leading-[1.15]">
          <div className="truncate text-[14px] font-semibold text-text-primary">{displayName}</div>
          <div
            className={cn(
              'truncate text-[12px]',
              status.tone === 'voice' ? 'text-accent-success' : 'text-text-muted',
            )}
          >
            {status.text}
          </div>
        </div>
      </button>
      <div className="flex shrink-0">
        <GlobalMuteButton />
        <DeafenButton />
        <UserCardMenu />
      </div>
    </div>
  );
}

interface StatusInfo {
  text: string;
  tone: 'idle' | 'voice';
}

function computeStatus(args: {
  callPhase: ReturnType<typeof useVoice.getState>['phase'];
  callPeerName: string | null;
  channelPhase: ReturnType<typeof useChannelVoice.getState>['phase'];
  voiceChannelName: string | null;
}): StatusInfo {
  if (args.callPhase === 'active' || args.callPhase === 'connecting') {
    return {
      text: args.callPeerName ? `В звонке — ${args.callPeerName}` : 'В звонке',
      tone: 'voice',
    };
  }
  if (args.callPhase === 'calling') return { text: 'Звоним…', tone: 'voice' };
  if (args.callPhase === 'ringing') return { text: 'Входящий вызов', tone: 'voice' };
  if (args.channelPhase === 'joined') {
    return {
      text: args.voiceChannelName
        ? `В голосовом — ${args.voiceChannelName}`
        : 'В голосовом канале',
      tone: 'voice',
    };
  }
  if (args.channelPhase === 'joining') return { text: 'Подключение…', tone: 'voice' };
  return { text: 'В сети', tone: 'idle' };
}

function GlobalMuteButton(): JSX.Element {
  const meId = useAuth((s) => s.user?.id);
  const channelPhase = useChannelVoice((s) => s.phase);
  const myInChannel = useChannelVoice((s) =>
    meId ? s.participants.get(meId) : undefined,
  );
  const channelOrchestrator = useChannelVoiceOrchestrator();

  const inChannel = channelPhase === 'joined';
  const muted = inChannel ? !(myInChannel?.audioEnabled ?? true) : false;

  return (
    <button
      type="button"
      aria-label={muted ? 'unmute mic' : 'mute mic'}
      title={
        !inChannel
          ? 'Подключитесь к голосовому каналу'
          : muted
            ? 'Включить микрофон'
            : 'Выключить микрофон'
      }
      disabled={!inChannel}
      onClick={() => void channelOrchestrator.toggleMute()}
      className="flex h-8 w-8 items-center justify-center rounded text-text-secondary hover:bg-bg-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
    >
      {muted ? (
        <MicOff size={16} strokeWidth={1.75} className="text-accent-danger" />
      ) : (
        <Mic size={16} strokeWidth={1.75} />
      )}
    </button>
  );
}

/**
 * Deafen-кнопка для voice-канала. Действует только когда юзер в voice-channel
 * (для 1:1 deafen есть в InlineCallBanner). При отсутствии voice-канала —
 * disabled.
 */
function DeafenButton(): JSX.Element {
  const channelPhase = useChannelVoice((s) => s.phase);
  const deafened = useChannelVoice((s) => s.deafened);
  const channelOrchestrator = useChannelVoiceOrchestrator();
  const inChannel = channelPhase === 'joined';

  return (
    <button
      type="button"
      aria-label={deafened ? 'undeafen' : 'deafen'}
      title={
        !inChannel
          ? 'Подключитесь к голосовому каналу'
          : deafened
            ? 'Включить звук'
            : 'Выключить звук'
      }
      disabled={!inChannel}
      onClick={() => void channelOrchestrator.toggleDeafen()}
      className="flex h-8 w-8 items-center justify-center rounded text-text-secondary hover:bg-bg-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
    >
      {deafened ? (
        <HeadphoneOff size={16} strokeWidth={1.75} className="text-accent-danger" />
      ) : (
        <Headphones size={16} strokeWidth={1.75} />
      )}
    </button>
  );
}

function avatarInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0]![0]! + words[1]![0]!).toUpperCase();
  return trimmed.slice(0, 2).toUpperCase();
}
