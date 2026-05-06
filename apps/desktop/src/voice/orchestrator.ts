/**
 * Связывает WS-сигналинг (call.*) с VoicePeer и useVoice-стором. Один
 * orchestrator на сессию приложения; запускается после auth и живёт пока
 * runtime жив.
 *
 * UI зовёт `placeCall / accept / decline / cancel / hangup / toggleMute /
 * toggleDeafen` — orchestrator делает все side-effects (WS, getUserMedia,
 * создание peer'а, обновление стора).
 */

import type { ServerEvent } from '@quorum/shared';
import type { WebSocketManager } from '@/realtime/WebSocketManager';
import type { CallsApi } from '@/api/calls';
import { useVoice, type VoiceParticipant } from './store';
import { VoicePeer } from './peer';
import { getMicrophoneStream, stopStream } from './devices';
import { useVoicePrefs } from './prefs';
import { bindPtt, unbindPtt } from './ptt';

interface VoiceOrchestratorDeps {
  ws: WebSocketManager;
  callsApi: CallsApi;
  /** Lookup участника по userId — берём из members гилд (TanStack cache). */
  lookupParticipant: (userId: string) => VoiceParticipant | null;
  /** Текущий userId (мы сами) — нужен чтобы отличать caller от callee на ringing. */
  getMeId: () => string | null;
}

export class VoiceOrchestrator {
  private peer: VoicePeer | null = null;
  /**
   * `true` после того как peer создан И к нему подцеплен local stream
   * (готов принимать offer/answer и иметь sender-track). До этого момента
   * остальные сигналинг-события (offer / ice) кэшируются.
   */
  private peerReady = false;
  private pendingOffer: { callId: string; sdp: string } | null = null;
  private cachedIceServers: RTCIceServer[] = [];
  private iceExpiresAt = 0;
  private offWs: (() => void) | null = null;

  constructor(private readonly deps: VoiceOrchestratorDeps) {}

  start(): void {
    if (this.offWs) return;
    this.offWs = this.deps.ws.subscribe((event) => {
      void this.handleEvent(event);
    });
  }

  stop(): void {
    this.offWs?.();
    this.offWs = null;
    this.tearDown();
  }

  // ---- Public actions ----

  placeCall(toUserId: string): void {
    const meId = this.deps.getMeId();
    if (!meId || toUserId === meId) return;
    const phase = useVoice.getState().phase;
    if (phase !== 'idle') return;

    const peerInfo = this.deps.lookupParticipant(toUserId);
    if (!peerInfo) return;

    useVoice.getState().setOutgoing(peerInfo);
    this.deps.ws.send({ t: 'call.invite', toUserId });
  }

  accept(): void {
    const { phase, callId } = useVoice.getState();
    if (phase !== 'ringing' || !callId) return;
    this.deps.ws.send({ t: 'call.accept', callId });
  }

  decline(): void {
    const { phase, callId } = useVoice.getState();
    if (phase !== 'ringing' || !callId) return;
    this.deps.ws.send({ t: 'call.decline', callId, reason: 'rejected' });
    useVoice.getState().reset();
  }

  cancel(): void {
    const { phase, callId } = useVoice.getState();
    if (phase !== 'calling' || !callId) return;
    this.deps.ws.send({ t: 'call.cancel', callId });
    useVoice.getState().reset();
  }

  hangup(): void {
    const { phase, callId } = useVoice.getState();
    if (callId) {
      if (phase === 'active' || phase === 'connecting') {
        this.deps.ws.send({ t: 'call.hangup', callId });
      } else if (phase === 'calling') {
        this.deps.ws.send({ t: 'call.cancel', callId });
      } else if (phase === 'ringing') {
        this.deps.ws.send({ t: 'call.decline', callId, reason: 'rejected' });
      }
    }
    this.tearDown();
  }

  toggleMute(): void {
    const next = !useVoice.getState().muted;
    useVoice.getState().setMuted(next);
    this.peer?.setMuted(next);
  }

  /** Восстанавливаемое состояние mute, чтобы un-deafen возвращал mic в исходное. */
  private mutedBeforeDeafen: boolean | null = null;

  toggleDeafen(): void {
    const state = useVoice.getState();
    const nextDeafened = !state.deafened;
    state.setDeafened(nextDeafened);

    if (nextDeafened) {
      // Discord-like: deafen ⇒ автоматически mute; запоминаем предыдущее mute
      // чтобы un-deafen вернул как было.
      this.mutedBeforeDeafen = state.muted;
      if (!state.muted) {
        state.setMuted(true);
        this.peer?.setMuted(true);
      }
    } else {
      // Un-deafen: восстанавливаем mute как было ДО deafen.
      const restored = this.mutedBeforeDeafen ?? false;
      this.mutedBeforeDeafen = null;
      if (state.muted !== restored) {
        state.setMuted(restored);
        this.peer?.setMuted(restored);
      }
    }
  }

  // ---- WS event handling ----

  private async handleEvent(event: ServerEvent): Promise<void> {
    switch (event.t) {
      case 'call.ringing':
        this.onRinging(event.callId, event.fromUserId);
        return;
      case 'call.accepted':
        await this.onAccepted(event.callId);
        return;
      case 'call.declined':
      case 'call.cancelled':
      case 'call.ended':
        if (this.matchCall(event.callId)) this.tearDown();
        return;
      case 'call.offer':
        if (!this.matchCall(event.callId)) return;
        if (!this.peer || !this.peerReady) {
          // Стрим ещё не получен (getUserMedia в работе или ждёт permission) —
          // запоминаем offer и применим как только локальный stream готов.
          this.pendingOffer = { callId: event.callId, sdp: event.sdp };
          return;
        }
        await this.applyOffer(event.callId, event.sdp);
        return;
      case 'call.answer':
        if (!this.matchCall(event.callId) || !this.peer) return;
        try {
          await this.peer.applyAnswer(event.sdp);
        } catch {
          this.tearDown('webrtc_answer_failed');
        }
        return;
      case 'call.ice':
        if (!this.matchCall(event.callId) || !this.peer) return;
        await this.peer.addRemoteIce(event.candidate);
        return;
      default:
        return;
    }
  }

  private onRinging(callId: string, fromUserId: string): void {
    const meId = this.deps.getMeId();
    if (!meId) return;
    const state = useVoice.getState();
    if (fromUserId === meId) {
      // Эхо собственного invite: запоминаем callId для последующих cancel/hangup.
      if (state.phase === 'calling') state.setCallId(callId);
      return;
    }
    // Incoming.
    if (state.phase !== 'idle') {
      // Мы заняты — отбиваем сразу.
      this.deps.ws.send({ t: 'call.decline', callId, reason: 'busy' });
      return;
    }
    const peer = this.deps.lookupParticipant(fromUserId);
    if (!peer) {
      this.deps.ws.send({ t: 'call.decline', callId, reason: 'rejected' });
      return;
    }
    state.setIncoming(callId, peer);
  }

  private async onAccepted(callId: string): Promise<void> {
    const state = useVoice.getState();
    if (state.callId !== callId) return;
    state.setConnecting();

    try {
      const iceServers = await this.fetchIceServers();
      const peer = new VoicePeer({
        iceServers,
        onLocalIce: (candidate) => {
          this.deps.ws.send({ t: 'call.ice', callId, candidate });
        },
        onRemoteTrack: (stream) => {
          useVoice.getState().setRemoteStream(stream);
        },
        onStateChange: (connState) => {
          useVoice.getState().setConnectionState(connState);
          if (connState === 'connected' && useVoice.getState().phase === 'connecting') {
            useVoice.getState().setActive();
          }
          if (connState === 'failed') {
            this.tearDown('ice_failed');
          }
        },
      });
      this.peer = peer;

      const prefs = useVoicePrefs.getState();
      const stream = await getMicrophoneStream({
        noiseSuppression: prefs.noiseSuppression,
        echoCancellation: prefs.echoCancellation,
        autoGainControl: prefs.autoGainControl,
      });
      peer.attachLocalStream(stream);
      useVoice.getState().setLocalStream(stream);
      this.peerReady = true;

      // Если offer уже прилетал, пока ждали микрофон — применяем сейчас.
      if (this.pendingOffer?.callId === callId) {
        const offer = this.pendingOffer;
        this.pendingOffer = null;
        await this.applyOffer(offer.callId, offer.sdp);
      }

      // PTT — стартовое состояние mic = выключен; включается на keyDown хоткея.
      if (prefs.mode === 'push-to-talk') {
        peer.setMuted(true);
        useVoice.getState().setMuted(true);
        await bindPtt(prefs.pttShortcut, {
          onPress: () => {
            const s = useVoice.getState();
            // Не перетираем явный mute из меню/UI — если юзер сам выключил мик,
            // PTT не включает; включаем только если muted был выставлен нами.
            if (s.phase !== 'active' && s.phase !== 'connecting') return;
            s.setMuted(false);
            this.peer?.setMuted(false);
          },
          onRelease: () => {
            const s = useVoice.getState();
            if (s.phase !== 'active' && s.phase !== 'connecting') return;
            s.setMuted(true);
            this.peer?.setMuted(true);
          },
        });
      }

      if (state.isOfferer) {
        const sdp = await peer.createOffer();
        this.deps.ws.send({ t: 'call.offer', callId, sdp });
      }
      // Если answerer — peer ждёт offer от другой стороны.
    } catch (err) {
      this.tearDown(err instanceof Error ? err.message : 'media_error');
      // Информируем пир.
      this.deps.ws.send({ t: 'call.hangup', callId });
    }
  }

  private async applyOffer(callId: string, sdp: string): Promise<void> {
    if (!this.peer) return;
    try {
      const answer = await this.peer.applyOffer(sdp);
      this.deps.ws.send({ t: 'call.answer', callId, sdp: answer });
    } catch {
      this.tearDown('webrtc_offer_failed');
    }
  }

  private matchCall(callId: string): boolean {
    return useVoice.getState().callId === callId;
  }

  private async fetchIceServers(): Promise<RTCIceServer[]> {
    const now = Math.floor(Date.now() / 1000);
    if (this.cachedIceServers.length > 0 && this.iceExpiresAt - 30 > now) {
      return this.cachedIceServers;
    }
    try {
      const res = await this.deps.callsApi.turnCredentials();
      this.cachedIceServers = res.iceServers;
      this.iceExpiresAt = res.expiresAt;
    } catch {
      this.cachedIceServers = [];
      this.iceExpiresAt = 0;
    }
    return this.cachedIceServers;
  }

  private tearDown(error?: string): void {
    const { localStream } = useVoice.getState();
    stopStream(localStream);
    this.peer?.close();
    this.peer = null;
    this.peerReady = false;
    this.pendingOffer = null;
    this.mutedBeforeDeafen = null;
    void unbindPtt();
    if (error) {
      useVoice.getState().setError(error);
    }
    useVoice.getState().reset();
  }
}
