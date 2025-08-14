import { Db, MongoClient, ObjectId } from "mongodb";

export type MigrationCtx = { db: Db; client: MongoClient };

// ===== Konfiguration / Flags =====
const MIG_NAME = "20250814_reshape_schema";
const KEEP_BACKUPS_ON_ERROR =
  process.env.KEEP_MIGRATION_BACKUPS_ON_ERROR === "true"; // default: Backups bei Fehler löschen

// Platzhalter-IDs aus v1 auf echte Legacy-IDs mappen:
const LEGACY_ID_MAP: Record<string, string> = { b1: "m1", b2: "m2" };

// Alle finalen Ziel-Collections (für Swap/Rollback)
const FINAL_NAMES = [
  "members",
  "accounts",
  "categories",
  "transactions",
  "recurrences",
  "member_incomes",
  "contribution_rules",
  "carryovers",
  "account_balances",
  "category_budgets",
];

// ===== Utilities =====
const nowTs = () => new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);

function monthToISODate(s?: string | null): Date | null {
  if (!s) return null;
  const [y, m] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1));
}
function centsFromEuro(n: number | string): number {
  const num = Number(n);
  if (Number.isNaN(num)) throw new Error(`Invalid amount: ${n}`);
  return Math.round(num * 100);
}
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
function keyOf(val: any): string | null {
  if (val == null) return null;
  if (typeof val === "string") return val;
  if (val instanceof ObjectId) return val.toHexString();
  if (val && typeof val === "object" && "$oid" in val) return String((val as any).$oid);
  return String(val);
}
function legacyKeyOf(doc: any): string {
  const k = doc?.id ?? keyOf(doc?._id);
  if (!k) throw new Error(`Document without id/_id: ${JSON.stringify(doc)}`);
  return k;
}
function resolveMemberKey(raw: any): string | null {
  const k = keyOf(raw);
  if (!k) return null;
  return LEGACY_ID_MAP[k] ?? k;
}
function ensureMap<K, V>(map: Map<K, V>, k: K, v: V) {
  if (!map.has(k)) map.set(k, v);
}
async function createIndexes(db: Db, N: (name: string) => string) {
  await db.collection(N("transactions")).createIndex({ accountId: 1, month: 1, status: 1 });
  await db.collection(N("transactions")).createIndex({ accountId: 1, bookDate: 1 });
  await db.collection(N("transactions")).createIndex({ categoryId: 1, month: 1 });
  await db.collection(N("transactions")).createIndex({ paidByMemberId: 1, month: 1 });

  await db.collection(N("member_incomes")).createIndex({ accountId: 1, memberId: 1, fromMonth: 1, toMonth: 1 });
  await db.collection(N("contribution_rules")).createIndex({ accountId: 1, fromMonth: 1, toMonth: 1, type: 1 });
  await db.collection(N("carryovers")).createIndex({ accountId: 1, memberId: 1, month: 1 }, { unique: true });
  await db.collection(N("account_balances")).createIndex({ accountId: 1, month: 1 }, { unique: true });
  await db.collection(N("recurrences")).createIndex({ accountId: 1, nextPlanned: 1 });
  await db.collection(N("categories")).createIndex({ accountId: 1, name: 1 });
}
async function copyBackup(db: Db, from: string, to: string) {
  if (!(await hasCollection(db, from))) return;
  await db.collection(from).aggregate([{ $match: {} }, { $out: to }]).toArray();
}

// ===== Migration: UP =====
export const up = async ({ context }: { context: MigrationCtx }) => {
  const { db } = context;
  const ts = nowTs();

  const v1Members =
    (await hasCollection(db, "members")) ? "members" :
    (await hasCollection(db, "member")) ? "member" : null;
  if (!v1Members) throw new Error('No v1 member collection found ("members" or "member").');

  for (const n of ["accounts", "categories", "transactions"]) {
    if (!(await hasCollection(db, n))) throw new Error(`v1 collection "${n}" missing.`);
  }
  const hasTemplates = await hasCollection(db, "transactionTemplates");

  // Namensfunktionen
  const BK = (n: string) => `${n}_v1bk_${ts}`;     // Backup-Kopien
  const NEW = (n: string) => `__new__${n}_${ts}`;   // Temp-Targets
  const OLD = (n: string) => `${n}_v1old_${ts}`;    // Originale nach Swap

  // Mappings
  const memberIdMap = new Map<string, ObjectId>();
  const accountIdMap = new Map<string, ObjectId>();
  const categoryIdMap = new Map<string, ObjectId>();
  const recurrenceIdMap = new Map<string, ObjectId>();

  // Was wurde schon geswapped? (für Rollback)
  let swappedSome: string[] = [];

  // Rollback nur bei Fehler (inkl. Backup-Löschung on-error)
  const rollback = async (err: any) => {
    console.warn(`[${MIG_NAME}] Rolling back due to error:`, err?.message || err);
    try {
      // Temps löschen
      for (const n of FINAL_NAMES) await dropIf(db, NEW(n));
      const allNow = await db.listCollections().toArray();
      for (const { name } of allNow) {
        if (name.startsWith("__new__") || name.startsWith("__tmp_revert_")) {
          await dropIf(db, name);
        }
      }
      // Geswappte wiederherstellen
      for (const n of swappedSome.reverse()) {
        const finalExists = await hasCollection(db, n);
        const oldExists = await hasCollection(db, OLD(n));
        if (finalExists && oldExists) {
          const tmp = `__tmp_revert_${n}_${ts}`;
          await safeRename(db, n, tmp);
          await safeRename(db, OLD(n), n);
          await dropIf(db, tmp);
        } else if (!finalExists && oldExists) {
          await safeRename(db, OLD(n), n);
        }
      }
      // Backups nur im Fehlerfall löschen (so gewünscht)
      if (!KEEP_BACKUPS_ON_ERROR) {
        await dropIf(db, BK(v1Members));
        await dropIf(db, BK("accounts"));
        await dropIf(db, BK("categories"));
        await dropIf(db, BK("transactions"));
        if (hasTemplates) await dropIf(db, BK("transactionTemplates"));
        for (const n of FINAL_NAMES) await dropIf(db, OLD(n));
      }
    } catch (e) {
      console.error(`[${MIG_NAME}] Rollback encountered an error:`, e);
    }
    throw err;
  };

  try {
    // 1) Backups als KOPIE (App bleibt auf v1 live)
    await copyBackup(db, v1Members, BK(v1Members));
    await copyBackup(db, "accounts", BK("accounts"));
    await copyBackup(db, "categories", BK("categories"));
    await copyBackup(db, "transactions", BK("transactions"));
    if (hasTemplates) await copyBackup(db, "transactionTemplates", BK("transactionTemplates"));

    // 2) Temp-Collections anlegen
    for (const n of FINAL_NAMES) {
      await dropIf(db, NEW(n));
      await db.createCollection(NEW(n));
    }

    // 3) Members
    const v1Mems = await db.collection(BK(v1Members)).find({}).toArray();
    if (!v1Mems.length) throw new Error("No members found in v1 backup.");
    await db.collection(NEW("members")).insertMany(
      v1Mems.map((m: any) => {
        const legacy = legacyKeyOf(m);
        const _id = new ObjectId();
        ensureMap(memberIdMap, legacy, _id);
        return {
          _id,
          legacyId: legacy,
          name: m.name ?? null,
          email: m.email ?? null,
          userId: m.user ? new ObjectId() : null,
        };
      }),
      { ordered: true }
    );

    // 4) Accounts (nur stabile Felder)
    const v1Accs = await db.collection(BK("accounts")).find({}).toArray();
    await db.collection(NEW("accounts")).insertMany(
      v1Accs.map((a: any) => {
        const legacy = legacyKeyOf(a);
        const _id = new ObjectId();
        ensureMap(accountIdMap, legacy, _id);
        const members = (a.members ?? []).map((raw: any) => {
          const mk = resolveMemberKey(raw);
          const mo = mk ? memberIdMap.get(mk) ?? null : null;
          if (!mo) console.warn(`Account member unresolved: account=${legacy} member=${String(raw)}`);
          return { memberId: mo, role: "owner" };
        });
        return {
          _id,
          legacyId: legacy,
          name: a.name ?? null,
          currency: "EUR",
          members,
          settings: { monthGranularity: "YYYY-MM" },
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      }),
      { ordered: true }
    );

    // 5) Categories
    const v1Cats = await db.collection(BK("categories")).find({}).toArray();
    await db.collection(NEW("categories")).insertMany(
      v1Cats.map((c: any) => {
        const legacy = legacyKeyOf(c);
        const _id = new ObjectId();
        ensureMap(categoryIdMap, legacy, _id);
        const accKey = keyOf(c.accountId);
        const accId = accKey ? accountIdMap.get(accKey) ?? null : null;
        const customSplit = (c.customSplit ?? []).map((s: any) => {
          const mk = resolveMemberKey(s.memberId);
          const mo = mk ? memberIdMap.get(mk) ?? null : null;
          if (!mo) console.warn(`Category customSplit unresolved member: ${mk}`);
          return { memberId: mo, split: s.split };
        });
        return { _id, legacyId: legacy, accountId: accId, name: c.name ?? null, customSplit };
      }),
      { ordered: true }
    );

    // 6) Recurrences (aus Templates)
    if (hasTemplates) {
      const v1Tpl = await db.collection(BK("transactionTemplates")).find({}).toArray();
      if (v1Tpl.length) {
        await db.collection(NEW("recurrences")).insertMany(
          v1Tpl.map((r: any) => {
            const legacy = legacyKeyOf(r);
            const _id = new ObjectId();
            ensureMap(recurrenceIdMap, legacy, _id);
            const accKey = keyOf(r.accountId);
            const catKey = keyOf(r.categoryId);
            return {
              _id,
              legacyId: legacy,
              accountId: accKey ? accountIdMap.get(accKey) ?? null : null,
              categoryId: catKey ? categoryIdMap.get(catKey) ?? null : null,
              title: r.title ?? null,
              type: r.type,
              amountCents: centsFromEuro(r.amount),
              schedule: { freq: "monthly", dayOfMonth: 1 },
              activeFrom: new Date(),
              activeUntil: null,
              createdByMemberId: r.createdBy ? (memberIdMap.get(resolveMemberKey(r.createdBy)!) ?? null) : null,
              nextPlanned: null,
              lastEmitted: null,
            };
          }),
          { ordered: true }
        );
      }
    }

    // 7) Neben-Collections aus accounts.*
    const balDocs: any[] = [];
    const incDocs: any[] = [];
    const contribDocs: any[] = [];
    const carryDocs: any[] = [];
    const budgetDocs: any[] = [];

    for (const a of v1Accs) {
      const accKey = legacyKeyOf(a);
      const accId = accountIdMap.get(accKey)!;

      for (const b of a.balances ?? []) {
        balDocs.push({ _id: new ObjectId(), accountId: accId, month: monthToISODate(b.month), closingBalanceCents: centsFromEuro(b.value) });
      }
      for (const r of a.monthlyIncomes ?? []) {
        const mk = resolveMemberKey(r.memberId);
        const mo = mk ? memberIdMap.get(mk) ?? null : null;
        if (!mo) console.warn(`member_incomes unresolved member: ${mk}`);
        incDocs.push({ _id: new ObjectId(), accountId: accId, memberId: mo, amountCents: centsFromEuro(r.amount), fromMonth: monthToISODate(r.startMonth), toMonth: r.endMonth ? monthToISODate(r.endMonth) : null, source: "salary", note: null });
      }
      for (const r of a.monthlyPlannedContributions ?? []) {
        const mKey = resolveMemberKey(r.memberId);
        const catKey = keyOf(r.categoryId);
        if (mKey) {
          const mOid = memberIdMap.get(mKey) ?? null;
          if (!mOid) console.warn(`contribution_rules base unresolved member: ${mKey}`);
          contribDocs.push({
            _id: new ObjectId(), accountId: accId, type: "base", recurring: true, description: "Planned contribution",
            amountCents: centsFromEuro(r.amount), distribution: { mode: "perMember", memberId: mOid, customSplit: null },
            fromMonth: monthToISODate(r.startMonth), toMonth: r.endMonth ? monthToISODate(r.endMonth) : null
          });
        } else if (catKey) {
          const catOid = categoryIdMap.get(catKey) ?? null;
          budgetDocs.push({
            _id: new ObjectId(), accountId: accId, categoryId: catOid,
            amountCents: centsFromEuro(r.amount), fromMonth: monthToISODate(r.startMonth), toMonth: r.endMonth ? monthToISODate(r.endMonth) : null
          });
        }
      }
      for (const r of a.additionalContributions ?? []) {
        const mKey = resolveMemberKey(r.memberId);
        const mOid = mKey ? memberIdMap.get(mKey) ?? null : null;
        if (!mOid) console.warn(`contribution_rules additional unresolved member: ${mKey}`);
        contribDocs.push({
          _id: new ObjectId(), accountId: accId, type: "additional", recurring: !!r.recurring,
          description: r.description ?? "Additional contribution",
          amountCents: centsFromEuro(r.amount), distribution: { mode: "perMember", memberId: mOid, customSplit: null },
          fromMonth: monthToISODate(r.startMonth), toMonth: r.endMonth ? monthToISODate(r.endMonth) : null
        });
      }
      for (const c of a.carryOverBalances ?? []) {
        const mKey = resolveMemberKey(c.memberId);
        const mOid = mKey ? memberIdMap.get(mKey) ?? null : null;
        if (!mOid) console.warn(`carryovers unresolved member: ${mKey}`);
        carryDocs.push({
          _id: new ObjectId(), accountId: accId, memberId: mOid, month: monthToISODate(c.month),
          amountCents: centsFromEuro(c.amount), reason: "Carryover", createdAt: new Date()
        });
      }
      for (const t of a.topUps ?? []) {
        const hasCustom = Array.isArray(t.customSplit) && t.customSplit.length > 0;
        contribDocs.push({
          _id: new ObjectId(), accountId: accId, type: "topup", recurring: false, description: t.reason ?? "Top-up",
          amountCents: centsFromEuro(t.amount),
          distribution: hasCustom
            ? { mode: "customSplit", memberId: null, customSplit: t.customSplit.map((s: any) => {
                const mk = resolveMemberKey(s.memberId);
                const mo = mk ? memberIdMap.get(mk) ?? null : null;
                if (!mo) console.warn(`topup customSplit unresolved member: ${mk}`);
                return { memberId: mo, split: s.split };
              }) }
            : { mode: "proRataIncome", memberId: null, customSplit: null },
          fromMonth: monthToISODate(t.month), toMonth: monthToISODate(t.month), meta: { legacyTopUpDate: t.date ?? null }
        });
      }
    }

    if (balDocs.length) await db.collection(NEW("account_balances")).insertMany(balDocs, { ordered: true });
    if (incDocs.length) await db.collection(NEW("member_incomes")).insertMany(incDocs, { ordered: true });
    if (contribDocs.length) await db.collection(NEW("contribution_rules")).insertMany(contribDocs, { ordered: true });
    if (carryDocs.length) await db.collection(NEW("carryovers")).insertMany(carryDocs, { ordered: true });
    if (budgetDocs.length) await db.collection(NEW("category_budgets")).insertMany(budgetDocs, { ordered: true });

    // 8) Transactions
    const v1Tx = await db.collection(BK("transactions")).find({}).toArray();
    if (v1Tx.length) {
      await db.collection(NEW("transactions")).insertMany(
        v1Tx.map((t: any) => {
          const accKey = keyOf(t.accountId);
          const catKey = keyOf(t.categoryId);
          const paidKey = resolveMemberKey(t.paidByMemberId);
          const recKey = keyOf(t.recurringTemplateId);
          return {
            _id: new ObjectId(),
            legacyId: legacyKeyOf(t),
            accountId: accKey ? accountIdMap.get(accKey) ?? null : null,
            categoryId: catKey ? categoryIdMap.get(catKey) ?? null : null,
            title: t.title ?? null,
            type: t.type,
            amountCents: centsFromEuro(t.amount),
            month: monthToISODate(t.month),
            bookDate: t.date ? new Date(`${t.date}T00:00:00Z`) : monthToISODate(t.month),
            status: t.status ?? "booked",
            isFromSharedAccount: t.isFromSharedAccount ?? null,
            paidByMemberId: paidKey ? memberIdMap.get(paidKey) ?? null : null,
            recurrenceId: recKey ? recurrenceIdMap.get(recKey) ?? null : null,
          };
        }),
        { ordered: true }
      );
    }

    // 9) Indexe auf Temp
    await createIndexes(db, NEW);

    // 10) Swap: Originale -> *_v1old_<ts>, Temps -> Final
    for (const n of FINAL_NAMES) {
      if (await hasCollection(db, n)) {
        await safeRename(db, n, OLD(n));
        swappedSome.push(n);
      }
      await safeRename(db, NEW(n), n);
    }

    console.log(`[${MIG_NAME}] Up migration finished successfully.`);
  } catch (err) {
    await rollback(err);
  }
};

// ===== Migration: DOWN =====
export const down = async ({ context }: { context: MigrationCtx }) => {
  const { db } = context;

  const colls = await db.listCollections().toArray();
  const suffixes = colls
    .map((c) => c.name.match(/_v1bk_(\d{14})$/))
    .filter(Boolean)
    .map((m) => (m as RegExpMatchArray)[1])
    .sort();
  if (!suffixes.length) {
    console.log("No v1 backups found — skipping down.");
    return;
  }
  const latest = suffixes.at(-1)!;
  const BK = (n: string) => `${n}_v1bk_${latest}`;
  const OLD = (n: string) => `${n}_v1old_${latest}`;

  // v2 löschen
  for (const n of FINAL_NAMES) await dropIf(db, n);

  // erst Originals aus *_v1old_* falls vorhanden, sonst Backups
  // members kann "members" oder "member" gewesen sein
  if (await hasCollection(db, OLD("members"))) await safeRename(db, OLD("members"), "members");
  else if (await hasCollection(db, BK("members"))) await safeRename(db, BK("members"), "members");
  else if (await hasCollection(db, OLD("member"))) await safeRename(db, OLD("member"), "member");
  else if (await hasCollection(db, BK("member"))) await safeRename(db, BK("member"), "member");

  for (const n of ["accounts", "categories", "transactions"]) {
    if (await hasCollection(db, OLD(n))) await safeRename(db, OLD(n), n);
    else if (await hasCollection(db, BK(n))) await safeRename(db, BK(n), n);
  }
  if (await hasCollection(db, OLD("transactionTemplates"))) await safeRename(db, OLD("transactionTemplates"), "transactionTemplates");
  else if (await hasCollection(db, BK("transactionTemplates"))) await safeRename(db, BK("transactionTemplates"), "transactionTemplates");

  console.log(`[${MIG_NAME}] Down migration finished (restored v1).`);
};

export default { up, down };
