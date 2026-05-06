import { z } from 'zod';

/**
 * Ephemeral TURN credentials, выдаваемые `GET /turn/credentials`.
 * Совместимы с RFC 5928 / IETF draft "A REST API For Access To TURN Services":
 *   username = `<unix-expiration>:<userId>`
 *   credential = base64(HMAC-SHA1(secret, username))
 *
 * Клиент кладёт это в `iceServers` для RTCPeerConnection.
 */
export const TurnIceServerSchema = z.object({
  urls: z.array(z.string()),
  username: z.string(),
  credential: z.string(),
});
export type TurnIceServer = z.infer<typeof TurnIceServerSchema>;

export const TurnCredentialsResponseSchema = z.object({
  iceServers: z.array(TurnIceServerSchema),
  /** Unix-timestamp когда creds истекают. Клиент перезапросит до этого момента. */
  expiresAt: z.number().int().positive(),
});
export type TurnCredentialsResponse = z.infer<typeof TurnCredentialsResponseSchema>;
