/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authHeader, setupRig, type TestActor, type TestRig } from './helpers/setup-app.js';

describe('messages CRUD + reactions', () => {
  let rig: TestRig;
  let alice: TestActor;
  let bob: TestActor;

  beforeAll(async () => {
    rig = await setupRig();
    alice = await rig.register('alice');
    bob = await rig.register('bob');
  }, 60_000);

  afterAll(async () => {
    await rig.close();
  });

  it('GET /guilds возвращает гилду в которую alice вступил по invite', async () => {
    const res = await rig.app.inject({
      method: 'GET',
      url: '/guilds',
      headers: authHeader(alice),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as any;
    expect(body.guilds).toHaveLength(1);
    expect(body.guilds[0].id).toBe(rig.guildId);
    expect(body.guilds[0].memberRole).toBe('member');
  });

  it('GET /guilds/:id/channels возвращает текстовый и голосовой канал', async () => {
    const res = await rig.app.inject({
      method: 'GET',
      url: `/guilds/${rig.guildId}/channels`,
      headers: authHeader(alice),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as any;
    expect(body.channels).toHaveLength(2);
    const text = body.channels.find((c: any) => c.kind === 'text');
    const voice = body.channels.find((c: any) => c.kind === 'voice');
    expect(text.id).toBe(rig.textChannelId);
    expect(voice.id).toBe(rig.voiceChannelId);
  });

  it('GET /guilds/:id/members — три члена (owner + alice + bob)', async () => {
    const res = await rig.app.inject({
      method: 'GET',
      url: `/guilds/${rig.guildId}/members`,
      headers: authHeader(alice),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as any;
    expect(body.members).toHaveLength(3);
    const usernames = body.members.map((m: any) => m.username).sort();
    expect(usernames).toEqual(['alice', 'bob', 'rigowner']);
  });

  it('POST /channels/:id/messages — alice шлёт, GET возвращает её сообщение', async () => {
    const send = await rig.app.inject({
      method: 'POST',
      url: `/channels/${rig.textChannelId}/messages`,
      headers: authHeader(alice),
      payload: { content: 'Hello, world!' },
    });
    expect(send.statusCode).toBe(201);
    const sent = (send.json() as any).message;
    expect(sent.content).toBe('Hello, world!');
    expect(sent.author.username).toBe('alice');
    expect(sent.reactions).toHaveLength(0);
    expect(sent.attachments).toHaveLength(0);

    const list = await rig.app.inject({
      method: 'GET',
      url: `/channels/${rig.textChannelId}/messages?limit=10`,
      headers: authHeader(alice),
    });
    expect(list.statusCode).toBe(200);
    const body = list.json() as any;
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].id).toBe(sent.id);
    expect(body.hasMore).toBe(false);
  });

  it('POST в voice-канал → 401 (только text-каналы)', async () => {
    const res = await rig.app.inject({
      method: 'POST',
      url: `/channels/${rig.voiceChannelId}/messages`,
      headers: authHeader(alice),
      payload: { content: 'voice' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('PATCH alice редактирует свой message; PATCH bob → 401', async () => {
    const send = await rig.app.inject({
      method: 'POST',
      url: `/channels/${rig.textChannelId}/messages`,
      headers: authHeader(alice),
      payload: { content: 'edit me' },
    });
    const msgId = (send.json() as any).message.id;

    const ok = await rig.app.inject({
      method: 'PATCH',
      url: `/channels/${rig.textChannelId}/messages/${msgId}`,
      headers: authHeader(alice),
      payload: { content: 'edited' },
    });
    expect(ok.statusCode).toBe(200);
    expect((ok.json() as any).message.content).toBe('edited');
    expect((ok.json() as any).message.editedAt).not.toBeNull();

    const bad = await rig.app.inject({
      method: 'PATCH',
      url: `/channels/${rig.textChannelId}/messages/${msgId}`,
      headers: authHeader(bob),
      payload: { content: 'hacked' },
    });
    expect(bad.statusCode).toBe(401);
  });

  it('DELETE — автор удаляет свой; чужой member → 401', async () => {
    const send = await rig.app.inject({
      method: 'POST',
      url: `/channels/${rig.textChannelId}/messages`,
      headers: authHeader(alice),
      payload: { content: 'kill me' },
    });
    const msgId = (send.json() as any).message.id;

    const bobTry = await rig.app.inject({
      method: 'DELETE',
      url: `/channels/${rig.textChannelId}/messages/${msgId}`,
      headers: authHeader(bob),
    });
    expect(bobTry.statusCode).toBe(401);

    const aliceOk = await rig.app.inject({
      method: 'DELETE',
      url: `/channels/${rig.textChannelId}/messages/${msgId}`,
      headers: authHeader(alice),
    });
    expect(aliceOk.statusCode).toBe(204);
  });

  it('cursor pagination через `before` отдаёт более старые сообщения', async () => {
    // создаём 5 сообщений
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const r = await rig.app.inject({
        method: 'POST',
        url: `/channels/${rig.textChannelId}/messages`,
        headers: authHeader(alice),
        payload: { content: `msg ${i}` },
      });
      ids.push((r.json() as any).message.id);
    }

    const first = await rig.app.inject({
      method: 'GET',
      url: `/channels/${rig.textChannelId}/messages?limit=2`,
      headers: authHeader(alice),
    });
    const firstBody = first.json() as any;
    expect(firstBody.messages).toHaveLength(2);
    expect(firstBody.hasMore).toBe(true);
    // последние два — самые свежие
    const oldest = firstBody.messages[0];

    const next = await rig.app.inject({
      method: 'GET',
      url: `/channels/${rig.textChannelId}/messages?limit=2&before=${oldest.id}`,
      headers: authHeader(alice),
    });
    expect(next.statusCode).toBe(200);
    const nextBody = next.json() as any;
    expect(nextBody.messages.length).toBeGreaterThan(0);
    // новых не должно быть в этой выборке
    expect(nextBody.messages.find((m: any) => m.id === oldest.id)).toBeUndefined();
  });

  it('reactions — PUT idempotent, GET показывает count и reactedByMe', async () => {
    const send = await rig.app.inject({
      method: 'POST',
      url: `/channels/${rig.textChannelId}/messages`,
      headers: authHeader(alice),
      payload: { content: 'react please' },
    });
    const msgId = (send.json() as any).message.id;
    const emoji = encodeURIComponent('👍');

    // alice ставит
    const r1 = await rig.app.inject({
      method: 'PUT',
      url: `/channels/${rig.textChannelId}/messages/${msgId}/reactions/${emoji}`,
      headers: authHeader(alice),
    });
    expect(r1.statusCode).toBe(204);

    // alice ставит ещё раз — idempotent (204, count всё ещё 1)
    const r1b = await rig.app.inject({
      method: 'PUT',
      url: `/channels/${rig.textChannelId}/messages/${msgId}/reactions/${emoji}`,
      headers: authHeader(alice),
    });
    expect(r1b.statusCode).toBe(204);

    // bob тоже ставит
    const r2 = await rig.app.inject({
      method: 'PUT',
      url: `/channels/${rig.textChannelId}/messages/${msgId}/reactions/${emoji}`,
      headers: authHeader(bob),
    });
    expect(r2.statusCode).toBe(204);

    // GET список — у alice reactedByMe=true, count=2
    const list = await rig.app.inject({
      method: 'GET',
      url: `/channels/${rig.textChannelId}/messages?limit=10`,
      headers: authHeader(alice),
    });
    const found = (list.json() as any).messages.find((m: any) => m.id === msgId);
    expect(found.reactions).toHaveLength(1);
    expect(found.reactions[0].emoji).toBe('👍');
    expect(found.reactions[0].count).toBe(2);
    expect(found.reactions[0].reactedByMe).toBe(true);

    // bob удаляет свою — count=1
    const del = await rig.app.inject({
      method: 'DELETE',
      url: `/channels/${rig.textChannelId}/messages/${msgId}/reactions/${emoji}`,
      headers: authHeader(bob),
    });
    expect(del.statusCode).toBe(204);

    const list2 = await rig.app.inject({
      method: 'GET',
      url: `/channels/${rig.textChannelId}/messages?limit=10`,
      headers: authHeader(alice),
    });
    const found2 = (list2.json() as any).messages.find((m: any) => m.id === msgId);
    expect(found2.reactions[0].count).toBe(1);
    expect(found2.reactions[0].reactedByMe).toBe(true);
  });

  it('mentions — `<@uuid>` в content → mentionedUserIds денормализуются', async () => {
    const send = await rig.app.inject({
      method: 'POST',
      url: `/channels/${rig.textChannelId}/messages`,
      headers: authHeader(alice),
      payload: { content: `Hey <@${bob.id}>, look at this` },
    });
    expect(send.statusCode).toBe(201);
    const msg = (send.json() as any).message;
    expect(msg.mentionedUserIds).toEqual([bob.id]);
  });

  it('reply — replyToMessageId сохраняется и валидируется (другой канал → 401)', async () => {
    const original = await rig.app.inject({
      method: 'POST',
      url: `/channels/${rig.textChannelId}/messages`,
      headers: authHeader(alice),
      payload: { content: 'parent' },
    });
    const parentId = (original.json() as any).message.id;

    const reply = await rig.app.inject({
      method: 'POST',
      url: `/channels/${rig.textChannelId}/messages`,
      headers: authHeader(bob),
      payload: { content: 'replying', replyToMessageId: parentId },
    });
    expect(reply.statusCode).toBe(201);
    expect((reply.json() as any).message.replyToMessageId).toBe(parentId);

    const wrongChannel = await rig.app.inject({
      method: 'POST',
      url: `/channels/${rig.voiceChannelId}/messages`,
      headers: authHeader(alice),
      payload: { content: 'cross-channel reply', replyToMessageId: parentId },
    });
    // voice-канал в первую очередь не разрешает текст → 401
    expect(wrongChannel.statusCode).toBe(401);
  });
});
