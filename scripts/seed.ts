import "dotenv/config";
import fs from "fs/promises";
import path from "path";
import mongoose, { Schema } from "mongoose";

type DB = {
  members: any[];
  accounts: any[];
  categories: any[];
  transactions: any[];
  transactionTemplates: any[];
};

// Kommentar-toleranter Parser
function parseJsonWithComments(txt: string) {
  return JSON.parse(
    txt
      .replace(/\/\*[\s\S]*?\*\//g, "") // Block-Kommentare
      .replace(/^\s*\/\/.*$/gm, "") // Zeilen-Kommentare
  );
}

// Flexibles Model mit string _id (verhindert ObjectId-Cast)
function createFlexibleModel(name: string, collection: string) {
  const schema = new Schema(
    { _id: { type: String } },
    { strict: false, versionKey: false }
  );
  return mongoose.models[name] || mongoose.model(name, schema, collection);
}

const Member = createFlexibleModel("Member", "members");
const Account = createFlexibleModel("Account", "accounts");
const Category = createFlexibleModel("Category", "categories");
const Transaction = createFlexibleModel("Transaction", "transactions");
const TransactionTemplate = createFlexibleModel(
  "TransactionTemplate",
  "transactionTemplates"
);

async function ensureMembersExist(ids: string[], known: Set<string>) {
  const toCreate = ids.filter((id) => id && !known.has(id));
  if (!toCreate.length) return;
  await Member.insertMany(
    toCreate.map((id) => ({
      _id: id,
      name: `Placeholder ${id}`,
      placeholder: true
    }))
  );
  toCreate.forEach((id) => known.add(id));
}

async function loadData(): Promise<DB> {
  const file = path.resolve("./db.json");
  const raw = await fs.readFile(file, "utf-8");
  return parseJsonWithComments(raw);
}

function mapWithId<T extends { id?: string }>(arr: T[] = []) {
  return arr.map((o) => {
    const { id, ...rest } = o;
    return { _id: id, ...rest };
  });
}

// NEU: vollständiger Reset (alle Collections droppen)
async function dropAllCollections() {
  const skip = new Set(
    (process.env.SKIP_DROP || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
  const db = mongoose.connection.db;
  const cols = await db.listCollections().toArray();
  for (const c of cols) {
    if (c.name.startsWith("system.")) continue;
    if (skip.has(c.name)) {
      console.log(`[reset] Skipping drop of ${c.name}`);
      continue;
    }
    await db.dropCollection(c.name);
    console.log(`[reset] Dropped collection: ${c.name}`);
  }
}

// NEU: Backup-DB ebenfalls leeren (falls MIGRATION_BACKUP_DB gesetzt)
async function dropBackupCollectionsIfConfigured() {
  const backupName = process.env.MIGRATION_BACKUP_DB?.trim();
  if (!backupName) {
    console.log("[reset] No MIGRATION_BACKUP_DB set -> skipping backup DB cleanup.");
    return;
  }
  const mainName = mongoose.connection.db.databaseName;
  if (backupName === mainName) {
    console.log("[reset] MIGRATION_BACKUP_DB equals main DB -> skipping (already cleared).");
    return;
  }
  const client = mongoose.connection.getClient
    ? mongoose.connection.getClient()
    : (mongoose as any).connection.client;
  const backupDb = client.db(backupName);
  console.log(`[reset] Dropping collections in backup DB '${backupName}' ...`);
  const cols = await backupDb.listCollections().toArray();
  for (const c of cols) {
    if (c.name.startsWith("system.")) continue;
    await backupDb.dropCollection(c.name);
    console.log(`[reset][backup] Dropped collection: ${c.name}`);
  }
  console.log("[reset] Backup DB cleanup done.");
}

async function main() {
  const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/tobu-finance";
  if (process.env.NODE_ENV === "production" && process.env.FORCE_RESET !== "1") {
    console.error("Refusing to run full reset in production without FORCE_RESET=1");
    process.exit(2);
  }
  console.log("Connecting:", uri);
  await mongoose.connect(uri);
  console.log("Mongo connected.");

  console.log("Reset: dropping all existing collections...");
  await dropAllCollections();

  // NEU: Backup-DB auch resetten
  await dropBackupCollectionsIfConfigured();

  const data = await loadData();

  console.log("Inserting members...");
  const members = mapWithId(data.members || []);
  await Member.insertMany(members);
  const known = new Set(members.map((m: any) => m._id));

  console.log("Inserting accounts...");
  for (const acc of data.accounts || []) {
    const memberIds: string[] = Array.isArray(acc.members) ? acc.members : [];
    await ensureMembersExist(memberIds, known);

    const topUps = (acc.topUps || []).map((t: any) => {
      if (t.id) return { _id: t.id, ...t };
      return t;
    });

    const doc = { _id: acc.id, ...acc, topUps };
    await Account.create(doc);
  }

  console.log("Inserting categories...");
  await Category.insertMany(mapWithId(data.categories || []));

  console.log("Preparing transactions (checking missing payer IDs)...");
  const missingPayerIds = Array.from(
    new Set(
      (data.transactions || [])
        .map((t) => t.paidByMemberId)
        .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
        .filter((x) => !known.has(x))
    )
  );
  await ensureMembersExist(missingPayerIds, known);

  console.log("Inserting transactions...");
  await Transaction.insertMany(mapWithId(data.transactions || []));

  console.log("Inserting transaction templates...");
  await TransactionTemplate.insertMany(mapWithId(data.transactionTemplates || []));

  console.log("Reset + Seeding abgeschlossen.");
  await mongoose.disconnect();
  process.exit(0);
}

main().catch(async (err) => {
  console.error("Seeding fehlgeschlagen:", err);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
