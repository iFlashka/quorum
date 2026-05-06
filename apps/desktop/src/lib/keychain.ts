import { invoke } from '@tauri-apps/api/core';

/**
 * Обёртка над Rust-командами `keychain_*`. Под капотом — keyring-rs.
 * В Tauri runtime — настоящий OS keychain. В web-режиме (`pnpm dev:desktop-web`)
 * fallback на sessionStorage: безопасно ровно постольку, поскольку sessionStorage
 * живёт только в текущем табе и ключи никуда не утекут. Для прода значение всегда
 * идёт в OS keychain.
 */

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
const FALLBACK_PREFIX = 'quorum.keychain.';

export const keychain = {
  async set(key: string, value: string): Promise<void> {
    if (isTauri) {
      await invoke('keychain_set', { key, value });
      return;
    }
    sessionStorage.setItem(FALLBACK_PREFIX + key, value);
  },
  async get(key: string): Promise<string | null> {
    if (isTauri) {
      return invoke<string | null>('keychain_get', { key });
    }
    return sessionStorage.getItem(FALLBACK_PREFIX + key);
  },
  async delete(key: string): Promise<void> {
    if (isTauri) {
      await invoke('keychain_delete', { key });
      return;
    }
    sessionStorage.removeItem(FALLBACK_PREFIX + key);
  },
};

export const KEYCHAIN_REFRESH_TOKEN = 'refresh_token';
