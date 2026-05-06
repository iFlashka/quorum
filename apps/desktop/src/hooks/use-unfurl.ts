/**
 * Хук резолва OG-метадаты по URL. Использует TanStack Query — каждый URL
 * один раз пулится, дальше из cache (staleTime 1 час совпадает с server LRU TTL).
 *
 * Возвращает UnfurlResponse | null:
 *   - null значит сервер вернул 404 (нет meta) или ошибка сети
 *   - undefined пока загружается (см. UseQueryResult.data === undefined)
 */

import { useQuery } from '@tanstack/react-query';
import type { UnfurlResponse } from '@quorum/shared';
import { useRuntime } from '@/auth/runtime-store';

export function useUnfurl(url: string | null | undefined) {
  const unfurlApi = useRuntime((s) => s.runtime?.unfurlApi);
  return useQuery<UnfurlResponse | null>({
    queryKey: ['unfurl', url],
    queryFn: async () => {
      if (!unfurlApi || !url) return null;
      return await unfurlApi.fetch(url);
    },
    enabled: !!unfurlApi && !!url,
    staleTime: 60 * 60 * 1000, // 1 час
    gcTime: 24 * 60 * 60 * 1000, // 24 часа
    retry: 0,
  });
}

/** Извлечь все http(s)-URL'ы из текстового сообщения. Снимает trailing-знаки. */
export function extractUrls(content: string): string[] {
  if (!content) return [];
  const out: string[] = [];
  // Простой regex: схема http/https + хост + опциональный путь без пробелов.
  const re = /\bhttps?:\/\/[^\s<>"']+/gi;
  for (const match of content.matchAll(re)) {
    let raw = match[0];
    // Снимаем trailing пунктуацию которая часто прилипает к URL.
    raw = raw.replace(/[),.;!?]+$/, '');
    if (!out.includes(raw)) out.push(raw);
  }
  return out;
}
