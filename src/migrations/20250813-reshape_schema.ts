import { Db, MongoClient, ObjectId } from "mongodb";
import {
  startMigrationRun,
  backupCollection,
  recordValidator,
  finalizeRun,
  restoreRun,
  getLatestRun,
  getBackupDb, // <-- hinzugefügt
} from "./lib/backupRegistry.js";

export type MigrationCtx = { db: Db; client: MongoClient };

// ===== Konfiguration / Flags =====
const MIG_NAME = "20250814_reshape_schema";

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

// Entfernt: KEEP_BACKUPS_ON_ERROR (nicht mehr nötig) + copyBackup + OLD/BK Mechanik

// NEU: Backups eines Runs (nur dieses Migrationsruns) vollständig löschen
async function purgeRunBackups(run: any, client: MongoClient, mainDb: Db) {
  const backupDb = getBackupDb(client, mainDb);
  for (const c of run.collections) {
    try {
      if ((await backupDb.listCollections({ name: c.backupColl }).toArray()).length) {
        await backupDb.collection(c.backupColl).drop();
      }
    } catch { /* ignore */ }
  }
  await backupDb.collection("_migration_runs").deleteOne({ _id: run._id });
}

// ===== Migration: UP (vereinfacht ohne lokale *_v1old / *_v1bk) =====
export const up = async ({ context }: { context: MigrationCtx }) => {
  const { db, client } = context;
  const ts = nowTs();
  const run = await startMigrationRun({ client, mainDb: db, mig: MIG_NAME, ts });

  try {
    const required = ["accounts", "categories", "transactions"];
    const memberColl = (await hasCollection(db, "members")) ? "members" : (await hasCollection(db, "member")) ? "member" : null;
    if (!memberColl) throw new Error('Missing member collection ("members" or "member").');
    for (const n of required) if (!(await hasCollection(db, n))) throw new Error(`Missing required collection ${n}`);

    const hasTemplates = await hasCollection(db, "transactionTemplates");

    // Zentrale Backups (nur Backup-DB)
    for (const coll of [
      memberColl,
      "accounts",
      "categories",
      "transactions",
      ...(hasTemplates ? ["transactionTemplates"] : []),
    ]) {
      await recordValidator(run, client, coll, db);
      await backupCollection(run, client, db, coll);
    }

    const NEW = (n: string) => `__new__${n}_${ts}`;
    // Temp-Collections anlegen
    for (const n of FINAL_NAMES) {
      await dropIf(db, NEW(n));
      await db.createCollection(NEW(n));
    }

    // Mapping-Container
    const memberIdMap = new Map<string, ObjectId>();
    const accountIdMap = new Map<string, ObjectId>();
    const categoryIdMap = new Map<string, ObjectId>();
    const recurrenceIdMap = new Map<string, ObjectId>();

    // Members direkt aus Original
    const srcMembers = await db.collection(memberColl).find({}).toArray();
    await db.collection(NEW("members")).insertMany(
      srcMembers.map((m: any) => {
        const _id = new ObjectId();
        ensureMap(memberIdMap, legacyKeyOf(m), _id);
        return {
          _id,
          name: m.name ?? null,
          email: m.email ?? null,
          userId: m.user ? new ObjectId() : null,
        };
      })
    );

    // Accounts
    const srcAccounts = await db.collection("accounts").find({}).toArray();
    await db.collection(NEW("accounts")).insertMany(
      srcAccounts.map((a: any) => {
        const _id = new ObjectId();
        ensureMap(accountIdMap, legacyKeyOf(a), _id);
        const members = (a.members ?? []).map((raw: any) => {
          const mk = resolveMemberKey(raw);
          const mo = mk ? memberIdMap.get(mk) ?? null : null;
          if (!mo) console.warn(`Account member unresolved: accountKey=${legacyKeyOf(a)} member=${raw}`);
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
      })
    );

    // Categories
    const srcCategories = await db.collection("categories").find({}).toArray();
    await db.collection(NEW("categories")).insertMany(
      srcCategories.map((c: any) => {
        const _id = new ObjectId();
        ensureMap(categoryIdMap, legacyKeyOf(c), _id);
        const accId = accountIdMap.get(keyOf(c.accountId) || "") ?? null;
        const customSplit = (c.customSplit ?? []).map((s: any) => {
          const mk = resolveMemberKey(s.memberId);
          const mo = mk ? memberIdMap.get(mk) ?? null : null;
          if (!mo) console.warn(`Category customSplit unresolved member: ${mk}`);
          return { memberId: mo, split: s.split };
        });
        return { _id, accountId: accId, name: c.name ?? null, customSplit };
      })
    );

    // Recurrences aus Templates
    if (hasTemplates) {
      const tpl = await db.collection("transactionTemplates").find({}).toArray();
      if (tpl.length) {
        await db.collection(NEW("recurrences")).insertMany(
          tpl.map((r: any) => {
            const _id = new ObjectId();
            ensureMap(recurrenceIdMap, legacyKeyOf(r), _id);
            return {
              _id,
              accountId: accountIdMap.get(keyOf(r.accountId) || "") ?? null,
              categoryId: categoryIdMap.get(keyOf(r.categoryId) || "") ?? null,
              title: r.title ?? null,
              type: r.type,
              amountCents: centsOrZero(r.amount, `recurrences.amount (${legacyKeyOf(r)})`),
              isFromSharedAccount: r.isFromSharedAccount ?? null,
              schedule: { freq: "monthly", dayOfMonth: 1 },
              activeFrom: new Date(),
              activeUntil: null,
              createdByMemberId: r.createdBy
                ? memberIdMap.get(resolveMemberKey(r.createdBy) || "") ?? null
                : null,
              nextPlanned: null,
              lastEmitted: null,
            };
          })
        );
      }
    }

    // Abgeleitete Collections aus Accounts
    const balDocs: any[] = [];
    const incDocs: any[] = [];
    const contribDocs: any[] = [];
    const carryDocs: any[] = [];
    const budgetDocs: any[] = [];

    for (const a of srcAccounts) {
      const accId = accountIdMap.get(legacyKeyOf(a))!;
      for (const b of a.balances ?? [])
        balDocs.push({
          _id: new ObjectId(),
          accountId: accId,
          month: monthToISODate(b.month),
          closingBalanceCents: centsOrZero(b.value, `account_balances.${b.month}`),
        });
      for (const r of a.monthlyIncomes ?? []) {
        const mo = memberIdMap.get(resolveMemberKey(r.memberId) || "") ?? null;
        incDocs.push({
          _id: new ObjectId(),
          accountId: accId,
          memberId: mo,
          amountCents: centsOrZero(r.amount, "member_incomes.amount"),
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
          contribDocs.push({
            _id: new ObjectId(),
            accountId: accId,
            type: "base",
            recurring: true,
            description: "Planned contribution",
            amountCents: centsOrZero(r.amount, "contribution_rules.base"),
            distribution: { mode: "perMember", memberId: mOid, customSplit: null },
            fromMonth: monthToISODate(r.startMonth),
            toMonth: r.endMonth ? monthToISODate(r.endMonth) : null,
          });
        } else if (catKey) {
          budgetDocs.push({
            _id: new ObjectId(),
            accountId: accId,
            categoryId: categoryIdMap.get(catKey) ?? null,
            amountCents: centsOrZero(r.amount, "category_budgets.amount"),
            fromMonth: monthToISODate(r.startMonth),
            toMonth: r.endMonth ? monthToISODate(r.endMonth) : null,
          });
        }
      }
      for (const r of a.additionalContributions ?? []) {
        const mOid = memberIdMap.get(resolveMemberKey(r.memberId) || "") ?? null;
        contribDocs.push({
          _id: new ObjectId(),
          accountId: accId,
          type: "additional",
          recurring: !!r.recurring,
            description: r.description ?? "Additional contribution",
          amountCents: centsOrZero(r.amount, "contribution_rules.additional"),
          distribution: { mode: "perMember", memberId: mOid, customSplit: null },
          fromMonth: monthToISODate(r.startMonth),
          toMonth: r.endMonth ? monthToISODate(r.endMonth) : null,
        });
      }
      for (const c of a.carryOverBalances ?? []) {
        carryDocs.push({
          _id: new ObjectId(),
          accountId: accId,
          memberId: memberIdMap.get(resolveMemberKey(c.memberId) || "") ?? null,
          month: monthToISODate(c.month),
          amountCents: centsOrZero(c.amount, "carryovers.amount"),
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
          amountCents: centsOrZero(t.amount, "contribution_rules.topup"),
          distribution: hasCustom
            ? {
                mode: "customSplit",
                memberId: null,
                customSplit: t.customSplit.map((s: any) => ({
                  memberId: memberIdMap.get(resolveMemberKey(s.memberId) || "") ?? null,
                  split: s.split,
                })),
              }
            : { mode: "proRataIncome", memberId: null, customSplit: null },
          fromMonth: monthToISODate(t.month),
          toMonth: monthToISODate(t.month),
          meta: { legacyTopUpDate: t.date ?? null },
        });
      }
    }

    if (balDocs.length) await db.collection(NEW("account_balances")).insertMany(balDocs);
    if (incDocs.length) await db.collection(NEW("member_incomes")).insertMany(incDocs);
    if (contribDocs.length) await db.collection(NEW("contribution_rules")).insertMany(contribDocs);
    if (carryDocs.length) await db.collection(NEW("carryovers")).insertMany(carryDocs);
    if (budgetDocs.length) await db.collection(NEW("category_budgets")).insertMany(budgetDocs);

    // Transactions
    const srcTx = await db.collection("transactions").find({}).toArray();
    if (srcTx.length) {
      await db.collection(NEW("transactions")).insertMany(
        srcTx.map((t: any) => ({
          _id: new ObjectId(),
          accountId: accountIdMap.get(keyOf(t.accountId) || "") ?? null,
          categoryId: categoryIdMap.get(keyOf(t.categoryId) || "") ?? null,
          title: t.title ?? null,
          type: t.type,
          amountCents: centsOrZero(t.amount, "transactions.amount"),
          month: monthToISODate(t.month),
          bookDate: t.date ? new Date(`${t.date}T00:00:00Z`) : monthToISODate(t.month),
          status: t.status ?? "booked",
          isFromSharedAccount: t.isFromSharedAccount ?? null,
          paidByMemberId: memberIdMap.get(resolveMemberKey(t.paidByMemberId) || "") ?? null,
          recurrenceId: recurrenceIdMap.get(keyOf(t.recurringTemplateId) || "") ?? null,
        }))
      );
    }

    // Indexe
    await createIndexes(db, NEW);

    // Swap (Originale droppen, NEW -> Final)
    for (const n of FINAL_NAMES) {
      if (await hasCollection(db, n)) await dropIf(db, n);
      if (await hasCollection(db, NEW(n))) await safeRename(db, NEW(n), n);
    }

    // transactionTemplates droppen – wurde in recurrences überführt, ist nicht in FINAL_NAMES
    if (hasTemplates) await dropIf(db, "transactionTemplates");

    // Restliche __new__ entfernen (Safety)
    const rest = await db.listCollections().toArray();
    for (const { name } of rest) {
      if (name.startsWith("__new__")) {
        try { await db.collection(name).drop(); } catch {}
      }
    }

    await finalizeRun(run, client, db, "ok");
    console.log(`[${MIG_NAME}] Up finished. Central backups retained for rollback.`);
  } catch (err) {
    console.error(`[${MIG_NAME}] Up failed:`, err);
    // Temps entfernen
    const all = await db.listCollections().toArray();
    for (const { name } of all) {
      if (name.startsWith("__new__")) {
        try { await db.collection(name).drop(); } catch {}
      }
    }
    // Restore + finalize + Backups nach Fehler löschen
    try {
      await restoreRun(run, client, db);
      await finalizeRun(run, client, db, "error", err);
      await purgeRunBackups(run, client, db);
      console.log(`[${MIG_NAME}] Restored original state and removed backups after failure.`);
    } catch (r) {
      console.error(`[${MIG_NAME}] Restore/purge after failure failed:`, r);
    }
    throw err;
  }
};

// ===== Migration: DOWN (restore + Backups dieser Migration löschen) =====
export const down = async ({ context }: { context: MigrationCtx }) => {
  const { db, client } = context;
  const run = await getLatestRun(client, db, MIG_NAME);
  if (!run) {
    console.warn(`[${MIG_NAME}] No run found to rollback.`);
    return;
  }
  try {
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
      if (name.startsWith("__new__")) {
        try { await db.collection(name).drop(); } catch {}
      }
    }
  }
};

export default { up, down };
