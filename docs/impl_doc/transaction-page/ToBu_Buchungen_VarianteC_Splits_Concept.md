# ToBu Finance – Buchungen & Capture-Konzept (Variante C)
**Stand:** 2026-02-23  
**Ziel:** Agent‑ready Spezifikation für eine Umsetzung mit **Angular 20+**, **PrimeNG**, **NGXS**, **Signals**, **NodeJS**, **MongoDB**.

> Mockup (Desktop): `mockup_varianteC_splits_expandable.png` (liegt im selben Ordner wie diese Datei)

---

## 0. Kurzfassung
- Buchungsseite pro Account: **Toolbar** + **expandierbare Liste (Parent/Child)** + **Detail‑Editor** + **Capture‑Dock** (einklappbar).
- **Splits/Teiltransaktionen:** Parent‑Zeilen sind ausklappbar, Children stehen eingerückt in der Liste.
- **Hybrid Parent:**  
  - ohne Children → Parent zählt normal (voller Betrag)  
  - mit Children + Rest ≠ 0 → Parent zählt **nur Rest** in Parent‑Kategorie  
  - mit Children + Rest = 0 → Parent ist **Container-only** (zählt 0)
- **Capture‑Dock:** Quick Add für **Normal** & **Teilbuchung** („Teil von“ Autocomplete), Queue/Drafts, „Alle speichern“.
- Neues Pflichtfeld: **`title`** (neben `notes`).

---

## 1. Ziele, Prinzipien, Non‑Goals

### 1.1 Ziele
- Schnelles Erfassen (Keyboard‑first Desktop, Daumen‑first Mobile).
- Geringe kognitive Last: Master/Detail ist Standard, Capture ist optional.
- Korrekte Charts ohne Doppelzählung bei Splits.
- Modularität für spätere Automatisierung (OCR/PDF) via Draft‑Pipeline.

### 1.2 Prinzipien (UI/UX)
- Klare Begriffe: **Zahlungsquelle** (Shared/Privat) ≠ **Bezahlt von** (Member/Extern).
- Defaults merken pro Account (letzte Kategorie/Quelle/Bezahlt‑von‑Modus).
- Inline‑Feedback: Feldnahe Validierung, **Undo** statt Confirm‑Spam.
- Scanbarkeit: in der Liste **Total/Assigned/Rest** sichtbar + Split‑Badges/Progress.

### 1.3 Non‑Goals (MVP)
- Echte OCR/PDF Extraktion (nur UI‑Hooks + Draft‑Struktur).
- Beleg‑Attachments.
- Komplexe Splits mit eigener Zahlungsquelle pro Child (optional später).

---

## 2. Terminologie
| Begriff | Bedeutung |
|---|---|
| Transaction (Buchung) | Persistierte Geldbewegung. |
| Draft (Entwurf) | Noch nicht persistiert (Queue/Import), muss finalisiert werden. |
| Parent | Hauptbuchung (optional mit Children). |
| Child | Teilbuchung (Transaction mit `parentTransactionId`). |
| Zahlungsquelle | `isFromSharedAccount`: true=Gemeinschaftskonto, false=privat/extern. |
| Bezahlt von | `paidByMemberId` oder `externalName` (Pflicht bei Privat). |
| Hybrid Parent | Parent zählt normal solange Rest ≠ 0 oder keine Children; bei Rest=0 Container-only. |

---

## 3. Datenmodell

### 3.1 Transaction (persistiert)
**Erweiterungen:** `title` (Pflicht), `parentTransactionId` (optional, für Splits).

| Feld | Typ | Pflicht | Regeln / Hinweise |
|---|---|---:|---|
| accountId | string | ✓ | |
| date | string (ISO 8601) | ✓ | Anzeige lokal, Speicherung ISO (UTC empfohlen) |
| amountMinor | int | ✓ | Minor Units; negativ=Ausgabe, positiv=Einnahme |
| categoryId | string | ✓ | |
| isFromSharedAccount | boolean | ✓ | Zahlungsquelle |
| paidByMemberId | string\|null | bedingt | XOR mit externalName wenn Privat |
| externalName | string\|null | bedingt | XOR mit paidByMemberId wenn Privat |
| title | string | ✓ | 2..80 Zeichen empfohlen |
| notes | string\|null | – | 0..1000 Zeichen |
| parentTransactionId | string\|null | – | gesetzt ⇒ Transaction ist Child |

**Paid‑By Regel (XOR):**
- Wenn `isFromSharedAccount = false` → genau **eins** von `paidByMemberId` oder `externalName` ist Pflicht.
- Wenn `isFromSharedAccount = true` → optional, aber falls gesetzt: weiterhin nicht beide gleichzeitig.

### 3.2 TransactionDraft (Queue / Import)
Drafts enthalten Transaction‑Felder **optional** + Status/Metadaten.
- `status`: `draft | needsReview | ready | saving | error`
- `source`: `manual | ocr | pdf | paste`
- optional: `confidence` (0..1 pro Feld), `rawText`, `warnings[]`
- Drafts können auch `parentTransactionId` tragen (Teilbuchung in Queue).

---

## 4. Split‑ und Hybrid‑Logik (Single Source of Truth)

### 4.1 Berechnungen (pro Parent)
- `total = parent.amountMinor`
- `assigned = Sum(children.amountMinor)`
- `rest = total - assigned`
- `splitCount = children.length`
- `completion = clamp(abs(assigned) / max(1, abs(total)))`

### 4.2 Aggregationsregel für Charts (keine Doppelzählung)
- Children zählen **immer** voll in ihrer Kategorie.
- Parent zählt **nur** `rest` in Parent‑Kategorie.
- Keine Children ⇒ `rest = total` (Parent zählt voll).
- Children vorhanden & `rest = 0` ⇒ Parent ist **Container-only** (effective=0).

### 4.3 Split‑Constraints
- `abs(assigned)` darf `abs(total)` nicht überschreiten.
- Wenn Parent‑Betrag geändert wird: Speichern blockieren, wenn danach `abs(assigned) > abs(total)`.

---

## 5. UI – Desktop

### 5.1 Layout
- Toolbar oben (Suche, Filter, CTA).
- Mitte: `p-splitter` (links Liste, rechts Detail‑Editor).
- Unten: Capture‑Dock (einklappbar).

### 5.2 Toolbar / Filter / Chips
- Suche (q): `title`, `notes`, `externalName` (optional auch Children).
- Zeitraum: `p-calendar` range.
- Kategorie: `p-multiSelect`.
- Quelle: `p-dropdown` (All/Shared/Privat).
- Bezahlt von: `p-dropdown` (All + Member + Extern).
- Aktive Filter als Chips (entfernbar) + Reset.

### 5.3 Liste: Parent/Child inline (rowExpansion)
- `p-table` zeigt Parents als Zeilen.
- RowExpansion Template rendert Children eingerückt darunter.

**Parent‑Zeile zeigt:**
- Chevron (nur wenn `splitCount > 0`)
- Total prominent
- Badges: `Split: n`, `Assigned`, `Rest`, optional `Container`
- optional Progressbar (completion)

**Child‑Zeilen (eingerückt):**
- Titel, Kategorie, Betrag (Datum optional)
- klare visuelle Hierarchie (heller, kleiner)

**Row Actions:**
- Parent: `Aufteilen / +Teil`, Edit, Delete
- Child: Edit, Delete

### 5.4 Detail‑Editor (rechts)
Felder:
- Betrag, Datum, Kategorie (Rest‑Anteil), Quelle, Bezahlt von (bedingt), `title` (Pflicht), `notes` (optional)

Zusatz:
- Parent mit Children: Split‑Panel (Total/Assigned/Rest) + Children Liste + `+ Teil hinzufügen`
- Child: Info „Teil von: <Parent>“ + Jump‑to‑Parent

---

## 6. Capture‑Dock (Batch optional, schnell)

### 6.1 Verhalten
- Default: zugeklappt (Tab „Capture (n)“).
- Öffnen: Fokus in Betrag, Keyboard‑Flow: Tab/Enter/Shift+Enter.

### 6.2 Quick Add – Pflichtfelder & Defaults
Pflicht:
- `amount`, `category`, `title`, `source`
- `paidBy` nur wenn Privat

Defaults:
- `date=heute`, `source=letzte Wahl`, `category=letzte Wahl`, `paidByMode=letzte Wahl`

Buttons:
- **In Queue**
- **Direkt speichern**

Keyboard:
- `Enter` → In Queue
- `Shift+Enter` → In Queue + Reset + Fokus Betrag
- `Ctrl+S` → Alle speichern
- `Esc` → Clear

### 6.3 Split Quick Add (Teilbuchung)
- Modus Toggle: `Normal | Teil`
- Teil‑Modus zeigt: **Teil von** (`p-autoComplete` auf Parents)
- Zeigt Rest verfügbar; Betrag validiert gegen Rest
- Teil‑Defaults erben vom Parent (`date/source/paidBy`) (Konfig: date editierbar ja/nein)

### 6.4 Queue / Drafts
- Status: `READY`, `REVIEW`, `ERROR`
- Click Draft → Editor rechts (Review Mode)
- Remove Draft + Undo
- **Alle speichern** speichert nur READY; REVIEW bleibt; ERROR → Retry

### 6.5 Import Hooks (MVP)
- Buttons: OCR / PDF / Paste → erzeugen Drafts (Stub)
- Drafts mit confidence/warnings → REVIEW Mode

---

## 7. UX Flows

### 7.1 Normal erfassen
1. Dock öffnen → Normal Modus → Felder → Enter (In Queue) oder Direkt speichern  
2. Alle speichern → persist → optimistic update

### 7.2 Parent splitten
1. Parent auswählen → Editor zeigt Split Panel  
2. `+ Teil hinzufügen` oder Dock → Teil Modus mit Parent  
3. Child erstellen → Assigned/Rest aktualisiert; bei Rest=0 Container

### 7.3 Nachträgliche Teilbuchung (Capture)
1. Teil Modus → Parent wählen → Rest sehen  
2. Betrag/Kategorie/Titel → Enter → Draft READY  
3. Alle speichern → Child persistiert → Parent ggf. Container

### 7.4 Edit/Delete Regeln
- Edit Parent amount: block wenn danach `abs(assigned) > abs(total)`
- Delete Parent mit Children: Confirm „Parent + Children löschen“
- Delete Child: Rest steigt, Container kann entfallen
- Undo via Toast

---

## 8. NGXS Architektur (agent‑ready)

### 8.1 State Slices
- **TransactionsState:** entities + ids + total + filters + selectedId + expandedParents
- **DraftsState:** dockOpen + drafts + selectedDraftId + captureMode
- optional **UiPrefsState:** last used defaults pro accountId

### 8.2 Actions (Minimalset)
- Load: `LoadTransactions(filters)`, `SetPage`, `SetSort`
- UI: `SelectTransaction(id)`, `ToggleParentExpanded(parentId)`, `ToggleDock(open?)`, `SetCaptureMode(mode)`
- CRUD optimistic: `CreateTransactionOptimistic`, `PatchTransactionOptimistic`, `DeleteTransactionOptimistic`, `UndoDelete`
- Drafts: `AddDraft`, `UpdateDraft`, `RemoveDraft(+Undo)`, `FinalizeDraft`, `FinalizeAllReady`, `RetryDraft`
- Split helpers: `OpenSplitMode(parentId)`, `CreateChildDraft(parentId, preset)`

### 8.3 Selectors / Computed
- `childrenByParentId`
- `splitMetaByParentId (assigned/rest/completion)`
- `effectiveAmountMinor(tx)`:
  - Child: amount
  - Parent ohne Children: amount
  - Parent mit Children: rest (0=Container)

---

## 9. API

### 9.1 Endpunkte
- `GET /api/transactions` (Filter + Paging + Sort)
- `POST /api/transactions`
- `PATCH /api/transactions/{id}`
- `DELETE /api/transactions/{id}`
- optional: `POST /api/transactions/bulk`

### 9.2 Query Parameter Vorschlag
| Param | Beispiel | Notiz |
|---|---|---|
| accountId | a1 | Pflicht |
| from/to | 2026-10-01 / 2026-10-31 | ISO Konvention festlegen |
| categoryIds | cat1,cat2 | CSV oder multi |
| source | shared/private/all | |
| paidBy | m_tony/external/all | |
| q | aldi | Suche |
| page/pageSize | 1/50 | |
| sort | dateDesc | |

### 9.3 Server Validation
- `amountMinor` int (Minor Units)
- `date` ISO 8601
- `title` Pflicht
- XOR paidBy wenn Privat
- Split constraint: assigned darf total nicht überschreiten

---

## 10. DoD
- `title` Pflichtfeld (UI + API + Validation).
- Expandable Liste mit Split‑Info (Total/Assigned/Rest/Container).
- Hybrid Aggregation: Child immer, Parent nur Rest, Container=0.
- Capture Dock Normal/Teil + Queue + Alle speichern.
- Optimistic + Undo.
- Mobile nutzbar.

---

## 11. Taskliste (Kurz)
1. OpenAPI + Backend Validation (`title`, `parentTransactionId`, split constraint)
2. DB Indexe/Migrationen
3. NGXS TransactionsState + Split Selectors + expandedParents
4. NGXS DraftsState (dock, queue, finalize)
5. UI: Toolbar + rowExpansion Liste + Detail‑Editor
6. Capture: Normal/Teil + Parent Autocomplete + Rest Validation
7. Undo + Error handling
8. Charts: effective amounts
9. Mobile Optimierung
10. Import Buttons (Stub)
