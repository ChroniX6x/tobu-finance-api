import { Db, MongoClient, ObjectId } from "mongodb";
import {
  startMigrationRun,
  backupCollection,
  recordValidator,
  finalizeRun,
  restoreRun,
  getLatestRun,
} from "./backupRegistry";

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
  if (!y || !m) return null;
  return new Date(Date.UTC(y, m - 1, 1));
}

// Robuste Cent-Konvertierung mit Fallback 0 + Logging
function centsOrZero(value: any, label: string): number {
  if (value === null || value === undefined || value === "") {
    console.warn(`[${MIG_NAME}] WARN amount missing at ${label} → defaulting to 0`);
    return 0;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      console.warn(`[${MIG_NAME}] WARN amount not finite at ${label}: ${value} → defaulting to 0`);
      return 0;
    }
    return Math.round(value * 100);
  }
  if (typeof value === "string") {
    const cleaned = value.replace(",", ".").replace(/[^\d.\-+eE]/g, "");
    const num = Number(cleaned);
    if (!Number.isFinite(num)) {
      console.warn(`[${MIG_NAME}] WARN amount not parsable at ${label}: "${value}" → defaulting to 0`);
      return 0;
    }
    return Math.round(num * 100);
  }
  console.warn(`[${MIG_NAME}] WARN amount invalid type at ${label}: ${JSON.stringify(value)} → defaulting to 0`);
  return 0;
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
  const { db, client } = context;
  const ts = nowTs();
  const run = await startMigrationRun({ client, mainDb: db, mig: MIG_NAME, ts });

  try {
    // Dynamisch vorhandene relevante Collections sichern
    const candidateCollections = [
      "members",
      "member",
      "accounts",
      "categories",
      "transactions",
      "recurrences",
      "member_incomes",
      "contribution_rules",
      "carryovers",
      "account_balances",
      "category_budgets",
      "transactionTemplates",
    ];
    for (const coll of candidateCollections) {
      if (await hasCollection(db, coll)) {
        await recordValidator(run, client, coll, db);
        await backupCollection(run, client, db, coll);
      }
    }

    const v1Members =
      (await hasCollection(db, "members")) ? "members" :
      (await hasCollection(db, "member")) ? "member" : null;
    if (!v1Members) throw new Error('No v1 member collection found ("members" or "member").');

    for (const n of ["accounts", "categories", "transactions"]) {
      if (!(await hasCollection(db, n))) throw new Error(`v1 collection "${n}" missing.`);
    }
    const hasTemplates = await hasCollection(db, "transactionTemplates");

    // *** Namensfunktionen mit gewünschtem Tausch ***
    // v1old_<ts> = Start-Snapshot
    const OLD = (n: string) => `${n}_v1old_${ts}`;
    // v1bk_<ts>  = Original direkt vor dem Swap
    const BK  = (n: string) => `${n}_v1bk_${ts}`;
    // Temp
    const NEW = (n: string) => `__new__${n}_${ts}`;

    const memberIdMap = new Map<string, ObjectId>();
    const accountIdMap = new Map<string, ObjectId>();
    const categoryIdMap = new Map<string, ObjectId>();
    const recurrenceIdMap = new Map<string, ObjectId>();

    let swappedSome: string[] = [];

    const rollback = async (err: any) => {
      console.warn(`[${MIG_NAME}] Rolling back due to error:`, err?.message || err);
      try {
        // Temps löschen
        for (const n of FINAL_NAMES) await dropIf(db, NEW(n));
        const allNow = await db.listCollections().toArray();
        for (const { name } of allNow) {
          if (name.startsWith("__new__") || name.startsWith("__tmp_revert_")) await dropIf(db, name);
        }
        // Falls beim Swap schon etwas umbenannt wurde: zurückholen
        for (const n of swappedSome.reverse()) {
          const finalExists = await hasCollection(db, n);
          const bkExists = await hasCollection(db, BK(n));
          if (finalExists && bkExists) {
            const tmp = `__tmp_revert_${n}_${ts}`;
            await safeRename(db, n, tmp);
            await safeRename(db, BK(n), n);
            await dropIf(db, tmp);
          } else if (!finalExists && bkExists) {
            await safeRename(db, BK(n), n);
          }
        }
        // Backups im Fehlerfall löschen? (Default: ja)
        if (!KEEP_BACKUPS_ON_ERROR) {
          await dropIf(db, OLD(v1Members));
          await dropIf(db, OLD("accounts"));
          await dropIf(db, OLD("categories"));
          await dropIf(db, OLD("transactions"));
          if (hasTemplates) await dropIf(db, OLD("transactionTemplates"));
          // BKs sind Originale vorm Swap – behalten wir i. d. R.
        }
      } catch (e) {
        console.error(`[${MIG_NAME}] Rollback encountered an error:`, e);
      }
      throw err;
    };

    try {
      // 1) Start-Snapshots als v1old_* (so gewünscht)
      await copyBackup(db, v1Members, OLD(v1Members));
      await copyBackup(db, "accounts", OLD("accounts"));
      await copyBackup(db, "categories", OLD("categories"));
      await copyBackup(db, "transactions", OLD("transactions"));
      if (hasTemplates) await copyBackup(db, "transactionTemplates", OLD("transactionTemplates"));

      // 2) Temp-Collections anlegen
      for (const n of FINAL_NAMES) {
        await dropIf(db, NEW(n));
        await db.createCollection(NEW(n));
      }

      // 3) Members
      const v1Mems = await db.collection(OLD(v1Members)).find({}).toArray();
      if (!v1Mems.length) throw new Error("No members found in v1 backup.");
      await db.collection(NEW("members")).insertMany(
        v1Mems.map((m: any) => {
          const _id = new ObjectId();
          // Map-Key intern behalten (über _id oder id), aber NICHT speichern
          const mapKey = legacyKeyOf(m);
          ensureMap(memberIdMap, mapKey, _id);
          return {
            _id,
            name: m.name ?? null,
            email: m.email ?? null,
            userId: m.user ? new ObjectId() : null,
          };
        }),
        { ordered: true }
      );

      // 4) Accounts
      const v1Accs = await db.collection(OLD("accounts")).find({}).toArray();
      await db.collection(NEW("accounts")).insertMany(
        v1Accs.map((a: any) => {
          const _id = new ObjectId();
          const mapKey = legacyKeyOf(a);
          ensureMap(accountIdMap, mapKey, _id);
          const members = (a.members ?? []).map((raw: any) => {
            const mk = resolveMemberKey(raw);
            const mo = mk ? memberIdMap.get(mk) ?? null : null;
            if (!mo) console.warn(`Account member unresolved: accountKey=${mapKey} member=${String(raw)}`);
            return { memberId: mo, role: "owner" };
          });
          return {
            _id,
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
      const v1Cats = await db.collection(OLD("categories")).find({}).toArray();
      await db.collection(NEW("categories")).insertMany(
        v1Cats.map((c: any) => {
          const _id = new ObjectId();
          const mapKey = legacyKeyOf(c);
          ensureMap(categoryIdMap, mapKey, _id);
          const accKey = keyOf(c.accountId);
          const accId = accKey ? accountIdMap.get(accKey) ?? null : null;
          const customSplit = (c.customSplit ?? []).map((s: any) => {
            const mk = resolveMemberKey(s.memberId);
            const mo = mk ? memberIdMap.get(mk) ?? null : null;
            if (!mo) console.warn(`Category customSplit unresolved member: ${mk}`);
            return { memberId: mo, split: s.split };
          });
          return { _id, accountId: accId, name: c.name ?? null, customSplit };
        }),
        { ordered: true }
      );

      // 6) Recurrences (aus Templates)
      const v1Tpl = hasTemplates ? await db.collection(OLD("transactionTemplates")).find({}).toArray() : [];
      if (v1Tpl.length) {
        await db.collection(NEW("recurrences")).insertMany(
          v1Tpl.map((r: any) => {
            const _id = new ObjectId();
            const mapKey = legacyKeyOf(r);
            ensureMap(recurrenceIdMap, mapKey, _id);
            const accKey = keyOf(r.accountId);
            const catKey = keyOf(r.categoryId);
            return {
              _id,
              accountId: accKey ? accountIdMap.get(accKey) ?? null : null,
              categoryId: catKey ? categoryIdMap.get(catKey) ?? null : null,
              title: r.title ?? null,
              type: r.type,
              amountCents: centsOrZero(r.amount, `recurrences.amount (src=${mapKey})`),
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
          balDocs.push({
            _id: new ObjectId(),
            accountId: accId,
            month: monthToISODate(b.month),
            closingBalanceCents: centsOrZero(b.value, `account_balances.closingBalance (accountKey=${accKey}, month=${b.month})`),
          });
        }

        for (const r of a.monthlyIncomes ?? []) {
          const mk = resolveMemberKey(r.memberId);
          const mo = mk ? memberIdMap.get(mk) ?? null : null;
          if (!mo) console.warn(`member_incomes unresolved member: ${mk}`);
          incDocs.push({
            _id: new ObjectId(),
            accountId: accId,
            memberId: mo,
            amountCents: centsOrZero(r.amount, `member_incomes.amount (accountKey=${accKey}, member=${mk})`),
            fromMonth: monthToISODate(r.startMonth),
            toMonth: r.endMonth ? monthToISODate(r.endMonth) : null,
            source: "salary",
            note: null,
          });
        }

        for (const r of a.monthlyPlannedContributions ?? []) {
          const mKey = resolveMemberKey(r.memberId);
          const catKey = keyOf(r.categoryId);
          if (mKey) {
            const mOid = memberIdMap.get(mKey) ?? null;
            if (!mOid) console.warn(`contribution_rules base unresolved member: ${mKey}`);
            contribDocs.push({
              _id: new ObjectId(),
              accountId: accId,
              type: "base",
              recurring: true,
              description: "Planned contribution",
              amountCents: centsOrZero(r.amount, `contribution_rules.base.amount (accountKey=${accKey}, member=${mKey})`),
              distribution: { mode: "perMember", memberId: mOid, customSplit: null },
              fromMonth: monthToISODate(r.startMonth),
              toMonth: r.endMonth ? monthToISODate(r.endMonth) : null,
            });
          } else if (catKey) {
            const catOid = categoryIdMap.get(catKey) ?? null;
            budgetDocs.push({
              _id: new ObjectId(),
              accountId: accId,
              categoryId: catOid,
              amountCents: centsOrZero(r.amount, `category_budgets.amount (accountKey=${accKey}, category=${catKey})`),
              fromMonth: monthToISODate(r.startMonth),
              toMonth: r.endMonth ? monthToISODate(r.endMonth) : null,
            });
          }
        }

        for (const r of a.additionalContributions ?? []) {
          const mKey = resolveMemberKey(r.memberId);
          const mOid = mKey ? memberIdMap.get(mKey) ?? null : null;
          if (!mOid) console.warn(`contribution_rules additional unresolved member: ${mKey}`);
          contribDocs.push({
            _id: new ObjectId(),
            accountId: accId,
            type: "additional",
            recurring: !!r.recurring,
            description: r.description ?? "Additional contribution",
            amountCents: centsOrZero(r.amount, `contribution_rules.additional.amount (accountKey=${accKey}, member=${mKey})`),
            distribution: { mode: "perMember", memberId: mOid, customSplit: null },
            fromMonth: monthToISODate(r.startMonth),
            toMonth: r.endMonth ? monthToISODate(r.endMonth) : null,
          });
        }

        for (const c of a.carryOverBalances ?? []) {
          const mKey = resolveMemberKey(c.memberId);
          const mOid = mKey ? memberIdMap.get(mKey) ?? null : null;
          if (!mOid) console.warn(`carryovers unresolved member: ${mKey}`);
          carryDocs.push({
            _id: new ObjectId(),
            accountId: accId,
            memberId: mOid,
            month: monthToISODate(c.month),
            amountCents: centsOrZero(c.amount, `carryovers.amount (accountKey=${accKey}, member=${mKey}, month=${c.month})`),
            reason: "Carryover",
            createdAt: new Date(),
          });
        }

        for (const t of a.topUps ?? []) {
          const hasCustom = Array.isArray(t.customSplit) && t.customSplit.length > 0;
          contribDocs.push({
            _id: new ObjectId(),
            accountId: accId,
            type: "topup",
            recurring: false,
            description: t.reason ?? "Top-up",
            amountCents: centsOrZero(t.amount, `contribution_rules.topup.amount (accountKey=${accKey}, month=${t.month})`),
            distribution: hasCustom
              ? {
                  mode: "customSplit",
                  memberId: null,
                  customSplit: t.customSplit.map((s: any) => {
                    const mk = resolveMemberKey(s.memberId);
                    const mo = mk ? memberIdMap.get(mk) ?? null : null;
                    if (!mo) console.warn(`topup customSplit unresolved member: ${mk}`);
                    return { memberId: mo, split: s.split };
                  }),
                }
              : { mode: "proRataIncome", memberId: null, customSplit: null },
            fromMonth: monthToISODate(t.month),
            toMonth: monthToISODate(t.month),
            meta: { legacyTopUpDate: t.date ?? null },
          });
        }
      }

      if (balDocs.length) await db.collection(NEW("account_balances")).insertMany(balDocs, { ordered: true });
      if (incDocs.length) await db.collection(NEW("member_incomes")).insertMany(incDocs, { ordered: true });
      if (contribDocs.length) await db.collection(NEW("contribution_rules")).insertMany(contribDocs, { ordered: true });
      if (carryDocs.length) await db.collection(NEW("carryovers")).insertMany(carryDocs, { ordered: true });
      if (budgetDocs.length) await db.collection(NEW("category_budgets")).insertMany(budgetDocs, { ordered: true });

      // 8) Transactions
      const v1Tx = await db.collection(OLD("transactions")).find({}).toArray();
      if (v1Tx.length) {
        await db.collection(NEW("transactions")).insertMany(
          v1Tx.map((t: any) => {
            const accKey = keyOf(t.accountId);
            const catKey = keyOf(t.categoryId);
            const paidKey = resolveMemberKey(t.paidByMemberId);
            const recKey = keyOf(t.recurringTemplateId);
            return {
              _id: new ObjectId(),
              accountId: accKey ? accountIdMap.get(accKey) ?? null : null,
              categoryId: catKey ? categoryIdMap.get(catKey) ?? null : null,
              title: t.title ?? null,
              type: t.type,
              amountCents: centsOrZero(t.amount, `transactions.amount (txKey=${legacyKeyOf(t)})`),
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

      // 10) Swap: Originale -> *_v1bk_<ts>, Temps -> Final
      for (const n of FINAL_NAMES) {
        if (await hasCollection(db, n)) {
          await safeRename(db, n, BK(n));   // Original vor Swap sichern (behalten)
          swappedSome.push(n);
        }
        await safeRename(db, NEW(n), n);    // Temp -> Final
      }

      // 11) Success-Cleanup: Start-Snapshots (v1old) löschen, v1bk behalten
      try {
        const dropIfHas = async (name: string) => {
          if ((await db.listCollections({ name }).toArray()).length) {
            await db.collection(name).drop();
          }
        };
        await dropIfHas(OLD(v1Members));
        await dropIfHas(OLD("accounts"));
        await dropIfHas(OLD("categories"));
        await dropIfHas(OLD("transactions"));
        if (hasTemplates) await dropIfHas(OLD("transactionTemplates"));

        // Temp-Reste entfernen
        const rest = await db.listCollections().toArray();
        for (const { name } of rest) {
          if (name.startsWith("__new__") || name.startsWith("__tmp_revert_")) {
            await db.collection(name).drop();
          }
        }
        console.log(`[${MIG_NAME}] Cleanup: kept *_v1bk_${ts}, dropped *_v1old_${ts}.`);
      } catch (e) {
        console.warn(`[${MIG_NAME}] Post-success cleanup warning:`, (e as Error).message);
      }

      await finalizeRun(run, client, db, "ok");
      console.log(`[${MIG_NAME}] Up completed with centralized backups.`);
    } catch (err) {
      console.error(`[${MIG_NAME}] Up failed:`, err);
      await finalizeRun(run, client, db, "error", err);
      // Optional vollständiges Restore des Runs
      try {
        await restoreRun(run, client, db);
        console.log(`[${MIG_NAME}] State restored after failure.`);
      } catch (rErr) {
        console.error(`[${MIG_NAME}] Restore after failure failed:`, rErr);
      }
      throw err;
    }
  } catch (err) {
    await rollback(err);
  }
};

// ===== Migration: DOWN =====
export const down = async ({ context }: { context: MigrationCtx }) => {
  const { db, client } = context;
  const run = await getLatestRun(client, db, MIG_NAME);
  if (!run) {
    console.warn(`[${MIG_NAME}] No backup run found for rollback.`);
    return;
  }
  try {
    await restoreRun(run, client, db);
    await finalizeRun(run, client, db, "rolled_back");
    console.log(`[${MIG_NAME}] Down restored from centralized backups.`);
  } catch (err) {
    console.error(`[${MIG_NAME}] Down restore failed:`, err);
    throw err;
  }
};

export default { up, down };
