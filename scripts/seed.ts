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

async function main() {
  const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/tobu-finance";
  console.log("Connecting:", uri);
  await mongoose.connect(uri);
  console.log("Mongo connected.");

  const data = await loadData();

  console.log("Cleaning existing data...");
  await Promise.all([
    Member.deleteMany({}),
    Account.deleteMany({}),
    Category.deleteMany({}),
    Transaction.deleteMany({}),
    TransactionTemplate.deleteMany({})
  ]);

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

  console.log("Seeding abgeschlossen ohne Cast-Fehler.");
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
