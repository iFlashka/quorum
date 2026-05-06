import type { PublicAttachment } from '@quorum/shared';
import { ApiError, type ApiClient } from './client';

export interface AttachmentsApi {
  upload: (channelId: string, file: File) => Promise<PublicAttachment>;
  /** Полный URL по которому окно может рендерить картинку — учитывает baseUrl и id. */
  buildUrl: (id: string) => string;
}

export function makeAttachmentsApi(api: ApiClient, baseUrl: string): AttachmentsApi {
  return {
    upload: async (channelId, file) => {
      const accessToken = api.getAccessToken();
      const fd = new FormData();
      fd.append('file', file);

      // multipart с raw fetch — у ApiClient.request только JSON body. Дублируем
      // заголовки и обработку 401 здесь руками; auto-refresh вызываем напрямую.
      const url = `${baseUrl}/channels/${channelId}/attachments`;
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
    buildUrl: (id) => `${baseUrl}/attachments/${id}`,
  };
}

async function unwrap(res: Response): Promise<PublicAttachment> {
  if (res.ok) {
    const body = (await res.json()) as { attachment: PublicAttachment };
    return body.attachment;
  }
  let errorBody;
  try {
    errorBody = (await res.json()) as { error: string; code?: string; message: string };
  } catch {
    errorBody = { error: 'NetworkError', message: res.statusText };
  }
  throw new ApiError(res.status, errorBody);
}
