import { Db, MongoClient } from "mongodb";
import {
  startMigrationRun,
  backupCollection,
  recordValidator,
  finalizeRun,
  getLatestRun,
  restoreRun,
  getBackupDb,
} from "./lib/backupRegistry.js";

export type MigrationCtx = { db: Db; client: MongoClient };

const MIG_NAME = "20260224_transactions_phase0";

// ─── utils (same pattern as existing migrations) ──────────────────────────────

const nowTs = () => new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);

async function hasCollection(db: Db, name: string) {
  return (await db.listCollections({ name }).toArray()).length > 0;
}

async function dropIf(db: Db, name: string) {
  if (await hasCollection(db, name)) await db.collection(name).drop();
}

async function safeRename(db: Db, from: string, to: string) {
  if (!(await hasCollection(db, from))) return;
  if (await hasCollection(db, to)) await db.collection(to).drop();
  await db
    .admin()
    .command({ renameCollection: `${db.databaseName}.${from}`, to: `${db.databaseName}.${to}` });
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

// ─── Event codes ──────────────────────────────────────────────────────────────

// Full list of allowed event codes after this migration (adds split codes).
const EVENT_CODES_V2 = [
  "transaction.created",
  "transaction.booked",
  "transaction.statusChanged",
  "transaction.splitChildCreated",
  "transaction.splitChildDeleted",
  "contributionRule.added",
  "contributionRule.updated",
  "contributionRule.removed",
  "memberIncome.added",
  "memberIncome.updated",
  "memberIncome.removed",
  "categoryBudget.added",
  "categoryBudget.updated",
  "categoryBudget.removed",
  "account.member.added",
  "account.member.removed",
] as const;

// Pre-migration codes (used in down to restore the old validator).
const EVENT_CODES_V1 = [
  "transaction.created",
  "transaction.booked",
  "transaction.statusChanged",
  "contributionRule.added",
  "contributionRule.updated",
  "contributionRule.removed",
  "memberIncome.added",
  "memberIncome.updated",
  "memberIncome.removed",
  "categoryBudget.added",
  "categoryBudget.updated",
  "categoryBudget.removed",
  "account.member.added",
  "account.member.removed",
] as const;

function buildEventsValidator(codes: readonly string[]) {
  return {
    $jsonSchema: {
      bsonType: "object",
      required: ["accountId", "date", "code", "params"],
      properties: {
        accountId: { bsonType: "objectId" },
        date: { bsonType: "date" },
        code: { enum: codes as unknown as string[] },
        params: { bsonType: "object" },
        createdByMemberId: { bsonType: ["objectId", "null"] },
      },
      additionalProperties: true,
    },
  };
}

// ─── Migration UP ─────────────────────────────────────────────────────────────
//
// Changes to `transactions` collection:
//   1. title:               null → "(ohne Titel)"  (now required, min 2 chars)
//   2. notes:               missing field → null
//   3. parentTransactionId: missing field → null
//   4. isFromSharedAccount: null → true  (conservative default)
//   5. month:               re-derive from bookDate when bookDate set,
//                           else derive from createdAt (Monatsanfang UTC)
//   6. status:              booked+bookDate=null → pending  (constraint fix)
//   7. Drop old ascending bookDate index, create descending one.
//   8. Create new indexes:
//        { accountId: 1, parentTransactionId: 1 }
//        { parentTransactionId: 1 }
//   9. Update events collection validator to include split event codes.

export const up = async ({ context }: { context: MigrationCtx }) => {
  const { db, client } = context;
  const ts = nowTs();
  const run = await startMigrationRun({ client, mainDb: db, mig: MIG_NAME, ts });

  try {
    if (!(await hasCollection(db, "transactions"))) {
      throw new Error('Collection "transactions" missing – cannot migrate.');
    }

    await recordValidator(run, client, "transactions", db);
    // Also record the current events validator so down() can restore it.
    if (await hasCollection(db, "events")) {
      await recordValidator(run, client, "events", db);
    }
    await backupCollection(run, client, db, "transactions");

    const NEW = `__new__transactions_${ts}`;
    await dropIf(db, NEW);

    // 1–6: field backfill via aggregation pipeline into temp collection
    await db
      .collection("transactions")
      .aggregate([
        { $match: {} },
        {
          $addFields: {
            // 1) title: use existing value or backfill
            title: {
              $cond: {
                if: { $or: [{ $eq: ["$title", null] }, { $not: ["$title"] }] },
                then: "(ohne Titel)",
                else: "$title",
              },
            },
            // 2) notes: ensure field exists
            notes: { $ifNull: ["$notes", null] },
            // 3) parentTransactionId: ensure field exists
            parentTransactionId: { $ifNull: ["$parentTransactionId", null] },
            // 4) isFromSharedAccount: null → true
            isFromSharedAccount: {
              $cond: {
                if: { $eq: ["$isFromSharedAccount", null] },
                then: true,
                else: "$isFromSharedAccount",
              },
            },
            // 5) month: derive from bookDate if set, else from createdAt (both floored to month start)
            month: {
              $cond: {
                if: { $ne: ["$bookDate", null] },
                then: {
                  $dateFromParts: {
                    year: { $year: "$bookDate" },
                    month: { $month: "$bookDate" },
                    day: 1,
                    timezone: "UTC",
                  },
                },
                else: {
                  $cond: {
                    if: { $ne: ["$month", null] },
                    then: "$month",
                    else: {
                      $dateFromParts: {
                        year: { $year: "$createdAt" },
                        month: { $month: "$createdAt" },
                        day: 1,
                        timezone: "UTC",
                      },
                    },
                  },
                },
              },
            },
          },
        },
        // 6) status: booked + bookDate=null → pending
        {
          $addFields: {
            status: {
              $cond: {
                if: { $and: [{ $eq: ["$status", "booked"] }, { $eq: ["$bookDate", null] }] },
                then: "pending",
                else: "$status",
              },
            },
          },
        },
        { $out: NEW },
      ])
      .toArray();

    await dropIf(db, "transactions");
    await safeRename(db, NEW, "transactions");

    // 7) Re-create bookDate index as descending (was ascending before)
    try {
      await db.collection("transactions").dropIndex("accountId_1_bookDate_1");
    } catch {
      // index may not exist with that exact name – try by spec
      try {
        await db.collection("transactions").dropIndex({ accountId: 1, bookDate: 1 } as any);
      } catch {
        /* ignore – index might already be gone or never existed */
      }
    }
    await db.collection("transactions").createIndex({ accountId: 1, bookDate: -1 });

    // 8) New indexes for split queries
    await db.collection("transactions").createIndex({ accountId: 1, parentTransactionId: 1 });
    await db.collection("transactions").createIndex({ parentTransactionId: 1 });

    // 9) Update events validator to allow split event codes
    if (await hasCollection(db, "events")) {
      await db.command({
        collMod: "events",
        validator: buildEventsValidator(EVENT_CODES_V2),
        validationLevel: "strict",
        validationAction: "error",
      });
    }

    // Temp cleanup
    const all = await db.listCollections().toArray();
    for (const { name } of all) {
      if (name.startsWith("__new__")) {
        try { await db.collection(name).drop(); } catch { /* ignore */ }
      }
    }

    await finalizeRun(run, client, db, "ok");
    console.log(
      `[${MIG_NAME}] Up finished: title backfill, notes/parentTransactionId/isFromSharedAccount fields added, month re-derived, status fixed, indexes updated, events validator extended.`
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
  } finally {
    const all = await db.listCollections().toArray();
    for (const { name } of all) {
      if (name.startsWith("__new__")) {
        try { await db.collection(name).drop(); } catch { /* ignore */ }
      }
    }
  }
};

// ─── Migration DOWN ───────────────────────────────────────────────────────────
//
// Restores the `transactions` collection from backup.
// New indexes are dropped (they don't exist in the backup state).

export const down = async ({ context }: { context: MigrationCtx }) => {
  const { db, client } = context;
  const run = await getLatestRun(client, db, MIG_NAME);

  if (!run) {
    console.warn(`[${MIG_NAME}] No run found to rollback.`);
    return;
  }

  try {
    await restoreRun(run, client, db);

    // Restore ascending bookDate index (pre-migration state)
    try { await db.collection("transactions").dropIndex({ accountId: 1, bookDate: -1 } as any); } catch { /* ignore */ }
    await db.collection("transactions").createIndex({ accountId: 1, bookDate: 1 });

    // Drop new indexes introduced by this migration
    try { await db.collection("transactions").dropIndex({ accountId: 1, parentTransactionId: 1 } as any); } catch { /* ignore */ }
    try { await db.collection("transactions").dropIndex({ parentTransactionId: 1 } as any); } catch { /* ignore */ }

    // Restore events validator to pre-migration codes
    if (await hasCollection(db, "events")) {
      await db.command({
        collMod: "events",
        validator: buildEventsValidator(EVENT_CODES_V1),
        validationLevel: "strict",
        validationAction: "error",
      });
    }

    await finalizeRun(run, client, db, "rolled_back");
    await purgeRunBackups(run, client, db);
    console.log(`[${MIG_NAME}] Down: restored transactions, reverted indexes, reverted events validator.`);
  } catch (err) {
    console.error(`[${MIG_NAME}] Down failed:`, err);
    throw err;
  } finally {
    const all = await db.listCollections().toArray();
    for (const { name } of all) {
      if (name.startsWith("__new__") || name.startsWith("__tmp_revert_")) {
        try { await db.collection(name).drop(); } catch { /* ignore */ }
      }
    }
  }
};

export default { up, down };
