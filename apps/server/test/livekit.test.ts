import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authHeader, setupRig, type TestActor, type TestRig } from './helpers/setup-app.js';
import type { LivekitTokenResponse } from '@quorum/shared';

interface JwtPayload {
  iss: string;
  sub: string;
  name?: string;
  video?: {
    roomJoin?: boolean;
    room?: string;
    canPublish?: boolean;
    canSubscribe?: boolean;
    canPublishData?: boolean;
  };
}

function decodeJwtPayload(token: string): JwtPayload {
  const part = token.split('.')[1];
  if (!part) throw new Error('not a JWT');
  const padded = part.padEnd(part.length + ((4 - (part.length % 4)) % 4), '=');
  const json = Buffer.from(padded, 'base64').toString('utf8');
  return JSON.parse(json) as JwtPayload;
}

describe('LiveKit token endpoint', () => {
  let rig: TestRig;
  let alice: TestActor;

  beforeAll(async () => {
    rig = await setupRig();
    alice = await rig.register('alice');
  }, 60_000);

  afterAll(async () => {
    await rig.close();
  });

  it('POST /channels/:id/voice/token — выдаёт JWT с правильными claims', async () => {
    const res = await rig.app.inject({
      method: 'POST',
      url: `/channels/${rig.voiceChannelId}/voice/token`,
      headers: authHeader(alice),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<LivekitTokenResponse>();
    expect(body.token.length).toBeGreaterThan(20);
    expect(body.wsUrl).toMatch(/^wss?:\/\//);

    const payload = decodeJwtPayload(body.token);
    expect(payload.sub).toBe(alice.id);
    expect(payload.video?.room).toBe(rig.voiceChannelId);
    expect(payload.video?.roomJoin).toBe(true);
    expect(payload.video?.canPublish).toBe(true);
    expect(payload.video?.canSubscribe).toBe(true);
  });

  it('400 для текстового канала', async () => {
    const res = await rig.app.inject({
      method: 'POST',
      url: `/channels/${rig.textChannelId}/voice/token`,
      headers: authHeader(alice),
    });
    expect(res.statusCode).toBe(400);
  });

  it('401 без auth', async () => {
    const res = await rig.app.inject({
      method: 'POST',
      url: `/channels/${rig.voiceChannelId}/voice/token`,
    });
    expect(res.statusCode).toBe(401);
  });
});
