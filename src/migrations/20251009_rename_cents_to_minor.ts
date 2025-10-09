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

const MIG_NAME = "20250109_rename_cents_to_minor";

// ======================== Utils ========================
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

async function saveValidatorBackup(mainDb: Db, client: MongoClient, coll: string, ts: string) {
  const backupDb = getBackupDb(client, mainDb);
  await backupDb.collection("_validator_backups").createIndex({ coll: 1, savedAt: -1 });
  const existing = await getExistingValidator(mainDb, coll);
  await backupDb.collection("_validator_backups").insertOne({
    ts,
    coll,
    validator: existing.validator ?? null,
    validationLevel: existing.validationLevel ?? null,
    validationAction: existing.validationAction ?? null,
    savedAt: new Date(),
  });
}

async function restoreValidatorFromBackup(mainDb: Db, client: MongoClient, name: string) {
  const backupDb = getBackupDb(client, mainDb);
  const doc = await backupDb
    .collection("_validator_backups")
    .find({ coll: name })
    .sort({ savedAt: -1 })
    .limit(1)
    .next();
  if (!doc) return;
  await mainDb.command({
    collMod: name,
    validator: doc.validator ?? {},
    validationLevel: (doc.validationLevel as any) ?? "strict",
    validationAction: (doc.validationAction as any) ?? "error",
  });
}

async function setValidatorMerged(
  mainDb: Db,
  client: MongoClient,
  name: string,
  addValidator: Record<string, any>,
  level: "strict" | "moderate" = "moderate",
  action: "error" | "warn" = "error",
  ts?: string
) {
  await saveValidatorBackup(mainDb, client, name, ts ?? nowTs());
  const existing = await getExistingValidator(mainDb, name);
  const merged =
    existing.validator && Object.keys(existing.validator).length
      ? { $and: [existing.validator, addValidator] }
      : addValidator;

  await mainDb.command({
    collMod: name,
    validator: merged,
    validationLevel: level,
    validationAction: action,
  });
}

// Backups eines Runs vollständig löschen
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

// ======================== Validators ========================

// Aktualisierte Validators mit "Minor" statt "Cents"
const accountsUpdatedValidator = {
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
              lowBalanceForecastMinor: { bsonType: "int", minimum: 0 },
              carryoverLargeMinor: { bsonType: "int", minimum: 0 },
              stalenessDays: { bsonType: "int", minimum: 1, maximum: 365 },
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

// ======================== Migration UP ========================
export const up = async ({ context }: { context: MigrationCtx }) => {
  const { db, client } = context;
  const ts = nowTs();
  const run = await startMigrationRun({ client, mainDb: db, mig: MIG_NAME, ts });

  try {
    // Collections, die betroffen sind
    const collections = [
      "accounts",
      "transactions",
      "recurrences",
      "member_incomes",
      "contribution_rules",
      "carryovers",
      "account_balances",
      "category_budgets",
    ];

    // Optionale Collection prüfen
    const hasTransactionTemplates = await hasCollection(db, "transactionTemplates");
    if (hasTransactionTemplates) {
      collections.push("transactionTemplates");
    }

    // Prüfe, ob alle Collections existieren
    for (const coll of collections) {
      if (!(await hasCollection(db, coll))) {
        throw new Error(`Collection "${coll}" missing – cannot migrate.`);
      }
    }

    // Validators sichern
    await recordValidator(run, client, "accounts", db);

    // Backups erstellen
    for (const coll of collections) {
      await backupCollection(run, client, db, coll);
    }

    const NEW = (n: string) => `__new__${n}_${ts}`;

    // ========== 1) ACCOUNTS: Settings erweitern + Cents → Minor ==========
    await dropIf(db, NEW("accounts"));
    await db.collection("accounts").aggregate([{ $match: {} }, { $out: NEW("accounts") }]).toArray();

    // Füge stalenessDays hinzu und benenne Cents → Minor um
    await db.collection(NEW("accounts")).updateMany(
      {},
      [
        { $set: { settings: { $ifNull: ["$settings", {}] } } },
        { $set: { "settings.alerts": { $ifNull: ["$settings.alerts", {}] } } },
        {
          $set: {
            // Neue Felder mit Minor + neues stalenessDays
            "settings.alerts.lowBalanceForecastMinor": {
              $ifNull: ["$settings.alerts.lowBalanceForecastCents", 100000],
            },
            "settings.alerts.carryoverLargeMinor": {
              $ifNull: ["$settings.alerts.carryoverLargeCents", 10000],
            },
            "settings.alerts.stalenessDays": {
              $ifNull: ["$settings.alerts.stalenessDays", 30],
            },
          },
        },
        // Alte Cents-Felder entfernen
        {
          $unset: [
            "settings.alerts.lowBalanceForecastCents",
            "settings.alerts.carryoverLargeCents",
          ],
        },
      ]
    );

    await dropIf(db, "accounts");
    await safeRename(db, NEW("accounts"), "accounts");

    // ========== 2) TRANSACTIONS: amountCents → amountMinor ==========
    await dropIf(db, NEW("transactions"));
    await db.collection("transactions").aggregate([{ $match: {} }, { $out: NEW("transactions") }]).toArray();

    await db.collection(NEW("transactions")).updateMany(
      {},
      [
        { $set: { amountMinor: { $ifNull: ["$amountCents", 0] } } },
        { $unset: "amountCents" },
      ]
    );

    await dropIf(db, "transactions");
    await safeRename(db, NEW("transactions"), "transactions");

    // ========== 3) RECURRENCES: amountCents → amountMinor ==========
    await dropIf(db, NEW("recurrences"));
    await db.collection("recurrences").aggregate([{ $match: {} }, { $out: NEW("recurrences") }]).toArray();

    await db.collection(NEW("recurrences")).updateMany(
      {},
      [
        { $set: { amountMinor: { $ifNull: ["$amountCents", 0] } } },
        { $unset: "amountCents" },
      ]
    );

    await dropIf(db, "recurrences");
    await safeRename(db, NEW("recurrences"), "recurrences");

    // ========== 4) MEMBER_INCOMES: amountCents → amountMinor ==========
    await dropIf(db, NEW("member_incomes"));
    await db.collection("member_incomes").aggregate([{ $match: {} }, { $out: NEW("member_incomes") }]).toArray();

    await db.collection(NEW("member_incomes")).updateMany(
      {},
      [
        { $set: { amountMinor: { $ifNull: ["$amountCents", 0] } } },
        { $unset: "amountCents" },
      ]
    );

    await dropIf(db, "member_incomes");
    await safeRename(db, NEW("member_incomes"), "member_incomes");

    // ========== 5) CONTRIBUTION_RULES: amountCents → amountMinor ==========
    await dropIf(db, NEW("contribution_rules"));
    await db.collection("contribution_rules").aggregate([{ $match: {} }, { $out: NEW("contribution_rules") }]).toArray();

    await db.collection(NEW("contribution_rules")).updateMany(
      {},
      [
        { $set: { amountMinor: { $ifNull: ["$amountCents", 0] } } },
        { $unset: "amountCents" },
      ]
    );

    await dropIf(db, "contribution_rules");
    await safeRename(db, NEW("contribution_rules"), "contribution_rules");

    // ========== 6) CARRYOVERS: amountCents → amountMinor ==========
    await dropIf(db, NEW("carryovers"));
    await db.collection("carryovers").aggregate([{ $match: {} }, { $out: NEW("carryovers") }]).toArray();

    await db.collection(NEW("carryovers")).updateMany(
      {},
      [
        { $set: { amountMinor: { $ifNull: ["$amountCents", 0] } } },
        { $unset: "amountCents" },
      ]
    );

    await dropIf(db, "carryovers");
    await safeRename(db, NEW("carryovers"), "carryovers");

    // ========== 7) ACCOUNT_BALANCES: closingBalanceCents → closingBalanceMinor ==========
    await dropIf(db, NEW("account_balances"));
    await db.collection("account_balances").aggregate([{ $match: {} }, { $out: NEW("account_balances") }]).toArray();

    await db.collection(NEW("account_balances")).updateMany(
      {},
      [
        { $set: { closingBalanceMinor: { $ifNull: ["$closingBalanceCents", 0] } } },
        { $unset: "closingBalanceCents" },
      ]
    );

    await dropIf(db, "account_balances");
    await safeRename(db, NEW("account_balances"), "account_balances");

    // ========== 8) CATEGORY_BUDGETS: amountCents → amountMinor ==========
    await dropIf(db, NEW("category_budgets"));
    await db.collection("category_budgets").aggregate([{ $match: {} }, { $out: NEW("category_budgets") }]).toArray();

    await db.collection(NEW("category_budgets")).updateMany(
      {},
      [
        { $set: { amountMinor: { $ifNull: ["$amountCents", 0] } } },
        { $unset: "amountCents" },
      ]
    );

    await dropIf(db, "category_budgets");
    await safeRename(db, NEW("category_budgets"), "category_budgets");

    // ========== 9) TRANSACTION_TEMPLATES: amount → amountMinor (falls vorhanden) ==========
    if (hasTransactionTemplates) {
      await dropIf(db, NEW("transactionTemplates"));
      await db.collection("transactionTemplates").aggregate([{ $match: {} }, { $out: NEW("transactionTemplates") }]).toArray();

      await db.collection(NEW("transactionTemplates")).updateMany(
        {},
        [
          { $set: { amountMinor: { $ifNull: ["$amount", 0] } } },
          { $unset: "amount" },
        ]
      );

      await dropIf(db, "transactionTemplates");
      await safeRename(db, NEW("transactionTemplates"), "transactionTemplates");
    }

    // ========== 10) Validator aktualisieren ==========
    await setValidatorMerged(db, client, "accounts", accountsUpdatedValidator, "moderate", "error", ts);

    // Temp-Collections aufräumen
    const all = await db.listCollections().toArray();
    for (const { name } of all) {
      if (name.startsWith("__new__")) {
        try {
          await db.collection(name).drop();
        } catch {}
      }
    }

    await finalizeRun(run, client, db, "ok");
    console.log(`[${MIG_NAME}] Up migration finished. Renamed ...Cents → ...Minor and added stalenessDays.`);
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
    // Temp-Collections immer aufräumen
    const all = await db.listCollections().toArray();
    for (const { name } of all) {
      if (name.startsWith("__new__")) {
        try {
          await db.collection(name).drop();
        } catch {}
      }
    }
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
    // Restore aus Backups
    await restoreRun(run, client, db);
    await finalizeRun(run, client, db, "rolled_back");
    await purgeRunBackups(run, client, db);
    console.log(`[${MIG_NAME}] Down: restored and deleted backups for this migration.`);
  } catch (err) {
    console.error(`[${MIG_NAME}] Down failed:`, err);
    throw err;
  } finally {
    // Temp-Cleanup
    const all = await db.listCollections().toArray();
    for (const { name } of all) {
      if (name.startsWith("__new__") || name.startsWith("__tmp_revert_")) {
        try {
          await db.collection(name).drop();
        } catch {}
      }
    }
  }
};

export default { up, down };
