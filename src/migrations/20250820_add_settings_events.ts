import { Db, MongoClient, ObjectId } from "mongodb";

export type MigrationCtx = { db: Db; client: MongoClient };

const MIG_NAME = "20250820_add_settings_events";

// ------------------------ Utils ------------------------
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
async function copyBackup(db: Db, from: string, to: string) {
  if (!(await hasCollection(db, from))) return;
  await db.collection(from).aggregate([{ $match: {} }, { $out: to }]).toArray();
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
async function saveValidatorBackup(db: Db, coll: string, ts: string) {
  await db.collection("_validator_backups").createIndex({ coll: 1, savedAt: -1 });
  const existing = await getExistingValidator(db, coll);
  await db.collection("_validator_backups").insertOne({
    ts,
    coll,
    validator: existing.validator ?? null,
    validationLevel: existing.validationLevel ?? null,
    validationAction: existing.validationAction ?? null,
    savedAt: new Date(),
  });
}
async function restoreValidatorFromBackup(db: Db, name: string) {
  const doc = await db
    .collection("_validator_backups")
    .find({ coll: name })
    .sort({ savedAt: -1 })
    .limit(1)
    .next();
  if (!doc) return; // nichts zu tun
  await db.command({
    collMod: name,
    validator: doc.validator ?? {},
    validationLevel: (doc.validationLevel as any) ?? "strict",
    validationAction: (doc.validationAction as any) ?? "error",
  });
}
// Merged-Validator anwenden (bestehenden beibehalten)
async function setValidatorMerged(
  db: Db,
  name: string,
  addValidator: Record<string, any>,
  level: "strict" | "moderate" = "moderate",
  action: "error" | "warn" = "error",
  ts?: string
) {
  await saveValidatorBackup(db, name, ts ?? nowTs());
  const existing = await getExistingValidator(db, name);
  const merged =
    existing.validator && Object.keys(existing.validator).length
      ? { $and: [existing.validator, addValidator] }
      : addValidator;

  await db.command({
    collMod: name,
    validator: merged,
    validationLevel: level,
    validationAction: action,
  });
}

// ------------------------ Validators ------------------------
const accountsAddValidator = {
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
              lowBalanceForecastCents: { bsonType: "int", minimum: 0 },
              carryoverLargeCents: { bsonType: "int", minimum: 0 },
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

const membersAddValidator = {
  $jsonSchema: {
    bsonType: "object",
    properties: {
      avatar: {
        bsonType: ["string", "null"],
        maxLength: 1024,
        description: "optional http/https URL",
      },
    },
    additionalProperties: true,
  },
};

// events – strikter Validator
const EVENT_CODES = [
  "transaction.created",
  "transaction.booked",
  "transaction.statusChanged",
  "contributionRule.added",
  "contributionRule.updated",
  "contributionRule.removed",
  "memberIncome.added",
  "memberIncome.updated",
  "memberIncome.removed",
  "categoryBudget.added",
  "categoryBudget.updated",
  "categoryBudget.removed",
  "account.member.added",
  "account.member.removed",
] as const;

const eventsCreateOptions = {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["accountId", "date", "code", "params"],
      properties: {
        accountId: { bsonType: "objectId" },
        date: { bsonType: "date" },
        code: { enum: EVENT_CODES as any },
        params: { bsonType: "object" },
        createdByMemberId: { bsonType: ["objectId", "null"] },
      },
      additionalProperties: true,
    },
  },
  validationLevel: "strict",
  validationAction: "error",
} as const;

// ------------------------ Migration UP ------------------------
export const up = async ({ context }: { context: MigrationCtx }) => {
  const { db } = context;
  const ts = nowTs();

  // Vorbedingungen
  for (const n of ["accounts", "members"]) {
    if (!(await hasCollection(db, n))) {
      throw new Error(`Collection "${n}" missing – cannot migrate.`);
    }
  }

  const OLD = (n: string) => `${n}_v1old_${ts}`;
  const NEW = (n: string) => `__new__${n}_${ts}`;
  const BK  = (n: string) => `${n}_v1bk_${ts}`; // Original vorm Swap (falls wir swappen)

  let swapDone = false;
  let eventsCreated = false;

  // Rollback bei Fehler: Zustand exakt zurückdrehen + aufräumen
  const rollback = async (err: any) => {
    console.warn(`[${MIG_NAME}] Rolling back due to error:`, err?.message || err);

    try {
      // events entfernen, falls schon angelegt
      if (await hasCollection(db, "events")) {
        await dropIf(db, "events");
      }

      // Accounts zurückswapen, falls bereits geswappt
      if (swapDone) {
        // final accounts -> tmp
        const tmp = `__tmp_revert_accounts_${ts}`;
        await safeRename(db, "accounts", tmp);
        // BK zurück nach accounts
        if (await hasCollection(db, BK("accounts"))) {
          await safeRename(db, BK("accounts"), "accounts");
        }
        // tmp löschen
        await dropIf(db, tmp);
      }

      // Temp-Collections löschen
      await dropIf(db, NEW("accounts"));

      // Validatoren zurücksetzen
      await restoreValidatorFromBackup(db, "accounts");
      await restoreValidatorFromBackup(db, "members");

      // Snapshots löschen (sauberer Zustand ohne Leichen)
      await dropIf(db, OLD("accounts"));
      await dropIf(db, OLD("members"));
      // evtl. liegen gebliebene BKs aufräumen (falls swapDone true war)
      await dropIf(db, BK("accounts"));
    } catch (e) {
      console.error(`[${MIG_NAME}] Rollback encountered an error:`, e);
    }

    throw err;
  };

  try {
    // 1) Snapshots (Startzustand)
    await copyBackup(db, "accounts", OLD("accounts"));
    await copyBackup(db, "members",  OLD("members"));

    // 2) Shadow-Kopie von accounts erzeugen
    await dropIf(db, NEW("accounts"));
    // 2.1 Kopie
    await db.collection("accounts").aggregate([{ $match: {} }, { $out: NEW("accounts") }]).toArray();

    // 2.2 Defaults in Shadow setzen (nur wenn fehlt)
    await db.collection(NEW("accounts")).updateMany(
      {},
      [
        { $set: { settings: { $ifNull: ["$settings", {}] } } },
        { $set: { "settings.dashboard": { $ifNull: ["$settings.dashboard", {}] } } },
        { $set: { "settings.alerts":   { $ifNull: ["$settings.alerts",   {}] } } },
        {
          $set: {
            "settings.dashboard.historyMonths": {
              $ifNull: ["$settings.dashboard.historyMonths", 6],
            },
            "settings.dashboard.topKCategories": {
              $ifNull: ["$settings.dashboard.topKCategories", 5],
            },
            "settings.alerts.lowBalanceForecastCents": {
              $ifNull: ["$settings.alerts.lowBalanceForecastCents", 100000],
            },
            "settings.alerts.carryoverLargeCents": {
              $ifNull: ["$settings.alerts.carryoverLargeCents", 10000],
            },
          },
        },
      ]
    );

    // 3) Swap (atomar)
    if (await hasCollection(db, "accounts")) {
      await safeRename(db, "accounts", BK("accounts")); // Original vorm Swap
    }
    await safeRename(db, NEW("accounts"), "accounts");
    swapDone = true;

    // 4) Validatoren anwenden (nach Swap, damit sie auf der finalen "accounts" liegen)
    await setValidatorMerged(db, "accounts", accountsAddValidator, "moderate", "error", ts);
    await setValidatorMerged(db, "members",  membersAddValidator,  "moderate", "error", ts);

    // 5) events-Collection anlegen + Indizes
    if (!(await hasCollection(db, "events"))) {
      await db.createCollection("events", eventsCreateOptions as any);
    } else {
      await db.command({ collMod: "events", ...(eventsCreateOptions as any) });
    }
    await db.collection("events").createIndex({ accountId: 1, date: -1 });
    await db.collection("events").createIndex({ createdByMemberId: 1, date: -1 });
    eventsCreated = true;

    // 6) Beispiel-Events seeden
    const accounts = await db.collection("accounts").find({}, { projection: { _id: 1, members: 1 } }).toArray();
    const hasTx = await hasCollection(db, "transactions");
    for (const acc of accounts) {
      const accountId: ObjectId = acc._id as ObjectId;

      // letzte 3 booked-Transaktionen
      let txEvents: any[] = [];
      if (hasTx) {
        const txs = await db
          .collection("transactions")
          .find({ accountId, status: "booked" })
          .sort({ bookDate: -1 })
          .limit(3)
          .toArray();

        txEvents = txs.map((t: any) => ({
          _id: new ObjectId(),
          accountId,
          date: t.bookDate ?? new Date(),
          code: "transaction.booked",
          params: {
            transactionId: String(t._id),
            type: t.type,
            amountCents: t.amountCents ?? 0,
            title: t.title ?? undefined,
            categoryId: t.categoryId ? String(t.categoryId) : undefined,
          },
          createdByMemberId: t.paidByMemberId ?? null,
        }));
      }

      // Member-Join-Events
      const memberEvents = (acc.members ?? []).map((m: any) => ({
        _id: new ObjectId(),
        accountId,
        date: new Date(Date.now() - 24 * 3600 * 1000),
        code: "account.member.added",
        params: { memberId: String(m.memberId) },
        createdByMemberId: m.memberId ?? null,
      }));

      const seed = [...txEvents, ...memberEvents];
      if (seed.length) {
        await db.collection("events").insertMany(seed, { ordered: true });
      }
    }

    // 7) Erfolgscleanup: Backups & Temps weg
    await dropIf(db, OLD("accounts"));
    await dropIf(db, OLD("members"));
    await dropIf(db, NEW("accounts"));
    // Optional: auch BK entfernen, weil du „bei Erfolg Backups löschen“ willst
    await dropIf(db, BK("accounts"));

    console.log(`[${MIG_NAME}] Up migration finished successfully.`);
  } catch (err) {
    await rollback(err);
  }
};

// ------------------------ Migration DOWN ------------------------
export const down = async ({ context }: { context: MigrationCtx }) => {
  const { db } = context;

  // (Unverändert) events entfernen & Felder rückgängig machen
  // 1) events entfernen
  if (await hasCollection(db, "events")) {
    await db.collection("events").drop();
  }

  // 2) accounts: neue Felder wieder entfernen
  // 2.1 konkrete Felder unsetten
  await db.collection("accounts").updateMany(
    {},
    {
      $unset: {
        "settings.dashboard.historyMonths": "",
        "settings.dashboard.topKCategories": "",
        "settings.alerts.lowBalanceForecastCents": "",
        "settings.alerts.carryoverLargeCents": "",
      },
    }
  );
  // 2.2 leere Objekte dashboard/alerts entfernen
  await db.collection("accounts").updateMany(
    {},
    [
      {
        $set: {
          "settings.dashboard": {
            $cond: [
              { $gt: [{ $size: { $objectToArray: "$settings.dashboard" } }, 0] },
              "$settings.dashboard",
              "$$REMOVE",
            ],
          },
          "settings.alerts": {
            $cond: [
              { $gt: [{ $size: { $objectToArray: "$settings.alerts" } }, 0] },
              "$settings.alerts",
              "$$REMOVE",
            ],
          },
        },
      },
    ]
  );
  // 2.3 settings ggf. komplett entfernen
  await db.collection("accounts").updateMany(
    {},
    [
      {
        $set: {
          settings: {
            $cond: [
              { $gt: [{ $size: { $objectToArray: "$settings" } }, 0] },
              "$settings",
              "$$REMOVE",
            ],
          },
        },
      },
    ]
  );

  // 3) Validatoren zurücksetzen
  await restoreValidatorFromBackup(db, "accounts");
  await restoreValidatorFromBackup(db, "members");

  // 4) Cleanup: Nur temporäre Collections entfernen, KEINE v1bk_/v1old_ Backups global löschen
  const all = await db.listCollections().toArray();
  for (const { name } of all) {
    if (name.startsWith("__new__") || name.startsWith("__tmp_revert_")) {
      try { await db.collection(name).drop(); } catch {}
    }
  }

  console.log(`[${MIG_NAME}] Down migration finished (Backups anderer Migrationen beibehalten).`);
};

export default { up, down };
