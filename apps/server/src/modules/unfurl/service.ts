/**
 * Сервис unfurl — по URL фетчит HTML и достаёт OG/Twitter-meta для рендера
 * embed-карточки в чате (YouTube preview, og:image-сайты и т.п.).
 *
 * Стратегия:
 *   - in-memory LRU-кеш на 256 записей с TTL 1 час
 *   - allowlist — только http(s); приватные хосты (localhost/RFC1918) режем
 *   - HTML фетчим в первые 256 KB (Range нет — читаем поток до лимита)
 *   - таймаут 5 секунд через AbortController
 *
 * OG-теги ищем regexp'ом в `<head>`-секции — без cheerio чтобы не тащить
 * зависимость; парсинг достаточно толерантный для основных движков.
 */

const DEFAULT_TTL_MS = 60 * 60 * 1000; // 1 час
const MAX_CACHE = 256;
const MAX_HTML_BYTES = 256 * 1024;
const FETCH_TIMEOUT_MS = 5_000;
const USER_AGENT = 'QuorumBot/1.0 (+https://github.com/iflashka/quorum)';

export interface UnfurlData {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
  type: string | null;
}

interface CacheEntry {
  data: UnfurlData;
  expiresAt: number;
}

export class UnfurlService {
  private readonly cache = new Map<string, CacheEntry>();
  constructor(private readonly ttlMs: number = DEFAULT_TTL_MS) {}

  async fetch(url: string): Promise<UnfurlData | null> {
    if (!isAllowedUrl(url)) return null;

    // Cache hit / TTL evict
    const cached = this.cache.get(url);
    if (cached && cached.expiresAt > Date.now()) {
      // LRU touch — re-insert.
      this.cache.delete(url);
      this.cache.set(url, cached);
      return cached.data;
    }
    if (cached) this.cache.delete(url);

    const data = await fetchOg(url);
    if (data) {
      this.cache.set(url, { data, expiresAt: Date.now() + this.ttlMs });
      this.evictIfFull();
    }
    return data;
  }

  private evictIfFull(): void {
    while (this.cache.size > MAX_CACHE) {
      // Map iterator-order = insertion-order, первый = самый старый.
      const oldest = this.cache.keys().next().value;
      if (!oldest) break;
      this.cache.delete(oldest);
    }
  }
}

/** http/https + публичный хост. */
function isAllowedUrl(rawUrl: string): boolean {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return false;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  const host = u.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost')) return false;
  // IPv4 RFC1918 / loopback
  const ipv4 = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(host);
  if (ipv4) {
    const a = Number(ipv4[1]);
    const b = Number(ipv4[2]);
    if (a === 10) return false;
    if (a === 127) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 169 && b === 254) return false; // link-local
  }
  return true;
}

async function fetchOg(url: string): Promise<UnfurlData | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' },
      redirect: 'follow',
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') ?? '';
    if (!ct.toLowerCase().includes('html')) return null;
    const html = await readBoundedText(res, MAX_HTML_BYTES);
    return parseOg(url, html);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function readBoundedText(res: Response, maxBytes: number): Promise<string> {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const result = (await reader.read()) as { value?: Uint8Array; done: boolean };
    if (result.done) break;
    const value = result.value;
    if (!value) continue;
    chunks.push(value);
    total += value.byteLength;
    if (total >= maxBytes) {
      try {
        await reader.cancel();
      } catch {
        // ignore
      }
      break;
    }
  }
  // Concat
  const buf = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    buf.set(c, off);
    off += c.byteLength;
  }
  return new TextDecoder('utf-8').decode(buf);
}

function parseOg(sourceUrl: string, html: string): UnfurlData | null {
  const headMatch = /<head[^>]*>([\s\S]*?)<\/head>/i.exec(html);
  const head = headMatch?.[1] ?? html.slice(0, 50_000);

  const meta = (prop: string): string | null => {
    const re = new RegExp(
      `<meta\\s+(?:[^>]*?\\s)?(?:property|name)=["']${escapeRegex(prop)}["']\\s+(?:[^>]*?\\s)?content=["']([^"']*)["']`,
      'i',
    );
    const m = re.exec(head);
    if (m?.[1]) return decodeEntities(m[1]);
    // Reverse-order: content="..." сначала, property="..." потом
    const re2 = new RegExp(
      `<meta\\s+(?:[^>]*?\\s)?content=["']([^"']*)["']\\s+(?:[^>]*?\\s)?(?:property|name)=["']${escapeRegex(prop)}["']`,
      'i',
    );
    const m2 = re2.exec(head);
    return m2?.[1] ? decodeEntities(m2[1]) : null;
  };

  const titleTag = /<title[^>]*>([^<]*)<\/title>/i.exec(head)?.[1] ?? null;
  const title = meta('og:title') ?? meta('twitter:title') ?? (titleTag ? decodeEntities(titleTag) : null);
  const description = meta('og:description') ?? meta('twitter:description') ?? meta('description');
  const image = absolutize(sourceUrl, meta('og:image') ?? meta('twitter:image'));
  const siteName = meta('og:site_name');
  const type = meta('og:type');

  if (!title && !image) return null;
  return { url: sourceUrl, title, description, image, siteName, type };
}

function absolutize(base: string, ref: string | null): string | null {
  if (!ref) return null;
  try {
    return new URL(ref, base).toString();
  } catch {
    return null;
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const ENTITY: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
};

function decodeEntities(s: string): string {
  return s.replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (m) => ENTITY[m] ?? m).trim();
}
