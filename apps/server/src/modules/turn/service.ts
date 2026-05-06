/**
 * Эфемерные TURN-учётки для WebRTC согласно стандартной схеме REST API for TURN
 * (IETF draft-uberti-rtcweb-turn-rest). coturn принимает это «из коробки» при
 * `lt-cred-mech` + `static-auth-secret`.
 *
 * Формат:
 *   username   = `<exp>:<userId>`  где exp — unix-timestamp истечения
 *   credential = base64(HMAC-SHA1(staticAuthSecret, username))
 *
 * coturn проверяет HMAC и что `exp > now`, не валидирует часть после `:`.
 */

import { createHmac } from 'node:crypto';
import type { TurnCredentialsResponse } from '@quorum/shared';

export interface TurnConfig {
  /** Список URL'ов TURN/STUN серверов, которые видит клиент. */
  urls: string[];
  /** Тот же `static-auth-secret` что в `turnserver.conf`. */
  sharedSecret: string;
  /** Сколько действует одна выдача (мы перевыдаём заранее, до истечения). */
  ttlSeconds: number;
}

export class TurnService {
  constructor(private readonly cfg: TurnConfig) {}

  /**
   * Если cfg.sharedSecret пустой — сервис считается выключенным; вернёт
   * пустой `iceServers`. Это удобно для тестов и для dev-окружения, где
   * coturn ещё не настроен (тогда WebRTC будет работать только в локальной сети).
   */
  isEnabled(): boolean {
    return this.cfg.sharedSecret.length > 0 && this.cfg.urls.length > 0;
  }

  generate(userId: string, now: Date = new Date()): TurnCredentialsResponse {
    if (!this.isEnabled()) {
      return { iceServers: [], expiresAt: 0 };
    }
    const expSeconds = Math.floor(now.getTime() / 1000) + this.cfg.ttlSeconds;
    const username = `${expSeconds}:${userId}`;
    const credential = createHmac('sha1', this.cfg.sharedSecret)
      .update(username)
      .digest('base64');

    return {
      iceServers: [
        {
          urls: this.cfg.urls,
          username,
          credential,
        },
      ],
      expiresAt: expSeconds,
    };
  }

  /** Утилита для тестов: проверить, что HMAC валиден. */
  verifyCredential(username: string, credential: string): boolean {
    const expected = createHmac('sha1', this.cfg.sharedSecret)
      .update(username)
      .digest('base64');
    return expected === credential;
  }
}
