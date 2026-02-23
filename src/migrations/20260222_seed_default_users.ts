import { Db, MongoClient, ObjectId } from "mongodb";
import {
  startMigrationRun,
  backupCollection,
  finalizeRun,
  getLatestRun,
  restoreRun,
  getBackupDb,
} from "./lib/backupRegistry.js";

export type MigrationCtx = { db: Db; client: MongoClient };

const MIG_NAME = "20260222_seed_default_users";
const USERS_COLL = "users";
const MEMBERS_COLL = "members";

// ======================== Seed-Daten ========================

const DEFAULT_USERS = [
  {
    _id: new ObjectId("68ed6c5c2f28cfe34b593e4c"),
    email: "tony@test.de",
    emailNormalized: "tony@test.de",
    name: "Tony",
    passwordHash:
      "$argon2id$v=19$m=65536,t=3,p=4$Xy5RU8fa7FoCkgVwLn6qjQ$ymSU91t6Et5m4BfujLdz47+cPQqSnYaWyWy6oNPIG3I",
    roles: ["user"],
    isActive: true,
    createdAt: new Date("2025-10-13T21:17:16.604Z"),
    updatedAt: new Date("2025-10-13T21:17:16.604Z"),
    __v: 0,
  },
  {
    _id: new ObjectId("68ed6e732f28cfe34b593e55"),
    email: "caro@test.de",
    emailNormalized: "caro@test.de",
    name: "Carolin",
    passwordHash:
      "$argon2id$v=19$m=65536,t=3,p=4$gcSv5OQwNcjtKGjJQGSGlA$GuQojlA2hy9rw9gENwhDK/yMWqys1J5SdN+mi2bJo7A",
    roles: ["user"],
    isActive: true,
    createdAt: new Date("2025-10-13T21:26:11.987Z"),
    updatedAt: new Date("2025-10-13T21:26:11.987Z"),
    __v: 0,
  },
  {
    _id: new ObjectId("68ed700d2f28cfe34b593e5f"),
    email: "test@test.de",
    emailNormalized: "test@test.de",
    name: "Test",
    passwordHash:
      "$argon2id$v=19$m=65536,t=3,p=4$sJIOigYRLuI8VPpannYQKQ$U9XiLMzLQNk29K+HoOMpPUB7RjPX2sVpE0OvshBSoQs",
    roles: ["user"],
    isActive: true,
    createdAt: new Date("2025-10-13T21:33:01.065Z"),
    updatedAt: new Date("2025-10-13T21:33:01.065Z"),
    __v: 0,
  },
] as const;

// ======================== Utils ========================

const nowTs = () => new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);

async function hasCollection(db: Db, name: string): Promise<boolean> {
  return (await db.listCollections({ name }).toArray()).length > 0;
}

async function purgeRunBackups(run: any, client: MongoClient, mainDb: Db) {
  const backupDb = getBackupDb(client, mainDb);
  for (const c of run.collections) {
    try {
      if ((await backupDb.listCollections({ name: c.backupColl }).toArray()).length) {
        await backupDb.collection(c.backupColl).drop();
      }
    } catch {
      /* ignore */
    }
  }
  await backupDb.collection("_migration_runs").deleteOne({ _id: run._id });
}

// ======================== Migration UP ========================

export const up = async ({ context }: { context: MigrationCtx }) => {
  const { db, client } = context;
  const ts = nowTs();
  const run = await startMigrationRun({ client, mainDb: db, mig: MIG_NAME, ts });

  try {
    // ----- users Collection vorbereiten -----
    const usersExistedBefore = await hasCollection(db, USERS_COLL);
    if (!usersExistedBefore) {
      await db.createCollection(USERS_COLL);
      await db.collection(USERS_COLL).createIndex({ emailNormalized: 1 }, { unique: true });
      console.log(`[${MIG_NAME}] Created collection "${USERS_COLL}".`);
    }

    // Backups vor jeder Änderung
    await backupCollection(run, client, db, USERS_COLL);
    if (await hasCollection(db, MEMBERS_COLL)) {
      await backupCollection(run, client, db, MEMBERS_COLL);
    }

    // ----- Users einfügen (idempotent per emailNormalized) -----
    let insertedCount = 0;
    for (const user of DEFAULT_USERS) {
      const exists = await db
        .collection(USERS_COLL)
        .findOne({ emailNormalized: user.emailNormalized });

      if (exists) {
        console.log(`[${MIG_NAME}] User "${user.emailNormalized}" already exists – skipping.`);
        continue;
      }

      await db.collection(USERS_COLL).insertOne({ ...user });
      console.log(`[${MIG_NAME}] Inserted user "${user.emailNormalized}".`);
      insertedCount++;
    }

    // ----- Members per E-Mail mit User verknüpfen -----
    let linkedCount = 0;
    if (await hasCollection(db, MEMBERS_COLL)) {
      for (const user of DEFAULT_USERS) {
        // Gelesene userId aus der DB (könnte bereits existiert haben)
        const dbUser = await db
          .collection(USERS_COLL)
          .findOne({ emailNormalized: user.emailNormalized }, { projection: { _id: 1 } });

        if (!dbUser) continue;

        const result = await db.collection(MEMBERS_COLL).updateMany(
          {
            email: { $regex: `^${user.emailNormalized}$`, $options: "i" },
          },
          { $set: { userId: dbUser._id } }
        );

        if (result.modifiedCount > 0) {
          console.log(
            `[${MIG_NAME}] Linked ${result.modifiedCount} member(s) to user "${user.emailNormalized}".`
          );
          linkedCount += result.modifiedCount;
        } else {
          console.log(
            `[${MIG_NAME}] No unlinked member found for email "${user.emailNormalized}" – skipping.`
          );
        }
      }
    } else {
      console.log(`[${MIG_NAME}] Collection "${MEMBERS_COLL}" not found – skipping member linking.`);
    }

    await finalizeRun(run, client, db, "ok");
    console.log(
      `[${MIG_NAME}] Up finished. ${insertedCount} user(s) inserted, ${linkedCount} member(s) linked.`
    );
  } catch (err) {
    console.error(`[${MIG_NAME}] Up failed:`, err);
    try {
      await restoreRun(run, client, db);
      await finalizeRun(run, client, db, "error", err);
      await purgeRunBackups(run, client, db);
      console.log(`[${MIG_NAME}] Original state restored and backups removed after failure.`);
    } catch (r) {
      console.error(`[${MIG_NAME}] Restore/purge after failure failed:`, r);
    }
    throw err;
  }
};

// ======================== Migration DOWN ========================

export const down = async ({ context }: { context: MigrationCtx }) => {
  const { db, client } = context;
  const run = await getLatestRun(client, db, MIG_NAME);

  if (!run) {
    console.warn(`[${MIG_NAME}] No run found to rollback.`);
    return;
  }

  try {
    const hadUsersBackup = run.collections.some((c) => c.coll === USERS_COLL);

    if (hadUsersBackup) {
      // Zustand vor der Migration für users und members wiederherstellen
      await restoreRun(run, client, db);
    } else {
      // users-Collection existierte vor der Migration nicht → droppen
      if (await hasCollection(db, USERS_COLL)) {
        await db.collection(USERS_COLL).drop();
        console.log(`[${MIG_NAME}] Dropped "${USERS_COLL}" (did not exist before migration).`);
      }
      // Member-Links zurücksetzen (userId → null) für alle betroffenen Emails
      if (await hasCollection(db, MEMBERS_COLL)) {
        const emails = DEFAULT_USERS.map((u) => u.emailNormalized);
        await db.collection(MEMBERS_COLL).updateMany(
          { email: { $in: emails } },
          { $set: { userId: null } }
        );
        console.log(`[${MIG_NAME}] Cleared userId on members for seeded emails.`);
      }
    }

    await finalizeRun(run, client, db, "rolled_back");
    await purgeRunBackups(run, client, db);
    console.log(`[${MIG_NAME}] Down: restored and deleted backups for this migration.`);
  } catch (err) {
    console.error(`[${MIG_NAME}] Down failed:`, err);
    throw err;
  }
};

export default { up, down };
