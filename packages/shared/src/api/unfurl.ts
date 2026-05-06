import { z } from 'zod';

/**
 * Ответ `GET /unfurl?url=...` — OG/Twitter-meta или null-поля если что-то
 * не нашлось. Сервер вернёт 404 если ничего парсимого не извлечь.
 */
export const UnfurlResponseSchema = z.object({
  url: z.string().url(),
  title: z.string().nullable(),
  description: z.string().nullable(),
  image: z.string().url().nullable(),
  siteName: z.string().nullable(),
  type: z.string().nullable(),
});
export type UnfurlResponse = z.infer<typeof UnfurlResponseSchema>;
