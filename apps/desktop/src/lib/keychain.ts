import { invoke } from '@tauri-apps/api/core';

/**
 * Обёртка над Rust-командами `keychain_*`. Под капотом — keyring-rs.
 * Команды доступны только когда приложение запущено в Tauri runtime.
 */
export const keychain = {
  async set(key: string, value: string): Promise<void> {
    await invoke('keychain_set', { key, value });
  },
  async get(key: string): Promise<string | null> {
    return invoke<string | null>('keychain_get', { key });
  },
  async delete(key: string): Promise<void> {
    await invoke('keychain_delete', { key });
  },
};

export const KEYCHAIN_REFRESH_TOKEN = 'refresh_token';
