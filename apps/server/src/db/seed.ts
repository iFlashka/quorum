import { eq, sql } from 'drizzle-orm';
import { loadConfig } from '../config.js';
import { createPostgresDb } from './client.js';
import { channels, guilds, invites, members, users } from './schema.js';
import { hashPassword } from '../modules/auth/password.js';

const SEED_USERNAME = 'admin';
const SEED_PASSWORD = 'admin123';
const SEED_DISPLAY = 'Admin';
const SEED_GUILD_NAME = 'Quorum HQ';
const SEED_INVITE_CODE = 'DEVCODE';

async function main(): Promise<void> {
  const config = loadConfig();
  if (config.NODE_ENV === 'production') {
    throw new Error('seed запрещён в production');
  }
  const { db, close } = createPostgresDb(config.DATABASE_URL);

  console.log(`Seeding into ${config.DATABASE_URL}…`);

  await db.transaction(async (tx) => {
    let [adminUser] = await tx
      .select()
      .from(users)
      .where(sql`lower(${users.username}) = ${SEED_USERNAME}`)
      .limit(1);

    if (!adminUser) {
      const passwordHash = await hashPassword(SEED_PASSWORD);
      [adminUser] = await tx
        .insert(users)
        .values({
          username: SEED_USERNAME,
          passwordHash,
          displayName: SEED_DISPLAY,
          status: 'offline',
        })
        .returning();
      console.log(`+ user "${SEED_USERNAME}" id=${adminUser!.id}`);
    } else {
      console.log(`= user "${SEED_USERNAME}" already exists id=${adminUser.id}`);
    }

    let [adminGuild] = await tx
      .select()
      .from(guilds)
      .where(eq(guilds.ownerId, adminUser!.id))
      .limit(1);

    if (!adminGuild) {
      [adminGuild] = await tx
        .insert(guilds)
        .values({ name: SEED_GUILD_NAME, ownerId: adminUser!.id })
        .returning();
      console.log(`+ guild "${SEED_GUILD_NAME}" id=${adminGuild!.id}`);

      await tx
        .insert(members)
        .values({ guildId: adminGuild!.id, userId: adminUser!.id, role: 'owner' });

      await tx.insert(channels).values([
        { guildId: adminGuild!.id, kind: 'text', name: 'general', topic: 'Канал по умолчанию для всех разговоров', position: 0 },
        { guildId: adminGuild!.id, kind: 'text', name: 'random', position: 1 },
        { guildId: adminGuild!.id, kind: 'voice', name: 'Lounge', position: 2 },
      ]);
      console.log(`+ default channels added to ${SEED_GUILD_NAME}`);
    } else {
      console.log(`= guild "${SEED_GUILD_NAME}" already exists id=${adminGuild.id}`);
    }

    const [existingInvite] = await tx
      .select()
      .from(invites)
      .where(eq(invites.code, SEED_INVITE_CODE))
      .limit(1);

    if (!existingInvite) {
      await tx.insert(invites).values({
        code: SEED_INVITE_CODE,
        guildId: adminGuild!.id,
        createdBy: adminUser!.id,
        maxUses: null,
      });
      console.log(`+ invite "${SEED_INVITE_CODE}" with unlimited uses`);
    } else {
      console.log(`= invite "${SEED_INVITE_CODE}" already exists`);
    }
  });

  console.log('Seed done.');
  console.log('  admin login: ' + SEED_USERNAME + ' / ' + SEED_PASSWORD);
  console.log('  invite code: ' + SEED_INVITE_CODE);

  await close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
