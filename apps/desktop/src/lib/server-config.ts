import { LazyStore } from '@tauri-apps/plugin-store';

const store = new LazyStore('quorum.config.json');
const KEY_SERVER_URL = 'serverUrl';

export interface ServerConfig {
  url: string;
}

export async function loadServerConfig(): Promise<ServerConfig | null> {
  const url = await store.get<string>(KEY_SERVER_URL);
  if (typeof url !== 'string' || !url) return null;
  return { url };
}

export async function saveServerConfig(cfg: ServerConfig): Promise<void> {
  await store.set(KEY_SERVER_URL, cfg.url);
  await store.save();
}

export async function clearServerConfig(): Promise<void> {
  await store.delete(KEY_SERVER_URL);
  await store.save();
}

export function normalizeServerUrl(input: string): string {
  let raw = input.trim();
  if (!raw) return raw;
  if (!/^https?:\/\//i.test(raw)) {
    // Для локалки/IP подставляем http; для доменов — https.
    const isLocal = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:|\/|$)/i.test(raw);
    raw = `${isLocal ? 'http' : 'https'}://${raw}`;
  }
  // На Windows webview2 резолвит localhost в IPv6 ::1 — на dev-машинах туда часто
  // висит чужой процесс (Nuxt и т.п.). Принудительно используем IPv4 127.0.0.1.
  raw = raw.replace(/^(https?:\/\/)localhost(?=[:/]|$)/i, '$1127.0.0.1');
  // убираем trailing slash для единообразия
  return raw.replace(/\/+$/, '');
}
