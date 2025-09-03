import { Db, MongoClient } from "mongodb";

export interface MigrationRun {
  _id?: any;
  mig: string;
  ts: string;
  startedAt: Date;
  finishedAt?: Date;
  status: "pending" | "ok" | "error" | "rolled_back";
  dbName: string;
  backupDbName: string;
  strategy: "copy";
  collections: {
    coll: string;
    backupColl: string;
    count?: number;
    method: "copy";
  }[];
  validators: {
    coll: string;
    validator: any;
    validationLevel?: string | null;
    validationAction?: string | null;
  }[];
  error?: string;
}

const STRATEGY = "copy" as const;

export function getBackupDb(client: MongoClient, mainDb: Db): Db {
  const backupName = process.env.MIGRATION_BACKUP_DB?.trim();
  return backupName ? client.db(backupName) : mainDb;
}

async function ensureIndexes(regDb: Db) {
  await regDb.collection("_migration_runs").createIndex({ mig: 1, ts: -1 });
}

export async function startMigrationRun(params: {
  client: MongoClient;
  mainDb: Db;
  mig: string;
  ts: string;
}): Promise<MigrationRun> {
  const { client, mainDb, mig, ts } = params;
  const backupDb = getBackupDb(client, mainDb);
  await ensureIndexes(backupDb);
  const run: MigrationRun = {
    mig,
    ts,
    startedAt: new Date(),
    status: "pending",
    dbName: mainDb.databaseName,
    backupDbName: backupDb.databaseName,
    strategy: STRATEGY,
    collections: [],
    validators: [],
  };
  const { insertedId } = await backupDb.collection("_migration_runs").insertOne(run);
  run._id = insertedId;
  return run;
}

export async function recordValidator(run: MigrationRun, client: MongoClient, coll: string, mainDb: Db) {
  const info = (await mainDb.listCollections({ name: coll }).toArray())[0] as any | undefined;
  const validator = info?.options?.validator ?? null;
  const validationLevel = info?.options?.validationLevel ?? null;
  const validationAction = info?.options?.validationAction ?? null;
  const backupDb = getBackupDb(client, mainDb);
  await backupDb.collection("_migration_runs").updateOne(
    { _id: run._id },
    { $push: { validators: { coll, validator, validationLevel, validationAction } } }
  );
  run.validators.push({ coll, validator, validationLevel, validationAction });
}

// Neuer Helper: baut sortierbare Backup-Namen (beginnend mit MIG_NAME = Datum)
function formatBackupCollectionName(run: MigrationRun, mainDb: Db, coll: string): string {
  // Beispiel: 20250820_add_settings_events__tobu_db__accounts__20250821123059
  return `${run.mig}__${mainDb.databaseName}__${coll}__${run.ts}`;
}

export async function backupCollection(run: MigrationRun, client: MongoClient, mainDb: Db, coll: string) {
  const exists = await mainDb.listCollections({ name: coll }).toArray();
  if (!exists.length) return;
  const backupDb = getBackupDb(client, mainDb);
  // ALT: `${mainDb.databaseName}__${coll}__${run.mig}__${run.ts}`
  const backupColl = formatBackupCollectionName(run, mainDb, coll);
  await mainDb
    .collection(coll)
    .aggregate([{ $match: {} }, { $out: { db: backupDb.databaseName, coll: backupColl } }])
    .toArray();
  const count = await backupDb.collection(backupColl).countDocuments();
  await backupDb.collection("_migration_runs").updateOne(
    { _id: run._id },
    { $push: { collections: { coll, backupColl, count, method: "copy" } } }
  );
  run.collections.push({ coll, backupColl, count, method: "copy" });
}

export async function finalizeRun(
  run: MigrationRun,
  client: MongoClient,
  mainDb: Db,
  status: MigrationRun["status"],
  error?: any
) {
  const backupDb = getBackupDb(client, mainDb);
  await backupDb.collection("_migration_runs").updateOne(
    { _id: run._id },
    {
      $set: {
        finishedAt: new Date(),
        status,
        error: error ? String(error?.message || error) : undefined,
      },
    }
  );
}

export async function getLatestRun(client: MongoClient, mainDb: Db, mig: string): Promise<MigrationRun | null> {
  const backupDb = getBackupDb(client, mainDb);
  return (await backupDb
    .collection("_migration_runs")
    .find({ mig, dbName: mainDb.databaseName })
    .sort({ ts: -1 })
    .limit(1)
    .next()) as MigrationRun | null;
}

export async function restoreRun(
  run: MigrationRun,
  client: MongoClient,
  mainDb: Db,
  targetCollections?: string[]
) {
  const backupDb = getBackupDb(client, mainDb);
  const filterSet = targetCollections ? new Set(targetCollections) : null;

  for (const c of run.collections) {
    if (filterSet && !filterSet.has(c.coll)) continue;
    const liveExists = await mainDb.listCollections({ name: c.coll }).toArray();
    if (liveExists.length) {
      await mainDb.collection(c.coll).drop();
    }
    const backupExists = await backupDb.listCollections({ name: c.backupColl }).toArray();
    if (!backupExists.length) continue;
    await backupDb
      .collection(c.backupColl)
      .aggregate([{ $match: {} }, { $out: { db: mainDb.databaseName, coll: c.coll } }])
      .toArray();
  }

  for (const v of run.validators) {
    try {
      await mainDb.command({
        collMod: v.coll,
        validator: v.validator ?? {},
        validationLevel: v.validationLevel ?? "strict",
        validationAction: v.validationAction ?? "error",
      });
    } catch {
      /* ignore */
    }
  }
}