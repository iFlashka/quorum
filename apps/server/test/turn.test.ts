import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { TurnService } from '../src/modules/turn/service.js';

describe('TurnService', () => {
  it('isEnabled=false когда нет секрета или urls', () => {
    expect(new TurnService({ sharedSecret: '', urls: [], ttlSeconds: 3600 }).isEnabled()).toBe(
      false,
    );
    expect(new TurnService({ sharedSecret: 's', urls: [], ttlSeconds: 3600 }).isEnabled()).toBe(
      false,
    );
    expect(
      new TurnService({ sharedSecret: '', urls: ['turn:x'], ttlSeconds: 3600 }).isEnabled(),
    ).toBe(false);
  });

  it('генерит username=<exp>:<userId> и base64 HMAC-SHA1', () => {
    const service = new TurnService({
      sharedSecret: 'topsecret',
      urls: ['turn:turn.example.com:3478'],
      ttlSeconds: 600,
    });
    const now = new Date('2026-05-06T12:00:00Z');
    const userId = '11111111-1111-1111-1111-111111111111';

    const result = service.generate(userId, now);

    expect(result.iceServers).toHaveLength(1);
    const server = result.iceServers[0]!;
    expect(server.urls).toEqual(['turn:turn.example.com:3478']);

    const expectedExp = Math.floor(now.getTime() / 1000) + 600;
    expect(server.username).toBe(`${expectedExp}:${userId}`);
    expect(result.expiresAt).toBe(expectedExp);

    const expectedCred = createHmac('sha1', 'topsecret').update(server.username).digest('base64');
    expect(server.credential).toBe(expectedCred);
    expect(service.verifyCredential(server.username, server.credential)).toBe(true);
  });

  it('пустой ответ когда сервис выключен', () => {
    const service = new TurnService({ sharedSecret: '', urls: [], ttlSeconds: 60 });
    expect(service.generate('user-1')).toEqual({ iceServers: [], expiresAt: 0 });
  });
});
