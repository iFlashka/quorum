/**
 * Клиентская обёртка над `POST /me/avatar` и `GET /avatars/:id`.
 * Отдача multipart запроса дублирует логику из attachments.ts —
 * ApiClient.request умеет только JSON, multipart идёт через сырой fetch.
 */

import { ApiError, type ApiClient } from './client';

interface UploadResult {
  avatarUrl: string;
}

export interface AvatarsApi {
  upload: (file: Blob, filename?: string) => Promise<UploadResult>;
  /** Абсолютный URL для тега <img>. Принимает relative `/avatars/{id}` либо null. */
  resolveUrl: (avatarUrl: string | null | undefined) => string | null;
}

export function makeAvatarsApi(api: ApiClient, baseUrl: string): AvatarsApi {
  return {
    upload: async (file, filename = 'avatar.webp') => {
      const accessToken = api.getAccessToken();
      const fd = new FormData();
      fd.append('file', file, filename);

      const url = `${baseUrl}/me/avatar`;
      const headers: Record<string, string> = {};
      if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

      const res = await fetch(url, { method: 'POST', body: fd, headers });
      if (res.status === 401) {
        const newAccess = await api.refreshTokensManually();
        if (!newAccess) {
          throw new ApiError(401, {
            error: 'Unauthorized',
            code: 'unauthorized',
            message: 'auth_lost',
          });
        }
        const retry = await fetch(url, {
          method: 'POST',
          body: fd,
          headers: { ...headers, Authorization: `Bearer ${newAccess}` },
        });
        return unwrap(retry);
      }
      return unwrap(res);
    },
    resolveUrl: (avatarUrl) => {
      if (!avatarUrl) return null;
      // Абсолютные URL'ы (data:, http(s):) — отдаём как есть. Относительные
      // (/avatars/{id}) префиксим baseUrl.
      if (/^([a-z]+:|\/\/)/i.test(avatarUrl)) return avatarUrl;
      return baseUrl.replace(/\/+$/, '') + avatarUrl;
    },
  };
}

async function unwrap(res: Response): Promise<UploadResult> {
  if (res.ok) {
    return (await res.json()) as UploadResult;
  }
  let errorBody;
  try {
    errorBody = (await res.json()) as { error: string; code?: string; message: string };
  } catch {
    errorBody = { error: 'NetworkError', message: res.statusText };
  }
  throw new ApiError(res.status, errorBody);
}
