import { z } from 'zod';

/**
 * Ответ `POST /channels/:id/voice/token` — короткоживущий JWT для подключения
 * к LiveKit-комнате `room=<channelId>`. Клиент кладёт его в
 * `Room.connect(wsUrl, token)`.
 */
export const LivekitTokenResponseSchema = z.object({
  token: z.string().min(1),
  wsUrl: z.string().min(1),
});
export type LivekitTokenResponse = z.infer<typeof LivekitTokenResponseSchema>;
