import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClient, ApiError } from './client';

interface FetchCall {
  url: string;
  init: RequestInit;
}

function urlToString(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function makeFetch(responses: Response[]): {
  fetch: typeof fetch;
  calls: FetchCall[];
} {
  const calls: FetchCall[] = [];
  let i = 0;
  const fetchFn = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: urlToString(input), init: init ?? {} });
    const next = responses[i++];
    if (!next) throw new Error('makeFetch: out of stubbed responses');
    return Promise.resolve(next);
  }) as unknown as typeof fetch;
  return { fetch: fetchFn, calls };
}

type RefreshFn = () => Promise<string | null>;
type OnAuthLostFn = () => void;

describe('ApiClient', () => {
  let access: string | null;
  let onAuthLost: ReturnType<typeof vi.fn<OnAuthLostFn>>;
  let refreshTokens: ReturnType<typeof vi.fn<RefreshFn>>;

  beforeEach(() => {
    access = 'access-1';
    onAuthLost = vi.fn<OnAuthLostFn>();
    refreshTokens = vi.fn<RefreshFn>();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function makeClient(): ApiClient {
    return new ApiClient({
      baseUrl: 'http://api.test',
      getAccessToken: () => access,
      refreshTokens: () => refreshTokens(),
      onAuthLost: () => {
        onAuthLost();
      },
    });
  }

  it('200 → распарсенное тело + Authorization header', async () => {
    const { fetch, calls } = makeFetch([
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    ]);
    vi.stubGlobal('fetch', fetch);

    const client = makeClient();
    const res = await client.request<{ ok: boolean }>('/health');

    expect(res).toEqual({ ok: true });
    expect(calls[0]?.url).toBe('http://api.test/health');
    expect((calls[0]?.init.headers as Record<string, string>).Authorization).toBe(
      'Bearer access-1',
    );
  });

  it('204 → undefined без парсинга тела', async () => {
    const { fetch } = makeFetch([new Response(null, { status: 204 })]);
    vi.stubGlobal('fetch', fetch);

    const client = makeClient();
    const res = await client.request<undefined>('/something');
    expect(res).toBeUndefined();
  });

  it('401 → refresh → retry с новым токеном', async () => {
    const { fetch, calls } = makeFetch([
      new Response(JSON.stringify({ error: 'AuthError', message: 'expired' }), {
        status: 401,
      }),
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    ]);
    vi.stubGlobal('fetch', fetch);
    refreshTokens.mockImplementation(() => {
      access = 'access-2';
      return Promise.resolve('access-2');
    });

    const client = makeClient();
    const res = await client.request<{ ok: boolean }>('/me');

    expect(res).toEqual({ ok: true });
    expect(refreshTokens).toHaveBeenCalledTimes(1);
    expect((calls[0]?.init.headers as Record<string, string>).Authorization).toBe(
      'Bearer access-1',
    );
    expect((calls[1]?.init.headers as Record<string, string>).Authorization).toBe(
      'Bearer access-2',
    );
  });

  it('401 + refresh fail → onAuthLost + ApiError', async () => {
    const { fetch } = makeFetch([
      new Response(JSON.stringify({ error: 'AuthError', message: 'expired' }), {
        status: 401,
      }),
    ]);
    vi.stubGlobal('fetch', fetch);
    refreshTokens.mockResolvedValue(null);

    const client = makeClient();
    await expect(client.request('/me')).rejects.toBeInstanceOf(ApiError);
    expect(onAuthLost).toHaveBeenCalledTimes(1);
  });

  it('параллельные 401 → один refresh (coalesced)', async () => {
    const { fetch } = makeFetch([
      new Response('', { status: 401 }),
      new Response('', { status: 401 }),
      new Response(JSON.stringify({ a: 1 }), { status: 200 }),
      new Response(JSON.stringify({ b: 2 }), { status: 200 }),
    ]);
    vi.stubGlobal('fetch', fetch);

    let resolveRefresh!: (v: string | null) => void;
    refreshTokens.mockReturnValue(
      new Promise<string | null>((res) => {
        resolveRefresh = res;
      }),
    );

    const client = makeClient();
    const p1 = client.request<{ a: number }>('/a');
    const p2 = client.request<{ b: number }>('/b');

    // Дать обоим запросам уйти и упереться в 401 → начать ждать refresh.
    await new Promise((r) => setTimeout(r, 10));
    expect(refreshTokens).toHaveBeenCalledTimes(1);

    access = 'access-2';
    resolveRefresh('access-2');

    const [a, b] = await Promise.all([p1, p2]);
    expect(a).toEqual({ a: 1 });
    expect(b).toEqual({ b: 2 });
    expect(refreshTokens).toHaveBeenCalledTimes(1);
  });
});
