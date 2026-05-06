/**
 * Оркестрирует жизненный цикл подключения к LiveKit-комнате (голосовому
 * каналу). Знает про API-вызов токена, conflict с 1-на-1 звонком, mute/PTT.
 *
 * Жизненный цикл (см. `useChannelVoice.phase`):
 *   idle → joining → joined → leaving → idle
 *
 * Конфликт 1:1 vs group: блокируем join если идёт 1:1 звонок (фаза != idle).
 */

import type { LivekitApi } from '@/api/livekit';
import { LivekitRoom } from './livekit-room';
import { useChannelVoice } from './channel-store';
import { useVoice } from './store';
import { useVoicePrefs } from './prefs';
import { bindPtt, unbindPtt } from './ptt';

export interface ChannelOrchestratorDeps {
  livekitApi: LivekitApi;
  /** userId / displayName / guildId / channelName resolver — берём из auth + cache. */
  getMe: () => { id: string; displayName: string } | null;
}

export class ChannelVoiceOrchestrator {
  private room: LivekitRoom | null = null;

  constructor(private readonly deps: ChannelOrchestratorDeps) {}

  async join(channelId: string, guildId: string): Promise<void> {
    const phase = useChannelVoice.getState().phase;
    if (phase !== 'idle') return;
    if (useVoice.getState().phase !== 'idle') {
      useChannelVoice
        .getState()
        .setError('Сначала завершите текущий звонок');
      return;
    }
    const me = this.deps.getMe();
    if (!me) return;

    useChannelVoice.getState().setJoining(channelId, guildId);
    try {
      const tokenRes = await this.deps.livekitApi.voiceToken(channelId);
      const room = new LivekitRoom();
      this.room = room;
      await room.join({
        token: tokenRes.token,
        wsUrl: tokenRes.wsUrl,
        channelId,
        guildId,
        myUserId: me.id,
        myDisplayName: me.displayName,
      });
      useChannelVoice.getState().setJoined();

      // PTT — стартовое mute, unmute по нажатию хоткея.
      const prefs = useVoicePrefs.getState();
      if (prefs.mode === 'push-to-talk') {
        await room.setMuted(true);
        await bindPtt(prefs.pttShortcut, {
          onPress: () => {
            void this.room?.setMuted(false);
          },
          onRelease: () => {
            void this.room?.setMuted(true);
          },
        });
      }
    } catch (err) {
      await this.tearDown();
      useChannelVoice
        .getState()
        .setError(err instanceof Error ? err.message : 'join_failed');
    }
  }

  async leave(): Promise<void> {
    if (useChannelVoice.getState().phase === 'idle') return;
    useChannelVoice.getState().setLeaving();
    await this.tearDown();
  }

  async toggleMute(): Promise<void> {
    if (!this.room) return;
    const me = this.deps.getMe();
    if (!me) return;
    const current = useChannelVoice.getState().participants.get(me.id);
    const next = current?.audioEnabled ?? false; // если был enabled — мьютим
    await this.room.setMuted(next);
  }

  private async tearDown(): Promise<void> {
    void unbindPtt();
    if (this.room) {
      await this.room.leave().catch(() => undefined);
      this.room = null;
    }
    useChannelVoice.getState().reset();
  }
}
