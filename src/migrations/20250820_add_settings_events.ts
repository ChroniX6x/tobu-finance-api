import { Db, MongoClient, ObjectId } from "mongodb";
import {
  startMigrationRun,
  backupCollection,
  recordValidator,
  finalizeRun,
  getLatestRun,
  restoreRun,
} from "./backupRegistry";

export type MigrationCtx = { db: Db; client: MongoClient };

const MIG_NAME = "20250820_add_settings_events";

// ------------------------ Utils ------------------------
const nowTs = () => new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);

async function hasCollection(db: Db, name: string) {
  const found = await db.listCollections({ name }).toArray();
  return found.length > 0;
}
async function dropIf(db: Db, name: string) {
  if (await hasCollection(db, name)) await db.collection(name).drop();
}
async function safeRename(db: Db, from: string, to: string) {
  if (!(await hasCollection(db, from))) return;
  if (await hasCollection(db, to)) await db.collection(to).drop();
  await db.admin().command({ renameCollection: `${db.databaseName}.${from}`, to: `${db.databaseName}.${to}` });
}
async function copyBackup(db: Db, from: string, to: string) {
  if (!(await hasCollection(db, from))) return;
  await db.collection(from).aggregate([{ $match: {} }, { $out: to }]).toArray();
}
async function getCollectionInfo(db: Db, name: string) {
  const info = (await db.listCollections({ name }).toArray())[0] as any | undefined;
  return info ?? null;
}
async function getExistingValidator(db: Db, name: string) {
  const info = await getCollectionInfo(db, name);
  const validator = info?.options?.validator ?? null;
  const validationLevel = info?.options?.validationLevel ?? undefined;
  const validationAction = info?.options?.validationAction ?? undefined;
  return { validator, validationLevel, validationAction };
}
async function saveValidatorBackup(db: Db, coll: string, ts: string) {
  await db.collection("_validator_backups").createIndex({ coll: 1, savedAt: -1 });
  const existing = await getExistingValidator(db, coll);
  await db.collection("_validator_backups").insertOne({
    ts,
    coll,
    validator: existing.validator ?? null,
    validationLevel: existing.validationLevel ?? null,
    validationAction: existing.validationAction ?? null,
    savedAt: new Date(),
  });
}
async function restoreValidatorFromBackup(db: Db, name: string) {
  const doc = await db
    .collection("_validator_backups")
    .find({ coll: name })
    .sort({ savedAt: -1 })
    .limit(1)
    .next();
  if (!doc) return; // nichts zu tun
  await db.command({
    collMod: name,
    validator: doc.validator ?? {},
    validationLevel: (doc.validationLevel as any) ?? "strict",
    validationAction: (doc.validationAction as any) ?? "error",
  });
}
// Merged-Validator anwenden (bestehenden beibehalten)
async function setValidatorMerged(
  db: Db,
  name: string,
  addValidator: Record<string, any>,
  level: "strict" | "moderate" = "moderate",
  action: "error" | "warn" = "error",
  ts?: string
) {
  await saveValidatorBackup(db, name, ts ?? nowTs());
  const existing = await getExistingValidator(db, name);
  const merged =
    existing.validator && Object.keys(existing.validator).length
      ? { $and: [existing.validator, addValidator] }
      : addValidator;

  await db.command({
    collMod: name,
    validator: merged,
    validationLevel: level,
    validationAction: action,
  });
}

// ------------------------ Validators ------------------------
const accountsAddValidator = {
  $jsonSchema: {
    bsonType: "object",
    properties: {
      settings: {
        bsonType: "object",
        properties: {
          dashboard: {
            bsonType: "object",
            properties: {
              historyMonths: { bsonType: "int", minimum: 3, maximum: 24 },
              topKCategories: { bsonType: "int", minimum: 1, maximum: 10 },
            },
            additionalProperties: true,
          },
          alerts: {
            bsonType: "object",
            properties: {
              lowBalanceForecastCents: { bsonType: "int", minimum: 0 },
              carryoverLargeCents: { bsonType: "int", minimum: 0 },
            },
            additionalProperties: true,
          },
        },
        additionalProperties: true,
      },
    },
    additionalProperties: true,
  },
};

const membersAddValidator = {
  $jsonSchema: {
    bsonType: "object",
    properties: {
      avatar: {
        bsonType: ["string", "null"],
        maxLength: 1024,
        description: "optional http/https URL",
      },
    },
    additionalProperties: true,
  },
};

// events – strikter Validator
const EVENT_CODES = [
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

const eventsCreateOptions = {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["accountId", "date", "code", "params"],
      properties: {
        accountId: { bsonType: "objectId" },
        date: { bsonType: "date" },
        code: { enum: EVENT_CODES as any },
        params: { bsonType: "object" },
        createdByMemberId: { bsonType: ["objectId", "null"] },
      },
      additionalProperties: true,
    },
  },
  validationLevel: "strict",
  validationAction: "error",
} as const;

// ------------------------ Migration UP ------------------------
export const up = async ({ context }: { context: MigrationCtx }) => {
  const { db, client } = context;
  const ts = nowTs();
  const run = await startMigrationRun({ client, mainDb: db, mig: MIG_NAME, ts });

  let swapDone = false;

  const rollback = async (err: any) => {
    console.warn(`[${MIG_NAME}] Rolling back:`, err?.message || err);
    try {
      await restoreRun(run, client, db);
      await finalizeRun(run, client, db, "error", err);
    } catch (e) {
      console.error(`[${MIG_NAME}] Rollback restore failed:`, e);
    }
    throw err;
  };

  try {
    for (const n of ["accounts", "members"]) {
      if (!(await hasCollection(db, n))) throw new Error(`Collection "${n}" missing – cannot migrate.`);
    }

    await recordValidator(run, client, "accounts", db);
    await recordValidator(run, client, "members", db);

    await backupCollection(run, client, db, "accounts");
    await backupCollection(run, client, db, "members");
    if (await hasCollection(db, "transactions")) {
      await backupCollection(run, client, db, "transactions");
    }

    const NEW = (n: string) => `__new__${n}_${ts}`;
    await dropIf(db, NEW("accounts"));
    await db.collection("accounts").aggregate([{ $match: {} }, { $out: NEW("accounts") }]).toArray();
    await db.collection(NEW("accounts")).updateMany(
      {},
      [
        { $set: { settings: { $ifNull: ["$settings", {}] } } },
        { $set: { "settings.dashboard": { $ifNull: ["$settings.dashboard", {}] } } },
        { $set: { "settings.alerts": { $ifNull: ["$settings.alerts", {}] } } },
        {
          $set: {
            "settings.dashboard.historyMonths": { $ifNull: ["$settings.dashboard.historyMonths", 6] },
            "settings.dashboard.topKCategories": { $ifNull: ["$settings.dashboard.topKCategories", 5] },
            "settings.alerts.lowBalanceForecastCents": {
              $ifNull: ["$settings.alerts.lowBalanceForecastCents", 100000],
            },
            "settings.alerts.carryoverLargeCents": {
              $ifNull: ["$settings.alerts.carryoverLargeCents", 10000],
            },
          },
        },
      ]
    );

    if (await hasCollection(db, "accounts")) {
      await dropIf(db, "accounts");
    }
    await safeRename(db, NEW("accounts"), "accounts");
    swapDone = true;

    await setValidatorMerged(db, "accounts", accountsAddValidator, "moderate", "error", ts);
    await setValidatorMerged(db, "members", membersAddValidator, "moderate", "error", ts);

    if (!(await hasCollection(db, "events"))) {
      await db.createCollection("events", eventsCreateOptions as any);
    } else {
      await db.command({ collMod: "events", ...(eventsCreateOptions as any) });
    }
    await db.collection("events").createIndex({ accountId: 1, date: -1 });
    await db.collection("events").createIndex({ createdByMemberId: 1, date: -1 });

    // 6) Beispiel-Events seeden
    const accounts = await db.collection("accounts").find({}, { projection: { _id: 1, members: 1 } }).toArray();
    const hasTx = await hasCollection(db, "transactions");
    for (const acc of accounts) {
      const accountId: ObjectId = acc._id as ObjectId;

      // letzte 3 booked-Transaktionen
      let txEvents: any[] = [];
      if (hasTx) {
        const txs = await db
          .collection("transactions")
          .find({ accountId, status: "booked" })
          .sort({ bookDate: -1 })
          .limit(3)
          .toArray();

        txEvents = txs.map((t: any) => ({
          _id: new ObjectId(),
          accountId,
          date: t.bookDate ?? new Date(),
          code: "transaction.booked",
          params: {
            transactionId: String(t._id),
            type: t.type,
            amountCents: t.amountCents ?? 0,
            title: t.title ?? undefined,
            categoryId: t.categoryId ? String(t.categoryId) : undefined,
          },
          createdByMemberId: t.paidByMemberId ?? null,
        }));
      }

      // Member-Join-Events
      const memberEvents = (acc.members ?? []).map((m: any) => ({
        _id: new ObjectId(),
        accountId,
        date: new Date(Date.now() - 24 * 3600 * 1000),
        code: "account.member.added",
        params: { memberId: String(m.memberId) },
        createdByMemberId: m.memberId ?? null,
      }));

      const seed = [...txEvents, ...memberEvents];
      if (seed.length) {
        await db.collection("events").insertMany(seed, { ordered: true });
      }
    }

    await dropIf(db, NEW("accounts"));

    await finalizeRun(run, client, db, "ok");
    console.log(`[${MIG_NAME}] Up migration finished with registry backups.`);
  } catch (err) {
    if (swapDone) {
      try {
        await rollback(err);
      } catch {
        throw err;
      }
    } else {
      await finalizeRun(run, client, db, "error", err);
      throw err;
    }
  }
};

// ------------------------ Migration DOWN ------------------------
export const down = async ({ context }: { context: MigrationCtx }) => {
  const { db, client } = context;
  const run = await getLatestRun(client, db, MIG_NAME);

  if (await hasCollection(db, "events")) {
    await db.collection("events").drop();
  }

  await db.collection("accounts").updateMany(
    {},
    {
      $unset: {
        "settings.dashboard.historyMonths": "",
        "settings.dashboard.topKCategories": "",
        "settings.alerts.lowBalanceForecastCents": "",
        "settings.alerts.carryoverLargeCents": "",
      },
    }
  );
  await db.collection("accounts").updateMany(
    {},
    [
      {
        $set: {
          "settings.dashboard": {
            $cond: [
              { $gt: [{ $size: { $objectToArray: "$settings.dashboard" } }, 0] },
              "$settings.dashboard",
              "$$REMOVE",
            ],
          },
          "settings.alerts": {
            $cond: [
              { $gt: [{ $size: { $objectToArray: "$settings.alerts" } }, 0] },
              "$settings.alerts",
              "$$REMOVE",
            ],
          },
        },
      },
    ]
  );
  await db.collection("accounts").updateMany(
    {},
    [
      {
        $set: {
          settings: {
            $cond: [{ $gt: [{ $size: { $objectToArray: "$settings" } }, 0] }, "$settings", "$$REMOVE"],
          },
        },
      },
    ]
  );

  if (run) {
    await restoreRun(run, client, db, ["accounts", "members"]);
    await finalizeRun(run, client, db, "rolled_back");
    console.log(`[${MIG_NAME}] Down restored from registry backups.`);
  } else {
    console.warn(`[${MIG_NAME}] No registry run found – structural rollback limited.`);
  }

  const all = await db.listCollections().toArray();
  for (const { name } of all) {
    if (name.startsWith("__new__") || name.startsWith("__tmp_revert_")) {
      try {
        await db.collection(name).drop();
      } catch {
        /* ignore */
      }
    }
  }
};

export default { up, down };
