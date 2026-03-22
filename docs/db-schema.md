# ToBu Finance – Datenbankstruktur (MongoDB)

**Stand:** Februar 2026  
**Datenbank:** MongoDB (Mongoose ODM)  
**Währung:** Alle Geldbeträge werden als **Integer in Minor Units (Cent)** gespeichert (z.B. `10000` = 100,00 €)  
**Datum/Monat:** Monatswerte als `Date` auf den **1. des Monats, 00:00:00 UTC**  
**IDs:** MongoDB `ObjectId` als `_id` + alle Fremdschlüssel

---

## Übersicht der Collections

| Collection           | Mongoose-Model     | Beschreibung                                    |
|----------------------|--------------------|-------------------------------------------------|
| `users`              | `User`             | App-Accounts (Login)                            |
| `auth_sessions`      | `AuthSession`      | Refresh-Token-Sessions                          |
| `members`            | `Member`           | Haushaltsmitglieder                             |
| `accounts`           | `Account`          | Budget-Konten (Container)                       |
| `categories`         | `Category`         | Ausgabenkategorien pro Account                  |
| `transactions`       | `Transaction`      | Einnahmen & Ausgaben                            |
| `recurrences`        | `Recurrence`       | Wiederkehrende Transaktionen (Templates)        |
| `contribution_rules` | `ContributionRule` | Beitragsregeln zur Kostenverteilung             |
| `member_incomes`     | `MemberIncome`     | Einkommenseinträge pro Mitglied & Monat         |
| `category_budgets`   | `CategoryBudget`   | Budgetgrenzen pro Kategorie & Zeitraum          |
| `account_balances`   | `AccountBalance`   | Manuelle Kontostand-Snapshots                   |
| `carryovers`         | `CarryOver`        | Übertrag-Korrekturen zwischen Monaten           |

---

## Collections im Detail

---

### `users`

App-Login-Accounts. Entkoppelt von `members` – ein User kann mit einem Member verknüpft sein.

| Feld               | Typ        | Pflicht | Beschreibung                            |
|--------------------|------------|---------|-----------------------------------------|
| `_id`              | ObjectId   | ✓       | Primärschlüssel                         |
| `email`            | String     | ✓       | Originalschreibweise                    |
| `emailNormalized`  | String     | ✓       | `trim().toLowerCase()`, unique          |
| `name`             | String     | –       | Anzeigename                             |
| `passwordHash`     | String     | ✓       | bcrypt-Hash                             |
| `roles`            | String[]   | –       | z.B. `["user"]`, `["admin"]`            |
| `isActive`         | Boolean    | –       | Default: `true`                         |
| `createdAt`        | Date       | auto    | Mongoose timestamps                     |
| `updatedAt`        | Date       | auto    | Mongoose timestamps                     |

**Indexes:** `emailNormalized` (unique), `roles`, `isActive`

---

### `auth_sessions`

Refresh-Token-Sessions. MongoDB TTL-Index löscht abgelaufene Sessions automatisch.

| Feld        | Typ      | Pflicht | Beschreibung                              |
|-------------|----------|---------|-------------------------------------------|
| `_id`       | ObjectId | ✓       | Primärschlüssel                           |
| `userId`    | ObjectId | ✓       | Ref → `users`                             |
| `jti`       | String   | ✓       | JWT Token-ID (unique)                     |
| `userAgent` | String   | –       | HTTP User-Agent des Clients               |
| `ip`        | String   | –       | IP-Adresse bei Login                      |
| `rotatedAt` | Date     | –       | Zeitpunkt letzter Token-Rotation          |
| `revokedAt` | Date     | –       | Wenn gesetzt: Session widerrufen          |
| `expiresAt` | Date     | ✓       | Ablaufdatum (TTL-Index löscht automatisch)|
| `createdAt` | Date     | auto    | Mongoose timestamps                       |
| `updatedAt` | Date     | auto    | Mongoose timestamps                       |

**Indexes:** `userId`, `jti` (unique), `revokedAt`, `expiresAt` (TTL, `expireAfterSeconds: 0`)

---

### `members`

Personen im Haushalt. Können (müssen aber nicht) mit einem `User`-Login verknüpft sein.

| Feld        | Typ      | Pflicht | Beschreibung                      |
|-------------|----------|---------|-----------------------------------|
| `_id`       | ObjectId | ✓       | Primärschlüssel                   |
| `name`      | String   | –       | Anzeigename, default `null`       |
| `email`     | String   | –       | Optional, default `null`          |
| `userId`    | ObjectId | –       | Ref → `users`, default `null`     |
| `avatar`    | String   | –       | URL oder Base64, default `null`   |
| `createdAt` | Date     | auto    | Mongoose timestamps               |
| `updatedAt` | Date     | auto    | Mongoose timestamps               |

---

### `accounts`

Oberste Container-Ebene für Budgeting. Mehrere Mitglieder können einem Account zugeordnet sein.

| Feld                                      | Typ      | Pflicht | Beschreibung                                |
|-------------------------------------------|----------|---------|---------------------------------------------|
| `_id`                                     | ObjectId | ✓       | Primärschlüssel                             |
| `name`                                    | String   | –       | Name des Kontos, default `null`             |
| `currency`                                | String   | –       | Währungskürzel, default `"EUR"`             |
| `members`                                 | Array    | –       | Liste von Mitgliedschaften (s.u.)           |
| `members[].memberId`                      | ObjectId | ✓       | Ref → `members`                             |
| `members[].role`                          | String   | –       | `"owner"` \| `"member"`, default `"member"` |
| `settings.dashboard.historyMonths`        | Number   | –       | Anzahl angezeigter Verlaufsmonate (3–24)    |
| `settings.dashboard.topKCategories`       | Number   | –       | Top-N Kategorien im Dashboard (1–10)        |
| `settings.alerts.lowBalanceForecastMinor` | Number   | –       | Warnschwelle Saldo-Prognose in Cent         |
| `settings.alerts.carryoverLargeMinor`     | Number   | –       | Warnschwelle großer Übertrag in Cent        |
| `settings.alerts.stalenessDays`           | Number   | –       | Warnschwelle für veraltete Daten (Tage)     |
| `createdAt`                               | Date     | auto    | Mongoose timestamps                         |
| `updatedAt`                               | Date     | auto    | Mongoose timestamps                         |

**Indexes:** `{ "members.memberId": 1 }`

---

### `categories`

Ausgabenkategorien, die einem Account zugeordnet sind. Können einen eigenen Aufteilungsschlüssel definieren.

| Feld                    | Typ      | Pflicht | Beschreibung                                       |
|-------------------------|----------|---------|----------------------------------------------------|
| `_id`                   | ObjectId | ✓       | Primärschlüssel                                    |
| `accountId`             | ObjectId | ✓       | Ref → `accounts`                                   |
| `name`                  | String   | –       | Kategoriename, default `null`                      |
| `customSplit`           | Array    | –       | Kategorieindividueller Aufteilungsschlüssel (s.u.) |
| `customSplit[].memberId`| ObjectId | ✓       | Ref → `members`                                    |
| `customSplit[].split`   | Number   | ✓       | Prozentualer Anteil (0–100, Summe ≈ 100)           |
| `createdAt`             | Date     | auto    | Mongoose timestamps                                |
| `updatedAt`             | Date     | auto    | Mongoose timestamps                                |

**Indexes:** `{ accountId: 1, name: 1 }`

---

### `transactions`

Kernentität. Enthält alle Einnahmen und Ausgaben. Unterstützt **Split-Transaktionen** via `parentTransactionId`.

| Feld                   | Typ      | Pflicht | Beschreibung                                                            |
|------------------------|----------|---------|-------------------------------------------------------------------------|
| `_id`                  | ObjectId | ✓       | Primärschlüssel                                                         |
| `accountId`            | ObjectId | ✓       | Ref → `accounts`                                                        |
| `categoryId`           | ObjectId | –       | Ref → `categories`, optional                                            |
| `title`                | String   | ✓       | Bezeichnung der Transaktion                                             |
| `notes`                | String   | –       | Freitextnotiz, default `null`                                           |
| `type`                 | String   | ✓       | `"income"` \| `"expense"`                                               |
| `amountMinor`          | Number   | ✓       | Betrag in Cent (min: 0)                                                 |
| `month`                | Date     | ✓       | Buchungsmonat (1. des Monats, UTC)                                      |
| `bookDate`             | Date     | –       | Konkretes Buchungsdatum, optional                                       |
| `status`               | String   | –       | `"booked"` \| `"pending"`, default `"pending"`                         |
| `isFromSharedAccount`  | Boolean  | ✓       | Ob von gemeinsamem Konto bezahlt                                        |
| `paidByMemberId`       | ObjectId | –       | Ref → `members` (wer hat gezahlt), optional                             |
| `parentTransactionId`  | ObjectId | –       | Ref → `transactions` (für Split-Children), default `null`               |
| `recurrenceId`         | ObjectId | –       | Ref → `recurrences` (Quelle bei auto-generierten Transaktionen)         |
| `createdAt`            | Date     | auto    | Mongoose timestamps                                                     |
| `updatedAt`            | Date     | auto    | Mongoose timestamps                                                     |

**Split-Logik:**
- **Container** (Parent ohne eigene Kategorie): `parentTransactionId = null`, Kinder summieren den vollen Betrag
- **Hybrid-Parent**: `parentTransactionId = null`, hat eigene Kategorie, Kinder decken nur Teil des Betrages ab
- **Child**: `parentTransactionId` gesetzt → Ref auf Parent

**Indexes:**
- `{ accountId, month, status }`
- `{ accountId, bookDate: -1 }`
- `{ categoryId, month }`
- `{ paidByMemberId, month }`
- `{ accountId, parentTransactionId }`
- `{ parentTransactionId }`

---

### `recurrences`

Vorlagen für wiederkehrende Transaktionen. Der Job/Scheduler emittiert daraus echte `transactions`.

| Feld                  | Typ      | Pflicht | Beschreibung                                    |
|-----------------------|----------|---------|-------------------------------------------------|
| `_id`                 | ObjectId | ✓       | Primärschlüssel                                 |
| `accountId`           | ObjectId | ✓       | Ref → `accounts`                                |
| `categoryId`          | ObjectId | –       | Ref → `categories`, optional                    |
| `title`               | String   | –       | Bezeichnung, default `null`                     |
| `type`                | String   | ✓       | `"income"` \| `"expense"`                       |
| `amountMinor`         | Number   | ✓       | Betrag in Cent (min: 0)                         |
| `isFromSharedAccount` | Boolean  | –       | Default `null`                                  |
| `schedule.freq`       | String   | –       | Frequenz: `"monthly"` (einzige Option aktuell)  |
| `schedule.dayOfMonth` | Number   | –       | Tag im Monat (1–28), default `1`                |
| `activeFrom`          | Date     | ✓       | Aktivierungsdatum                               |
| `activeUntil`         | Date     | –       | Enddatum, `null` = unbegrenzt                   |
| `createdByMemberId`   | ObjectId | –       | Ref → `members`, wer hat erstellt               |
| `nextPlanned`         | Date     | –       | Nächster geplanter Ausführungszeitpunkt         |
| `lastEmitted`         | Date     | –       | Zuletzt emittierter Monat                       |
| `createdAt`           | Date     | auto    | Mongoose timestamps                             |
| `updatedAt`           | Date     | auto    | Mongoose timestamps                             |

**Indexes:** `{ accountId, nextPlanned }`

---

### `contribution_rules`

Regeln, wie die Mitglieder eines Accounts zu den Kosten beitragen (Basisanteil, Zusatzbeitrag, Top-Up).

| Feld                          | Typ      | Pflicht | Beschreibung                                                        |
|-------------------------------|----------|---------|---------------------------------------------------------------------|
| `_id`                         | ObjectId | ✓       | Primärschlüssel                                                     |
| `accountId`                   | ObjectId | ✓       | Ref → `accounts`                                                    |
| `type`                        | String   | ✓       | `"base"` \| `"additional"` \| `"topup"`                             |
| `recurring`                   | Boolean  | ✓       | Ob die Regel monatlich wiederkehrt                                  |
| `description`                 | String   | –       | Freitext-Beschreibung, default `null`                               |
| `amountMinor`                 | Number   | ✓       | Betrag in Cent (min: 0)                                             |
| `distribution.mode`           | String   | ✓       | `"perMember"` \| `"customSplit"` \| `"proRataIncome"`               |
| `distribution.memberId`       | ObjectId | –       | Ref → `members` (nur bei `mode = "perMember"`)                      |
| `distribution.customSplit`    | Array    | –       | Nur bei `mode = "customSplit"` (Summe muss 100 ergeben)             |
| `distribution.customSplit[].memberId` | ObjectId | ✓ | Ref → `members`                                                   |
| `distribution.customSplit[].split`    | Number   | ✓ | Prozentualer Anteil (0–100)                                       |
| `fromMonth`                   | Date     | –       | Gültig ab (1. des Monats, UTC), `null` = unbegrenzt               |
| `toMonth`                     | Date     | –       | Gültig bis (1. des Monats, UTC), `null` = unbegrenzt              |
| `meta.legacyTopUpDate`        | String   | –       | Migrationshilfe, legacy                                             |
| `createdAt`                   | Date     | auto    | Mongoose timestamps                                                 |
| `updatedAt`                   | Date     | auto    | Mongoose timestamps                                                 |

**Validierung:** `distribution`-Felder sind gegenseitig exklusiv je nach `mode`.  
**Indexes:** `{ accountId, fromMonth, toMonth, type }`

---

### `member_incomes`

Monatsgehälter / Einkommensangaben pro Mitglied, verwendet für `proRataIncome`-Verteilung.

| Feld          | Typ      | Pflicht | Beschreibung                                       |
|---------------|----------|---------|----------------------------------------------------|
| `_id`         | ObjectId | ✓       | Primärschlüssel                                    |
| `accountId`   | ObjectId | ✓       | Ref → `accounts`                                   |
| `memberId`    | ObjectId | ✓       | Ref → `members`                                    |
| `amountMinor` | Number   | ✓       | Betrag in Cent (min: 0)                            |
| `fromMonth`   | Date     | –       | Gültig ab, `null` = unbegrenzt                     |
| `toMonth`     | Date     | –       | Gültig bis, `null` = unbegrenzt                    |
| `source`      | String   | –       | Einkommensart, default `"salary"`                  |
| `note`        | String   | –       | Freitext, default `null`                           |
| `createdAt`   | Date     | auto    | Mongoose timestamps                                |
| `updatedAt`   | Date     | auto    | Mongoose timestamps                                |

**Indexes:** `{ accountId, memberId, fromMonth, toMonth }`

---

### `category_budgets`

Budgetobergrenzen für eine Kategorie innerhalb eines Zeitraums.

| Feld          | Typ      | Pflicht | Beschreibung                         |
|---------------|----------|---------|--------------------------------------|
| `_id`         | ObjectId | ✓       | Primärschlüssel                      |
| `accountId`   | ObjectId | ✓       | Ref → `accounts`                     |
| `categoryId`  | ObjectId | ✓       | Ref → `categories`                   |
| `amountMinor` | Number   | ✓       | Budgetbetrag in Cent (min: 0)        |
| `fromMonth`   | Date     | –       | Gültig ab, `null` = unbegrenzt       |
| `toMonth`     | Date     | –       | Gültig bis, `null` = unbegrenzt      |
| `createdAt`   | Date     | auto    | Mongoose timestamps                  |
| `updatedAt`   | Date     | auto    | Mongoose timestamps                  |

---

### `account_balances`

Manuelle Kontostand-Snapshots für einen Account zu einem bestimmten Monat.

| Feld                   | Typ      | Pflicht | Beschreibung                            |
|------------------------|----------|---------|-----------------------------------------|
| `_id`                  | ObjectId | ✓       | Primärschlüssel                         |
| `accountId`            | ObjectId | ✓       | Ref → `accounts`                        |
| `month`                | Date     | –       | Monat des Snapshots, default `null`     |
| `closingBalanceMinor`  | Number   | ✓       | Abschlusssaldo in Cent                  |

**Indexes:** `{ accountId, month }` (unique, sparse)

---

### `carryovers`

Übertrag-Korrekturen zwischen Monaten pro Mitglied (kann negativ sein).

| Feld          | Typ      | Pflicht | Beschreibung                                       |
|---------------|----------|---------|----------------------------------------------------|
| `_id`         | ObjectId | ✓       | Primärschlüssel                                    |
| `accountId`   | ObjectId | ✓       | Ref → `accounts`                                   |
| `memberId`    | ObjectId | ✓       | Ref → `members`                                    |
| `month`       | Date     | –       | Monat des Übertrags, default `null`                |
| `amountMinor` | Number   | ✓       | Betrag in Cent (kann negativ sein)                 |
| `reason`      | String   | –       | Begründung, default `""`                           |
| `createdAt`   | Date     | –       | Default: `new Date()`                              |

**Indexes:** `{ accountId, memberId, month }` (unique, sparse)

---

## Beziehungsdiagramm

```
users ──────────────────────────────────────────── auth_sessions
  │                                                   │ userId
  │ userId                                            │
  ▼                                                   │
members ◄──────────────────────────────────────────────┘
  │
  │ memberId (accounts.members[])
  ▼
accounts ──────────► categories ──────────► category_budgets
  │                      │
  │ accountId             │ categoryId
  │                       │
  ▼                       ▼
transactions ◄──────── (categoryId)
  │   │
  │   └── parentTransactionId (Self-Ref: Split-Children)
  │
  ├── paidByMemberId ──► members
  └── recurrenceId ────► recurrences

accounts ──► contribution_rules
accounts ──► member_incomes
accounts ──► account_balances
accounts ──► carryovers ◄── members
```

---

## Events Collection (`events`)

Die `events`-Collection dient als **Audit-Log / Activity-Stream** für accountbezogene Aktionen.

| Feld                | Typ      | Pflicht | Beschreibung                              |
|---------------------|----------|---------|-------------------------------------------|
| `_id`               | ObjectId | ✓       | Primärschlüssel                           |
| `accountId`         | ObjectId | ✓       | Ref → `accounts`                          |
| `date`              | Date     | ✓       | Zeitpunkt des Events                      |
| `code`              | String   | ✓       | Event-Typ (z.B. `"transaction.created"`)  |
| `params`            | Object   | ✓       | Event-Payload (flexibel)                  |
| `createdByMemberId` | ObjectId | –       | Ref → `members`, wer hat ausgelöst        |
| `createdAt`         | Date     | auto    | Mongoose timestamps                       |
| `updatedAt`         | Date     | auto    | Mongoose timestamps                       |

**Indexes:** `{ accountId, date: -1 }`

---

*Generiert aus den Mongoose-Schemas in `src/models/` und `src/auth/models.ts`.*
