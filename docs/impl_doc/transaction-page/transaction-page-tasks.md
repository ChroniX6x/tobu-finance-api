# Taskliste – Buchungen (Variante C) inkl. Capture-Dock + Splits + Hybrid Parent

## Phase 0 – Vorbereitung & Contract ✅ ABGESCHLOSSEN

1. **✅ OpenAPI / Backend Contract aktualisieren** *(Phase 0 abgeschlossen)*

* `Transaction` um Felder erweitert: `title` (required), `notes` (optional), `parentTransactionId` (optional), `type` (required: `income|expense`), `status` (required: `pending|booked`), `bookDate` (bedingt), `month` (immer required), `isFromSharedAccount` (required, default `true`).
* `amountMinor` immer >= 0; Vorzeichen kommt aus `type` (kein negatives Vorzeichen).
* `externalName` entfällt im MVP.
* Validierungsregeln implementiert:

  * `amountMinor` int >= 0
  * `bookDate` ISO 8601; Pflicht wenn `status=booked`
  * `month` Pflicht; serverseitig aus `bookDate` abgeleitet wenn gesetzt, sonst `YYYY-MM` vom Client
  * `isFromSharedAccount=false` → `paidByMemberId` Pflicht (kein `externalName`)
  * Child-Create: Parent muss `parentTransactionId=null` sein (max. Tiefe: 1)
  * Split-Constraint: `sum(children.amountMinor) <= parent.amountMinor` (kein abs())
  * Child-PATCH blockiert Änderungen an `type`, `isFromSharedAccount`, `paidByMemberId`
  * Parent-PATCH cascaded `type/status/bookDate` auf alle direkten Children
    **Deliverable:** ✅ aktualisiertes `openapi.yaml` + serverseitige Validation + Events.

2. **✅ DB / Schema Anpassungen** *(Phase 0 abgeschlossen – Migration `20260224_transactions_phase0`)*

* Mongo-Indexe erstellt:

  * `{ accountId: 1, bookDate: -1 }` (ersetzt alten `date`-Index)
  * `{ accountId: 1, parentTransactionId: 1 }`
  * `{ parentTransactionId: 1 }`
* Felder migriert: `title` (backfill), `notes`, `parentTransactionId`, `isFromSharedAccount`, `month` re-derived.
* Events-Validator auf `EVENT_CODES_V2` aktualisiert (inkl. `splitChildCreated`, `splitChildDeleted`).
    **Deliverable:** ✅ Migration `20260224_transactions_phase0.ts` (up+down getestet).

---

## Phase 1 – Datenlayer & NGXS

3. **🟡 API Client / Service** *(weitgehend umgesetzt, FE-Query-Verdrahtung offen)*

* `TransactionsApiService`:

  * `getTransactions(filters)` — Phase-1-Filter: `accountId` (required), `monthFrom/monthTo`, `status`, `page/pageSize`, `sort`, `q` (optional), `parentTransactionId` (optional, `"null"` für Autocomplete). Response: `{ items: TransactionWithChildren[], total, page, pageSize }` — jeder Parent enthält `children: Transaction[]` (leer wenn keine vorhanden).
  * Autocomplete-Pattern: `getTransactions({ accountId, parentTransactionId: "null", q })` — FE berechnet `rest = item.amountMinor − sum(item.children.map(c => c.amountMinor))` aus dem Response.
  * `createTransaction(dto)`
  * `patchTransaction(id, patch)`
  * `deleteTransaction(id)`
  * ~~`bulkCreate(dtos)`~~ — entfällt im MVP; „Alle speichern" läuft als sequenzielle POSTs
  * **Ist-Stand FE:** aktuell sind im Service sicher verdrahtet `accountId`, `monthFrom`, `monthTo`, `categoryIds[]`, `status`, `page`, `pageSize`, `sort`; `q` und `parentTransactionId` sind noch nachzuziehen.
  * **Soll:** Vollständige Phase-1-Filterverdrahtung (`q`, `parentTransactionId`) im FE-Service.
  * **Gap:** `q` und `parentTransactionId` werden aktuell nicht als Query-Parameter gesetzt.
  * **Next Action:** `getTransactions(...)` um `q` und `parentTransactionId` erweitern; anschließend Search-/Split-Autocomplete-Flow gegen API verifizieren.
    **Deliverable:** Service + Types (+ vollständige Filter-Verdrahtung im FE).

4. **✅ NGXS: TransactionsState Grundgerüst**

* State Model: entities, ids, total, filters, loading/error, selectedId.
* Actions:

  * `LoadTransactions`
  * `SelectTransaction`
  * `CreateTransactionOptimistic`
  * `PatchTransactionOptimistic`
  * `DeleteTransactionOptimistic`
  * `UndoDeleteTransaction`
    **Deliverable:** State + Actions + selectors.

5. **🟡 NGXS: Split-Selectors (Hybrid)** *(Selektoren fertig, Tests offen)*

* Selectors/Computed:

  * `childrenByParentId: Map<parentId, childIds[]>`
  * `splitMetaByParentId: { splitCount, assignedMinor, restMinor, completionRatio }`
  * `effectiveAmountMinor(txId)`:

    * Child: amountMinor
    * Parent ohne Children: amountMinor
    * Parent mit Children: restMinor (0 => Container)
  * `signedAmountMinor(txId)`: Pure Selector; `type=expense ? -effectiveAmountMinor : +effectiveAmountMinor`; Charts und Aggregationen konsumieren **ausschließlich diesen Selector**
* UI-State: `expandedParents: Set<string>` (bleibt in TransactionsState — gleiche Lifetime wie die Liste)

  * Action `ToggleParentExpanded(parentId)`
  * **Soll:** Selektor-Logik testbar abgesichert (Parent ohne Children, Parent mit Rest, Container, Child).
  * **Ist:** Selektoren laufen produktiv, aber ohne dedizierte Unit-Tests.
  * **Gap:** Fehlende Regression-Absicherung bei Refactoring/Chart-Anbindung.
  * **Next Action:** Spec-Datei für `effectiveAmountMinor`/`signedAmountMinor` inkl. 4 Kernfälle ergänzen.
    **Deliverable:** Selector-Set ✅ + Unit Tests für Rechenlogik (offen).

6. **🟡 NGXS: DraftsState (Capture/Queue)** *(State/Aktionen umgesetzt, UI-Anbindung offen)*

* Model: `dockOpen`, `captureMode (normal|split)`, `drafts[]`, `selectedDraftId`.
* Draft-Status (kanonisch camelCase): `draft | needsReview | ready | saving | error`
* Actions:

  * `ToggleDock`
  * `SetCaptureMode`
  * `AddDraft`
  * `UpdateDraft`
  * `RemoveDraft` (+ Undo)
  * `FinalizeDraft`
  * `FinalizeAllReadyDrafts`
  * `RetryFailedDrafts`
* Finalize-Regel:

  * Nur `ready`-Drafts; sequenzielle POSTs (kein Bulk-Endpoint im MVP)
  * Finalize erzeugt Transaction mit `status=booked`
  * `needsReview`-Drafts bleiben, `saving` während POST, `error` bei Fehler
* Draft-Readiness-Check (FE = booked-Validation BE):

  * `amountMinor` int >= 0 + `type` gesetzt
  * `title` gesetzt (2..80)
  * `isFromSharedAccount` gesetzt
  * wenn `isFromSharedAccount=false` → `paidByMemberId` gesetzt
  * `bookDate` gesetzt (default: heute)
  * `accountId` gesetzt
* **Soll:** State-Flow ist vollständig über Dock-UI nutzbar (Add/Update/Finalize/Retry/Undo).
* **Ist:** Actions und Logik sind implementiert, aber Capture-Dock nutzt sie noch nicht vollständig im UI.
* **Gap:** Fehlende End-to-End-Benutzbarkeit der Draft-Pipeline.
* **Next Action:** Dock-UI (Quick Add + Queue) direkt an `AddDraft`, `UpdateDraft`, `FinalizeAllReadyDrafts`, `RetryFailedDrafts` anbinden.
    **Deliverable:** DraftsState + Actions + selectors ✅; vollständige Dock-UI-Anbindung offen.

---

## Phase 2 – UI Skeleton (Desktop-first, Mobile responsive)

7. **✅ Route + Page Shell**

* Route: `/accounts/:accountId/transactions`
* Component: `TransactionsPageComponent`
* Layout: Toolbar + Splitter + Capture Dock (collapsed by default)
  **Deliverable:** Navigierbare Seite.

8. **🟡 Toolbar / Filter UI** *(UI fertig, Filter-Verdrahtung teilweise offen)*

* PrimeNG:

  * Suche `p-inputText` (debounce)
  * `p-calendar` range
  * `p-multiSelect` Kategorien
  * `p-dropdown` Quelle
  * `p-dropdown` Bezahlt von
  * CTA `+ Neue Buchung`
* Filter-Chips (Custom oder `p-chip`) + Reset
* **Ist-Stand FE:** `q`, `Quelle`, `Bezahlt von` sind im UI vorhanden; `q/source/paidBy` sind noch nicht vollständig als API-Query angebunden.
* **Soll:** Alle sichtbaren Filter wirken serverseitig konsistent auf `LoadTransactions`.
* **Gap:** UI und Request-Parameter sind aktuell nicht 1:1 synchron.
* **Next Action:** Filter-Mapping im Toolbar-Dispatch + API-Service angleichen und mit Kombinationsfällen testen (`q+Kategorie+Zeitraum+Quelle+paidBy`).
  **Deliverable:** Filter setzen → `LoadTransactions` + vollständige API-Filterverdrahtung.

9. **✅ Liste: p-table mit rowExpansion**

* Parents in `p-table`
* RowExpansion Template: Children-Liste (eingezogen)
* Parent-Zeile zeigt:

  * Chevron nur wenn `splitCount>0`
  * Badges: SplitCount, Assigned, Rest, Container
  * Optional Mini-Progress (completion)
* Row Actions:

  * Parent: „Aufteilen/+Teil“, Edit, Delete
  * Child: Edit, Delete
    **Deliverable:** Expand/Collapse + korrektes Rendering.
    **Hinweis:** `expandedParents` ist im State vorhanden, derzeit aber nicht als führende Quelle für den Table-Expand-State genutzt.
    **Soll:** Expand-State ist eindeutig (eine Quelle) und paging-/reload-stabil.
    **Gap:** Doppeltes Konzept (`expandedParents` im State vs. table-interner Expand-State).
    **Next Action:** Entscheidung treffen: entweder state-gesteuerte Expansion anbinden oder `expandedParents` aus Scope entfernen.

10. **✅ Detail-Editor (rechts)**

* Reactive Form:

  * amount (inputNumber, immer >= 0)
  * type dropdown (`income | expense`)
  * date/bookDate (calendar; Pflicht für `booked`)
  * category dropdown (optional)
  * source dropdown/segmented (`isFromSharedAccount`)
  * paidBy member dropdown — nur anzeigen wenn `isFromSharedAccount=false` (kein `externalName`)
  * **title** (required, 2..80)
  * notes optional
* Modus:

  * Parent selected → zeigt Split Panel (Total/Assigned/Rest + Children Quick Add)
  * Child selected → zeigt „Teil von" Info + Jump-to-parent; Felder `type`, `source`, `paidBy`, `bookDate` read-only (vom Parent geerbt)
    **Deliverable:** Edit & Save (optimistic) funktioniert.

---

## Phase 3 – Capture Dock (Quick Add + Split)

11. **✅ Capture Dock UI** *(Phase 3 Kern umgesetzt)*

* Collapsible Bottom Panel (desktop) + Bottom-Sheet (mobile)
* Links Quick Add, rechts Queue, unten „Alle speichern“
* Mode Toggle: Normal | Teil
* **Ist-Stand FE:** Dock enthält Quick Add, Queue-Liste, Status-Badges und Footer-Aktionen (`Alle speichern`, `Fehler erneut`, `Entfernen rückgängig`).
* **Shortcuts umgesetzt:** `Enter`, `Shift+Enter`, `Ctrl+S`, `Esc`.
  **Deliverable:** ✅ Dock togglen + vollständige Quick-Add/Queue-UI.

12. **✅ Quick Add – Normal**

* Pflicht: amount, type (Toggle `Ausgabe | Einnahme`), title, source
* paidBy Pflicht nur wenn source=Privat
* category: nie Pflichtfeld; null = „Nicht kategorisiert"
* Buttons:

  * „In Queue“
  * „Direkt speichern“
* Keyboard:

  * Enter → In Queue
  * Shift+Enter → In Queue + Reset + Fokus Betrag
* **Ist-Stand FE:** Formular + Validation + Dispatch für `AddDraft` / `FinalizeDraft` sind umgesetzt.
* **Keyboard:** Enter/Shift+Enter/Ctrl+S/Esc umgesetzt.
  **Deliverable:** ✅ Schnell erfassen funktioniert.

13. **✅ Quick Add – Teilbuchung**

* Zusätzlicher Input: `Teil von` (p-autoComplete) → sucht Parents
* Nach Parent Auswahl:

  * zeigt `Rest verfügbar`
  * child erbt vom Parent (serverseitig): `type`, `isFromSharedAccount`, `paidByMemberId`, `status`, `bookDate`, `month`
  * UI-Felder `Quelle`, `Bezahlt von`, `Datum` als read-only (Wert aus Parent) anzeigen
  * validiert Betrag gegen Rest: `assigned <= total` (kein abs())
* Draft bekommt `parentTransactionId`
* **Ist-Stand FE:** Parent-Autocomplete (`q` + `parentTransactionId=null`) und Rest-Validierung sind im Dock umgesetzt.
* **Ist-Stand FE:** Geerbte Felder im Split-Modus werden aus Parent übernommen und im Quick-Add gesperrt.
  **Deliverable:** ✅ Split-QuickAdd + Rest-Validation.

14. **✅ Queue/Drafts**

* Anzeige nach Draft-Status: `draft` / `needsReview` / `ready` / `saving` / `error`
* UI-Labels lokalisierbar (z.B. „Bereit" / „Prüfen" / „Fehler"), kanonische State-Werte bleiben camelCase
* Remove + Undo
* Click Draft → lädt in Detail-Editor (Review Mode optional)
* `FinalizeAllReadyDrafts`:

  * sequenzielle POSTs (kein Bulk-Endpoint im MVP)
  * partial failures bleiben stehen, mit Retry (`error`-Drafts)
* **Ist-Stand FE:** Queue-Liste mit Status-Badges und Aktionen für `FinalizeAllReadyDrafts`, Einzel-Finalize, `RetryFailedDrafts`, `RemoveDraft` + Undo ist umgesetzt.
* **Hinweis:** Review-Mode-Handover „Click Draft → rechter Detail-Editor" bleibt optional und ist nicht Blocker für Phase 3.
  **Deliverable:** ✅ Queue-Workflow komplett.

---

## Phase 4 – UX Quality & Edge Cases

15. **Undo System (Delete Transaction, Remove Draft)**

* **Delete Child**: Optimistisch + Undo-Toast
* **Delete Parent ohne Children**: Optimistisch + Undo-Toast
* **Delete Parent mit Children**: Confirm-Dialog → non-optimistic (kein Undo nötig); Spinner → Erfolgs-/Fehler-Toast
* **Remove Draft**: Undo-Toast
* Timeout handling (finalize delete)
  **Deliverable:** Undo robust, keine Dateninkonsistenz.

16. **Hybrid Aggregation in Charts**

* **Selectors zuerst:** Unit Tests für `effectiveAmountMinor`- und `signedAmountMinor`-Selector schreiben (alle 4 Fälle: Parent ohne Children, Parent mit Rest, Container, Child) — **vor** jeder Chart-Änderung.
* Account Overview Charts auf `signedAmountMinor`-Selector umstellen (Chart-Komponenten selbst werden nicht verändert):

  * Parent ohne splits → full (signed)
  * Parent mit splits → rest (signed)
  * Container → 0
  * Children → own (signed)
* **Soll:** Charts nutzen ausschließlich den Hybrid-Selector und vermeiden Doppelzählungen robust.
* **Ist:** Selektoren vorhanden; Chart-Umstellung/Tests noch nicht final dokumentiert.
* **Gap:** Risiko von inkonsistenter Aggregation außerhalb der Selektor-Pipeline.
* **Next Action:** Chart-Datenquelle auditen und auf `signedAmountMinor` vereinheitlichen; Tests grünziehen.
    **Deliverable:** Charts korrekt (keine Doppelzählung); Selector Unit Tests grün.

17. **Empty States & Onboarding**

* Keine Buchungen:

  * Hinweis + Button „Capture öffnen“
* Keine Ergebnisse nach Filter:

  * „Keine Treffer – Filter zurücksetzen“
    **Deliverable:** saubere States.

18. **Mobile Optimierung**

* Liste als Cards oder responsive table row template
* Detail als eigener Screen (optional Route)
* Capture als Bottom-Sheet
  **Deliverable:** Mobile nutzbar.

19. **Performance**

* Pagination / Virtual scroll bei Bedarf
* Debounce Suche
* Memoized selectors (NGXS)
  **Deliverable:** flüssig bei vielen Einträgen.

---

## Phase 5 – Automation Hooks (ohne echte OCR im MVP)

20. **Import Buttons & Draft Pipeline (Stub)**

* Buttons: OCR / PDF / Paste → erzeugen Drafts (fake/stub)
* Review Mode markiert Felder (optional)
  **Deliverable:** UI/State vorbereitet, echte OCR später plug-in.

---

# Definition of Done (kurz)

* ✅ `title` Pflichtfeld überall (UI+API+DB)
* ✅ `amountMinor` immer >= 0; `type` steuert Vorzeichen (`signedAmountMinor` für Charts)
* ✅ `bookDate` + `month` korrekt; `month` immer gesetzt; cascaded auf Children
* ✅ Split-Constraint ohne abs() (alle Beträge >= 0)
* ✅ Max. Tiefe: 1 (Children haben keine Children)
* ✅ Cascade: Parent type/status/bookDate wirkt auf alle direkten Children
* Expandable Liste mit Split-Infos (Total/Assigned/Rest/Container)
* Hybrid Parent Aggregation korrekt: `signedAmountMinor = type=expense ? -effectiveAmountMinor : +effectiveAmountMinor`; Child voll, Parent nur Rest, Container=0
* Capture Dock Normal/Teil + Queue + Alle speichern (sequenzielle POSTs) — **teilweise** (State/Aktionen da, UI noch offen)
* Draft-Status `draft|needsReview|ready|saving|error` (FE-only, nicht persistiert)
* Optimistic Updates + Undo
* Mobile tauglich

