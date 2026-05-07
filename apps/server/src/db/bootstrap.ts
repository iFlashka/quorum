import { sql } from 'drizzle-orm';
import { loadConfig } from '../config.js';
import { createPostgresDb } from './client.js';
import { channels, guilds, invites, members, users } from './schema.js';
import { hashPassword } from '../modules/auth/password.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const { db, close } = createPostgresDb(config.DATABASE_URL);

  const [existing] = await db.select({ id: users.id }).from(users).limit(1);
  if (existing) {
    console.log('Users already exist — bootstrap skipped.');
    await close();
    return;
  }

  const username = process.argv[2];
  const password = process.argv[3];
  if (!username || !password) {
    console.error('Usage: node dist/db/bootstrap.js <username> <password>');
    process.exit(1);
  }

  const passwordHash = await hashPassword(password);

  await db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({ username, passwordHash, displayName: username, status: 'offline' })
      .returning();

    const [guild] = await tx
      .insert(guilds)
      .values({ name: 'Quorum HQ', ownerId: user!.id })
      .returning();

    await tx.insert(members).values({ guildId: guild!.id, userId: user!.id, role: 'owner' });

    await tx.insert(channels).values([
      { guildId: guild!.id, kind: 'text', name: 'general', position: 0 },
      { guildId: guild!.id, kind: 'text', name: 'random', position: 1 },
      { guildId: guild!.id, kind: 'voice', name: 'Lounge', position: 2 },
    ]);

    const code = Math.random().toString(36).slice(2, 10).toUpperCase();
    await tx.insert(invites).values({
      code,
      guildId: guild!.id,
      createdBy: user!.id,
      maxUses: null,
    });

    console.log(`Admin created:  ${username} / ${password}`);
    console.log(`Invite code:    ${code}`);
    console.log('Share invite code with friends to let them register.');
  });

  await close();
}

main().catch((err) => { console.error(err); process.exit(1); });
