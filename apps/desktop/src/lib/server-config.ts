/**
 * Хранилище URL сервера. В Tauri пишем в plugin-store; в web (браузерный
 * dev-режим, тесты) — в localStorage. Fallback нужен чтобы `pnpm dev:desktop-web`
 * работал — без него любой invoke() ломает onboarding.
 */

import { LazyStore } from '@tauri-apps/plugin-store';

const STORE_FILE = 'quorum.config.json';
const KEY_SERVER_URL = 'serverUrl';
const LS_KEY = 'quorum.serverUrl';

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
const store = isTauri ? new LazyStore(STORE_FILE) : null;

export interface ServerConfig {
  url: string;
}

export async function loadServerConfig(): Promise<ServerConfig | null> {
  if (store) {
    try {
      const url = await store.get<string>(KEY_SERVER_URL);
      if (typeof url === 'string' && url) return { url };
    } catch {
      // fall through to localStorage
    }
  }
  const fromLs = readLocal();
  return fromLs ? { url: fromLs } : null;
}

export async function saveServerConfig(cfg: ServerConfig): Promise<void> {
  if (store) {
    try {
      await store.set(KEY_SERVER_URL, cfg.url);
      await store.save();
    } catch {
      // ignore — упадёт в localStorage ниже
    }
  }
  writeLocal(cfg.url);
}

export async function clearServerConfig(): Promise<void> {
  if (store) {
    try {
      await store.delete(KEY_SERVER_URL);
      await store.save();
    } catch {
      // ignore
    }
  }
  writeLocal(null);
}

function readLocal(): string | null {
  try {
    return globalThis.localStorage?.getItem(LS_KEY) ?? null;
  } catch {
    return null;
  }
}

function writeLocal(value: string | null): void {
  try {
    if (value === null) globalThis.localStorage?.removeItem(LS_KEY);
    else globalThis.localStorage?.setItem(LS_KEY, value);
  } catch {
    // ignore
  }
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
