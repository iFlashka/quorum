/**
 * Привязки SoundManager к событиям приложения. Логика "когда играть":
 *
 *   - 1:1 voice: phase=calling → ring-out (loop), phase=ringing → ring-in (loop).
 *     Прыжок в connecting/active из ring-фазы → connect. Возврат в idle из
 *     active/connecting/ending → disconnect.
 *   - Voice channel: join/leave чужого участника — соответствующий звук
 *     (свои переходы и смена канала — без звука).
 *   - Message: maybePlayMentionSound для @me, maybePlayMessageSound для всего
 *     прочего (по дефолту off; mention перебивает message).
 *
 * Все per-event префы и master volume — в `useSoundPrefs`. Глобальный mute
 * (тот же что заглушает toast'ы) — в `useNotificationPrefs.muted`.
 */

import type { PublicMessage } from '@quorum/shared';
import { useVoice, type CallPhase } from '@/voice/store';
import { useChannelVoice } from '@/voice/channel-store';
import { useNotificationPrefs } from '@/state/notification-prefs';
import { useSoundPrefs } from '@/state/sound-prefs';
import { soundManager } from './sounds';

/** Mention: автор не я, упомянут я, не на mute, mention sfx включён. */
export function maybePlayMentionSound(message: PublicMessage, meId: string): void {
  if (message.author.id === meId) return;
  if (!message.mentionedUserIds.includes(meId)) return;
  if (useNotificationPrefs.getState().muted) return;
  if (!useSoundPrefs.getState().mentionEnabled) return;
  soundManager.play('mention');
}

/** Каждое сообщение (off по дефолту). Mention перебивает — иначе двойной звук. */
export function maybePlayMessageSound(message: PublicMessage, meId: string): void {
  if (message.author.id === meId) return;
  if (message.mentionedUserIds.includes(meId)) return;
  if (useNotificationPrefs.getState().muted) return;
  if (!useSoundPrefs.getState().messageEnabled) return;
  soundManager.play('message');
}

/**
 * Подписывается на изменения phase 1:1-звонка и проигрывает ring/connect/disconnect.
 * Возвращает unsubscribe.
 */
export function subscribeCallSounds(): () => void {
  let prev: CallPhase = useVoice.getState().phase;
  return useVoice.subscribe((s) => {
    const next = s.phase;
    if (next === prev) return;
    handlePhaseTransition(prev, next);
    prev = next;
  });
}

function handlePhaseTransition(prev: CallPhase, next: CallPhase): void {
  const muted = useNotificationPrefs.getState().muted;
  const enabled = useSoundPrefs.getState().callEnabled && !muted;

  // Любой выход из ring-фаз — глушим оба ring-loop'а.
  if (prev === 'calling' || prev === 'ringing') {
    soundManager.stopLoop('ring-out');
    soundManager.stopLoop('ring-in');
  }

  if (next === 'calling') {
    if (enabled) soundManager.playLoop('ring-out');
    return;
  }
  if (next === 'ringing') {
    if (enabled) soundManager.playLoop('ring-in');
    return;
  }
  if ((next === 'connecting' || next === 'active') && (prev === 'calling' || prev === 'ringing')) {
    if (enabled) soundManager.play('connect');
    return;
  }
  if (next === 'idle' && (prev === 'active' || prev === 'connecting' || prev === 'ending')) {
    if (enabled) soundManager.play('disconnect');
  }
}

/**
 * Подписывается на изменения участников voice-канала. Звук join/leave играет
 * только когда мы уже в канале (и нас не меняли) и кто-то другой пришёл/ушёл.
 */
export function subscribeChannelVoiceSounds(getMeId: () => string | null): () => void {
  const initial = useChannelVoice.getState();
  let prevIds = new Set(initial.participants.keys());
  let prevChannelId = initial.channelId;

  return useChannelVoice.subscribe((s) => {
    const muted = useNotificationPrefs.getState().muted;
    const enabled = useSoundPrefs.getState().voiceJoinLeaveEnabled && !muted;
    const meId = getMeId();
    const nextIds = new Set(s.participants.keys());

    // Смена канала (вход/выход самим) — синкаем снапшот без звука.
    if (s.channelId !== prevChannelId) {
      prevIds = nextIds;
      prevChannelId = s.channelId;
      return;
    }

    if (!enabled) {
      prevIds = nextIds;
      return;
    }

    let joined = false;
    for (const id of nextIds) {
      if (!prevIds.has(id) && id !== meId) {
        joined = true;
        break;
      }
    }
    if (joined) soundManager.play('join');

    let left = false;
    for (const id of prevIds) {
      if (!nextIds.has(id) && id !== meId) {
        left = true;
        break;
      }
    }
    if (left) soundManager.play('leave');

    prevIds = nextIds;
  });
}

/** Подхватывает изменения master volume для уже играющих loop'ов. */
export function subscribeVolumeSync(): () => void {
  let prev = useSoundPrefs.getState().masterVolume;
  return useSoundPrefs.subscribe((s) => {
    if (s.masterVolume !== prev) {
      prev = s.masterVolume;
      soundManager.applyVolumeToLoops();
    }
  });
}
