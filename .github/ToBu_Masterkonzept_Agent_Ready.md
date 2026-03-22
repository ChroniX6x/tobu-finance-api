# ToBu Finance – Agent Ready Masterkonzept

## 1. Kurzbeschreibung

**ToBu Finance** ist eine Web-App zur Verwaltung gemeinsamer Finanzen für Paar oder WG.
Die App kombiniert drei Dinge in einem System:

1. **Buchungsverwaltung** für gemeinsame und private Zahlungen
2. **Monatsplanung** für Budgets, Beiträge und Einzahlungen je Mitglied
3. **Account-Übersicht** mit Kontostand, Verlauf, Warnungen und Abweichungen

Der aktuelle MVP setzt bewusst auf **manuelle Erfassung**. Die fachliche Kernidee ist nicht nur „Ausgaben tracken“, sondern ein **gemeinschaftliches Abrechnungs- und Planungsmodell**:

- Was wurde gemeinsam bezahlt?
- Was wurde privat vorgestreckt?
- Wie sollen Kosten verteilt werden?
- Wie viel sollte jedes Mitglied einzahlen?
- Was wurde tatsächlich gezahlt?
- Wie verlässlich ist der aktuelle Kontostand?

---

## 2. Produktziel

Die App soll ein Gemeinschaftskonto so abbilden, dass ein Nutzer:

- alle relevanten Buchungen nachvollziehen kann,
- private Vorleistungen korrekt ausgleichen kann,
- Kategorien und Budgets pflegen kann,
- wiederkehrende Kosten erfassen kann,
- Beitragsregeln pro Mitglied oder einkommensbasiert definieren kann,
- pro Monat Soll- und Ist-Werte je Mitglied sehen kann,
- einen verlässlichen Kontostand mit Verlauf und Forecast bekommt,
- offene Risiken und Hinweise im Dashboard erkennt.

---

## 3. Grundprinzipien des Systems

### 3.1 Geldwerte

Alle Geldbeträge werden als **Minor Units** gespeichert, also als Integer in Cent.

**Beispiel:**
- `1299` = 12,99 €
- `-` Vorzeichen wird **nicht** direkt gespeichert, sondern aus `type` abgeleitet.

**Warum:**
- keine Fließkommafehler
- konsistente Summenbildung
- einfache Aggregation

### 3.2 Monatshandling

Monate werden fachlich als **Month-Anchor** behandelt.

Das bedeutet:
- Ein Monat steht logisch für den 1. Tag des Monats um 00:00 UTC.
- Im API-Kontext kann `YYYY-MM` als Eingabe verwendet werden.
- Persistiert wird der Monatswert als Date/ISO-Monatsanker.

**Warum:**
- saubere Monatsaggregation
- keine unklaren Monatsgrenzen
- einheitliche Ableitung für Budgets, Carryovers und Monatsbeiträge

### 3.3 Live-Berechnung statt Statement-Modell

Der MVP arbeitet mit **Live-Berechnung**.

Das bedeutet:
- Es gibt noch kein eingefrorenes Monatsstatement als eigene Domäne.
- Anzeigen und Kennzahlen werden aus bestehenden Daten live abgeleitet.
- Grundlage dafür sind vor allem `transactions`, `account_balances`, `carryovers`, `category_budgets`, `contribution_rules` und `member_incomes`.

**Vorteil:**
- schneller MVP
- sofort sichtbare Korrekturen
- keine zusätzliche Closing-Logik

**Nachteil:**
- historische Monate können sich nachträglich ändern

### 3.4 Pending zählt mit

`pending`-Buchungen zählen im MVP bereits in Statistiken und Charts mit.

**Warum:**
- auch geplante oder noch nicht final gebuchte Vorgänge beeinflussen den erwarteten Monatsverlauf

**Wichtige UI-Regel:**
- Pending muss **sichtbar markiert** und **filterbar** sein

### 3.5 Split-Sicherheit

Buchungen können aufgeteilt werden.
Das System nutzt dafür ein **Parent/Child-Modell** mit maximaler Tiefe **1**.

**Warum:**
- reale Haushaltsbuchungen bestehen oft aus mehreren Teilzuordnungen
- Charts und Summen dürfen trotzdem nicht doppelt zählen

---

## 4. Zentrale Domänenobjekte

## 4.1 User

**Technische Identität für Login und Zugriff**

Typische Felder:
- `_id`
- `email`
- `emailNormalized`
- `name`
- `passwordHash`
- `roles`
- `isActive`
- `createdAt`
- `updatedAt`

**Zweck:**
- Authentifizierung
- Rollen / Berechtigungen
- Bezug zur eingeloggten Person

**Wichtig:**
Ein User ist **nicht automatisch** ein Haushaltsmitglied.
Der User ist die technische Identität der App, während `member` die fachliche Person im Haushalt modelliert.

### Auth-Verhalten im aktuellen API-Vertrag
Die API nutzt standardmäßig Bearer-Auth mit einem kurzlebigen Access Token. Das Access Token wird nach Login oder Registrierung im Response-Body zurückgegeben und bei geschützten Endpunkten als `Authorization: Bearer <token>` mitgeschickt. Die Auth-Endpunkte selbst sind öffentlich und setzen `security: []`.

Die Registrierung ist gleichzeitig ein Auto-Login: `POST /api/auth/register` legt einen User an, liefert direkt ein Access Token zurück und setzt zusätzlich einen HttpOnly-Refresh-Cookie. `POST /api/auth/login` funktioniert analog für bestehende Nutzer und ist explizit rate-limitiert pro IP.

---

## 4.2 Auth Session

**Persistierte Refresh-Token-Session**

Typische Felder:
- `_id`
- `userId`
- `jti`
- `userAgent`
- `ip`
- `rotatedAt`
- `revokedAt`
- `expiresAt`

**Zweck:**
- Session-Verwaltung
- Token-Rotation
- Logout / Session-Revoke

### Refresh- und Logout-Logik
Refresh Tokens werden nicht im normalen Response-Body geführt, sondern als HttpOnly-Cookie `rt`. `POST /api/auth/refresh` liest diesen Cookie, stellt ein neues kurzlebiges Access Token aus und rotiert gleichzeitig die Refresh-Session.

Die API sieht dabei explizit **Refresh-Token-Rotation** vor: Die bisherige Session wird widerrufen und eine neue Session mit neuem Cookie ausgegeben. Wird ein bereits widerrufener Refresh Token erneut verwendet, greift **Reuse Detection** und alle Sessions des Users werden sofort widerrufen.

`POST /api/auth/logout` ist idempotent: Auch ohne vorhandenen Refresh-Cookie antwortet der Endpunkt mit `204`. Wenn ein Cookie vorhanden ist, wird die aktuelle Session widerrufen und der Cookie gelöscht.

---

## 4.3 Member

**Fachliche Person im Haushalt**

Typische Felder:
- `_id`
- `name`
- `email`
- `userId` (optional)
- `avatar`
- `createdAt`
- `updatedAt`

**Zweck:**
- reale Person im gemeinsamen Finanzmodell
- kann mit User verknüpft sein, muss aber nicht

**Warum diese Trennung wichtig ist:**
- ein Haushaltsmitglied kann fachlich existieren, auch ohne App-Login
- das System arbeitet mit Haushaltspersonen, nicht nur mit technischen Konten

---

## 4.4 Account

**Zentrale fachliche Einheit / Gemeinschaftskonto**

Typische Felder:
- `_id`
- `name`
- `currency`
- `members[]`
- `settings`
- `createdAt`
- `updatedAt`

### `members[]`
Enthält pro Teilnehmer typischerweise:
- `memberId`
- `role` (`owner` oder `member`)

### `settings.dashboard`
Typische Felder:
- `historyMonths`
- `topKCategories`

### `settings.alerts`
Typische Felder:
- `lowBalanceForecastMinor`
- `carryoverLargeMinor`
- `stalenessDays`

**Zweck:**
- bündelt alle fachlich zusammengehörigen Daten eines gemeinsamen Kontos
- ist die Einheit für Dashboard, Buchungen, Budgets, Regeln und Auswertungen

---

## 4.5 Category

**Klassifikation für Buchungen / Ausgaben**

Typische Felder:
- `_id`
- `accountId`
- `name`
- `customSplit[]`
- `createdAt`
- `updatedAt`

### `customSplit[]`
Typischer Inhalt:
- `memberId`
- `split` (Prozent)

**Zweck:**
- fachliche Zuordnung von Buchungen
- Grundlage für Budgetierung
- Möglichkeit für kategoriespezifische Verteilung statt Standardlogik

**Wichtige Regel:**
- `categoryId = null` ist erlaubt und bedeutet **nicht kategorisiert**

---

## 4.6 Transaction

**Zentrales Ledger-Objekt für Einnahmen und Ausgaben**

Typische Felder:
- `_id`
- `accountId`
- `categoryId`
- `title`
- `notes`
- `type` (`income` | `expense`)
- `amountMinor`
- `month`
- `bookDate`
- `status` (`pending` | `booked`)
- `isFromSharedAccount`
- `paidByMemberId`
- `parentTransactionId`
- `recurrenceId`
- `createdAt`
- `updatedAt`

### Bedeutung der wichtigsten Felder

#### `type`
Legt die fachliche Richtung fest:
- `income` = positiver Geldfluss
- `expense` = negativer Geldfluss

**Wichtig:**
Das Vorzeichen wird nicht direkt gespeichert, sondern aus `type` abgeleitet.

#### `amountMinor`
Immer positiver Integerbetrag in Cent.

#### `status`
- `pending` = geplant / offen / noch nicht final
- `booked` = gebucht / bestätigt

#### `bookDate`
Konkretes Buchungsdatum.
Bei `booked` ist `bookDate` Pflicht.

#### `month`
Monatsanker für Aggregationen.
- Bei `booked` wird `month` aus `bookDate` abgeleitet.
- Bei `pending` ohne `bookDate` wird der Monat vorgegeben.

#### `isFromSharedAccount`
Beschreibt die Zahlungsquelle.
- `true` = direkt vom Gemeinschaftskonto
- `false` = privat bezahlt / vorgestreckt

#### `paidByMemberId`
Relevant nur für private Zahlung.
Wenn `isFromSharedAccount = false`, muss hier das zahlende Mitglied gesetzt sein.

#### `parentTransactionId`
- `null` = Parent / normale Top-Level-Buchung
- gesetzt = Child / Teilbuchung

#### `recurrenceId`
Verweist auf die Recurrence-Vorlage, wenn die Buchung automatisch aus einer Wiederholung erzeugt wurde.

**Zweck des Transaktionsmodells:**
- alle Einnahmen und Ausgaben erfassen
- private vs. gemeinsame Zahlungen unterscheiden
- Splits ermöglichen
- Monatsauswertungen und Charts speisen

---

## 4.7 Recurrence

**Vorlage für wiederkehrende Buchungen**

Typische Felder:
- `_id`
- `accountId`
- `categoryId`
- `title`
- `type`
- `amountMinor`
- `isFromSharedAccount`
- `schedule`
- `activeFrom`
- `activeUntil`
- `createdByMemberId`
- `nextPlanned`
- `lastEmitted`
- `createdAt`
- `updatedAt`

### `schedule`
Im aktuellen Konzept vor allem:
- `freq = monthly`
- `dayOfMonth`

**Zweck:**
- Fixkosten und andere regelmäßige Buchungen nicht jeden Monat neu anlegen
- Scheduler erzeugt daraus echte `transactions`

**Wichtige Fachregel:**
- Wiederholungen sind nicht nur Erinnerungen, sondern emittieren echte Buchungen

---

## 4.8 Contribution Rule

**Regel für Beiträge und Einzahlungen**

Typische Felder:
- `_id`
- `accountId`
- `type` (`base` | `additional` | `topup`)
- `recurring`
- `description`
- `amountMinor`
- `distribution`
- `fromMonth`
- `toMonth`
- `meta`
- `createdAt`
- `updatedAt`

### `type`
- `base` = regulärer Grundbeitrag
- `additional` = zusätzlicher Beitrag
- `topup` = Auffüllung / Zusatzbedarf

### `distribution.mode`
- `perMember`
- `customSplit`
- `proRataIncome`

### Zweck
Contribution Rules sind die persistierte Regelbasis für Monatsbeiträge.
Sie ersetzen lose, rein UI-getriebene Logik und machen Beitragsplanung nachvollziehbar.

---

## 4.9 Member Income

**Historisierte Einkommensbasis je Mitglied**

Typische Felder:
- `_id`
- `accountId`
- `memberId`
- `amountMinor`
- `fromMonth`
- `toMonth`
- `source`
- `note`
- `createdAt`
- `updatedAt`

**Zweck:**
- Grundlage für einkommensbasierte Verteilung (`proRataIncome`)
- Änderungen der Einkommenssituation über Zeit nachvollziehbar halten

---

## 4.10 Category Budget

**Budgetgrenze pro Kategorie und Zeitraum**

Typische Felder:
- `_id`
- `accountId`
- `categoryId`
- `amountMinor`
- `fromMonth`
- `toMonth`
- `createdAt`
- `updatedAt`

**Zweck:**
- Budgetkontrolle je Kategorie
- Input für Monatsplanung
- Insights / Warnungen bei Überschreitung

---

## 4.11 Account Balance

**Manueller Kontostand-Snapshot pro Monat**

Typische Felder:
- `_id`
- `accountId`
- `month`
- `closingBalanceMinor`
- `createdAt`
- `updatedAt`

**Zweck:**
- letzter verlässlicher Kontostand
- Grundlage für Dashboard, Verlauf, Forecast und Staleness

**Wichtige Regel:**
Nicht irgendein theoretisch gerechneter Stand ist maßgeblich, sondern der letzte reale Balance-Snapshot.

---

## 4.12 Carryover

**Übertrag / Korrektur zwischen Monaten pro Mitglied**

Typische Felder:
- `_id`
- `accountId`
- `memberId`
- `month`
- `amountMinor`
- `reason`
- `createdAt`

**Zweck:**
- kleine Abweichungen nicht sofort über neue Grundbeiträge ausgleichen
- Differenzen zwischen Monaten mitnehmen
- spätere Verrechnung ermöglichen

**Wichtig:**
`amountMinor` kann hier auch negativ sein.

---

## 4.13 Event

**Audit- / Activity-Log für Timeline**

Typische Felder:
- `_id`
- `accountId`
- `date`
- `code`
- `params`
- `createdByMemberId`
- `createdAt`
- `updatedAt`

**Zweck:**
- Grundlage für die Timeline im Account Overview
- nachvollziehbare letzte Aktivitäten
- typisierte Ereignisse über `code + params`

---

## 5. Wichtige fachliche Regeln

## 5.1 Shared vs. Private Zahlung

Die App muss sauber unterscheiden zwischen:

1. **Gemeinsame Kontobewegung**
   - `isFromSharedAccount = true`
   - Geld ging direkt über das Gemeinschaftskonto

2. **Private Vorleistung**
   - `isFromSharedAccount = false`
   - `paidByMemberId` ist Pflicht
   - ein Mitglied hat privat bezahlt und muss intern berücksichtigt werden

Das ist eine Kernfunktion der App.

---

## 5.2 Split-Regeln (Parent/Child)

Ein Parent kann Children besitzen.
Die maximale Tiefe ist **1**.

### Split-Zählregel

- Parent ohne Children zählt voll.
- Parent mit Children zählt nur mit dem Restbetrag.
- Children zählen immer voll.
- Wenn Rest = 0, ist der Parent nur noch Container.

### Vererbte Felder bei Children
Children erben vom Parent:
- `type`
- `isFromSharedAccount`
- `paidByMemberId`
- `status`
- `bookDate`
- `month`

### Warum diese Regeln wichtig sind
- keine Doppelzählung in Charts
- keine widersprüchlichen Child-Daten
- klare, kontrollierbare Split-Struktur

---

## 5.3 Monatsableitung

Die Monatslogik der App soll pro Monat beantworten:

- welche Budgets aktiv sind,
- welche Contribution Rules aktiv sind,
- welche Einkommensbasis gilt,
- welche Carryovers mitwirken,
- welche Zahlungen bereits erfolgt sind,
- welche Abweichung zwischen Soll und Ist besteht.

Dadurch entsteht pro Mitglied eine Monatsbewertung:
- **monthlyDue** = was gezahlt werden sollte
- **paidAmount** = was tatsächlich gezahlt wurde
- **paid** = ob das Monatsziel erreicht wurde

---

## 5.4 Kontostand-Regel

Das Dashboard basiert auf dem **letzten verlässlichen Balance-Snapshot**.

Das heißt:
- `currentBalanceMinor` darf nicht künstlich auf 0 fallen, nur weil für den aktuellen Monat kein neuer Snapshot existiert.
- maßgeblich ist der letzte bekannte Snapshot bis heute.

Zusätzliche Metadaten:
- `currentMonth`
- `stalenessDays`
- `isStale`
- `missingMonths`

---

## 5.5 Insights statt loser Meldungen

Hinweise im Account Overview sollen als **Insights** modelliert werden.
Nicht als lose Texte, sondern als typisierte Elemente mit Bedeutung.

Beispielhafte Inhalte:
- offene Beiträge
- niedriger Forecast
- Budget überschritten
- große Carryovers
- Einkommensänderung
- zusätzliche Beiträge aktiv

Damit bekommt die App ein robustes Hinweissystem statt unstrukturierter Meldungen.

---

## 6. Seiten / Hauptscreens

## 6.1 Login / Registration

**Zweck:**
- Nutzer anmelden / registrieren
- Zugriff auf persönliche Accounts herstellen
- Sessions sicher erneuern und beenden

**Fachliche Bedeutung:**
Der Login ist nicht nur Technik, sondern Einstieg in personengebundene Daten.

**Konkreter API-Flow:**
1. `POST /api/auth/register` erstellt einen neuen User, loggt ihn direkt ein, gibt ein Access Token zurück und setzt einen HttpOnly-Refresh-Cookie.
2. `POST /api/auth/login` authentifiziert per E-Mail + Passwort, gibt ein Access Token zurück und setzt ebenfalls den Refresh-Cookie.
3. Läuft das Access Token ab, holt sich der Client über `POST /api/auth/refresh` mit dem Cookie ein neues Access Token.
4. `POST /api/auth/logout` widerruft die aktuelle Session und entfernt den Refresh-Cookie.

**Wichtige Implementierungsentscheidung:**
Das Access Token ist kurzlebig und für API-Requests gedacht. Der langlebigere Refresh Token liegt ausschließlich als HttpOnly-Cookie vor und soll nicht im Frontend-State gespeichert werden.

---

## 6.2 Dashboard / Kontenübersicht

**Zweck:**
- alle Accounts der eingeloggten Person anzeigen
- pro Account Schnellüberblick liefern

**Wichtige Inhalte pro Account:**
- Name
- Anzahl Mitglieder
- aktueller verlässlicher Kontostand
- historischer Verlauf
- Staleness / veraltete Daten
- mögliche Hinweise / Warnungen

**Nutzen:**
- zentrale Startseite
- schneller Zustand aller Gemeinschaftskonten

---

## 6.3 Account Overview / Detail-Dashboard

**Zweck:**
Management-Sicht für einen einzelnen Account.

**Typische Blöcke:**
- Account-KPIs
- Mitgliederstatus (`monthlyDue`, `paidAmount`, `paid`)
- QuickStats
- Charts
- Insights
- Timeline

**Nutzen:**
- aktueller Zustand
- Handlungsbedarf erkennen
- Entwicklung und letzte Aktivitäten nachvollziehen

---

## 6.4 Wizard – Account anlegen

**Zweck:**
Ersteinrichtung eines Accounts.

**Typische Schritte:**
1. Account-Basisdaten
2. Members
3. Settings
4. Kategorien
5. Budgets
6. Contribution Rules
7. Recurrences

**Wichtige fachliche Rolle:**
Der Wizard erzeugt nicht nur einen Account-Namen, sondern baut die gesamte fachliche Grundlage eines neuen Kontos auf.

**Frontend-Hinweis:**
Für den Wizard ist ein eigener Eingabe-State vorgesehen, inklusive temporärer Member-IDs, bevor echte Persistenz-IDs existieren.

---

## 6.5 Buchungsseite / Transactions

**Zweck:**
Operativer Kern für Buchungen.

**Bestandteile:**
- Toolbar / Filter
- Listenansicht mit Parent/Child
- Detail-Editor
- Capture-Dock

**Nutzen:**
- Buchungen anlegen, suchen, filtern, ändern
- Splits verwalten
- Pending vs. Booked sichtbar machen

**Besondere Regeln:**
- `nicht kategorisiert` muss explizit behandelbar sein
- Aggregationen müssen split-sicher sein
- Pending muss markiert sein

---

## 6.6 Capture-Dock

**Zweck:**
Schnelle Batch-Erfassung von Buchungen.

**Konzept:**
- Drafts leben nur im Frontend
- eigener Draft-Lifecycle
- nur `ready`-Drafts dürfen finalisiert werden
- Finalize erzeugt immer `booked`-Transactions

**Wichtig:**
Draft-Status ist **nicht** dasselbe wie Transaktionsstatus.

**Nutzen:**
- schnelles Erfassen mehrerer Einträge
- Entlastung des Detail-Editors

---

## 6.7 Monatsplanung

**Zweck:**
Monatssicht auf Soll und Ist pro Mitglied.

**Kombiniert:**
- Category Budgets
- Contribution Rules
- Member Incomes
- Carryovers
- tatsächliche Zahlungen

**Fachliche Kernfrage:**
Wie viel sollte jedes Mitglied diesen Monat einzahlen und was wurde tatsächlich gezahlt?

---

## 7. Read Models / API-Sichten

Neben CRUD-Endpunkten braucht das System spezialisierte Sichten.

### 7.1 `accounts/summary`
Für Dashboard / Kontenübersicht.

Typische Inhalte:
- `id`
- `name`
- `memberCount`
- `currentBalanceMinor`
- `currentMonth`
- `stalenessDays`
- `isStale`
- `balanceHistoryMinor`
- `missingMonths`

### 7.2 `accounts/{id}/overview`
Für Account Overview / Detail-Dashboard.

Typische Blöcke:
- `account`
- `members`
- `quickStats`
- `charts`
- `insights`
- `timeline`

### 7.3 `accounts/{id}/expanded`
Gebündelte Rohdaten für einen Account.

Gedacht für:
- komplexe Client-Sichten
- Editor-/Wizard-nahe Datensammlung
- abhängige Daten in einem Call

### 7.4 Auth-Endpunkte
Der Auth-Bereich ist jetzt als eigener API-Block dokumentiert.

**`POST /api/auth/register`**
- legt einen User an
- liefert `accessToken` + `user`
- setzt einen HttpOnly-Refresh-Cookie

**`POST /api/auth/login`**
- authentifiziert per E-Mail + Passwort
- liefert `accessToken` + `user`
- setzt einen HttpOnly-Refresh-Cookie
- ist rate-limitiert

**`POST /api/auth/refresh`**
- liest den Refresh-Cookie `rt`
- liefert ein neues `accessToken`
- rotiert die Refresh-Session
- widerruft bei Token-Replay alle Sessions des Users

**`POST /api/auth/logout`**
- widerruft die aktuelle Session
- löscht den Refresh-Cookie
- bleibt idempotent, auch wenn kein Cookie vorhanden ist

---

## 8. Frontend-Struktur

Empfohlene NGXS-Bereiche:
- `Accounts`
- `Members`
- `Categories`
- `Transactions`
- `Drafts / Capture`
- `Analytics`

### Wichtige Trennung

- Persistierte Entities in Entity-States
- Seitenfilter und UI-Zustände separat
- Drafts nur frontend-lokal

### Besonders wichtige Selektoren

Für Buchungen dürfen Summen nicht direkt auf `amountMinor` beruhen.
Es braucht ableitende Selektoren wie:
- `effectiveAmountMinor`
- `signedAmountMinor`

Nur so bleiben Splits korrekt.

---

## 9. Was für eine korrekte Umsetzung zwingend eingehalten werden muss

1. Geld immer als Minor Units speichern.
2. Monate immer über Month-Anchor denken.
3. `paidByMemberId` ist Pflicht bei privater Zahlung.
4. Splits nur als Parent/Child mit Tiefe 1.
5. Aggregationen immer split-sicher berechnen.
6. Pending mitzählen, aber markieren.
7. Recurrences müssen echte Transactions erzeugen.
8. Budgets und Einkommen sind Teil der Beitragslogik.
9. `account_balances` definieren den letzten verlässlichen Stand.
10. Draft-Zustände niemals mit Backend-Transaktionsstatus verwechseln.

---

## 10. Aktueller Implementierungsstand (kompakt)

### Bereits klar konzipiert / weitgehend vorhanden
- zentrales Domänenmodell
- Buchungsmodell mit Parent/Child-Splits
- Dashboard-/Overview-Read-Models
- Budgets, Incomes, Contribution Rules, Carryovers
- Recurrence-Templates
- Wizard-Grundidee
- Capture-Dock-Konzept
- Auth-API mit Register, Login, Refresh und Logout

### Noch nicht vollständig geschlossen
- dediziertes Read Model für Monatsplanung
- robuste Typisierung von Mitgliedseinzahlungen
- Recurrence-Unterstützung für private wiederkehrende Zahlungen
- vollständig stabiler Insight-Vertrag
- klarer Initialzustand für Accounts ohne Balance-Snapshot
- atomarer Wizard-Setup-Flow

---

## 11. Kompakte Gap-Liste

## GAP 1 – Monatsplanung ohne fertiges Read Model
**Problem:** Fachlogik für `monthlyDue vs. paid` ist da, aber keine endgültige serverseitige Sicht.

**Fehlt:**
- dedizierter Planungs-Endpunkt
- erklärbare Teilbeträge je Mitglied und Monat

---

## GAP 2 – Mitgliedseinzahlungen nicht klar typisiert
**Problem:** Das Modell unterscheidet noch nicht sauber zwischen echter Einzahlung eines Mitglieds, normaler Einnahme, Erstattung oder sonstigem Zufluss.

**Fehlt:**
- fachliche Typisierung / Zweckfeld für Zahlungsarten

---

## GAP 3 – Recurrences für private Zahlungen unvollständig
**Problem:** Wiederkehrende private Ausgaben lassen sich nicht vollständig modellieren, solange kein `paidByMemberId` in Recurrences existiert.

**Fehlt:**
- `paidByMemberId` auf Recurrence-Ebene

---

## GAP 4 – Insights noch nicht vollständig hart typisiert
**Problem:** Insights sind fachlich vorhanden, aber noch nicht überall als stabiler Minimalvertrag festgezogen.

**Fehlt:**
- fester Schema-Kern (`code`, `kind`, `severity`, `params`, optional `actions`)

---

## GAP 5 – No-Snapshot-Fall für neue Accounts offen
**Problem:** Für Accounts ohne `account_balance` ist der initiale Zustand im Dashboard/Overview noch nicht eindeutig geregelt.

**Fehlt:**
- klare Startregel für neue Accounts

---

## GAP 6 – Wizard noch nicht atomar
**Problem:** Der Wizard erzeugt fachlich viele abhängige Objekte, aber es fehlt ein klarer transaktionaler Gesamt-Create-Flow.

**Fehlt:**
- Setup-Orchestrierung oder Composite-Endpunkt

---

## GAP 7 – Dokumentationskonsistenz noch nicht vollständig
**Problem:** Monatsformate, manche Feldnamen und einige Zwischenartefakte sind noch nicht komplett harmonisiert.

**Fehlt:**
- eindeutige kanonische Vertragsdefinition für Monat, Feldnamen und Read-Models

---

## 12. Kanonische Interpretation für neue Agents

Wenn neue Entwickler oder Agents mit dem Projekt arbeiten, sollten sie diese Reihenfolge im Kopf haben:

1. **Account + Members** sind die fachliche Hülle.
2. **Transactions** bilden die realen Geldbewegungen.
3. **Categories + Budgets** beschreiben geplante Kostenstrukturen.
4. **Contribution Rules + Member Incomes** beschreiben, wie Beiträge verteilt werden sollen.
5. **Carryovers** fangen Abweichungen zwischen Monaten auf.
6. **Account Balances** liefern den verlässlichen Kontostand.
7. **Overview / Summary** sind spezialisierte Lesesichten über diese Domäne.
8. **Wizard, Transactions und Monatsplanung** sind die drei wichtigsten operativen UX-Bereiche.

