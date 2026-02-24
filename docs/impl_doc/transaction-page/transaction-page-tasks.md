# Taskliste – Buchungen (Variante C) inkl. Capture-Dock + Splits + Hybrid Parent

## Phase 0 – Vorbereitung & Contract

1. **OpenAPI / Backend Contract aktualisieren**

* `Transaction` um Felder erweitern: `title` (required), `parentTransactionId` (optional).
* Validierungsregeln dokumentieren/implementieren:

  * Minor Units `amountMinor` int
  * ISO `date`
  * XOR `paidByMemberId` / `externalName` wenn `isFromSharedAccount=false`
  * Split-Constraint: bei Child Create/Patch darf Parent nicht „über-splittet“ werden (assigned darf total nicht überschreiten – abs Vergleich).
    **Deliverable:** aktualisiertes `openapi.yaml` + serverseitige Validation.

2. **DB / Schema Anpassungen**

* Mongo/Migrations: Indexe für schnelle Queries:

  * `{ accountId: 1, date: -1 }`
  * `{ accountId: 1, parentTransactionId: 1 }`
  * optional Textindex `title/notes/externalName` (oder separate Search-Lösung)
    **Deliverable:** Migration/Index-Skript.

---

## Phase 1 – Datenlayer & NGXS

3. **API Client / Service**

* `TransactionsApiService`:

  * `getTransactions(filters)`
  * `createTransaction(dto)`
  * `patchTransaction(id, patch)`
  * `deleteTransaction(id)`
  * optional `bulkCreate(dtos)` (wenn du direkt mit Batch starten willst)
    **Deliverable:** Service + Types.

4. **NGXS: TransactionsState Grundgerüst**

* State Model: entities, ids, total, filters, loading/error, selectedId.
* Actions:

  * `LoadTransactions`
  * `SelectTransaction`
  * `CreateTransactionOptimistic`
  * `PatchTransactionOptimistic`
  * `DeleteTransactionOptimistic`
  * `UndoDeleteTransaction`
    **Deliverable:** State + Actions + selectors.

5. **NGXS: Split-Selectors (Hybrid)**

* Selectors/Computed:

  * `childrenByParentId: Map<parentId, childIds[]>`
  * `splitMetaByParentId: { splitCount, assignedMinor, restMinor, completionRatio }`
  * `effectiveAmountMinor(txId)`:

    * Child: amountMinor
    * Parent ohne Children: amountMinor
    * Parent mit Children: restMinor (0 => Container)
* UI-State: `expandedParents: Set<string>`

  * Action `ToggleParentExpanded(parentId)`
    **Deliverable:** Selector-Set + Unit Tests für Rechenlogik (wichtig!).

6. **NGXS: DraftsState (Capture/Queue)**

* Model: `dockOpen`, `captureMode (normal|split)`, `drafts[]`, `selectedDraftId`.
* Actions:

  * `ToggleDock`
  * `SetCaptureMode`
  * `AddDraft`
  * `UpdateDraft`
  * `RemoveDraft` (+ Undo)
  * `FinalizeDraft`
  * `FinalizeAllReadyDrafts`
  * `RetryFailedDrafts`
* Finalize:

  * optional Bulk (empfohlen) oder sequential POST
    **Deliverable:** DraftsState + Actions + selectors.

---

## Phase 2 – UI Skeleton (Desktop-first, Mobile responsive)

7. **Route + Page Shell**

* Route: `/accounts/:accountId/transactions`
* Component: `TransactionsPageComponent`
* Layout: Toolbar + Splitter + Capture Dock (collapsed by default)
  **Deliverable:** Navigierbare Seite.

8. **Toolbar / Filter UI**

* PrimeNG:

  * Suche `p-inputText` (debounce)
  * `p-calendar` range
  * `p-multiSelect` Kategorien
  * `p-dropdown` Quelle
  * `p-dropdown` Bezahlt von
  * CTA `+ Neue Buchung`
* Filter-Chips (Custom oder `p-chip`) + Reset
  **Deliverable:** Filter setzen → `LoadTransactions` (server oder client).

9. **Liste: p-table mit rowExpansion**

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

10. **Detail-Editor (rechts)**

* Reactive Form:

  * amount (inputNumber)
  * date (calendar)
  * category dropdown
  * source dropdown/segmented
  * paidBy (member/external, XOR)
  * **title** (required)
  * notes optional
* Modus:

  * Parent selected → zeigt Split Panel (Total/Assigned/Rest + Children Quick Add)
  * Child selected → zeigt „Teil von“ Info + Jump-to-parent
    **Deliverable:** Edit & Save (optimistic) funktioniert.

---

## Phase 3 – Capture Dock (Quick Add + Split)

11. **Capture Dock UI**

* Collapsible Bottom Panel (desktop) + Bottom-Sheet (mobile)
* Links Quick Add, rechts Queue, unten „Alle speichern“
* Mode Toggle: Normal | Teil
  **Deliverable:** Dock togglen + state persist (optional localStorage).

12. **Quick Add – Normal**

* Pflicht: amount, category, title, source
* paidBy Pflicht nur wenn source=Privat
* Buttons:

  * „In Queue“
  * „Direkt speichern“
* Keyboard:

  * Enter → In Queue
  * Shift+Enter → In Queue + Reset + Fokus Betrag
    **Deliverable:** Schnell erfassen funktioniert.

13. **Quick Add – Teilbuchung**

* Zusätzlicher Input: `Teil von` (p-autoComplete) → sucht Parents
* Nach Parent Auswahl:

  * zeigt `Rest verfügbar`
  * erbt date/source/paidBy (optional locked)
  * validiert Betrag gegen Rest (abs)
* Draft bekommt `parentTransactionId`
  **Deliverable:** Split-QuickAdd + Rest-Validation.

14. **Queue/Drafts**

* Anzeige READY / REVIEW / ERROR
* Remove + Undo
* Click Draft → lädt in Detail-Editor (Review Mode optional)
* `FinalizeAllReadyDrafts`:

  * Bulk oder sequenziell
  * partial failures bleiben stehen, mit Retry
    **Deliverable:** Queue-Workflow komplett.

---

## Phase 4 – UX Quality & Edge Cases

15. **Undo System (Delete Transaction, Remove Draft)**

* Toast mit „Rückgängig“
* Timeout handling (finalize delete)
  **Deliverable:** Undo robust, keine Dateninkonsistenz.

16. **Hybrid Aggregation in Charts**

* Account Overview Charts auf `effectiveAmountMinor` umstellen:

  * Parent ohne splits → full
  * Parent mit splits → rest
  * Container → 0
  * Children → own
    **Deliverable:** Charts korrekt (keine Doppelzählung).

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

* `title` Pflichtfeld überall (UI+API+DB)
* Expandable Liste mit Split-Infos (Total/Assigned/Rest/Container)
* Hybrid Parent Aggregation korrekt (Charts & Stats)
* Capture Dock Normal/Teil + Queue + Save all
* Optimistic Updates + Undo
* Mobile tauglich

---

Wenn du willst, kann ich dir als Nächstes diese Taskliste **als GitHub-Issue-Set** formatieren (mit Labels, Akzeptanzkriterien pro Task) oder als **Markdown-Datei**, die du direkt ins Repo legen kannst.
