import { beforeEach, describe, expect, it } from 'vitest';
import { countUnreadChannels, useRealtime } from './store';

function reset(): void {
  useRealtime.setState({
    typing: new Map(),
    presence: new Map(),
    lastReadByChannel: new Map(),
    lastSeenByChannel: new Map(),
  });
}

describe('useRealtime store', () => {
  beforeEach(reset);

  it('setPresence + setManyPresence обновляют presence', () => {
    const { setPresence, setManyPresence } = useRealtime.getState();

    setPresence('user-a', 'online');
    expect(useRealtime.getState().presence.get('user-a')).toBe('online');

    setManyPresence([
      { userId: 'user-a', status: 'offline' },
      { userId: 'user-b', status: 'online' },
    ]);
    const presence = useRealtime.getState().presence;
    expect(presence.get('user-a')).toBe('offline');
    expect(presence.get('user-b')).toBe('online');
  });

  it('noteTyping + clearTyping; pruneExpired убирает протухшие', () => {
    const { noteTyping, clearTyping, pruneExpired } = useRealtime.getState();
    const now = Date.now();

    noteTyping({ channelId: 'ch-1', userId: 'u-1' });
    noteTyping({ channelId: 'ch-1', userId: 'u-2' });
    expect(useRealtime.getState().typing.get('ch-1')?.size).toBe(2);

    clearTyping('ch-1', 'u-1');
    expect(useRealtime.getState().typing.get('ch-1')?.size).toBe(1);

    // Сдвинем «сейчас» на 10s вперёд — TTL = 8s, всё должно протухнуть.
    pruneExpired(now + 10_000);
    expect(useRealtime.getState().typing.get('ch-1')).toBeUndefined();
  });

  it('markRead + noteIncoming формируют unread-state', () => {
    const { noteIncoming, markRead } = useRealtime.getState();

    noteIncoming('ch-1', 'msg-1');
    let s = useRealtime.getState();
    expect(s.lastSeenByChannel.get('ch-1')).toBe('msg-1');
    expect(s.lastReadByChannel.get('ch-1')).toBeUndefined();
    // unread (seen ≠ read и read=undefined → видим как unread)

    markRead('ch-1', 'msg-1');
    s = useRealtime.getState();
    expect(s.lastReadByChannel.get('ch-1')).toBe('msg-1');
  });

  it('countUnreadChannels — каналы где seen ≠ read', () => {
    const seen = new Map([
      ['ch-1', 'm-10'],
      ['ch-2', 'm-20'],
      ['ch-3', 'm-30'],
    ]);
    const read = new Map([
      ['ch-1', 'm-10'], // прочитан
      ['ch-2', 'm-15'], // отстаёт → unread
      // ch-3 → отсутствует в read → unread
    ]);
    expect(countUnreadChannels(seen, read)).toBe(2);
  });
});
