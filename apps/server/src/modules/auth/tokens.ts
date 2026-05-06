import { createHash, randomBytes } from 'node:crypto';
import { SignJWT, jwtVerify, errors as joseErrors } from 'jose';
import { and, eq, isNull, lt } from 'drizzle-orm';
import type { DbClient } from '../../db/client.js';
import { refreshTokens, type RefreshToken } from '../../db/schema.js';
import type { Config } from '../../config.js';

export interface AccessClaims {
  sub: string; // user id
  username: string;
}

export interface IssuedTokenPair {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: Date;
  refreshTokenExpiresAt: Date;
}

export interface RefreshContext {
  userAgent?: string;
}

const REFRESH_BYTES = 48; // 384 бита энтропии.
const ISSUER = 'quorum';
const AUDIENCE = 'quorum-client';

export class TokenStolenError extends Error {
  constructor() {
    super('refresh_token_replay_detected');
    this.name = 'TokenStolenError';
  }
}

export class TokenInvalidError extends Error {
  constructor(reason = 'invalid_refresh_token') {
    super(reason);
    this.name = 'TokenInvalidError';
  }
}

export interface TokenServiceDeps {
  db: DbClient;
  config: Config;
  now?: () => Date;
}

export class TokenService {
  private readonly db: DbClient;
  private readonly config: Config;
  private readonly now: () => Date;
  private readonly accessKey: Uint8Array;

  constructor({ db, config, now }: TokenServiceDeps) {
    this.db = db;
    this.config = config;
    this.now = now ?? (() => new Date());
    this.accessKey = new TextEncoder().encode(config.JWT_ACCESS_SECRET);
  }

  async issuePair(
    userId: string,
    username: string,
    ctx: RefreshContext = {},
  ): Promise<IssuedTokenPair> {
    const issuedAt = this.now();
    const accessTtlMs = parseDuration(this.config.JWT_ACCESS_TTL);
    const refreshTtlMs = parseDuration(this.config.JWT_REFRESH_TTL);
    const accessExpiresAt = new Date(issuedAt.getTime() + accessTtlMs);
    const refreshExpiresAt = new Date(issuedAt.getTime() + refreshTtlMs);

    const accessToken = await new SignJWT({ username })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(userId)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt(Math.floor(issuedAt.getTime() / 1000))
      .setExpirationTime(Math.floor(accessExpiresAt.getTime() / 1000))
      .sign(this.accessKey);

    const refreshToken = randomBytes(REFRESH_BYTES).toString('base64url');
    const tokenHash = hashToken(refreshToken);

    await this.db.insert(refreshTokens).values({
      userId,
      tokenHash,
      userAgent: ctx.userAgent ?? null,
      createdAt: issuedAt,
      lastUsedAt: issuedAt,
      expiresAt: refreshExpiresAt,
    });

    return {
      accessToken,
      refreshToken,
      accessTokenExpiresAt: accessExpiresAt,
      refreshTokenExpiresAt: refreshExpiresAt,
    };
  }

  async verifyAccess(token: string): Promise<AccessClaims> {
    try {
      const { payload } = await jwtVerify(token, this.accessKey, {
        issuer: ISSUER,
        audience: AUDIENCE,
      });
      if (typeof payload.sub !== 'string') throw new TokenInvalidError('malformed_access_token');
      const username = typeof payload.username === 'string' ? payload.username : '';
      return { sub: payload.sub, username };
    } catch (err) {
      if (err instanceof joseErrors.JOSEError) {
        throw new TokenInvalidError(err.code ?? 'invalid_access_token');
      }
      throw err;
    }
  }

  async rotate(
    refreshToken: string,
    ctx: RefreshContext = {},
  ): Promise<IssuedTokenPair & { userId: string; username: string }> {
    const tokenHash = hashToken(refreshToken);
    const now = this.now();

    const stored = await this.db.query.refreshTokens.findFirst({
      where: eq(refreshTokens.tokenHash, tokenHash),
      with: { user: true },
    });

    if (!stored) {
      throw new TokenInvalidError('unknown_refresh_token');
    }

    if (stored.revokedAt !== null) {
      // Replay уже использованного токена — детектор кражи: ревочим всю цепочку.
      await this.revokeAllForUser(stored.userId);
      throw new TokenStolenError();
    }

    if (stored.expiresAt.getTime() <= now.getTime()) {
      throw new TokenInvalidError('refresh_token_expired');
    }

    return this.db.transaction(async (tx) => {
      const result = await tx
        .update(refreshTokens)
        .set({ revokedAt: now, lastUsedAt: now })
        .where(and(eq(refreshTokens.id, stored.id), isNull(refreshTokens.revokedAt)))
        .returning({ id: refreshTokens.id });

      if (result.length === 0) {
        // Параллельный ревок этого же токена — race; считаем как replay.
        await this.revokeAllForUser(stored.userId);
        throw new TokenStolenError();
      }

      const accessTtlMs = parseDuration(this.config.JWT_ACCESS_TTL);
      const refreshTtlMs = parseDuration(this.config.JWT_REFRESH_TTL);
      const newAccessExpires = new Date(now.getTime() + accessTtlMs);
      const newRefreshExpires = new Date(now.getTime() + refreshTtlMs);

      const newAccess = await new SignJWT({ username: stored.user.username })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(stored.userId)
        .setIssuer(ISSUER)
        .setAudience(AUDIENCE)
        .setIssuedAt(Math.floor(now.getTime() / 1000))
        .setExpirationTime(Math.floor(newAccessExpires.getTime() / 1000))
        .sign(this.accessKey);

      const newRefresh = randomBytes(REFRESH_BYTES).toString('base64url');
      const newRefreshHash = hashToken(newRefresh);

      await tx.insert(refreshTokens).values({
        userId: stored.userId,
        tokenHash: newRefreshHash,
        userAgent: ctx.userAgent ?? stored.userAgent ?? null,
        createdAt: now,
        lastUsedAt: now,
        expiresAt: newRefreshExpires,
      });

      return {
        userId: stored.userId,
        username: stored.user.username,
        accessToken: newAccess,
        refreshToken: newRefresh,
        accessTokenExpiresAt: newAccessExpires,
        refreshTokenExpiresAt: newRefreshExpires,
      };
    });
  }

  async revoke(refreshToken: string): Promise<void> {
    const tokenHash = hashToken(refreshToken);
    const now = this.now();
    await this.db
      .update(refreshTokens)
      .set({ revokedAt: now })
      .where(and(eq(refreshTokens.tokenHash, tokenHash), isNull(refreshTokens.revokedAt)));
  }

  async revokeAllForUser(userId: string): Promise<void> {
    const now = this.now();
    await this.db
      .update(refreshTokens)
      .set({ revokedAt: now })
      .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
  }

  async cleanupExpired(): Promise<number> {
    const now = this.now();
    const deleted = await this.db
      .delete(refreshTokens)
      .where(lt(refreshTokens.expiresAt, now))
      .returning({ id: refreshTokens.id });
    return deleted.length;
  }
}

export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

const DURATION_UNITS: Record<string, number> = {
  ms: 1,
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000,
  y: 31_536_000_000,
};

export function parseDuration(input: string): number {
  const match = /^(\d+)\s*(ms|s|m|h|d|w|y)$/.exec(input);
  if (!match) throw new Error(`invalid duration: ${input}`);
  const [, value, unit] = match;
  return Number(value) * DURATION_UNITS[unit!]!;
}

export type StoredRefreshToken = RefreshToken;
