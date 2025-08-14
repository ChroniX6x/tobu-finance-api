import "dotenv/config";
import { MongoClient } from "mongodb";

async function main() {
  const uri = process.env.MONGODB_URI!;
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db();
  const dbName = db.databaseName;

  const colls = await db.listCollections().toArray();
  const names = colls.map(c => c.name);

  const has = (n: string) => names.includes(n);
  const dropIf = async (n: string) => { if (has(n)) await db.collection(n).drop(); };
  const latestSuffix = () => {
    const ts = names
      .map(n => n.match(/_(v1old|v1bk)_(\d{14})$/))
      .filter(Boolean)
      .map(m => (m as RegExpMatchArray)[2])
      .sort();
    return ts.at(-1) ?? null;
  };
  const suf = latestSuffix();
  if (!suf) { console.log("No _v1old/_v1bk backups found. Nothing to revert."); await client.close(); return; }
  const BK = (n: string) => `${n}_v1bk_${suf}`;
  const OLD = (n: string) => `${n}_v1old_${suf}`;
  const safeRename = async (from: string, to: string) => {
    if (!has(from)) return;
    if (has(to)) await db.collection(to).drop();
    await db.admin().command({ renameCollection: `${dbName}.${from}`, to: `${dbName}.${to}` });
  };

  // 1) drop v2 + temp
  const finals = ["members","accounts","categories","transactions","recurrences",
                  "member_incomes","contribution_rules","carryovers","account_balances","category_budgets"];
  for (const n of finals) await dropIf(n);
  for (const n of names.filter(n => n.startsWith("__new__"))) await dropIf(n);

  // 2) restore members or member
  if (has(OLD("members"))) await safeRename(OLD("members"), "members");
  else if (has(BK("members"))) await safeRename(BK("members"), "members");
  else if (has(OLD("member"))) await safeRename(OLD("member"), "member");
  else if (has(BK("member"))) await safeRename(BK("member"), "member");

  // 3) restore other bases
  for (const n of ["accounts","categories","transactions"]) {
    if (has(OLD(n))) await safeRename(OLD(n), n);
    else if (has(BK(n))) await safeRename(BK(n), n);
  }
  if (has(OLD("transactionTemplates"))) await safeRename(OLD("transactionTemplates"), "transactionTemplates");
  else if (has(BK("transactionTemplates"))) await safeRename(BK("transactionTemplates"), "transactionTemplates");

  console.log("Revert complete.");
  await client.close();
}

main().catch(e => { console.error(e); process.exit(1); });
