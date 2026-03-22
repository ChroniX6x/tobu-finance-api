# ToBu Finance – Buchungen & Capture-Konzept (Variante C)
**Stand:** 2026-02-26 (inkl. finaler Backend-Contract-Entscheidungen + FE-Ist-Stand-Abgleich)  
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
- Pflichtfeld: **`title`** (2..80 Zeichen). `notes` optional.
- **`amountMinor` immer ≥ 0**, Vorzeichen kommt aus `type` (`income` / `expense`).
- **`externalName` entfällt** (MVP). „Bezahlt von" = nur `paidByMemberId` (Pflicht bei Privat).
- **Zwei getrennte Status-Systeme:** Backend (`pending|booked`) vs. Frontend-Draft (`draft|needsReview|ready|saving|error`).

**Präzisierung Ist-Stand (Frontend, 2026-02-26):**
- Toolbar, Liste (inkl. Parent/Child rowExpansion) und Detail-Editor sind umgesetzt.
- Capture-Dock ist als einklappbarer Container vorhanden, Quick-Add/Queue-UI ist noch nicht final implementiert.

**Konzeptrelevante Präzisierungen aus der Umsetzung (ohne reine Bug-Themen):**
- **ID-Konvention:** Für Transactions und Categories ist die kanonische Kennung im System `'_id'` (MongoDB), nicht `'id'`.
- **Kategorie-Filter:** „Nicht kategorisiert" ist ein expliziter Filterfall und bleibt konzeptionell als eigene Option erhalten.
- **API-Filtervertrag Kategorien:** Multi-Value wird als `categoryIds[]` übertragen; „Nicht kategorisiert" wird über den Marker `__UNCATEGORIZED__` repräsentiert.

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
| Draft (Entwurf) | Noch nicht persistiert (Queue/Import), muss finalisiert werden. Lebt nur im FE-State. |
| Parent | Hauptbuchung (optional mit Children). `parentTransactionId` ist null. |
| Child | Teilbuchung (Transaction mit gesetztem `parentTransactionId`). Max. Tiefe: 1. |
| Zahlungsquelle | `isFromSharedAccount`: true = Gemeinschaftskonto, false = privat. |
| Bezahlt von | `paidByMemberId` – Pflicht wenn `isFromSharedAccount=false`. |
| Hybrid Parent | Parent zählt normal solange Rest ≠ 0 oder keine Children; bei Rest=0 Container-only. |
| signedAmountMinor | View-only Wert für Charts: `type=expense ? -effectiveAmountMinor : +effectiveAmountMinor`. Nicht persistiert. Wird als NGXS-Selector berechnet — nie direkt aus `amountMinor`. |

---

## 3. Datenmodell

### 3.1 Transaction (persistiert)

| Feld | Typ | Pflicht | Regeln / Hinweise |
|---|---|---:|---|
| accountId | ObjectId | ✓ | |
| type | `income\|expense` | ✓ | Vorzeichen für Charts; `amountMinor` selbst immer ≥ 0 |
| amountMinor | int | ✓ | Minor Units, immer ≥ 0 |
| status | `pending\|booked` | ✓ | default: `pending` |
| bookDate | string (ISO 8601) | bedingt | Pflicht wenn `status=booked`. UI-Datum. |
| month | Date (UTC) | ✓ | **Immer gesetzt, nie null.** Derived von `bookDate` (wenn gesetzt), sonst vom Client als `YYYY-MM`. Format: `YYYY-MM-01T00:00:00.000Z`. |
| title | string | ✓ | 2..80 Zeichen |
| notes | string\|null | – | 0..1000 Zeichen |
| categoryId | ObjectId\|null | – | Optional. null = „Nicht kategorisiert" |
| isFromSharedAccount | boolean | ✓ | default: `true`. true = Gemeinschaftskonto, false = privat |
| paidByMemberId | ObjectId\|null | bedingt | Pflicht wenn `isFromSharedAccount=false` |
| parentTransactionId | ObjectId\|null | – | Gesetzt ⇒ Transaction ist Child. Max. Tiefe: 1. |
| recurrenceId | ObjectId\|null | – | Verknüpfung zur Recurrence |

**bookDate / month Regeln:**
- `status=booked` → `bookDate` required → `month` wird serverseitig aus `bookDate` abgeleitet.
- `status=pending` + `bookDate` gesetzt → `month` wird ebenfalls abgeleitet.
- `status=pending` + `bookDate=null` → `month` wird vom Client mitgegeben (Format `YYYY-MM`).
- PATCH `bookDate → null` während `status=booked` → 422 (blockiert).
- PATCH `bookDate → null` + gleichzeitig `status=pending` → erlaubt; `month` bleibt unverändert.
- PATCH `bookDate → neuer Wert` → `month` wird serverseitig überschrieben.

**Paid‑By Regel:**
- `isFromSharedAccount=false` → `paidByMemberId` required.
- `isFromSharedAccount=true` → `paidByMemberId` optional.

### 3.2 Child-Felder (geerbt vom Parent)

Beim Erstellen eines Childs setzt der Server folgende Felder automatisch aus dem Parent (Client-Werte werden ignoriert / führen zu 422):

| Feld | Verhalten |
|---|---|
| `type` | Vom Parent geerbt, via Client nicht setzbar |
| `isFromSharedAccount` | Vom Parent geerbt, nicht änderbar |
| `paidByMemberId` | Vom Parent geerbt, nicht änderbar |
| `status` | Vom Parent geerbt; Parent-Status-Wechsel cascaded zu Children |
| `bookDate` | Vom Parent geerbt; Parent-bookDate-Änderung cascaded zu Children |
| `month` | Vom Parent geerbt (derived); cascaded bei Parent-Änderung |

**Child-PATCH blockiert Änderungen an:** `type`, `isFromSharedAccount`, `paidByMemberId`.  
**Parent-PATCH mit type/status/bookDate cascaded** automatisch zu allen direkten Children.

### 3.3 TransactionDraft (Queue / Import, nur FE-State)

Drafts sind **nie persistierte Transactions** – sie leben nur im FE-State (NGXS DraftsState) und werden bei Finalize als `booked` Transaction persistiert.

**Draft-Status (kanonisch, camelCase):**
| Status | Bedeutung |
|---|---|
| `draft` | Nutzer tippt, kein Vollständigkeitscheck |
| `needsReview` | Pflichtfelder fehlen oder Import mit niedriger Confidence |
| `ready` | Alle Pflichtfelder für `booked` erfüllt → Finalize erlaubt |
| `saving` | POST/bulk läuft gerade |
| `error` | Backend- oder Netzwerkfehler; Retry möglich |

**Draft → Transaction (Finalize-Regel):**
- Nur `ready`-Drafts dürfen finalisiert werden.
- Finalize erzeugt Transaction mit `status=booked`.
- `needsReview`-Drafts bleiben in der Queue bis manuell bearbeitet.

**Draft-Readiness-Check (FE = booked-Validation BE):**
Ein Draft gilt als `ready` wenn:
- `amountMinor` gesetzt (int ≥ 0) und `type` gesetzt
- `title` gesetzt (2..80)
- `isFromSharedAccount` gesetzt (boolean)
- Wenn `isFromSharedAccount=false` → `paidByMemberId` gesetzt
- `bookDate` gesetzt (ISO) — wird als heute defaulted wenn Nutzer kein Datum ändert
- `accountId` gesetzt
- Wenn `parentTransactionId` gesetzt: Parent geladen + `amountMinor ≤ parent.rest`

**Draft-Felder optional (kein Block für `ready`):** `categoryId`, `notes`.

Draft-Metadaten:
- `source`: `manual | ocr | pdf | paste`
- optional: `confidence` (0..1 pro Feld), `rawText`, `warnings[]`

---

## 4. Split‑ und Hybrid‑Logik (Single Source of Truth)

### 4.1 Berechnungen (pro Parent)
- `total = parent.amountMinor`
- `assigned = sum(children.amountMinor)`
- `rest = total - assigned`
- `splitCount = children.length`
- `completion = assigned / max(1, total)` (immer 0..1, da `assigned <= total` garantiert)

> `amountMinor` ist immer ≥ 0 und Children haben denselben `type` wie der Parent → kein `abs()` nötig.

### 4.2 Aggregationsregel für Charts (keine Doppelzählung)
- `signedAmountMinor = type=expense ? -effectiveAmountMinor : +effectiveAmountMinor` (immer über `effectiveAmountMinor`, nicht direkt über `amountMinor`)
- Children zählen **immer** voll: `effectiveAmountMinor = amountMinor`
- Parent zählt **nur** `rest` in Parent‑Kategorie: `effectiveAmountMinor = rest`
- Keine Children ⇒ `rest = total` (Parent zählt voll).
- Children vorhanden & `rest = 0` ⇒ Parent ist **Container-only** (effectiveAmountMinor = 0, zählt nicht in Charts).

### 4.3 Split‑Constraints
- `sum(children.amountMinor) <= parent.amountMinor` (kein `abs()` nötig, alle Werte ≥ 0).
- Wenn Parent‑Betrag geändert wird: blockieren wenn `sum(children) > newParentAmount`.
- Wenn Child‑Betrag geändert wird (PATCH): `(sum(allChildren) − oldChildAmount + newChildAmount) <= parent.amountMinor`.
- Eine Child-Transaktion darf selbst keine Children haben (**max. Tiefe: 1**).
- Server prüft beim Child-Create: Parent muss `parentTransactionId = null` haben.

### 4.4 Cascade-Regeln (Parent → Children)
Bei PATCH eines Parents cascaded der Server automatisch:

| Parent-Feld geändert | Cascade auf Children |
|---|---|
| `type` | `type` wird auf alle Children gesetzt |
| `status` | `status` wird auf alle Children gesetzt |
| `bookDate` | `bookDate` + `month` werden auf alle Children gesetzt |

### 4.5 Delete-Regeln
- **Delete Child**: Optimistisch + Undo-Toast. Nur das Child; `rest` des Parents steigt; Container-Zustand kann entfallen.
- **Delete Parent ohne Children**: Optimistisch + Undo-Toast.
- **Delete Parent mit Children**: Confirm-Dialog „Parent + {n} Teiltransaktionen löschen" → **kein Optimistic**, Spinner → Erfolgs-/Fehler-Toast. Kein Undo erforderlich (State war nicht verändert).
  - Server: Children zuerst (`deleteMany`), dann Parent (`deleteOne`) — best-effort ohne Mongo-Session.
- Kein Soft-Delete im MVP.

---

## 5. UI – Desktop

### 5.1 Layout
- Toolbar oben (Suche, Filter, CTA).
- Mitte: `p-splitter` (links Liste, rechts Detail‑Editor).
- Unten: Capture‑Dock (einklappbar).

### 5.2 Toolbar / Filter / Chips
- Suche (q) — **Phase 1:** sucht nur in Parents (`title`, `notes`). Children erscheinen nie als isoliertes Suchergebnis.  
  **Phase 2:** sucht auch in Children; Treffer-Parents werden automatisch expanded (Backend liefert `_hasMatchingChild: true` in der Response).
- Kein `externalName` (entfällt im MVP).
- Zeitraum: `p-calendar` range.
- Kategorie: `p-multiSelect`.
- Kategorie enthält zusätzlich die Option **„Nicht kategorisiert"**.
- Quelle: `p-dropdown` (All/Shared/Privat).
- Bezahlt von: `p-dropdown` (All + Members). Kein „Extern"-Eintrag; `externalName` entfällt im MVP.
- Aktive Filter als Chips (entfernbar) + Reset.

**Ist-Stand FE (präzise):**
- UI-Elemente für `q`, Zeitraum, Kategorien, Quelle und Bezahlt-von sind vorhanden.
- Im aktuellen FE-Request werden sicher gesendet: `accountId`, `monthFrom`, `monthTo`, `categoryIds[]`, `status`, `page`, `pageSize`, `sort`.
- `q`, `source`, `paidBy` sind im UI vorhanden, aber noch nicht durchgängig als API-Query verdrahtet.

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

**Ist-Stand FE (präzise):**
- Parent-Action `Aufteilen/+Teil` legt bereits einen Split-Draft an (`captureMode='split'`) und öffnet das Dock.
- Delete ist umgesetzt mit zwei Pfaden:
  - Parent ohne Children / Child: optimistisch + Undo
  - Parent mit Children: Confirm + API-Delete + anschließendes State-Cleanup
- `expandedParents` ist im State vorhanden, die Tabellen-Expansion wird aktuell primär über das Table-Expansion-Verhalten geführt.

### 5.4 Detail‑Editor (rechts)
Felder:
- Betrag, Datum, Kategorie (Rest‑Anteil), Quelle, Bezahlt von (bedingt), `title` (Pflicht), `notes` (optional)

Zusatz:
- Parent mit Children: Split‑Panel (Total/Assigned/Rest) + Children Liste + `+ Teil hinzufügen`
- Child: Info „Teil von: <Parent>“ + Jump‑to‑Parent

**Ist-Stand FE (präzise):**
- Form ist als Reactive Form umgesetzt und speichert per `PatchTransactionOptimistic`.
- Child-ReadOnly für geerbte Felder (`type`, `isFromSharedAccount`, `paidByMemberId`, `bookDate`) ist umgesetzt.
- Status-Feld (`pending/booked`) ist im Editor aktuell editierbar.

---

## 6. Capture‑Dock (Batch optional, schnell)

### 6.1 Verhalten
- Default: zugeklappt (Tab „Capture (n)“).
- Öffnen: Fokus in Betrag, Keyboard‑Flow: Tab/Enter/Shift+Enter.

**Ist-Stand FE (präzise):**
- Dock-Toggle, Draft-Counter und Mode-Toggle (`Normal | Teil`) sind umgesetzt.
- Quick-Add (Normal/Teil), Queue-Liste, Status-Badges, „Alle speichern", „Fehler erneut" und „Entfernen rückgängig" sind im Dock umgesetzt.

### 6.2 Quick Add – Pflichtfelder & Defaults
Pflicht:
- `amount` (immer ≥ 0)
- `type` — Toggle/Segmented Button `Ausgabe | Einnahme` (`expense | income`)
- `title`, `source`
- `paidBy` nur wenn Privat

Optional:
- `category` — nie Pflichtfeld; null = „Nicht kategorisiert"

Defaults:
- `date=heute`, `source=letzte Wahl`, `category=letzte Wahl`, `paidByMode=letzte Wahl`

Buttons:
- **In Queue**
- **Direkt speichern**

> **`pending`-Transaktionen:** Das Capture Dock erzeugt ausschließlich `status=booked`-Buchungen (Finalize-Regel). Wer eine Buchung als `pending` anlegen will, nutzt „+ Neue Buchung" → öffnet den Detail-Editor direkt mit Status-Toggle `pending / booked`.

Keyboard:
- `Enter` → In Queue
- `Shift+Enter` → In Queue + Reset + Fokus Betrag
- `Ctrl+S` → Alle speichern
- `Esc` → Clear

**Ist-Stand FE (präzise):**
- Shortcuts sind im geöffneten Dock umgesetzt.
- `Enter`/`Shift+Enter`/`Esc` greifen bei Fokus innerhalb des Docks; `Ctrl+S` triggert „Alle speichern" solange das Dock geöffnet ist.

### 6.3 Split Quick Add (Teilbuchung)
- Modus Toggle: `Normal | Teil`
- Teil‑Modus zeigt: **Teil von** (`p-autoComplete`, sucht server-seitig via `GET /api/transactions?accountId=x&parentTransactionId=null&q=<input>`; debounced; schlanke Projektion `{ _id, title, amountMinor, rest }` in der Response genügt; unabhängig von der Listenpaginierung)
- Zeigt Rest verfügbar; Betrag validiert gegen Rest (`assigned <= total`, kein `abs()`)
- Child erbt vom Parent (serverseitig gesetzt; UI zeigt als „geerbt/gesperrt" an): `type`, `isFromSharedAccount`, `paidByMemberId`, `status`, `bookDate`, `month`
- UI-Felder `Quelle`, `Bezahlt von` und `Datum` sind bei Child-Drafts read-only (Wert aus Parent anzeigen)

**Ist-Stand FE (präzise):**
- Parent-Autocomplete ist verdrahtet (`q` + `parentTransactionId=null`), Rest wird aus embedded Children berechnet.
- Betrag wird gegen Rest validiert; bei Split sind `Typ`, `Quelle`, `Bezahlt von`, `Datum` im Quick-Add gesperrt und werden aus dem Parent übernommen.

### 6.4 Queue / Drafts
- Draft-Status (kanonisch camelCase): `draft` | `needsReview` | `ready` | `saving` | `error`
- Click Draft → Editor rechts (Review Mode)
- Remove Draft + Undo
- **Alle speichern** speichert nur `ready`-Drafts sequenziell (POST je Draft); `needsReview` bleibt; `error` → Retry
- UI-Labels dürfen lokalisiert sein (z. B. „Bereit" / „Prüfen" / „Fehler"), kanonische State-Werte bleiben englisch camelCase

**Ist-Stand FE (präzise):**
- Queue zeigt alle Drafts mit lokalisierten Status-Labels und Aktionen (Einzelspeichern bei `ready`, Entfernen, Retry, Save-All).
- „Click Draft → Editor rechts" ist weiterhin optional; aktuell wird primär die Draft-Selektion im Capture-State gesetzt.

### 6.5 Import Hooks (MVP)
- Buttons: OCR / PDF / Paste → erzeugen Drafts (Stub)
- Drafts mit confidence/warnings → `needsReview`-Mode

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
2. Betrag/Kategorie/Titel → Enter → Draft `ready`  
3. Alle speichern → Child persistiert → Parent ggf. Container

### 7.4 Edit/Delete Regeln
- Edit Parent amount: blockieren wenn danach `assigned > total` (kein `abs()` nötig, alle Beträge ≥ 0)
- Delete Child: Optimistisch. Rest steigt, Container kann entfallen. Undo via Toast.
- Delete Parent ohne Children: Optimistisch. Undo via Toast.
- Delete Parent mit Children: Confirm-Dialog „Parent + {n} Teiltransaktionen löschen". Kein Optimistic. Spinner → Erfolgs-/Fehler-Toast. Kein Undo.

---

## 8. NGXS Architektur (agent‑ready)

### 8.1 State Slices
- **TransactionsState:** entities + ids + total + filters + selectedId + expandedParents (`expandedParents` bleibt in TransactionsState — gleiche Lifetime wie die Liste, kein separater UiState nötig)
- **DraftsState:** dockOpen + drafts + selectedDraftId + captureMode
- **kein UiPrefsState:** Letzte-Wahl-Defaults (`lastCategoryId`, `lastSource`, `lastPaidByMode`) werden per `UiPrefsService` in `localStorage` persistiert (Key-Schema: `tobu.prefs.{accountId}.*`). Kein NGXS-Overhead für reine UI-Preferences.

**Ist-Stand FE (Namensmapping):**
- `TransactionsState` entspricht aktuell `TransactionPageState`.
- `DraftsState` entspricht aktuell `TransactionCaptureState`.
- `UiPrefsService`-Persistenz ist konzeptionell vorgesehen, aktuell noch nicht als eigener produktiver Flow umgesetzt.

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
- `signedAmountMinor(tx)`: Pure Selector auf Basis von `effectiveAmountMinor` + `type`.  
  `type=expense ? -effectiveAmountMinor : +effectiveAmountMinor`.  
  Charts und Aggregationen konsumieren **ausschließlich diesen Selector** — nie rohe `amountMinor`-Werte direkt aus dem State.

---

## 9. API

### 9.1 Endpunkte
- `GET /api/transactions` (Filter + Paging + Sort; Phase 1 liefert Parents mit embedded Children)
- `POST /api/transactions`
- `PATCH /api/transactions/{id}`
- `DELETE /api/transactions/{id}`

### 9.2 Query Parameter

**Phase 1 (implementiert):**
| Param | Beispiel | Notiz |
|---|---|---|
| `accountId` | `abc123` | **Pflicht** |
| `monthFrom` | `2026-01` | Format `YYYY-MM`; filtert `month >=` |
| `monthTo` | `2026-03` | Format `YYYY-MM`; filtert `month <=` |
| `categoryIds[]` | `categoryIds[]=<id>&categoryIds[]=<id2>` | Mehrfachfilter Kategorie (Array-Notation). Enthält optional `__UNCATEGORIZED__` für „Nicht kategorisiert". |
| `status` | `pending` | Einzelwert: `pending\|booked` |
| `page` | `1` | 1-basiert |
| `pageSize` | `50` | max. 200 |
| `sort` | `bookDateDesc` | `bookDateDesc\|bookDateAsc\|amountDesc\|amountAsc` |

**Ist-Stand FE-Client (präzise):**
- `TransactionsApiService.getTransactions(...)` sendet derzeit: `accountId`, `monthFrom`, `monthTo`, `categoryIds[]`, `status`, `page`, `pageSize`, `sort`.
- `q` und `parentTransactionId` sind konzeptionell als Phase-1-Filter definiert, aber im aktuellen FE-Service noch nicht vollständig verdrahtet.

Antwort: `{ items: Transaction[], total: number, page: number, pageSize: number }`

> **`total`** zählt ausschließlich **Parents** (keine Children). Children sind embedded und zählen nicht gegen `total` oder die Paginierung.

> **Children embedded:** Jeder Parent in `items` enthält `children: Transaction[]` mit seinen direkten Children (leeres Array wenn keine vorhanden). Children erscheinen **nicht** als eigene Top-Level-Einträge in `items`. Kein separater Lazy-Load pro Zeile.

**Phase 1 – Zusätzliche Filter (für Autocomplete-Usecase):**
| Param | Beispiel | Notiz |
|---|---|---|
| `parentTransactionId` | `null` | `"null"` (String) = nur Parents zurückgeben; Omission hat denselben Effekt |
| `q` | `Edeka` | Suche in `title` + `notes` (Parents); min. 1, max. 200 Zeichen |

> **Autocomplete-Pattern:** `GET /api/transactions?accountId=x&parentTransactionId=null&q=<input>` — liefert `TransactionWithChildren`-Objekte. Das FE berechnet `rest = amountMinor − sum(children.map(c => c.amountMinor))` direkt aus den embedded Children und zeigt es als „Rest verfügbar" an. Kein separater `rest`-Feld im Response nötig.

> **Sonderfall „Nicht kategorisiert" im API-Filter:**
> - `categoryIds[]=__UNCATEGORIZED__` → nur Transactions mit `categoryId = null`
> - gemischt (`categoryIds[]=__UNCATEGORIZED__` + echte Category-IDs) → Union aus `categoryId = null` **oder** den angegebenen Kategorien
> - nur echte Category-IDs → normales Kategorie-`IN`-Filtering

**Phase 2 (geplant, noch nicht implementiert):**
| Param | Notiz |
|---|---|
| `from` / `to` | ISO Date Range |
| `categoryIds` | CSV oder Multi-Value |
| `source` | `shared\|private\|all` |
| `paidBy` | Member-ID oder `all` |
| `q` | Volltextsuche inkl. Children; Treffer-Parents erhalten `_hasMatchingChild: true` → Frontend expandiert diese Rows automatisch |

### 9.3 Server Validation
- `amountMinor`: int ≥ 0 (Minor Units)
- `type`: `income | expense` (Pflicht)
- `title`: Pflicht, 2..80 Zeichen
- `bookDate`: ISO 8601; Pflicht wenn `status=booked`
- `month`: Pflicht; wird vom Server aus `bookDate` abgeleitet wenn `bookDate` gesetzt, sonst Format `YYYY-MM` vom Client
- `isFromSharedAccount=false` → `paidByMemberId` Pflicht (kein `externalName` im MVP)
- Split constraint: `sum(children.amountMinor) <= parent.amountMinor` (kein `abs()` nötig)
- Child-Create: Parent darf kein Child sein (`parentTransactionId` des Parents muss null sein)
- Child-PATCH: Änderungen an `type`, `isFromSharedAccount`, `paidByMemberId` werden mit 422 abgelehnt

---

## 10. DoD
- `title` Pflichtfeld (UI + API + Validation). ✅ BE fertig.
- `amountMinor` immer ≥ 0; `type` steuert Vorzeichen. ✅ BE fertig.
- `bookDate` + `month` korrekt: `month` immer gesetzt, cascaded auf Children. ✅ BE fertig.
- Split constraint ohne `abs()` (alle Beträge ≥ 0). ✅ BE fertig.
- Max. Split-Tiefe: 1 (Children können keine Children haben). ✅ BE fertig.
- Cascade: Parent type/status/bookDate wirkt auf alle direkten Children. ✅ BE fertig.
- GET `/api/transactions` liefert Parents mit embedded `children: Transaction[]`; `q` + `parentTransactionId` als Phase-1-Filter. ✅ BE fertig, FE-Query-Verdrahtung für `q`/`parentTransactionId` noch offen.
- Expandable Liste mit Split‑Info (Total/Assigned/Rest/Container).
- Hybrid Aggregation: Child immer voll, Parent nur Rest (signed via `signedAmountMinor`), Container=0.
- Capture Dock Normal/Teil + Queue + Alle speichern (sequenziell POST) — State/Actions vorhanden, UI noch nicht end-to-end fertig.
- Draft-Status `draft|needsReview|ready|saving|error` (FE-only, nicht persistiert).
- Optimistic + Undo.
- Mobile nutzbar.

---

## 11. Taskliste (Kurz)
1. ✅ OpenAPI + Backend Validation (`title`, `bookDate/month`, `type`, `parentTransactionId`, split constraint, cascade) — **Phase 0 abgeschlossen**
2. ✅ DB Indexe/Migrationen (Migration `20260224_transactions_phase0`) — **Phase 0 abgeschlossen**
2a. ✅ GET Children embedded (`children: Transaction[]` pro Parent-Item); `q` + `parentTransactionId` als Phase-1-Filter — **Phase 0.5 abgeschlossen**
3. NGXS TransactionsState + Split Selectors + expandedParents
4. NGXS DraftsState (dock, queue, finalize mit Draft-Status `draft|needsReview|ready|saving|error`)
5. UI: Toolbar + rowExpansion Liste + Detail‑Editor
6. Capture: Normal/Teil + Parent Autocomplete + Rest Validation (`assigned <= total`)
7. Undo + Error handling
8. Charts: `signedAmountMinor = type=expense ? -effectiveAmountMinor : +effectiveAmountMinor`; effective amounts (Child voll, Parent nur Rest)
9. Mobile Optimierung
10. Import Buttons (Stub)
