/**
 * LiveKit token-генератор для голосовых каналов фазы 5.
 *
 * Токен — JWT, подписан LIVEKIT_API_SECRET'ом и валидный для конкретной комнаты
 * `room=<channelId>` с identity = userId. Право `canPublish` нужно для
 * публикации микрофона; `canSubscribe` — для прослушивания других участников.
 * Без admin-прав, чтобы клиент не мог удалить других участников.
 */

import { AccessToken, type VideoGrant } from 'livekit-server-sdk';

export interface LivekitConfig {
  apiKey: string;
  apiSecret: string;
  /** WebSocket URL который видит клиент (обычно `ws://localhost:7880` в dev). */
  wsUrl: string;
  /** TTL JWT в секундах. Дефолт — 6 часов; LiveKit сам сделает refresh при reconnect. */
  ttlSeconds?: number;
}

export interface IssueTokenInput {
  userId: string;
  /** Имя для отображения в LiveKit-комнате — обычно displayName. */
  displayName: string;
  /** Канал-идентификатор. Используется как room name в LiveKit. */
  channelId: string;
}

export interface IssuedToken {
  token: string;
  wsUrl: string;
}

export class LivekitService {
  private readonly cfg: LivekitConfig;

  constructor(cfg: LivekitConfig) {
    this.cfg = cfg;
  }

  isEnabled(): boolean {
    return (
      this.cfg.apiKey.length > 0 &&
      this.cfg.apiSecret.length > 0 &&
      this.cfg.wsUrl.length > 0
    );
  }

  async issueToken(input: IssueTokenInput): Promise<IssuedToken> {
    if (!this.isEnabled()) {
      throw new Error('LiveKit is not configured');
    }
    const at = new AccessToken(this.cfg.apiKey, this.cfg.apiSecret, {
      identity: input.userId,
      name: input.displayName,
      ttl: this.cfg.ttlSeconds ?? 6 * 60 * 60,
    });
    const grant: VideoGrant = {
      roomJoin: true,
      room: input.channelId,
      canPublish: true,
      canSubscribe: true,
      // Видео и data channels пока не нужны (фаза 6 включит видео).
      canPublishData: false,
    };
    at.addGrant(grant);
    const token = await at.toJwt();
    return { token, wsUrl: this.cfg.wsUrl };
  }
}
