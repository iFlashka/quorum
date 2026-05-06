import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket, type RawData } from 'ws';
import { setupRig, type TestActor, type TestRig } from './helpers/setup-app.js';
import type { ServerEvent } from '@quorum/shared';
import { channels, guilds as guildsTable, invites, members } from '../src/db/schema.js';
import { hashPassword } from '../src/modules/auth/password.js';
import { users } from '../src/db/schema.js';

interface OpenedClient {
  ws: WebSocket;
  inbox: ServerEvent[];
  waitFor: <T extends ServerEvent['t']>(
    t: T,
    matcher?: (event: Extract<ServerEvent, { t: T }>) => boolean,
    timeoutMs?: number,
  ) => Promise<Extract<ServerEvent, { t: T }>>;
  send: (event: object) => void;
  close: () => Promise<void>;
}

describe('1-on-1 call signaling', () => {
  let rig: TestRig;
  let alice: TestActor;
  let bob: TestActor;
  /** carol — в отдельной гилде, без пересечения с alice. */
  let carolToken: string;
  let carolId: string;
  let baseUrl: string;

  beforeAll(async () => {
    rig = await setupRig();
    alice = await rig.register('alice');
    bob = await rig.register('bob');

    // Создаём отдельную гилду без alice/bob и заводим туда carol — чтобы проверить
    // что alice не может позвонить carol.
    const passwordHash = await hashPassword('password123');
    const [carol] = await rig.testDb.db
      .insert(users)
      .values({ username: 'carol', passwordHash, displayName: 'Carol' })
      .returning();
    if (!carol) throw new Error('failed to seed carol');
    carolId = carol.id;

    const [otherGuild] = await rig.testDb.db
      .insert(guildsTable)
      .values({ name: 'Other', ownerId: carol.id })
      .returning();
    if (!otherGuild) throw new Error('failed to seed other guild');
    await rig.testDb.db
      .insert(members)
      .values({ guildId: otherGuild.id, userId: carol.id, role: 'owner' });
    await rig.testDb.db
      .insert(channels)
      .values({ guildId: otherGuild.id, kind: 'text', name: 'general', position: 0 });
    await rig.testDb.db.insert(invites).values({
      code: 'OTHERGUILD',
      guildId: otherGuild.id,
      createdBy: carol.id,
      maxUses: null,
    });

    const loginRes = await rig.app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { username: 'carol', password: 'password123' },
    });
    if (loginRes.statusCode !== 200) {
      throw new Error(`carol login failed: ${loginRes.statusCode} ${loginRes.body}`);
    }
    const body = loginRes.json<{ tokens: { accessToken: string } }>();
    carolToken = body.tokens.accessToken;

    const addr = await rig.app.listen({ host: '127.0.0.1', port: 0 });
    baseUrl = addr.replace(/^http:\/\//, 'ws://') + '/ws';
  }, 90_000);

  afterAll(async () => {
    await rig.close();
  });

  async function open(token: string): Promise<OpenedClient> {
    const ws = new WebSocket(baseUrl);
    const inbox: ServerEvent[] = [];
    const waiters: ((event: ServerEvent) => void)[] = [];

    ws.on('message', (raw: RawData) => {
      const text = Buffer.isBuffer(raw)
        ? raw.toString('utf8')
        : Array.isArray(raw)
          ? Buffer.concat(raw).toString('utf8')
          : Buffer.from(raw).toString('utf8');
      const event = JSON.parse(text) as ServerEvent;
      inbox.push(event);
      for (const fn of waiters.slice()) fn(event);
    });

    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve());
      ws.once('error', reject);
    });
    ws.send(JSON.stringify({ t: 'hello', access: token }));

    const waitFor = async <T extends ServerEvent['t']>(
      t: T,
      matcher?: (event: Extract<ServerEvent, { t: T }>) => boolean,
      timeoutMs = 3_000,
    ): Promise<Extract<ServerEvent, { t: T }>> => {
      for (const e of inbox) {
        if (e.t === t) {
          const cand = e as Extract<ServerEvent, { t: T }>;
          if (!matcher || matcher(cand)) return cand;
        }
      }
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          waiters.splice(waiters.indexOf(handler), 1);
          reject(
            new Error(
              `timeout waiting for "${t}"; inbox=${inbox.map((e) => e.t).join(',')}`,
            ),
          );
        }, timeoutMs);
        const handler = (event: ServerEvent): void => {
          if (event.t !== t) return;
          const cand = event as Extract<ServerEvent, { t: T }>;
          if (matcher && !matcher(cand)) return;
          clearTimeout(timer);
          waiters.splice(waiters.indexOf(handler), 1);
          resolve(cand);
        };
        waiters.push(handler);
      });
    };

    const close = async (): Promise<void> => {
      if (ws.readyState === ws.OPEN || ws.readyState === ws.CONNECTING) {
        await new Promise<void>((resolve) => {
          ws.once('close', () => resolve());
          ws.close();
        });
      }
    };

    return {
      ws,
      inbox,
      waitFor,
      send: (event) => ws.send(JSON.stringify(event)),
      close,
    };
  }

  it('invite → accept → offer/answer/ice форвардятся → hangup → ended', async () => {
    const a = await open(alice.accessToken);
    const b = await open(bob.accessToken);
    await a.waitFor('ready');
    await b.waitFor('ready');

    a.send({ t: 'call.invite', toUserId: bob.id });

    const aRing = await a.waitFor('call.ringing');
    const bRing = await b.waitFor('call.ringing');
    expect(aRing.callId).toBe(bRing.callId);
    expect(bRing.fromUserId).toBe(alice.id);
    const callId = aRing.callId;

    b.send({ t: 'call.accept', callId });
    await a.waitFor('call.accepted', (e) => e.callId === callId);
    await b.waitFor('call.accepted', (e) => e.callId === callId);

    a.send({ t: 'call.offer', callId, sdp: 'v=0\r\nfake-offer' });
    const offer = await b.waitFor('call.offer', (e) => e.callId === callId);
    expect(offer.sdp).toContain('fake-offer');

    b.send({ t: 'call.answer', callId, sdp: 'v=0\r\nfake-answer' });
    const answer = await a.waitFor('call.answer', (e) => e.callId === callId);
    expect(answer.sdp).toContain('fake-answer');

    a.send({ t: 'call.ice', callId, candidate: '{"candidate":"a=candidate:..."}' });
    const ice = await b.waitFor('call.ice', (e) => e.callId === callId);
    expect(ice.candidate).toContain('candidate');

    a.send({ t: 'call.hangup', callId });
    await b.waitFor('call.ended', (e) => e.callId === callId);

    await a.close();
    await b.close();
  });

  it('decline — звонящий получает declined:rejected', async () => {
    const a = await open(alice.accessToken);
    const b = await open(bob.accessToken);
    await a.waitFor('ready');
    await b.waitFor('ready');

    a.send({ t: 'call.invite', toUserId: bob.id });
    const ring = await b.waitFor('call.ringing');

    b.send({ t: 'call.decline', callId: ring.callId, reason: 'rejected' });
    const declined = await a.waitFor(
      'call.declined',
      (e) => e.callId === ring.callId,
    );
    expect(declined.reason).toBe('rejected');

    await a.close();
    await b.close();
  });

  it('cancel до accept — звонимый получает cancelled', async () => {
    const a = await open(alice.accessToken);
    const b = await open(bob.accessToken);
    await a.waitFor('ready');
    await b.waitFor('ready');

    a.send({ t: 'call.invite', toUserId: bob.id });
    const ring = await b.waitFor('call.ringing');

    a.send({ t: 'call.cancel', callId: ring.callId });
    await b.waitFor('call.cancelled', (e) => e.callId === ring.callId);

    await a.close();
    await b.close();
  });

  it('disconnect звонящего во время ringing → у звонимого declined:unreachable', async () => {
    const a = await open(alice.accessToken);
    const b = await open(bob.accessToken);
    await a.waitFor('ready');
    await b.waitFor('ready');

    a.send({ t: 'call.invite', toUserId: bob.id });
    await b.waitFor('call.ringing');

    await a.close();
    const declined = await b.waitFor('call.declined');
    expect(declined.reason).toBe('unreachable');

    await b.close();
  });

  it('invite в юзера без общей гилды → error call_forbidden, без ringing', async () => {
    const a = await open(alice.accessToken);
    const c = await open(carolToken);
    await a.waitFor('ready');
    await c.waitFor('ready');

    a.send({ t: 'call.invite', toUserId: carolId });

    const err = await a.waitFor('error');
    expect(err.code).toBe('call_forbidden');

    // У carol точно не должно быть ringing.
    await new Promise((r) => setTimeout(r, 100));
    expect(c.inbox.some((e) => e.t === 'call.ringing')).toBe(false);

    await a.close();
    await c.close();
  });
});
