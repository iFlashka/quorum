import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ClientEvent,
  ServerEvent,
  TurnCredentialsResponse,
} from '@quorum/shared';
import { useVoice, type VoiceParticipant } from './store';

/**
 * Тесты VoiceOrchestrator FSM с perfect-negotiation моком.
 * Реальный VoicePeer не запускаем — он требует RTCPeerConnection (jsdom не
 * поддерживает). Mock покрывает поверхность API: applyRemoteOffer/Answer,
 * forceOffer, addRemoteIce, setMuted, setCameraStream, setScreenStream,
 * setRemoteStreamMap, close.
 */

const peerHandle = vi.hoisted(() => {
  interface FakePeerInstance {
    closed: boolean;
    muted: boolean;
    cameraStream: MediaStream | null;
    screenStream: MediaStream | null;
    remoteCameraStreamId: string | null;
    remoteScreenStreamId: string | null;
    remoteOffersApplied: string[];
    remoteAnswersApplied: string[];
    forceOfferCalls: number;
    onLocalSdp?: (sdp: string, type: 'offer' | 'answer') => void;
    onLocalStreamsChanged?: (
      cameraStreamId: string | null,
      screenStreamId: string | null,
    ) => void;
    onStateChange?: (state: string) => void;
  }
  return { peers: [] as FakePeerInstance[] };
});

vi.mock('./peer', () => {
  return {
    VoicePeer: class {
      closed = false;
      muted = false;
      cameraStream: MediaStream | null = null;
      screenStream: MediaStream | null = null;
      remoteCameraStreamId: string | null = null;
      remoteScreenStreamId: string | null = null;
      remoteOffersApplied: string[] = [];
      remoteAnswersApplied: string[] = [];
      forceOfferCalls = 0;
      onLocalSdp?: (sdp: string, type: 'offer' | 'answer') => void;
      onLocalStreamsChanged?: (
        cameraStreamId: string | null,
        screenStreamId: string | null,
      ) => void;
      onStateChange?: (state: string) => void;

      constructor(opts: {
        onLocalSdp: (sdp: string, type: 'offer' | 'answer') => void;
        onLocalStreamsChanged: (c: string | null, s: string | null) => void;
        onStateChange: (state: string) => void;
      }) {
        this.onLocalSdp = opts.onLocalSdp;
        this.onLocalStreamsChanged = opts.onLocalStreamsChanged;
        this.onStateChange = opts.onStateChange;
        peerHandle.peers.push(this);
      }

      attachLocalAudio(_stream: MediaStream): void {
        // no-op в моке
      }

      setCameraStream(stream: MediaStream | null): void {
        this.cameraStream = stream;
        this.onLocalStreamsChanged?.(stream?.id ?? null, this.screenStream?.id ?? null);
      }

      setScreenStream(stream: MediaStream | null): void {
        this.screenStream = stream;
        this.onLocalStreamsChanged?.(this.cameraStream?.id ?? null, stream?.id ?? null);
      }

      setRemoteStreamMap(camera: string | null, screen: string | null): void {
        this.remoteCameraStreamId = camera;
        this.remoteScreenStreamId = screen;
      }

      applyRemoteOffer(sdp: string): Promise<void> {
        this.remoteOffersApplied.push(sdp);
        this.onLocalSdp?.('answer-sdp', 'answer');
        return Promise.resolve();
      }

      applyRemoteAnswer(sdp: string): Promise<void> {
        this.remoteAnswersApplied.push(sdp);
        return Promise.resolve();
      }

      addRemoteIce(_candidate: string): Promise<void> {
        return Promise.resolve();
      }

      forceOffer(): Promise<void> {
        this.forceOfferCalls++;
        this.onLocalSdp?.('offer-sdp', 'offer');
        return Promise.resolve();
      }

      setMuted(muted: boolean): void {
        this.muted = muted;
      }

      close(): void {
        this.closed = true;
      }
    },
  };
});

vi.mock('./devices', () => ({
  getMicrophoneStream: () => Promise.resolve({} as MediaStream),
  getCameraStream: () =>
    Promise.resolve({ id: 'cam-stream-id', getVideoTracks: () => [] } as unknown as MediaStream),
  getScreenShareStream: () =>
    Promise.resolve({
      id: 'screen-stream-id',
      getVideoTracks: () => [{ addEventListener: () => undefined }],
    } as unknown as MediaStream),
  stopStream: () => undefined,
}));

vi.mock('./ptt', () => ({
  bindPtt: () => Promise.resolve(),
  unbindPtt: () => Promise.resolve(),
}));

import { VoiceOrchestrator } from './orchestrator';

const ME_ID = '00000000-0000-0000-0000-00000000aaaa';
const PEER_ID = '00000000-0000-0000-0000-00000000bbbb';
const CALL_ID = '11111111-1111-1111-1111-111111111111';

describe('VoiceOrchestrator', () => {
  let sentEvents: ClientEvent[];
  let wsListener: ((e: ServerEvent) => void) | null;
  let orchestrator: VoiceOrchestrator;

  beforeEach(() => {
    sentEvents = [];
    wsListener = null;
    peerHandle.peers.length = 0;
    useVoice.getState().reset();

    const ws = {
      send: (e: ClientEvent) => sentEvents.push(e),
      subscribe: (cb: (e: ServerEvent) => void) => {
        wsListener = cb;
        return () => {
          wsListener = null;
        };
      },
    } as unknown as ConstructorParameters<typeof VoiceOrchestrator>[0]['ws'];

    const callsApi = {
      turnCredentials: (): Promise<TurnCredentialsResponse> =>
        Promise.resolve({ iceServers: [], expiresAt: 0 }),
    };

    const lookup = (userId: string): VoiceParticipant | null =>
      userId === PEER_ID
        ? { userId: PEER_ID, username: 'bob', displayName: 'Bob' }
        : null;

    orchestrator = new VoiceOrchestrator({
      ws,
      callsApi,
      lookupParticipant: lookup,
      getMeId: () => ME_ID,
    });
    orchestrator.start();
  });

  afterEach(() => {
    orchestrator.stop();
    vi.clearAllMocks();
  });

  function emit(event: ServerEvent): void {
    if (!wsListener) throw new Error('ws not subscribed');
    wsListener(event);
  }

  function lastPeer(): (typeof peerHandle.peers)[0] | undefined {
    return peerHandle.peers[peerHandle.peers.length - 1];
  }

  it('placeCall → invite + phase=calling', () => {
    orchestrator.placeCall(PEER_ID);
    expect(useVoice.getState().phase).toBe('calling');
    expect(sentEvents).toEqual([{ t: 'call.invite', toUserId: PEER_ID }]);
  });

  it('echo own ringing — caller сохраняет callId', () => {
    orchestrator.placeCall(PEER_ID);
    emit({ t: 'call.ringing', callId: CALL_ID, fromUserId: ME_ID });
    expect(useVoice.getState().callId).toBe(CALL_ID);
    expect(useVoice.getState().phase).toBe('calling');
  });

  it('incoming ringing — phase=ringing', () => {
    emit({ t: 'call.ringing', callId: CALL_ID, fromUserId: PEER_ID });
    expect(useVoice.getState().phase).toBe('ringing');
    expect(useVoice.getState().peer?.userId).toBe(PEER_ID);
  });

  it('busy — auto-decline incoming во время другого звонка', () => {
    orchestrator.placeCall(PEER_ID);
    sentEvents.length = 0;
    emit({ t: 'call.ringing', callId: 'other', fromUserId: 'other-user' });
    expect(sentEvents).toEqual([
      { t: 'call.decline', callId: 'other', reason: 'busy' },
    ]);
  });

  it('caller flow: invite → ringing(echo) → accepted → forceOffer + offer', async () => {
    orchestrator.placeCall(PEER_ID);
    emit({ t: 'call.ringing', callId: CALL_ID, fromUserId: ME_ID });
    emit({ t: 'call.accepted', callId: CALL_ID });
    await flushPromises();

    expect(useVoice.getState().phase).toBe('connecting');
    expect(lastPeer()?.forceOfferCalls).toBe(1);
    expect(sentEvents.find((e) => e.t === 'call.offer')).toBeDefined();
  });

  it('callee flow: accept → applyRemoteOffer → call.answer', async () => {
    emit({ t: 'call.ringing', callId: CALL_ID, fromUserId: PEER_ID });
    orchestrator.accept();
    expect(sentEvents).toContainEqual({ t: 'call.accept', callId: CALL_ID });

    emit({ t: 'call.accepted', callId: CALL_ID });
    await flushPromises();

    sentEvents.length = 0;
    emit({ t: 'call.offer', callId: CALL_ID, sdp: 'remote-offer' });
    await flushPromises();

    expect(lastPeer()?.remoteOffersApplied).toEqual(['remote-offer']);
    const answer = sentEvents.find((e) => e.t === 'call.answer');
    expect(answer).toBeDefined();
  });

  it('pending offer кэшируется до peerReady', async () => {
    // call.offer приходит ДО call.accepted (получили оба, но offer первым)
    emit({ t: 'call.ringing', callId: CALL_ID, fromUserId: PEER_ID });
    orchestrator.accept();
    emit({ t: 'call.offer', callId: CALL_ID, sdp: 'early-offer' });
    // peer ещё не создан → offer должен быть в pending
    expect(peerHandle.peers).toHaveLength(0);

    emit({ t: 'call.accepted', callId: CALL_ID });
    await flushPromises();

    // Теперь peer создан, pending-offer должен примениться
    expect(lastPeer()?.remoteOffersApplied).toContain('early-offer');
  });

  it('decline сбрасывает phase в idle', () => {
    emit({ t: 'call.ringing', callId: CALL_ID, fromUserId: PEER_ID });
    orchestrator.decline();
    expect(useVoice.getState().phase).toBe('idle');
    expect(sentEvents).toContainEqual({
      t: 'call.decline',
      callId: CALL_ID,
      reason: 'rejected',
    });
  });

  it('hangup из active → call.hangup + close peer', async () => {
    orchestrator.placeCall(PEER_ID);
    emit({ t: 'call.ringing', callId: CALL_ID, fromUserId: ME_ID });
    emit({ t: 'call.accepted', callId: CALL_ID });
    await flushPromises();
    const peer = lastPeer();

    sentEvents.length = 0;
    orchestrator.hangup();
    expect(sentEvents).toContainEqual({ t: 'call.hangup', callId: CALL_ID });
    expect(useVoice.getState().phase).toBe('idle');
    expect(peer?.closed).toBe(true);
  });

  it('toggleMute проксирует в peer', async () => {
    orchestrator.placeCall(PEER_ID);
    emit({ t: 'call.ringing', callId: CALL_ID, fromUserId: ME_ID });
    emit({ t: 'call.accepted', callId: CALL_ID });
    await flushPromises();
    const peer = lastPeer();

    orchestrator.toggleMute();
    expect(peer?.muted).toBe(true);
    expect(useVoice.getState().muted).toBe(true);

    orchestrator.toggleMute();
    expect(peer?.muted).toBe(false);
  });

  it('toggleCamera включает stream + шлёт call.media', async () => {
    orchestrator.placeCall(PEER_ID);
    emit({ t: 'call.ringing', callId: CALL_ID, fromUserId: ME_ID });
    emit({ t: 'call.accepted', callId: CALL_ID });
    await flushPromises();

    sentEvents.length = 0;
    await orchestrator.toggleCamera();

    expect(lastPeer()?.cameraStream).toBeTruthy();
    const media = sentEvents.find((e) => e.t === 'call.media');
    expect(media).toBeDefined();
    if (media && 'cameraStreamId' in media) {
      expect(media.cameraStreamId).toBe('cam-stream-id');
    }
  });

  it('call.media обновляет remote-stream-map', async () => {
    orchestrator.placeCall(PEER_ID);
    emit({ t: 'call.ringing', callId: CALL_ID, fromUserId: ME_ID });
    emit({ t: 'call.accepted', callId: CALL_ID });
    await flushPromises();

    emit({
      t: 'call.media',
      callId: CALL_ID,
      cameraStreamId: 'remote-cam-id',
      screenStreamId: null,
    });

    expect(lastPeer()?.remoteCameraStreamId).toBe('remote-cam-id');
    expect(lastPeer()?.remoteScreenStreamId).toBeNull();
  });

  it('call.ended серверное → tearDown без отправки hangup', async () => {
    orchestrator.placeCall(PEER_ID);
    emit({ t: 'call.ringing', callId: CALL_ID, fromUserId: ME_ID });
    emit({ t: 'call.accepted', callId: CALL_ID });
    await flushPromises();

    sentEvents.length = 0;
    emit({ t: 'call.ended', callId: CALL_ID });
    expect(useVoice.getState().phase).toBe('idle');
    expect(sentEvents.find((e) => e.t === 'call.hangup')).toBeUndefined();
  });
});

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
