# ToBu‑Finance – Backend Schema Summary (New MongoDB Layout)

**Status:** post‑migration target schema (no `legacyId` fields).  
**Goal:** Enable backend refactor in another channel. This document summarizes collections, fields, indexes, relations, and the v1→v2 mapping.

---

## Core Conventions

- **IDs:** Use MongoDB `_id` (ObjectId) for primary keys and references. No additional ids are required.  
  *(Optional for later: add `publicId`/`slug` for nicer URLs; not part of this schema.)*
- **Money:** Store all monetary values in **cents** (integer).
- **Months/Periods:** Use ISO `Date` at **UTC-01** (first day of month at 00:00:00Z) for month markers.
- **Time:** All timestamps are UTC unless explicitly noted.
- **Members in accounts:** Only store references, not denormalized member data.
- **No `legacyId`:** Removed from all targets; only used transiently in the migration script.

---

## Collections

### 1) `members`
```jsonc
{
  "_id": "ObjectId",
  "name": "string|null",
  "email": "string|null",
  "userId": "ObjectId|null" // optional link to app-auth user
}
```
**Notes:** Minimal; expand as needed (avatars, settings).

---

### 2) `accounts`
```jsonc
{
  "_id": "ObjectId",
  "name": "string|null",
  "currency": "EUR",                     // fixed for now
  "members": [                           // membership/roles
    { "memberId": "ObjectId", "role": "owner" }
  ],
  "settings": { "monthGranularity": "YYYY-MM" },
  "createdAt": "Date",
  "updatedAt": "Date"
}
```
**Usage:** Top-level container for budgeting; no embedded incomes/topups here (moved to dedicated collections).

---

### 3) `categories`
```jsonc
{
  "_id": "ObjectId",
  "accountId": "ObjectId",
  "name": "string|null",
  "customSplit": [ { "memberId": "ObjectId", "split": 50 } ] // percentages (sum ~100)
}
```
**Index:** `{ accountId: 1, name: 1 }` (non-unique by default; make unique if required per account).

---

### 4) `transactions`
```jsonc
{
  "_id": "ObjectId",
  "accountId": "ObjectId",
  "categoryId": "ObjectId|null",
  "title": "string|null",
  "type": "income" | "expense",
  "amountCents": 0,                       // integer cents
  "month": "Date|null",                   // period marker (1st of month UTC)
  "bookDate": "Date|null",                // actual booking date UTC
  "status": "booked" | "pending",
  "isFromSharedAccount": "boolean|null",
  "paidByMemberId": "ObjectId|null",
  "recurrenceId": "ObjectId|null"         // if originated from a recurrence
}
```
**Indexes:**
- `{ accountId: 1, month: 1, status: 1 }`
- `{ accountId: 1, bookDate: 1 }`
- `{ categoryId: 1, month: 1 }`
- `{ paidByMemberId: 1, month: 1 }`

---

### 5) `recurrences`  (formerly “transactionTemplates”)
```jsonc
{
  "_id": "ObjectId",
  "accountId": "ObjectId",
  "categoryId": "ObjectId|null",
  "title": "string|null",
  "type": "income" | "expense",
  "amountCents": 0,
  "schedule": { "freq": "monthly", "dayOfMonth": 1 },
  "activeFrom": "Date",
  "activeUntil": "Date|null",
  "createdByMemberId": "ObjectId|null",
  "nextPlanned": "Date|null",
  "lastEmitted": "Date|null"
}
```
**Index:** `{ accountId: 1, nextPlanned: 1 }`

---

### 6) `member_incomes`
*Planned/actual income time-ranges per member in an account.*
```jsonc
{
  "_id": "ObjectId",
  "accountId": "ObjectId",
  "memberId": "ObjectId",
  "amountCents": 0,
  "fromMonth": "Date|null",   // inclusive
  "toMonth": "Date|null",     // inclusive or null = open-ended
  "source": "salary",
  "note": "string|null"
}
```
**Index:** `{ accountId: 1, memberId: 1, fromMonth: 1, toMonth: 1 }`

---

### 7) `contribution_rules`
*Single place for base contributions, additional contributions, and top-ups (planned).*  
```jsonc
{
  "_id": "ObjectId",
  "accountId": "ObjectId",
  "type": "base" | "additional" | "topup",
  "recurring": "boolean",
  "description": "string|null",
  "amountCents": 0,
  "distribution":
    // choose exactly one:
    { "mode": "perMember",     "memberId": "ObjectId", "customSplit": null } |
    { "mode": "customSplit",   "memberId": null,       "customSplit": [ { "memberId": "ObjectId", "split": 60 } ] } |
    { "mode": "proRataIncome", "memberId": null,       "customSplit": null },
  "fromMonth": "Date|null",
  "toMonth": "Date|null",
  "meta": { "legacyTopUpDate": "string|null" } // optional legacy hint
}
```
**Index:** `{ accountId: 1, fromMonth: 1, toMonth: 1, type: 1 }`

**Semantics:**
- `base`: standing orders / monthly planned contributions per member.
- `additional`: additive rules (could be recurring or one-off).
- `topup`: planned seasonal/exceptional amounts (one-off unless `recurring=true`).

---

### 8) `carryovers`
*Monthly per-member buffer to avoid changing standing orders every month.*
```jsonc
{
  "_id": "ObjectId",
  "accountId": "ObjectId",
  "memberId": "ObjectId",
  "month": "Date|null",
  "amountCents": 0,       // can be negative
  "reason": "string",
  "createdAt": "Date"
}
```
**Unique Index:** `{ accountId: 1, memberId: 1, month: 1 }`

---

### 9) `account_balances`
*Closing balances per account & month (historical snapshots).*  
```jsonc
{
  "_id": "ObjectId",
  "accountId": "ObjectId",
  "month": "Date|null",
  "closingBalanceCents": 0
}
```
**Unique Index:** `{ accountId: 1, month: 1 }`

---

### 10) `category_budgets`
*Optional planned budget per category over a time range.*
```jsonc
{
  "_id": "ObjectId",
  "accountId": "ObjectId",
  "categoryId": "ObjectId",
  "amountCents": 0,
  "fromMonth": "Date|null",
  "toMonth": "Date|null"
}
```

---

## Relations (quick)

- `accounts.members[].memberId → members._id`
- `categories.accountId → accounts._id`
- `transactions.accountId → accounts._id`
- `transactions.categoryId → categories._id`
- `transactions.paidByMemberId → members._id`
- `transactions.recurrenceId → recurrences._id`
- `recurrences.accountId → accounts._id`
- `recurrences.categoryId → categories._id`
- `member_incomes.accountId/memberId → accounts/members`
- `contribution_rules.accountId → accounts._id` and any `distribution.customSplit[].memberId → members._id`
- `carryovers.accountId/memberId → accounts/members`
- `account_balances.accountId → accounts._id`
- `category_budgets.accountId/categoryId → accounts/categories`

---

## v1 → v2 Mapping (What changed)

- **Embedded planning fields removed from `accounts`:**
  - `monthlyIncomes` → **`member_incomes`**
  - `monthlyPlannedContributions` → **`contribution_rules`** with `type="base"`
  - `additionalContributions` → **`contribution_rules`** with `type="additional"`
  - `topUps` (planned) → **`contribution_rules`** with `type="topup"`
  - `carryOverBalances` → **`carryovers`**
  - `balances` → **`account_balances`**
- **`transactionTemplates`** → **`recurrences`**
- **Transactions**: unchanged conceptually; amounts now **normalized to `amountCents`** and month handling is strictly ISO date (1st of month).
- **No `legacyId`** fields in target documents.
- **Splits**: keep at category level (`categories.customSplit`) and within rules (`contribution_rules.distribution`).

---

## API Implications

- Endpoints that previously read from `accounts.*` must now query the respective collections:
  - Income planning → `member_incomes`
  - Base/additional/topup contributions → `contribution_rules`
  - Carryover buffer → `carryovers`
  - Monthly balances → `account_balances`
- Aggregations by month use `transactions.month` and `bookDate` consistently; planning applies via `contribution_rules` filtered by (`fromMonth`/`toMonth` coverage).
- When allocating planned amounts per member:
  - `distribution.mode === "perMember"` → amount belongs to that member.
  - `customSplit` → prorate by specified splits (sum ≈ 100).
  - `proRataIncome` → prorate by active `member_incomes` in that period.

---

## Query Sketches

**Active rules for a given month (`M`):**
```js
db.contribution_rules.find({
  accountId,
  $and: [
    { $or: [ { fromMonth: null }, { fromMonth: { $lte: M } } ] },
    { $or: [ { toMonth: null },   { toMonth:   { $gte: M } } ] }
  ]
})
```

**Member income effective at month `M`:**
```js
db.member_incomes.find({
  accountId, memberId,
  $and: [
    { $or: [ { fromMonth: null }, { fromMonth: { $lte: M } } ] },
    { $or: [ { toMonth: null },   { toMonth:   { $gte: M } } ] }
  ]
})
```

**Transactions of a period:**
```js
db.transactions.find({ accountId, month: M, status: "booked" })
```

---

## Optional Enhancements (not applied yet)

- **`publicId`** (string) for stable external URLs (`/accounts/:publicId`) + unique index.
- **`slug`** (string) for human-readable URLs; unique index (global or scoped per account).
- **Audit fields**: `createdBy`, `updatedBy`, `updatedAt` on more collections.
- **Soft delete** via `deletedAt` where relevant.

---

## Validation Hints

- Ensure `amountCents` is integer (≥ 0 except for `carryovers` where negative is allowed).
- Validate `distribution` mutually exclusive schema.
- Check `customSplit[].split` are within 0..100 and (optionally) sum to 100.
- Enforce `category.accountId` and `category_budgets.accountId` consistency.

---

## Migration Backups (only FYI)

- Start snapshot collections are named `*_v1old_<TS>` and are **deleted on success**.
- Originals just before swap are named `*_v1bk_<TS>` and are **kept** to allow `down`.

---

**End of Summary** — This reflects the target MongoDB schema that the backend should use after migration.
