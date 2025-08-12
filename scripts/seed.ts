import "dotenv/config";
import fs from "fs/promises";
import path from "path";
import { connectDB } from "../src/db.js";
import Member from "../src/models/Member.js";
import Account from "../src/models/Account.js";
import Category from "../src/models/Category.js";
import Transaction from "../src/models/Transaction.js";
import Template from "../src/models/TransactionTemplate.js";

type DB = {
  member: any[];
  accounts: any[];
  categories: any[];
  transactions: any[];
  transactionTemplates: any[];
};

async function ensureMembersExist(ids: string[], known: Set<string>) {
  const created: string[] = [];
  for (const id of ids) {
    if (!known.has(id)) {
      await Member.create({ _id: id, name: `Placeholder ${id}` });
      known.add(id);
      created.push(id);
    }
  }
  return created;
}

async function main() {
  const uri = process.env.MONGODB_URI!;
  await connectDB(uri);

  // Datei laden (Passe den Pfad an deine Umgebung an)
  const file = path.resolve("./db.json"); // <- z.B. projektnah ablegen
  const raw = await fs.readFile(file, "utf-8");
  const data: DB = JSON.parse(raw);

  // clean
  await Promise.all([
    Member.deleteMany({}),
    Account.deleteMany({}),
    Category.deleteMany({}),
    Transaction.deleteMany({}),
    Template.deleteMany({})
  ]);

  // Members
  const members = data.member.map((m) => ({ _id: m.id, ...m }));
  await Member.insertMany(members);
  const known = new Set(members.map((m) => m._id));

  // Accounts + Platzhalter für ggf. fehlende memberIds
  for (const acc of data.accounts) {
    const accountMemberIds: string[] = Array.isArray(acc.memberIds) ? acc.memberIds : [];
    await ensureMembersExist(accountMemberIds, known);

    // topUps: Subdocs _id aus id
    const topUps = (acc.topUps || []).map((t: any) => ({ _id: t.id, ...t }));
    const doc = { _id: acc.id, ...acc, topUps };
    await Account.create(doc);
  }

  // Categories (customSplit gemischt => Mixed)
  const cats = data.categories.map((c) => ({ _id: c.id, ...c }));
  await Category.insertMany(cats);

  // Transactions
  // paidByMemberId prüfen + ggf. Placeholder
  const missingPayerIds = Array.from(
    new Set(
      data.transactions
        .map((t) => t.paidByMemberId)
        .filter((x): x is string => typeof x === "string")
        .filter((x) => !known.has(x))
    )
  );
  await ensureMembersExist(missingPayerIds, known);

  const txs = data.transactions.map((t) => ({ _id: t.id, ...t }));
  await Transaction.insertMany(txs);

  // Templates
  const tpl = data.transactionTemplates.map((t) => ({ _id: t.id, ...t }));
  await Template.insertMany(tpl);

  console.log("Seed fertig.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
