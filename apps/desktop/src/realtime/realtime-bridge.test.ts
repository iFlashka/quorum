import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import type {
  ListMessagesResponse,
  PublicMessage,
  ServerEvent,
} from '@quorum/shared';
import { attachRealtimeBridge, findChannelName } from './realtime-bridge';
import type { WebSocketManager } from './WebSocketManager';
import { useRealtime } from './store';

interface InfinitePages {
  pageParams: unknown[];
  pages: ListMessagesResponse[];
}

function makeMessage(overrides: Partial<PublicMessage> = {}): PublicMessage {
  return {
    id: 'msg-1',
    channelId: 'ch-1',
    author: {
      id: 'u-1',
      username: 'alice',
      displayName: 'Alice',
      avatarUrl: null,
    },
    content: 'hi',
    createdAt: new Date().toISOString(),
    editedAt: null,
    replyToMessageId: null,
    replyToPreview: null,
    mentionedUserIds: [],
    attachments: [],
    reactions: [],
    ...overrides,
  };
}

function makeFakeWs(): { ws: WebSocketManager; emit: (e: ServerEvent) => void } {
  let listener: ((event: ServerEvent) => void) | null = null;
  const ws = {
    subscribe: (cb: (event: ServerEvent) => void) => {
      listener = cb;
      return () => {
        listener = null;
      };
    },
  } as unknown as WebSocketManager;
  return {
    ws,
    emit: (e) => listener?.(e),
  };
}

describe('attachRealtimeBridge', () => {
  let qc: QueryClient;
  let detach: () => void;

  beforeEach(() => {
    vi.useFakeTimers();
    qc = new QueryClient();
    useRealtime.setState({
      typing: new Map(),
      presence: new Map(),
      lastReadByChannel: new Map(),
      lastSeenByChannel: new Map(),
    });
  });

  afterEach(() => {
    detach?.();
    vi.useRealTimers();
  });

  it('ready → setManyPresence', () => {
    const { ws, emit } = makeFakeWs();
    detach = attachRealtimeBridge(ws, qc);

    emit({
      t: 'ready',
      user: {
        id: 'me',
        username: 'me',
        displayName: 'Me',
        avatarUrl: null,
        status: 'online',
        email: null,
      },
      guilds: [],
      presence: [
        { userId: 'u-1', status: 'online' },
        { userId: 'u-2', status: 'offline' },
      ],
    });

    const presence = useRealtime.getState().presence;
    expect(presence.get('u-1')).toBe('online');
    expect(presence.get('u-2')).toBe('offline');
  });

  it('presence.update → setPresence', () => {
    const { ws, emit } = makeFakeWs();
    detach = attachRealtimeBridge(ws, qc);

    emit({ t: 'presence.update', userId: 'u-9', status: 'online' });
    expect(useRealtime.getState().presence.get('u-9')).toBe('online');

    emit({ t: 'presence.update', userId: 'u-9', status: 'offline' });
    expect(useRealtime.getState().presence.get('u-9')).toBe('offline');
  });

  it('typing → noteTyping в realtime-store', () => {
    const { ws, emit } = makeFakeWs();
    detach = attachRealtimeBridge(ws, qc);

    emit({ t: 'typing', channelId: 'ch-1', userId: 'u-7' });
    expect(useRealtime.getState().typing.get('ch-1')?.has('u-7')).toBe(true);
  });

  it('message.create → добавляется в конец infinite-cache + noteIncoming', () => {
    const initial: InfinitePages = {
      pageParams: [null],
      pages: [{ messages: [makeMessage({ id: 'old' })], hasMore: false }],
    };
    qc.setQueryData(['messages', 'ch-1'], initial);

    const { ws, emit } = makeFakeWs();
    detach = attachRealtimeBridge(ws, qc);

    const msg = makeMessage({ id: 'new', channelId: 'ch-1' });
    emit({ t: 'message.create', message: msg });

    const data = qc.getQueryData<InfinitePages>(['messages', 'ch-1'])!;
    const last = data.pages[data.pages.length - 1]!;
    expect(last.messages.map((m) => m.id)).toEqual(['old', 'new']);
    expect(useRealtime.getState().lastSeenByChannel.get('ch-1')).toBe('new');
  });

  it('message.update → заменяет message в cache', () => {
    const initial: InfinitePages = {
      pageParams: [null],
      pages: [{ messages: [makeMessage({ id: 'm-1', content: 'old' })], hasMore: false }],
    };
    qc.setQueryData(['messages', 'ch-1'], initial);

    const { ws, emit } = makeFakeWs();
    detach = attachRealtimeBridge(ws, qc);

    emit({
      t: 'message.update',
      message: makeMessage({ id: 'm-1', content: 'new' }),
    });

    const data = qc.getQueryData<InfinitePages>(['messages', 'ch-1'])!;
    expect(data.pages[0]!.messages[0]!.content).toBe('new');
  });

  it('message.delete → удаляет message из cache', () => {
    const initial: InfinitePages = {
      pageParams: [null],
      pages: [
        {
          messages: [makeMessage({ id: 'm-1' }), makeMessage({ id: 'm-2' })],
          hasMore: false,
        },
      ],
    };
    qc.setQueryData(['messages', 'ch-1'], initial);

    const { ws, emit } = makeFakeWs();
    detach = attachRealtimeBridge(ws, qc);

    emit({ t: 'message.delete', channelId: 'ch-1', messageId: 'm-1' });

    const data = qc.getQueryData<InfinitePages>(['messages', 'ch-1'])!;
    expect(data.pages[0]!.messages.map((m) => m.id)).toEqual(['m-2']);
  });

  it('reaction.add → инкрементит count, reaction.remove → декрементит / удаляет', () => {
    const initial: InfinitePages = {
      pageParams: [null],
      pages: [{ messages: [makeMessage({ id: 'm-1' })], hasMore: false }],
    };
    qc.setQueryData(['messages', 'ch-1'], initial);

    const { ws, emit } = makeFakeWs();
    detach = attachRealtimeBridge(ws, qc);

    emit({
      t: 'reaction.add',
      channelId: 'ch-1',
      messageId: 'm-1',
      userId: 'u-x',
      emoji: '👍',
    });

    let msg = qc.getQueryData<InfinitePages>(['messages', 'ch-1'])!.pages[0]!.messages[0]!;
    expect(msg.reactions).toHaveLength(1);
    expect(msg.reactions[0]!.count).toBe(1);

    emit({
      t: 'reaction.remove',
      channelId: 'ch-1',
      messageId: 'm-1',
      userId: 'u-x',
      emoji: '👍',
    });

    msg = qc.getQueryData<InfinitePages>(['messages', 'ch-1'])!.pages[0]!.messages[0]!;
    expect(msg.reactions).toHaveLength(0);
  });

  it('pong / auth_failed / error не падают', () => {
    const { ws, emit } = makeFakeWs();
    detach = attachRealtimeBridge(ws, qc);

    expect(() => emit({ t: 'pong' })).not.toThrow();
    expect(() =>
      emit({ t: 'auth_failed', reason: 'invalid_access' }),
    ).not.toThrow();
    expect(() =>
      emit({ t: 'error', code: 'foo', message: 'bar' }),
    ).not.toThrow();
  });

  it('onMessageCreate hook вызывается с PublicMessage', () => {
    const { ws, emit } = makeFakeWs();
    const onMessageCreate = vi.fn();
    detach = attachRealtimeBridge(ws, qc, { onMessageCreate });

    const msg = makeMessage({ id: 'm-9', channelId: 'ch-1' });
    emit({ t: 'message.create', message: msg });

    expect(onMessageCreate).toHaveBeenCalledTimes(1);
    expect(onMessageCreate.mock.calls[0]![0]).toBe(msg);
  });
});

describe('findChannelName', () => {
  it('находит имя канала по id обходя все ["channels", *] cache-entries', () => {
    const qc = new QueryClient();
    qc.setQueryData(['channels', 'g-1'], {
      channels: [
        { id: 'ch-1', name: 'general' },
        { id: 'ch-2', name: 'random' },
      ],
    });
    qc.setQueryData(['channels', 'g-2'], {
      channels: [{ id: 'ch-3', name: 'lounge' }],
    });

    expect(findChannelName(qc, 'ch-2')).toBe('random');
    expect(findChannelName(qc, 'ch-3')).toBe('lounge');
    expect(findChannelName(qc, 'ch-missing')).toBeNull();
  });
});
