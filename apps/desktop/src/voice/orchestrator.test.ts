import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ClientEvent,
  ServerEvent,
  TurnCredentialsResponse,
} from '@quorum/shared';
import { useVoice, type VoiceParticipant } from './store';

// Делаем FakePeer-инстансы доступными из теста через vi.hoisted (важно: factory
// vi.mock запускается ДО импортов теста, поэтому нужен hoisted-контейнер).
const peerHandle = vi.hoisted(() => {
  interface FakePeer {
    attached: boolean;
    closed: boolean;
    muted: boolean;
    attachLocalStream(stream: MediaStream): void;
    createOffer(): Promise<string>;
    applyOffer(sdp: string): Promise<string>;
    applyAnswer(sdp: string): Promise<void>;
    addRemoteIce(candidate: string): Promise<void>;
    setMuted(muted: boolean): void;
    close(): void;
  }
  return { peers: [] as FakePeer[] };
});

vi.mock('./peer', () => {
  return {
    VoicePeer: class {
      attached = false;
      closed = false;
      muted = false;
      constructor() {
        peerHandle.peers.push(this);
      }
      attachLocalStream(_stream: MediaStream): void {
        this.attached = true;
      }
      createOffer(): Promise<string> {
        return Promise.resolve('v=0\r\nfake-offer');
      }
      applyOffer(_sdp: string): Promise<string> {
        return Promise.resolve('v=0\r\nfake-answer');
      }
      applyAnswer(_sdp: string): Promise<void> {
        return Promise.resolve();
      }
      addRemoteIce(_candidate: string): Promise<void> {
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

  it('placeCall → отправляет invite и переводит phase=calling', () => {
    orchestrator.placeCall(PEER_ID);
    expect(useVoice.getState().phase).toBe('calling');
    expect(useVoice.getState().peer?.userId).toBe(PEER_ID);
    expect(sentEvents).toEqual([{ t: 'call.invite', toUserId: PEER_ID }]);
  });

  it('echo own ringing — caller сохраняет callId', () => {
    orchestrator.placeCall(PEER_ID);
    emit({ t: 'call.ringing', callId: CALL_ID, fromUserId: ME_ID });
    expect(useVoice.getState().callId).toBe(CALL_ID);
    expect(useVoice.getState().phase).toBe('calling');
  });

  it('incoming ringing — phase=ringing с peerInfo', () => {
    emit({ t: 'call.ringing', callId: CALL_ID, fromUserId: PEER_ID });
    expect(useVoice.getState().phase).toBe('ringing');
    expect(useVoice.getState().peer?.userId).toBe(PEER_ID);
    expect(useVoice.getState().callId).toBe(CALL_ID);
  });

  it('incoming во время другого звонка — auto-decline busy', () => {
    orchestrator.placeCall(PEER_ID);
    sentEvents.length = 0;
    emit({ t: 'call.ringing', callId: 'other', fromUserId: 'other-user' });
    expect(sentEvents).toEqual([
      { t: 'call.decline', callId: 'other', reason: 'busy' },
    ]);
  });

  it('caller flow: invite → ringing(echo) → accepted → отправляет offer', async () => {
    orchestrator.placeCall(PEER_ID);
    emit({ t: 'call.ringing', callId: CALL_ID, fromUserId: ME_ID });
    emit({ t: 'call.accepted', callId: CALL_ID });
    await flushPromises();

    expect(useVoice.getState().phase).toBe('connecting');
    expect(lastPeer()?.attached).toBe(true);
    const offer = sentEvents.find((e) => e.t === 'call.offer');
    expect(offer).toBeDefined();
    expect(offer && 'sdp' in offer ? offer.sdp : '').toContain('fake-offer');
  });

  it('callee flow: ringing → accept → принимает offer и шлёт answer', async () => {
    emit({ t: 'call.ringing', callId: CALL_ID, fromUserId: PEER_ID });
    orchestrator.accept();
    expect(sentEvents).toContainEqual({ t: 'call.accept', callId: CALL_ID });

    emit({ t: 'call.accepted', callId: CALL_ID });
    await flushPromises();
    expect(useVoice.getState().phase).toBe('connecting');

    sentEvents.length = 0;
    emit({ t: 'call.offer', callId: CALL_ID, sdp: 'remote-offer' });
    await flushPromises();
    const answer = sentEvents.find((e) => e.t === 'call.answer');
    expect(answer).toBeDefined();
    expect(answer && 'sdp' in answer ? answer.sdp : '').toContain('fake-answer');
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

  it('hangup из active → отправляет call.hangup и сбрасывает', async () => {
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

  it('toggleMute меняет стор и проксирует в peer', async () => {
    orchestrator.placeCall(PEER_ID);
    emit({ t: 'call.ringing', callId: CALL_ID, fromUserId: ME_ID });
    emit({ t: 'call.accepted', callId: CALL_ID });
    await flushPromises();
    const peer = lastPeer();

    orchestrator.toggleMute();
    expect(useVoice.getState().muted).toBe(true);
    expect(peer?.muted).toBe(true);

    orchestrator.toggleMute();
    expect(useVoice.getState().muted).toBe(false);
    expect(peer?.muted).toBe(false);
  });
});

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
