import { z } from 'zod';

/**
 * Эмодзи в URL — limit 64 символа (хватит на самое длинное unicode-cluster
 * вроде emoji-with-skin-tone-modifier). Сервер хранит как есть.
 */
export const EmojiPathSchema = z
  .string()
  .min(1)
  .max(64);

export const ReactionPathParamsSchema = z.object({
  emoji: EmojiPathSchema,
});
export type ReactionPathParams = z.infer<typeof ReactionPathParamsSchema>;
