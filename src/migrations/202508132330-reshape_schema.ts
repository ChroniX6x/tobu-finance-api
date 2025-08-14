import { Db, MongoClient, ObjectId } from "mongodb";

/** Runner-Kontext (kompatibel zu deinem migrate.ts) */
type MigrationCtx = { db: Db; client: MongoClient };

/** Mapping für alte, nicht-existente Member-IDs -> echte Legacy-Member-IDs.
 *  Beispiel: in v1 tauchen "b1"/"b2" auf, die eigentlich "m1"/"m2" sind.
 *  >>> Bei Bedarf erweitern. */
const LEGACY_ID_MAP: Record<string, string> = {
  b1: "m1",
  b2: "m2",
};

function monthToISODate(monthStr?: string | null): Date | null {
  if (!monthStr) return null;
  const [y, m] = monthStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1));
}

/** dein v1 war in Euro -> wir speichern in Cents */
function centsFromEuro(n: number | string): number {
  const num = Number(n);
  if (Number.isNaN(num)) throw new Error(`Ungültiger Betrag: ${n}`);
  return Math.round(num * 100);
}

async function hasCollection(db: Db, name: string): Promise<boolean> {
  const found = await db.listCollections({ name }).toArray();
  return found.length > 0;
}

async function dropIfExists(db: Db, name: string): Promise<void> {
  if (await hasCollection(db, name)) {
    await db.collection(name).drop();
  }
}

async function safeRename(db: Db, from: string, to: string): Promise<void> {
  if (!(await hasCollection(db, from))) return; // nichts zu tun
  if (await hasCollection(db, to)) await db.collection(to).drop();
  // renameCollection erfordert den vollqualifizierten Namen
  const dbName = db.databaseName;
  await db.admin().command({
    renameCollection: `${dbName}.${from}`,
    to: `${dbName}.${to}`,
  });
}

function ensureMap<K, V>(map: Map<K, V>, k: K, v: V) {
  if (!map.has(k)) map.set(k, v);
}

function resolveMemberIdStrict(
  memberIdMap: Map<string, ObjectId>,
  legacyMemberId?: string | null
): ObjectId | null {
  if (!legacyMemberId) return null;
  const mappedKey = LEGACY_ID_MAP[legacyMemberId] ?? legacyMemberId;
  const oid = memberIdMap.get(mappedKey);
  if (!oid) {
    throw new Error(
      `Unaufloesbare memberId "${legacyMemberId}" (mapped -> "${mappedKey}"). Bitte LEGACY_ID_MAP ergänzen.`
    );
  }
  return oid;
}

async function createIndexes(db: Db) {
  await db.collection("transactions").createIndex({ accountId: 1, month: 1, status: 1 });
  await db.collection("transactions").createIndex({ accountId: 1, bookDate: 1 });
  await db.collection("transactions").createIndex({ categoryId: 1, month: 1 });
  await db.collection("transactions").createIndex({ paidByMemberId: 1, month: 1 });

  await db.collection("member_incomes").createIndex({ accountId: 1, memberId: 1, fromMonth: 1, toMonth: 1 });
  await db.collection("contribution_rules").createIndex({ accountId: 1, fromMonth: 1, toMonth: 1, type: 1 });
  await db.collection("carryovers").createIndex({ accountId: 1, memberId: 1, month: 1 }, { unique: true });
  await db.collection("account_balances").createIndex({ accountId: 1, month: 1 }, { unique: true });
  await db.collection("recurrences").createIndex({ accountId: 1, nextPlanned: 1 });
  await db.collection("categories").createIndex({ accountId: 1, name: 1 });
}

export const up = async ({context}: any) => {
  const db = context.db;
  // ---- v1 Collection-Namen erkennen
  const v1MembersName = (await hasCollection(db, "members"))
    ? "members"
    : (await hasCollection(db, "member"))
    ? "member"
    : null;
  if (!v1MembersName) {
    throw new Error('Keine v1-Mitglieder-Collection gefunden ("members" oder "member").');
  }
  for (const n of ["accounts", "categories", "transactions"]) {
    if (!(await hasCollection(db, n))) throw new Error(`v1 Collection "${n}" fehlt.`);
  }
  const hasTemplates = await hasCollection(db, "transactionTemplates");

  // ---- Backups anlegen
  const ts = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const bk = (name: string) => `${name}_v1bk_${ts}`;

  await safeRename(db, v1MembersName, bk(v1MembersName));
  await safeRename(db, "accounts", bk("accounts"));
  await safeRename(db, "categories", bk("categories"));
  await safeRename(db, "transactions", bk("transactions"));
  if (hasTemplates) await safeRename(db, "transactionTemplates", bk("transactionTemplates"));

  // ---- neue Ziel-Collections erzeugen
  const targetCols = [
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
  for (const c of targetCols) {
    await dropIfExists(db, c);
    await db.createCollection(c);
  }

  // ---- ID-Maps
  const memberIdMap = new Map<string, ObjectId>(); // legacyId -> new ObjectId
  const accountIdMap = new Map<string, ObjectId>();
  const categoryIdMap = new Map<string, ObjectId>();
  const recurrenceIdMap = new Map<string, ObjectId>(); // legacy template id -> recurrence _id

  // ---- 1) Members
  const v1Members = await db.collection(bk(v1MembersName)).find({}).toArray();
  const mOps: any[] = [];
  for (const m of v1Members) {
    const newId = new ObjectId();
    ensureMap(memberIdMap, m.id, newId);
    mOps.push({
      insertOne: {
        document: {
          _id: newId,
          legacyId: m.id ?? null,
          name: m.name ?? null,
          email: m.email ?? null,
          userId: m.user ? new ObjectId() : null, // falls vorhanden, hier an echte User koppeln
        },
      },
    });
  }
  if (mOps.length) await db.collection("members").bulkWrite(mOps, { ordered: true });

  // ---- 2) Accounts (ohne wachsende Arrays)
  const v1Accounts = await db.collection(bk("accounts")).find({}).toArray();
  const aOps: any[] = [];
  for (const a of v1Accounts) {
    const newId = new ObjectId();
    ensureMap(accountIdMap, a.id, newId);
    aOps.push({
      insertOne: {
        document: {
          _id: newId,
          legacyId: a.id ?? null,
          name: a.name ?? null,
          currency: "EUR",
          members: (a.members ?? []).map((mid: string) => ({
            memberId:
              (LEGACY_ID_MAP[mid] && memberIdMap.get(LEGACY_ID_MAP[mid])) ||
              memberIdMap.get(mid) ||
              null,
            role: "owner",
          })),
          settings: { monthGranularity: "YYYY-MM" },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      },
    });
  }
  if (aOps.length) await db.collection("accounts").bulkWrite(aOps, { ordered: true });

  // Helper
  const resolveMember = (legacyMemberId?: string | null) =>
    resolveMemberIdStrict(memberIdMap, legacyMemberId);

  // ---- 3) Categories
  const v1Cats = await db.collection(bk("categories")).find({}).toArray();
  const cOps: any[] = [];
  for (const c of v1Cats) {
    const newId = new ObjectId();
    ensureMap(categoryIdMap, c.id, newId);
    cOps.push({
      insertOne: {
        document: {
          _id: newId,
          legacyId: c.id ?? null,
          accountId: accountIdMap.get(c.accountId),
          name: c.name ?? null,
          customSplit: (c.customSplit ?? []).map((s: any) => ({
            memberId: resolveMember(s.memberId),
            split: s.split,
          })),
        },
      },
    });
  }
  if (cOps.length) await db.collection("categories").bulkWrite(cOps, { ordered: true });

  // ---- 4) Recurrences aus transactionTemplates (vor Transactions, damit wir die Map haben)
  if (hasTemplates) {
    const v1Templates = await db.collection(bk("transactionTemplates")).find({}).toArray();
    const rOps: any[] = [];
    for (const r of v1Templates) {
      const _id = new ObjectId();
      ensureMap(recurrenceIdMap, r.id, _id);
      rOps.push({
        insertOne: {
          document: {
            _id,
            legacyId: r.id ?? null,
            accountId: accountIdMap.get(r.accountId),
            categoryId: r.categoryId ? categoryIdMap.get(r.categoryId) : null,
            title: r.title ?? null,
            type: r.type, // "expense" | "income"
            amountCents: centsFromEuro(r.amount),
            schedule: { freq: "monthly", dayOfMonth: 1 }, // ggf. verfeinern/konfigurierbar machen
            activeFrom: new Date(),
            activeUntil: null,
            createdByMemberId: r.createdBy ? resolveMember(r.createdBy) : null,
            nextPlanned: null,
            lastEmitted: null,
          },
        },
      });
    }
    if (rOps.length) await db.collection("recurrences").bulkWrite(rOps, { ordered: true });
  }

  // ---- 5) Aus accounts abgeleitete Neben-Collections
  const balanceOps: any[] = [];
  const incomeOps: any[] = [];
  const contribOps: any[] = [];
  const carryOps: any[] = [];
  const budgetOps: any[] = [];

  for (const a of v1Accounts) {
    const accId = accountIdMap.get(a.id)!;

    // balances -> account_balances
    for (const b of a.balances ?? []) {
      balanceOps.push({
        insertOne: {
          document: {
            _id: new ObjectId(),
            accountId: accId,
            month: monthToISODate(b.month),
            closingBalanceCents: centsFromEuro(b.value),
          },
        },
      });
    }

    // monthlyIncomes -> member_incomes
    for (const r of a.monthlyIncomes ?? []) {
      incomeOps.push({
        insertOne: {
          document: {
            _id: new ObjectId(),
            accountId: accId,
            memberId: resolveMember(r.memberId),
            amountCents: centsFromEuro(r.amount),
            fromMonth: monthToISODate(r.startMonth),
            toMonth: r.endMonth ? monthToISODate(r.endMonth) : null,
            source: "salary",
            note: null,
          },
        },
      });
    }

    // monthlyPlannedContributions -> contribution_rules (perMember) ODER category_budgets
    for (const r of a.monthlyPlannedContributions ?? []) {
      if (r.memberId) {
        contribOps.push({
          insertOne: {
            document: {
              _id: new ObjectId(),
              accountId: accId,
              type: "base",
              recurring: true,
              description: "Planned contribution",
              amountCents: centsFromEuro(r.amount),
              distribution: {
                mode: "perMember",
                memberId: resolveMember(r.memberId),
                customSplit: null,
              },
              fromMonth: monthToISODate(r.startMonth),
              toMonth: r.endMonth ? monthToISODate(r.endMonth) : null,
            },
          },
        });
      } else if (r.categoryId) {
        // Das sind Budgets pro Kategorie
        budgetOps.push({
          insertOne: {
            document: {
              _id: new ObjectId(),
              accountId: accId,
              categoryId: categoryIdMap.get(r.categoryId),
              amountCents: centsFromEuro(r.amount),
              fromMonth: monthToISODate(r.startMonth),
              toMonth: r.endMonth ? monthToISODate(r.endMonth) : null,
            },
          },
        });
      }
    }

    // additionalContributions -> contribution_rules (additional, perMember)
    for (const r of a.additionalContributions ?? []) {
      contribOps.push({
        insertOne: {
          document: {
            _id: new ObjectId(),
            accountId: accId,
            type: "additional",
            recurring: !!r.recurring,
            description: r.description ?? "Additional contribution",
            amountCents: centsFromEuro(r.amount),
            distribution: {
              mode: "perMember",
              memberId: resolveMember(r.memberId),
              customSplit: null,
            },
            fromMonth: monthToISODate(r.startMonth),
            toMonth: r.endMonth ? monthToISODate(r.endMonth) : null,
          },
        },
      });
    }

    // carryOverBalances -> carryovers
    for (const c of a.carryOverBalances ?? []) {
      carryOps.push({
        insertOne: {
          document: {
            _id: new ObjectId(),
            accountId: accId,
            memberId: resolveMember(c.memberId),
            month: monthToISODate(c.month),
            amountCents: centsFromEuro(c.amount),
            reason: "Carryover",
            createdAt: new Date(),
          },
        },
      });
    }

    // topUps (Plan) -> contribution_rules type:"topup"
    for (const t of a.topUps ?? []) {
      const hasCustom = Array.isArray(t.customSplit) && t.customSplit.length > 0;
      contribOps.push({
        insertOne: {
          document: {
            _id: new ObjectId(),
            accountId: accId,
            type: "topup",
            recurring: false,
            description: t.reason ?? "Top-up",
            amountCents: centsFromEuro(t.amount),
            distribution: hasCustom
              ? {
                  mode: "customSplit",
                  memberId: null,
                  customSplit: t.customSplit.map((s: any) => ({
                    memberId: resolveMember(s.memberId),
                    split: s.split,
                  })),
                }
              : {
                  mode: "proRataIncome",
                  memberId: null,
                  customSplit: null,
                },
            fromMonth: monthToISODate(t.month),
            toMonth: monthToISODate(t.month),
            meta: { legacyTopUpDate: t.date ?? null },
          },
        },
      });
    }
  }

  if (balanceOps.length) await db.collection("account_balances").bulkWrite(balanceOps, { ordered: true });
  if (incomeOps.length) await db.collection("member_incomes").bulkWrite(incomeOps, { ordered: true });
  if (contribOps.length) await db.collection("contribution_rules").bulkWrite(contribOps, { ordered: true });
  if (carryOps.length) await db.collection("carryovers").bulkWrite(carryOps, { ordered: true });
  if (budgetOps.length) await db.collection("category_budgets").bulkWrite(budgetOps, { ordered: true });

  // ---- 6) Transactions (mit Recurrence-Verknüpfung, falls vorhanden)
  const v1Tx = await db.collection(bk("transactions")).find({}).toArray();
  const txOps: any[] = [];
  for (const t of v1Tx) {
    txOps.push({
      insertOne: {
        document: {
          _id: new ObjectId(),
          legacyId: t.id ?? null,
          accountId: accountIdMap.get(t.accountId),
          categoryId: t.categoryId ? categoryIdMap.get(t.categoryId) : null,
          title: t.title ?? null,
          type: t.type, // "expense" | "income" | "topup" | "transfer" | "adjustment"
          amountCents: centsFromEuro(t.amount),
          month: monthToISODate(t.month),
          bookDate: t.date ? new Date(`${t.date}T00:00:00Z`) : monthToISODate(t.month),
          status: t.status ?? "booked",
          isFromSharedAccount: t.isFromSharedAccount ?? null,
          paidByMemberId: t.paidByMemberId ? resolveMember(t.paidByMemberId) : null,
          recurrenceId:
            t.recurringTemplateId && recurrenceIdMap.has(t.recurringTemplateId)
              ? recurrenceIdMap.get(t.recurringTemplateId)
              : null,
        },
      },
    });
  }
  if (txOps.length) await db.collection("transactions").bulkWrite(txOps, { ordered: true });

  // ---- 7) Indizes anlegen
  await createIndexes(db);

  console.log("Up-Migration abgeschlossen.");
};

export const down = async ({context}: any) => {
  const db = context.db;
  // jüngstes Backup ermitteln
  const all = await db.listCollections().toArray();
  const suffixes = all
    .map((c) => c.name.match(/_v1bk_(\d{14})$/))
    .filter(Boolean)
    .map((m) => (m as RegExpMatchArray)[1])
    .sort();
  if (!suffixes.length) {
    console.log("Keine Backups gefunden – down übersprungen.");
    return;
  }
  const latest = suffixes.at(-1)!;
  const bk = (name: string) => `${name}_v1bk_${latest}`;

  // neue Collections löschen
  const targets = [
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
  for (const t of targets) await dropIfExists(db, t);

  // Backups zurückbenennen (Mitglieder-Collection kann singular oder plural gewesen sein)
  if (await hasCollection(db, bk("members"))) {
    await safeRename(db, bk("members"), "members");
  }
  if (await hasCollection(db, bk("member"))) {
    await safeRename(db, bk("member"), "member");
  }
  await safeRename(db, bk("accounts"), "accounts");
  await safeRename(db, bk("categories"), "categories");
  await safeRename(db, bk("transactions"), "transactions");
  if (await hasCollection(db, bk("transactionTemplates"))) {
    await safeRename(db, bk("transactionTemplates"), "transactionTemplates");
  }

  console.log("Down-Migration abgeschlossen (Backups wiederhergestellt).");
};
