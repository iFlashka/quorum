import { eq, isNotNull, lt, or, sql } from 'drizzle-orm';
import type { DbClient } from '../../db/client.js';
import { guilds, invites, members, refreshTokens, users, type User } from '../../db/schema.js';
import {
  type LoginRequest,
  type RegisterRequest,
  type PrivateUser,
  type PublicGuild,
} from '@quorum/shared';
import { AuthError } from './errors.js';
import { hashPassword, verifyPassword } from './password.js';
import { TokenInvalidError, type TokenService, TokenStolenError, type IssuedTokenPair } from './tokens.js';

export interface AuthResult {
  user: PrivateUser;
  tokens: IssuedTokenPair;
}

export interface AuthServiceDeps {
  db: DbClient;
  tokens: TokenService;
  now?: () => Date;
}

export class AuthService {
  private readonly db: DbClient;
  private readonly tokens: TokenService;
  private readonly now: () => Date;
  private dummyHashPromise: Promise<string> | null = null;

  constructor({ db, tokens, now }: AuthServiceDeps) {
    this.db = db;
    this.tokens = tokens;
    this.now = now ?? (() => new Date());
  }

  /** Постоянная цена argon2id-проверки даже если юзера нет — глушим timing-leak. */
  private getDummyHash(): Promise<string> {
    this.dummyHashPromise ??= hashPassword('__placeholder_for_constant_time__');
    return this.dummyHashPromise;
  }

  async register(req: RegisterRequest, userAgent?: string): Promise<AuthResult> {
    // Транзакция создаёт юзера, members-связь, инкрементит invite.
    // issuePair (refresh_tokens.insert) — отдельно после коммита, потому что
    // FK к users.id видны только после коммита.
    const created = await this.db.transaction(async (tx) => {
      const now = this.now();

      const [invite] = await tx
        .select()
        .from(invites)
        .where(eq(invites.code, req.inviteCode))
        .limit(1);

      if (!invite) throw new AuthError('invite_invalid');
      if (invite.expiresAt && invite.expiresAt.getTime() <= now.getTime()) {
        throw new AuthError('invite_expired');
      }
      if (invite.maxUses !== null && invite.uses >= invite.maxUses) {
        throw new AuthError('invite_exhausted');
      }

      const existing = await tx
        .select({ id: users.id })
        .from(users)
        .where(sql`lower(${users.username}) = lower(${req.username})`)
        .limit(1);

      if (existing.length > 0) throw new AuthError('username_taken');

      const passwordHash = await hashPassword(req.password);

      const [user] = await tx
        .insert(users)
        .values({
          username: req.username,
          email: req.email ?? null,
          passwordHash,
          displayName: req.displayName,
        })
        .returning();

      if (!user) throw new Error('failed_to_insert_user');

      await tx
        .insert(members)
        .values({ guildId: invite.guildId, userId: user.id, role: 'member' });

      // Атомарно инкрементим uses, перепроверяя лимит: если параллельная регистрация
      // уже исчерпала invite — UPDATE вернёт 0 строк и мы откатим транзакцию.
      const inc = await tx
        .update(invites)
        .set({ uses: sql`${invites.uses} + 1` })
        .where(
          invite.maxUses === null
            ? eq(invites.code, invite.code)
            : sql`${invites.code} = ${invite.code} and ${invites.uses} < ${invite.maxUses}`,
        )
        .returning({ uses: invites.uses });
      if (inc.length === 0) throw new AuthError('invite_exhausted');

      return user;
    });

    const tokens = await this.tokens.issuePair(created.id, created.username, { userAgent });
    return { user: toPrivateUser(created), tokens };
  }

  async login(req: LoginRequest, userAgent?: string): Promise<AuthResult> {
    const [user] = await this.db
      .select()
      .from(users)
      .where(sql`lower(${users.username}) = lower(${req.username})`)
      .limit(1);

    // Постоянное время вне зависимости от существования юзера —
    // считаем хэш и от заглушка-хэша, чтобы не утекать timing-сигнал «такой пользователь существует».
    const targetHash = user ? user.passwordHash : await this.getDummyHash();
    const passwordOk = await verifyPassword(targetHash, req.password);

    if (!user || !passwordOk) throw new AuthError('invalid_credentials');

    const tokens = await this.tokens.issuePair(user.id, user.username, { userAgent });
    return { user: toPrivateUser(user), tokens };
  }

  async refresh(refreshToken: string, userAgent?: string): Promise<AuthResult> {
    try {
      const rotated = await this.tokens.rotate(refreshToken, { userAgent });

      const [user] = await this.db
        .select()
        .from(users)
        .where(eq(users.id, rotated.userId))
        .limit(1);

      if (!user) throw new AuthError('refresh_invalid');

      return {
        user: toPrivateUser(user),
        tokens: rotated,
      };
    } catch (err) {
      if (err instanceof TokenStolenError) throw new AuthError('refresh_replay');
      if (err instanceof TokenInvalidError) throw new AuthError('refresh_invalid');
      throw err;
    }
  }

  async logout(refreshToken: string): Promise<void> {
    await this.tokens.revoke(refreshToken);
  }

  async getMeWithGuilds(
    userId: string,
  ): Promise<{ user: PrivateUser; guilds: PublicGuild[] }> {
    const [user] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) throw new AuthError('unauthorized');

    const guildRows = await this.db
      .select({
        id: guilds.id,
        name: guilds.name,
        iconUrl: guilds.iconUrl,
        memberRole: members.role,
      })
      .from(members)
      .innerJoin(guilds, eq(members.guildId, guilds.id))
      .where(eq(members.userId, userId));

    return {
      user: toPrivateUser(user),
      guilds: guildRows.map((g) => ({
        id: g.id,
        name: g.name,
        iconUrl: g.iconUrl,
        memberRole: g.memberRole,
      })),
    };
  }

  /**
   * Patch собственного профиля. Сейчас можно только displayName и status.
   * username/email/password не трогаем — отдельный flow со re-auth.
   */
  async updateMe(
    userId: string,
    patch: { displayName?: string; status?: 'online' | 'idle' | 'dnd' },
  ): Promise<PrivateUser> {
    const [updated] = await this.db
      .update(users)
      .set({
        ...(patch.displayName !== undefined ? { displayName: patch.displayName } : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
      })
      .where(eq(users.id, userId))
      .returning();
    if (!updated) throw new AuthError('unauthorized');
    return toPrivateUser(updated);
  }

  /** Помощник на случай, если понадобится принудительно зачистить мёртвые токены из cron. */
  async janitorCleanup(): Promise<{ removedExpired: number; removedRevoked: number }> {
    const now = this.now();
    const expired = await this.db
      .delete(refreshTokens)
      .where(or(lt(refreshTokens.expiresAt, now), isNotNull(refreshTokens.revokedAt)))
      .returning({ id: refreshTokens.id, revokedAt: refreshTokens.revokedAt });
    let removedExpired = 0;
    let removedRevoked = 0;
    for (const r of expired) {
      if (r.revokedAt) removedRevoked++;
      else removedExpired++;
    }
    return { removedExpired, removedRevoked };
  }
}

function toPrivateUser(user: User): PrivateUser {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    status: user.status,
    email: user.email,
  };
}

