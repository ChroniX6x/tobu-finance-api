# ToBu – Planung-Page: Agent-Ready Taskliste

## 1. Ziel der Taskliste

Diese Taskliste zerlegt die Umsetzung der **Planung-Page** in sinnvolle, voneinander trennbare Arbeitspakete.  
Sie ist so aufgebaut, dass ein neuer Entwickler oder Agent:

- den Zweck der Planung-Page versteht,
- die Reihenfolge der Umsetzung nachvollziehen kann,
- Backend-Voraussetzungen von UI-Bausteinen trennt,
- und die Seite iterativ bauen kann, ohne bestehende Domänenlogik zu beschädigen.

Die Planung-Page ist der zentrale Verwaltungsbereich für alle zeitabhängigen Berechnungsgrundlagen eines Accounts.  
Sie beantwortet die Kernfrage: **Welcher Monatsbedarf entsteht, wie wird er verteilt, und was fehlt noch für eine vollständige Berechnung?**

---

## 2. Grundannahmen vor Start

- Die Page liegt unter `/accounts/:accountId/planning`.
- Sie ist ein sichtbarer Account-Haupttab neben Übersicht, Buchungen und Monat.
- Alle Add/Edit-Flows laufen über **Sidebars**, keine Dialoge.
- Es gibt **kein globales Speichern** — jede Aktion ist objektbezogen.
- Kein optimistisches Speichern: immer Serverantwort abwarten, dann `ReloadPlanning()` + Toast.
- `base`-ContributionRules sind **ausschließlich auto-generiert** — kein manuelles Create/Edit/Delete über CRUD-Endpunkte.
- Berechnungslogik (ProRata, Verteilung) **immer serverseitig** via `contrib.ts`. Frontend zeigt nur das ReadModel.
- Alle Geldwerte intern als `amountMinor` (Integer, Minor Units). UI zeigt Euro.
- Monate immer als `YYYY-MM`. API akzeptiert `YYYY-MM`, persistiert als Date (Month-Anchor-Pattern).
- NGXS ist bereits installiert und konfiguriert (`app.config.ts`). Kein erneutes Setup nötig.
- Die Stammdaten-Page ist bereits implementiert und muss im Planning-Scope um einen Cross-Link erweitert werden.

---

## 3. Empfohlene Umsetzungsstrategie

Sinnvolle Gesamt-Reihenfolge (jeder Baustein hinterlässt die App in einem vollständig lauffähigen Zustand):

0. **Backend: Bug-Fixes, Guards, Generator-Service, ReadModel-Endpunkt**
1. **Route, Shell-Tab & Seitenlayout-Grundgerüst**
2. **Interfaces, State & Actions**
3. **ReadModel anzeigen (alles read-only)**
4. **Budget-CRUD**
5. **Income-CRUD**
6. **Contribution Rules CRUD (additional + topup)**
7. **Stammdaten-Cross-Link**
8. **Polish, Mobile, Empty/Error States & QA**

Wichtig:  
Nicht zuerst die gesamte UI aufbauen und dann Logik ergänzen.  
Sinnvoller ist:

- zuerst Backend stabilisieren und ReadModel bereitstellen,
- dann State + Interfaces,
- dann Bereiche nacheinander: erst read-only, dann CRUD.

---

## 4. Taskliste im Detail

---

# Baustein 0 – Backend: Bug-Fixes, Guards, Generator & ReadModel

Dieser Baustein umfasst alle Backend-Arbeiten. Das Frontend bleibt vollständig unverändert.

---

## Task 0.1 – Zod-Schema für Contribution Rules reparieren

**Ziel:** Jeder `POST /api/contribution-rules`-Request scheitert aktuell mit einem Mongoose-Validierungsfehler, weil `recurring` im Zod-Schema fehlt. Dieser Bug muss vor allem anderen Backend-Arbeiten behoben werden.

**Problem:**  
In `src/validation/contribution-rules.ts` fehlen im `CreateContributionRule`-Schema die Felder `recurring` und `description`, obwohl `recurring: required` im Mongoose-Schema gesetzt ist.

**Umsetzung:**
- `CreateContributionRule`-Schema ergänzen:
  - `recurring: z.boolean()`
  - `description: z.string().nullish()`
- `UpdateContributionRule`-Schema ergänzen:
  - `recurring: z.boolean().optional()`
  - `description: z.string().nullish()`

**DoD:**
- `POST /api/contribution-rules` mit `recurring: true` und ohne `description` gibt HTTP 201 zurück
- `POST /api/contribution-rules` ohne `recurring` gibt HTTP 400 zurück
- Bestehende Tests (falls vorhanden) grün

---

## Task 0.2 – Overlap-Check in `category-budgets`-Route einbauen

**Ziel:** Überlappende Zeiträume desselben Kategorie-Budgets werden serverseitig blockiert (`409 BUDGET_OVERLAP`), bevor sie zu inkonsistenten Base-Rules führen können.

**Umsetzung:**
- Hilfsfunktion `monthRangesOverlap(a, b)` implementieren (oder in `src/utils/` extrahieren):
  - Parameter: `{ fromMonth: string | null, toMonth: string | null }` × 2
  - `null` bei `fromMonth` = -∞, `null` bei `toMonth` = +∞
  - Zwei Ranges überlappen, wenn `a.from <= b.to && b.from <= a.to`
- In `POST /api/category-budgets`:
  - Alle bestehenden Budgets derselben `categoryId` laden
  - Mit neuer Range vergleichen
  - Bei Überlappung: `409 { code: 'BUDGET_OVERLAP', message: '...' }`
- In `PATCH /api/category-budgets/:id`:
  - Gleiche Prüfung, das eigene Budget aus dem Vergleich ausschließen

**DoD:**
- POST mit überlappender Range gibt `409 BUDGET_OVERLAP`
- POST ohne Überlappung gibt `201`
- PATCH auf eigenes Budget ohne Zeitraumänderung gibt `200`
- PATCH mit neuem Zeitraum der überlappt gibt `409`

---

## Task 0.3 – Overlap-Check in `member-incomes`-Route einbauen

**Ziel:** Für denselben Member darf kein überlappender Einkommenszeitraum existieren.

**Umsetzung:**
- `monthRangesOverlap()` aus Task 0.2 wiederverwenden
- In `POST /api/member-incomes`:
  - Alle Incomes desselben `memberId` + `accountId` laden
  - Overlap-Prüfung
  - Bei Überlappung: `409 INCOME_OVERLAP`
- In `PATCH /api/member-incomes/:id`:
  - Gleiche Prüfung, eigenes Income ausschließen

**DoD:**
- POST mit überlappender Range gibt `409 INCOME_OVERLAP`
- Bestehende Flows unverändert

---

## Task 0.4 – `type: 'base'`-Guard in Contribution-Rules-CRUD einbauen

**Ziel:** `base`-Rules sind ausschließlich auto-generiert. Manuelles `PATCH` oder `DELETE` auf eine `base`-Rule wird mit `403 FORBIDDEN` abgewiesen.

**Umsetzung:**
- In `PATCH /api/contribution-rules/:id`:
  - Regel laden, prüfen ob `type === 'base'`
  - Falls ja: `403 { code: 'BASE_RULE_IMMUTABLE', message: 'Base rules are auto-generated and cannot be modified.' }`
- In `DELETE /api/contribution-rules/:id`:
  - Gleiche Prüfung

**DoD:**
- `PATCH` auf `base`-Rule gibt `403`
- `DELETE` auf `base`-Rule gibt `403`
- `PATCH` auf `additional`/`topup`-Rule weiterhin `200`

---

## Task 0.5 – `contribution-rule-generator.ts`-Service implementieren

**Ziel:** Zentraler Service, der aus den aktuellen Kategorie-Budgets eines Accounts konsistente `base`-ContributionRules generiert.

**Datei:** `src/services/contribution-rule-generator.ts`

**Funktion:** `regenerateBaseRules(accountId: string): Promise<void>`

**Algorithmus:**
1. Alle `contribution_rules` des Accounts mit `type: 'base'` löschen.
2. Alle `category_budgets` des Accounts laden inkl. zugehöriger `categories` (für `customSplit`).
3. Kategorien nach `customSplit` gruppieren:
   - Kategorien ohne `customSplit` (leeres Array) → eine Gruppe → `distribution.mode = 'proRataIncome'`
   - Kategorien mit identischem `customSplit` → eine Gruppe → `distribution.mode = 'customSplit'`
   - Zwei Kategorien gelten als identisch im Split, wenn alle `memberId`/`split`-Einträge übereinstimmen (sortiert verglichen)
   - Kategorien mit einzigartigem `customSplit` → je eine eigene Gruppe
4. Pro Gruppe:
   - `amountMinor`: Summe aller Budgets der Gruppe mit aktivem offenem Zeitraum (oder für den aktuellen Monat aktiv)
   - `fromMonth`: frühestes `fromMonth` aller Budgets der Gruppe (`null` wenn keines gesetzt)
   - `toMonth`: `null` wenn mind. ein Budget offen, sonst spätestes `toMonth`
   - `recurring: true`
   - `type: 'base'`
   - neue `contribution_rule` anlegen

**DoD:**
- Funktion ohne Fehler aufrufbar
- Alle `base`-Rules des Accounts werden durch neue ersetzt
- Korrekte Gruppierungslogik (Einheitstest empfohlen)
- Keine anderen Rules werden berührt

---

## Task 0.6 – `regenerateBaseRules` in `category-budgets`-Route verdrahten

**Ziel:** Nach jedem Create, Update und Delete eines Budgets werden die Base-Rules automatisch synchronisiert.

**Umsetzung:**
- In `src/routes/category-budgets.ts` am Ende der Handler ergänzen:
  - `POST` (nach erfolgreichem Save): `await regenerateBaseRules(accountId)`
  - `PATCH /:id` (nach erfolgreichem Save): `await regenerateBaseRules(accountId)`
  - `DELETE /:id` (nach erfolgreichem Delete): `await regenerateBaseRules(accountId)`
- `accountId` ist in allen Handlern aus dem Auth-Kontext / Route-Param verfügbar

**DoD:**
- Nach `POST /api/category-budgets` existieren korrekte `base`-Rules
- Nach `DELETE /api/category-budgets/:id` sind `base`-Rules aktualisiert
- Fehler in `regenerateBaseRules` führen zu 500 (kein stilles Ignorieren)

---

## Task 0.7 – `GET /api/accounts/:accountId/planning` ReadModel implementieren

**Ziel:** Dedizierter Read-Endpunkt für die Planung-Page liefert ein vollständig berechnetes ReadModel für einen Referenzmonat.

**Datei:** `src/routes/planning.ts`

**Query-Parameter:** `month=YYYY-MM` (Referenzmonat, Pflicht)

**Response:** `AccountPlanningResponse` gemäß Konzept §14.3

**Aggregation:**
- Account-Daten laden
- Alle `category_budgets` des Accounts laden → `BudgetPlanningItemVm[]`
  - `isActiveInReferenceMonth`: Budget-Zeitraum enthält Referenzmonat
  - `hasOverlapConflict`: andere Budgets für dieselbe Kategorie im selben Monat
- Alle `member_incomes` des Accounts laden → `IncomePlanningMemberVm[]`
  - je Member: aktives Income für Referenzmonat, History, `incomeSharePct`, `missingForProRata`
- Alle `contribution_rules` des Accounts laden → `ContributionBlockVm[]`
  - aufgeteilt in `contributionBlocks` (base + additional) und `specialBlocks` (topup)
  - `isActiveInReferenceMonth` berechnen
  - `isEditable`: `false` für `type === 'base'`, `true` sonst
  - `effectByMember`: ProRata/CustomSplit/PerMember via `src/utils/contrib.ts` berechnen
- `PlanningPreviewVm` berechnen:
  - `plannedNeedMinor`: Summe aktiver Base + Additional im Referenzmonat
  - `memberDuePreview`: via `contrib.ts` verteilen
- `PlanningOverviewVm` aggregieren
- `PlanningHintVm[]` generieren (fehlende Einkommen, Konflikte, abgelaufene Rules etc.)
- Route in `src/server.ts` registrieren: `app.use('/api/accounts', planningRouter)`

**DoD:**
- `GET /api/accounts/:id/planning?month=2026-05` gibt strukturiertes JSON zurück
- Alle VM-Felder korrekt befüllt
- `effectByMember` stimmt mit `month-view`-Berechnung überein
- Route ist in `server.ts` registriert
- Alle bestehenden Routes unverändert

---

## Task 0.8 – OpenAPI-Spezifikation erweitern

**Ziel:** Neuer Endpunkt und alle geänderten Response-Codes sind dokumentiert.

**Umsetzung:**
- Pfad `GET /api/accounts/{accountId}/planning` in `docs/openapi.yaml` eintragen
- Response-Schema `AccountPlanningResponse` mit allen Unter-Schemas definieren
- `409 BUDGET_OVERLAP` und `409 INCOME_OVERLAP` für die jeweiligen Schreib-Endpunkte dokumentieren
- `403 BASE_RULE_IMMUTABLE` für `PATCH`/`DELETE /api/contribution-rules/:id` dokumentieren

**DoD:**
- Swagger/Docs zeigen alle neuen und geänderten Endpunkte
- Response-Schemas stimmen mit der Implementierung überein

---

**Zustand nach Abschluss Baustein 0:** Backend ist stabil und vollständig. Alle Bugs gefixt, Guards aktiv, Base-Rules werden automatisch synchronisiert, Planning-ReadModel verfügbar. Frontend und alle bestehenden Features bleiben vollständig unverändert und lauffähig.

---

# Baustein 1 – Route, Shell-Tab & Seitenlayout

## Task 1.1 – Planning-Route in `accounts.routes.ts` anlegen

**Ziel:** Die Route `/accounts/:accountId/planning` ist navigierbar und bindet den NGXS `PlanningPageState` ein.

**Umsetzung:**
- In `src/app/accounts/accounts.routes.ts` unter den bestehenden `:accountId`-Children ergänzen:
  ```ts
  {
    path: 'planning',
    providers: [provideStates([PlanningPageState])],
    loadComponent: () =>
      import('./account-management/planning/planning-page.component')
        .then(m => m.PlanningPageComponent)
  }
  ```
- `PlanningPageState` ist zu diesem Zeitpunkt eine leere State-Klasse (Stub) — wird in Baustein 2 befüllt
- Analoges Muster: bestehende `accounts.routes.ts` für `master-data-page.routes.ts`

**DoD:**
- `/accounts/:id/planning` ist navigierbar (kein Blank-Screen, kein Routing-Fehler)
- Deep-Link funktioniert
- Kein State-Leak in bestehende Account-States

---

## Task 1.2 – Planning-Tab in AccountShell ergänzen

**Ziel:** Der 4. Tab „Planung" erscheint in der Account-Hauptnavigation neben Übersicht, Buchungen und Monat.

**Betroffene Dateien:**
- `src/app/accounts/account-shell/account-shell.ts`
- `src/app/accounts/account-shell/account-shell.html`

**Umsetzung:**
- In `account-shell.html`: `<p-tab value="planning">Planung</p-tab>` ergänzen (nach dem Monat-Tab)
- In `account-shell.ts`:
  - `activeTab`-Signal: `'/planning'` URL-Substring ergänzen
  - `navigateTab()`: `case 'planning': this.router.navigate(['planning'], ...)` ergänzen

**DoD:**
- Tab „Planung" erscheint und ist anklickbar
- Tab-Highlighting funktioniert beim direkten Aufruf der URL
- Bestehende Tabs (Übersicht, Buchungen, Monat) weiterhin korrekt

---

## Task 1.3 – Seitenlayout-Grundgerüst anlegen

**Ziel:** Feste Hauptstruktur der Planung-Page ohne echte Daten — Platzhalter für alle Bereiche.

**Ordnerstruktur anlegen:**
```
src/app/accounts/account-management/planning/
├── planning-page.component.ts
├── planning-overview-section.component.ts
├── budget-planning-section.component.ts
├── budget-editor-sidebar.component.ts
├── income-planning-section.component.ts
├── income-editor-sidebar.component.ts
├── contribution-rules-section.component.ts
├── contribution-rule-editor-sidebar.component.ts
├── special-blocks-section.component.ts
├── distribution-editor.component.ts
├── planning-preview-card.component.ts
├── planning-hints.component.ts
└── state/
    ├── planning.actions.ts
    ├── planning.state.ts
    └── planning.selectors.ts
```

**`planning-page.component.ts`:**
- Seiten-Header: Titel „Planung", Monat-Auswahl-Platzhalter
- Desktop: linke Sticky-Sekundärnavigation (Anker: Überblick / Budgets / Einkommen / Beitragsregeln / Sonderbausteine)
- Rechte Inhaltsfläche mit allen 5 Section-Komponenten (Platzhalter-Text)
- Mobile: 5 Accordions (p-accordion)

**DoD:**
- Seite lädt ohne Fehler
- Grundstruktur entspricht finaler Seitenarchitektur
- App bleibt vollständig lauffähig und navigierbar

---

**Zustand nach Abschluss Baustein 1:** Die Planung-Page ist navigierbar, hat einen Tab in der Shell und zeigt ein leeres Grundgerüst. Alle bestehenden Features unverändert.

---

# Baustein 2 – Interfaces, State & Actions

## Task 2.1 – Frontend-Interfaces für `AccountPlanningResponse` definieren

**Ziel:** API-Response-Typen für die Planung-Page sauber und isoliert im Feature-Ordner definiert.

**Datei:** `src/app/accounts/account-management/planning/planning.models.ts`

**Interfaces (analog zu Konzept §14.3):**
```ts
AccountPlanningResponse
PlanningOverviewVm
BudgetPlanningItemVm
IncomePlanningMemberVm
ContributionBlockVm
PlanningPreviewVm
PlanningHintVm
```

**Wichtig:**
- Keine Abhängigkeit von bestehenden `account.model.ts`-Legacy-Typen
- `amountMinor` überall als `number` (Integer, Minor Units)
- `fromMonth`/`toMonth` als `string | null` (YYYY-MM)

**DoD:**
- Alle Interfaces kompilieren fehlerfrei
- Typen können in State und Komponenten importiert werden

---

## Task 2.2 – `PlanningPageState`, Actions und Selectors anlegen

**Ziel:** Schlanker Page-State für das ReadModel, UI-Zustände und alle Schreibaktionen.

**`planning.state.ts` — State Model:**
```ts
PlanningPageStateModel {
  vm: AccountPlanningResponse | null;
  referenceMonth: string;
  loading: boolean;
  error: string | null;
  activeSection: 'overview' | 'budgets' | 'incomes' | 'rules' | 'specials';
  editor:
    | { kind: 'budget'; mode: 'create' | 'edit'; budgetId?: string; categoryId?: string }
    | { kind: 'income'; mode: 'create' | 'edit'; incomeId?: string; memberId?: string }
    | { kind: 'rule'; mode: 'create' | 'edit'; ruleId?: string; ruleType?: 'additional' | 'topup' }
    | null;
}
```

**`planning.actions.ts` — Actions:**
```ts
LoadPlanning(accountId, referenceMonth)
SetPlanningReferenceMonth(month)
ReloadPlanning()
OpenBudgetSidebar(mode, budgetId?, categoryId?)
OpenIncomeSidebar(mode, incomeId?, memberId?)
OpenRuleSidebar(mode, ruleId?, ruleType?)
ClosePlanningSidebar()
CreateBudget(payload)
UpdateBudget(budgetId, payload)
DeleteBudget(budgetId)
CreateIncome(payload)
UpdateIncome(incomeId, payload)
DeleteIncome(incomeId)
CreateContributionRule(payload)
UpdateContributionRule(ruleId, payload)
DeleteContributionRule(ruleId)
```

**Schreibaktions-Pattern (alle CRUD-Actions):**
- API-Call ausführen
- Bei Erfolg: `ClosePlanningSidebar()`, Toast, `ReloadPlanning()`
- Bei Fehler: `error`-Feld setzen, Sidebar offen lassen

**`planning.selectors.ts`:**
- `vm`, `loading`, `error`, `referenceMonth`, `editor`, `activeSection`
- Abgeleitete Selektoren: `activeBudgets`, `activeIncomes`, `baseBlocks`, `additionalBlocks`, `specialBlocks`, `hints`

**DoD:**
- State kompiliert fehlerfrei
- `LoadPlanning` lädt das ReadModel vom API-Endpunkt und setzt `vm`
- `SetPlanningReferenceMonth` + `ReloadPlanning` funktionieren korrekt
- Alle Actions registriert

---

**Zustand nach Abschluss Baustein 2:** State und Interfaces sind vollständig. Die Page lädt Daten vom Backend (noch keine Darstellung), alle Schreibaktionen sind vorbereitet. App lauffähig.

---

# Baustein 3 – ReadModel anzeigen (alles read-only)

## Task 3.1 – Referenzmonat-Auswahl und LoadPlanning verdrahten

**Ziel:** Die Page lädt beim Öffnen automatisch das Planning-ReadModel für den aktuellen Monat und erlaubt die Monatsauswahl.

**Umsetzung in `planning-page.component.ts`:**
- `ngOnInit`: `store.dispatch(new LoadPlanning(accountId, currentMonth))`
- Monatsauswahl (p-select oder p-datepicker im Month-Only-Modus): dispatch `SetPlanningReferenceMonth(month)`
- Loading-Overlay während `loading === true`
- Error-State mit Retry-Button wenn `error !== null`

**DoD:**
- Page zeigt korrekten ReadModel-Inhalt nach dem Laden
- Monatswechsel triggert Reload
- Loading/Error-States sichtbar

---

## Task 3.2 – Überblick-Section (read-only KPIs + Hints)

**Ziel:** `planning-overview-section.component.ts` zeigt die 4 KPI-Karten und Planungs-Hinweise aus dem ReadModel.

**KPI-Karten:**
1. Aktive Budgetsumme (`overview.activeBudgetSumMinor` → Euro)
2. Aktive Beitragsbausteine (`overview.activeContributionBlockCount`)
3. ProRata-Status (`overview.proRataStatus` → Ampel: vollständig / unvollständig / nicht aktiv)
4. Planungs-Hinweise (`overview.hintCount` → Badge)

**Hints-Bereich:**
- `planning-hints.component.ts` zeigt `hints[]` als kompakte Liste
- Severity-Icons: info / warn / error
- Jeder Hint mit `target`-Verweis (z. B. Link zur betroffenen Section)

**DoD:**
- KPIs aus ReadModel korrekt dargestellt
- Hints sichtbar mit korrektem Severity-Icon
- Leerer Hints-Bereich wird ausgeblendet

---

## Task 3.3 – Budget-Section (read-only Liste)

**Ziel:** `budget-planning-section.component.ts` zeigt alle Budgets gruppiert nach Kategorie.

**Darstellung je Kategorie:**
- Kategorie-Name als Gruppenheader
- Je Budget: Betrag, `gültig ab`, `gültig bis` (oder „offen"), aktiv-im-Referenzmonat-Badge
- `hasOverlapConflict: true` → Warnhinweis an der Zeile
- `[+ Budget hinzufügen]`-Button (öffnet Sidebar — noch ohne Funktion in diesem Task)
- `[Bearbeiten]`-Button je Budget (noch ohne Funktion)

**Empty State:**
```text
Noch keine Budgets eingerichtet.
Budgets bilden die Grundlage für deinen geplanten Monatsbedarf.
[Budget hinzufügen]
```

**DoD:**
- Budgets korrekt aus ReadModel dargestellt
- Aktiv-Markierung für Referenzmonat sichtbar
- Empty State bei leerer Liste

---

## Task 3.4 – Income-Section (read-only)

**Ziel:** `income-planning-section.component.ts` zeigt Einkommen je Mitglied.

**Darstellung je Member:**
- Member-Name
- Aktuelles Einkommen: Betrag, `gültig ab / bis`
- `incomeSharePct` (wenn ProRata aktiv im Referenzmonat): „Anteil: 58 %"
- `missingForProRata: true` → Warnhinweis „Einkommen fehlt" + Button „Einkommen ergänzen" (öffnet Sidebar mit vorausgewähltem Member)
- Einkommens-History ausgeklappt anzeigbar

**Hinweis wenn ProRata nicht aktiv:**
```text
Im ausgewählten Referenzmonat wird keine einkommensbasierte Verteilung verwendet.
```

**DoD:**
- Alle Members mit Einkommensdaten korrekt dargestellt
- Missing-ProRata-State sichtbar
- Empty State bei keinen Einträgen

---

## Task 3.5 – Beitragsregeln-Section (read-only)

**Ziel:** `contribution-rules-section.component.ts` zeigt alle `contributionBlocks` (base + additional).

**Darstellung je Block:**
- Titel, Betrag (Euro), Distribution-Mode-Label
- Aktiv-im-Referenzmonat-Badge
- `isEditable: false` (base-Blöcke): read-only-Karte mit Hinweis „Abgeleitet aus Budgets" + Link „Budgets anzeigen"
- `isEditable: true` (additional): `[Bearbeiten]`-Button (noch ohne Funktion)
- `effectByMember[]`: aufklappbare Detail-Zeilen je Mitglied (Betrag + Anteil %)

**DoD:**
- Base-Blöcke als read-only markiert, Link zur Budget-Section funktioniert
- Additional-Blöcke als bearbeitbar markiert
- Leere Liste zeigt Empty State

---

## Task 3.6 – Sonderbausteine-Section (read-only)

**Ziel:** `special-blocks-section.component.ts` zeigt alle `specialBlocks` (topup).

**Darstellung analog zu Task 3.5**, aber für TopUps.

**Empty State:**
```text
Noch keine TopUps oder Sonderbeiträge eingerichtet.
[+ TopUp] [+ Zusatzbeitrag]
```

**DoD:**
- TopUps korrekt angezeigt
- Empty State bei leerer Liste

---

## Task 3.7 – Vorschau-Karte (read-only)

**Ziel:** `planning-preview-card.component.ts` zeigt `preview` aus dem ReadModel.

**Darstellung:**
```
Vorschau für Mai 2026
Monatsbedarf: 1.850 €
Tony   Soll: 1.070 €
Caro   Soll:   780 €
```

- Aufklappbar: Breakdown je Member (welcher Block trägt wie viel bei)
- Hinweis: „Dies ist kein Ersatz für die Monat-Ansicht"

**DoD:**
- Vorschau-Karte zeigt korrekte Werte aus `preview`
- Breakdown-Detail aufklappbar
- Hinweis-Text sichtbar

---

**Zustand nach Abschluss Baustein 3:** Alle Bereiche der Planung-Page zeigen ReadModel-Daten korrekt an. Keine Schreibfunktionen aktiv. App vollständig lauffähig.

---

# Baustein 4 – Budget-CRUD

## Task 4.1 – Budget-Editor-Sidebar anlegen

**Ziel:** `budget-editor-sidebar.component.ts` ist eine vollständige, wiederverwendbare Sidebar für Create und Edit.

**Felder:**
- Kategorie (p-select, Auswahl aus `vm.budgets` dedupliziert / oder Account-Kategorien aus Account-State)
- Betrag (Euro, konvertiert zu `amountMinor`)
- Gültig ab (Month-only picker, `YYYY-MM`)
- Gültig bis (Month-only picker, optional)
- Rückwirkungs-Hinweis wenn `fromMonth` in der Vergangenheit liegt

**Öffnen/Schließen:**
- Öffnet via `OpenBudgetSidebar(mode, budgetId?, categoryId?)`
- Schließt via `ClosePlanningSidebar()`

**Validierung:**
- Betrag > 0
- `fromMonth` Pflicht
- `toMonth >= fromMonth` wenn gesetzt

**DoD:**
- Sidebar öffnet und schließt korrekt
- Formular-Validierung clientseitig funktioniert
- Kategorie und Betrag vorbelegt im Edit-Modus

---

## Task 4.2 – Budget erstellen

**Ziel:** `[+ Budget hinzufügen]`-Button öffnet Sidebar und legt nach Bestätigung ein neues Budget an.

**Umsetzung:**
- Button in `budget-planning-section.component.ts` dispatcht `OpenBudgetSidebar('create')`
- Sidebar-Submit dispatcht `CreateBudget(payload)`
- State führt `POST /api/category-budgets` aus
- Bei `409 BUDGET_OVERLAP`: Fehlermeldung in der Sidebar anzeigen (Sidebar bleibt offen)
- Bei Erfolg: Sidebar schließen, Toast „Budget gespeichert", `ReloadPlanning()`

**DoD:**
- Budget wird korrekt angelegt
- Overlap-Fehler wird in der Sidebar als verständliche Meldung angezeigt
- ReadModel wird nach Speichern neu geladen

---

## Task 4.3 – Budget bearbeiten

**Ziel:** `[Bearbeiten]`-Button öffnet Sidebar mit vorausgefüllten Werten.

**Umsetzung:**
- Button dispatcht `OpenBudgetSidebar('edit', budgetId)`
- Sidebar befüllt Formular aus `vm.budgets.find(b => b.budgetId === budgetId)`
- Submit dispatcht `UpdateBudget(budgetId, payload)`
- Gleiche Overlap- und Rückwirkungslogik wie Task 4.2

**DoD:**
- Formular korrekt vorausgefüllt
- Änderung wird gespeichert und ReadModel neu geladen
- Overlap-Fehler korrekt behandelt

---

## Task 4.4 – Budget löschen

**Ziel:** Budget kann mit Bestätigungsdialog gelöscht werden.

**Umsetzung:**
- `[Löschen]`-Button in Sidebar oder direkt in der Liste
- p-confirmDialog: „Diese Änderung kann bereits berechnete Monatsansichten rückwirkend verändern. Trotzdem löschen?"
- Bei Bestätigung: dispatch `DeleteBudget(budgetId)`
- State führt `DELETE /api/category-budgets/:id` aus
- Bei Erfolg: Toast „Budget gelöscht", `ReloadPlanning()`

**DoD:**
- Confirm-Dialog erscheint mit Rückwirkungshinweis
- Budget wird gelöscht und ReadModel neu geladen

---

**Zustand nach Abschluss Baustein 4:** Budget-CRUD vollständig funktionsfähig. Überlappungsschutz aktiv. Base-Rules werden automatisch synchronisiert (durch Backend-Trigger aus Baustein 0). App vollständig lauffähig.

---

# Baustein 5 – Income-CRUD

## Task 5.1 – Income-Editor-Sidebar anlegen

**Ziel:** `income-editor-sidebar.component.ts` für Create und Edit von Member-Incomes.

**Felder:**
- Mitglied (p-select, vorbelegt wenn über „Einkommen ergänzen"-Button geöffnet)
- Betrag (Euro → `amountMinor`)
- Gültig ab (Month-only, Pflicht)
- Gültig bis (Month-only, optional)
- Rückwirkungs-Hinweis wenn Zeitraum in der Vergangenheit liegt

**Validierung:**
- Betrag > 0
- `fromMonth` Pflicht
- `toMonth >= fromMonth` wenn gesetzt

**DoD:**
- Sidebar öffnet/schließt korrekt
- Mitglied vorbelegt wenn über „Einkommen ergänzen" geöffnet
- Formularvalidierung funktioniert

---

## Task 5.2 – Income erstellen und bearbeiten

**Ziel:** Vollständiger Create/Edit-Flow für Member-Incomes.

**Umsetzung:**
- `[+ Einkommen hinzufügen]`-Button: `OpenIncomeSidebar('create')`
- „Einkommen ergänzen"-Button bei `missingForProRata`: `OpenIncomeSidebar('create', undefined, memberId)`
- `[Bearbeiten]`-Button: `OpenIncomeSidebar('edit', incomeId)`
- Submit: `CreateIncome(payload)` / `UpdateIncome(incomeId, payload)`
- Bei `409 INCOME_OVERLAP`: Fehlermeldung in Sidebar
- Bei Erfolg: Sidebar schließen, Toast, `ReloadPlanning()`

**DoD:**
- Create und Edit funktionieren korrekt
- Overlap-Fehler als verständliche Meldung
- `missingForProRata`-State wird nach Ergänzen aufgelöst

---

## Task 5.3 – Income löschen

**Ziel:** Income kann mit Confirm-Dialog gelöscht werden.

**Umsetzung:**
- `[Löschen]`-Button in Sidebar
- Confirm-Dialog mit Hinweis: „Wenn dadurch eine ProRata-Verteilung nicht mehr berechenbar ist, erscheint ein Planungs-Hinweis."
- dispatch `DeleteIncome(incomeId)`
- Bei Erfolg: Toast, `ReloadPlanning()`

**DoD:**
- Income wird gelöscht
- ReadModel neu geladen, ggf. neuer Hint sichtbar

---

**Zustand nach Abschluss Baustein 5:** Income-CRUD vollständig. ProRata-Warnflows aktiv. App vollständig lauffähig.

---

# Baustein 6 – Contribution Rules CRUD (additional + topup)

## Task 6.1 – Distribution-Editor-Komponente implementieren

**Ziel:** `distribution-editor.component.ts` ist ein wiederverwendbarer Editor-Bereich für alle drei Distribution Modes.

**Modes:**
- `perMember`: Member-Auswahl (p-select aus Account-Members)
- `customSplit`: Prozent-Eingabe je Member, Live-Validierung Summe = 100 %
- `proRataIncome`: keine manuelle Eingabe, Vorschau-Anteile aus ReadModel (`incomes[].incomeSharePct`)

**Mode-Auswahl:**
- p-selectButton oder p-tabs: „Pro Member / Custom Split / ProRata"

**DoD:**
- Alle drei Modes schaltbar
- `customSplit`-Summen-Validierung clientseitig funktioniert
- `proRataIncome`-Vorschau zeigt berechnete Anteile aus ReadModel

---

## Task 6.2 – Rule-Editor-Sidebar anlegen

**Ziel:** `contribution-rule-editor-sidebar.component.ts` für Create und Edit von `additional`- und `topup`-Rules.

**Felder:**
- Typ: `additional` / `topup` (Create: Auswahl; Edit: read-only)
- Beschreibung (optional)
- Betrag (Euro → `amountMinor`)
- Wiederkehrend (Boolean Toggle)
- Gültig ab (`YYYY-MM`, Pflicht)
- Gültig bis (optional; wenn nicht wiederkehrend: automatisch = Gültig ab)
- Distribution Editor (Task 6.1)

**Validierung:**
- Betrag > 0
- `customSplit`-Summe = 100 %
- Bei `proRataIncome`: Startmonat muss für alle Members Einkommen haben (sonst Warnhinweis, Speichern blockiert)

**DoD:**
- Sidebar öffnet/schließt korrekt
- Alle Felder valide
- `proRataIncome` ohne vollständige Einkommen zeigt Warnhinweis

---

## Task 6.3 – Contribution Rule erstellen

**Ziel:** `[+ Zusatzbeitrag]`- und `[+ TopUp]`-Buttons öffnen die Sidebar mit dem entsprechend voreingestellten Typ.

**Umsetzung:**
- Button in `contribution-rules-section.component.ts`: `OpenRuleSidebar('create', undefined, 'additional')`
- Button in `special-blocks-section.component.ts`: `OpenRuleSidebar('create', undefined, 'topup')`
- Submit: `CreateContributionRule(payload)`
- Bei Erfolg: Sidebar schließen, Toast, `ReloadPlanning()`

**DoD:**
- Additional und TopUp Rules werden korrekt angelegt
- `base` kann nicht über die Sidebar angelegt werden (kein Typ-Eintrag, keine Action)

---

## Task 6.4 – Contribution Rule bearbeiten und löschen

**Ziel:** `[Bearbeiten]`- und `[Löschen]`-Flows für `additional`- und `topup`-Rules.

**Bearbeiten:**
- `OpenRuleSidebar('edit', ruleId)` befüllt Sidebar aus `vm.contributionBlocks` / `vm.specialBlocks`
- Submit: `UpdateContributionRule(ruleId, payload)`
- Bei Erfolg: Sidebar schließen, Toast, `ReloadPlanning()`

**Löschen:**
- Confirm-Dialog mit Rückwirkungshinweis
- dispatch `DeleteContributionRule(ruleId)`
- Bei Erfolg: Toast, `ReloadPlanning()`

**Schutz:**
- `isEditable: false`-Blöcke (base) haben keinen Bearbeiten/Löschen-Button
- Falls doch ein DELETE auf `type === 'base'` durchkommt: Backend gibt `403`, Frontend zeigt Fehlermeldung

**DoD:**
- Edit und Delete für `additional`/`topup` funktionieren
- `base`-Blöcke haben keine Bearbeiten/Löschen-Aktionen in der UI

---

**Zustand nach Abschluss Baustein 6:** Alle CRUD-Flows vollständig. Planung-Page ist produktiv einsetzbar. App vollständig lauffähig.

---

# Baustein 7 – Stammdaten-Cross-Link

## Task 7.1 – „In Planung bearbeiten"-Link in Kategorie-Stammdaten ergänzen

**Ziel:** Nutzer können direkt aus der Stammdaten-Page zur Planung-Page einer Kategorie navigieren.

**Betroffene Datei:** `src/app/accounts/account-management/master-data/category-master-section.component.ts`

**Umsetzung:**
- Je Kategorie-Eintrag in der Stammdaten-Liste einen Link ergänzen:
  ```
  [In Planung bearbeiten →]
  ```
- Navigation: `routerLink="/accounts/:accountId/planning"` (mit QueryParam oder Fragment für Budget-Section der betreffenden Kategorie, falls gewünscht — MVP: Link zur Planung ohne vorausgefüllten Filter genügt)
- Link nur anzeigen, wenn der Account eine Planung-Page hat (MVP: immer anzeigen)

**DoD:**
- Link erscheint je Kategorie in der Stammdaten-Page
- Klick navigiert zur Planung-Page des Accounts
- Bestehende Stammdaten-Funktionalität unverändert

---

**Zustand nach Abschluss Baustein 7:** Stammdaten und Planung sind sinnvoll verknüpft. App vollständig lauffähig.

---

# Baustein 8 – Polish, Mobile, Empty/Error States & QA

## Task 8.1 – Mobile Accordions finalisieren

**Ziel:** Auf Mobile werden alle 5 Bereiche als `p-accordion` dargestellt.

**Umsetzung:**
- Responsive Breakpoint (Tailwind: `lg:hidden` / `hidden lg:block`)
- Desktop: Sticky-Sidebar-Navigation + Scroll zu Anchors
- Mobile: 5 `p-accordionPanel` in `planning-page.component.ts`
- Sidebars öffnen fullscreen auf Mobile (`p-drawer` mit `styleClass="w-full"`)

**DoD:**
- Mobile-Darstellung zeigt Accordions ohne horizontales Scrollen
- Sidebar fullscreen auf Mobile
- Desktop-Sticky-Navigation unverändert

---

## Task 8.2 – Alle Empty und Error States implementieren

**Ziel:** Jeder Bereich hat einen sauberen Empty-State und die Page hat einen globalen Error-State.

**Empty States (gemäß Konzept §19):**
- Keine Budgets
- Keine Einkommen
- ProRata aktiv, Einkommen fehlt
- Keine Beitragsregeln
- Fehler beim Laden (mit Retry-Button)

**Umsetzung:**
- `*ngIf` / `@if` auf jeweilige Listen-Länge
- `error !== null` in `planning-page.component.ts`: globaler Fehler-Banner mit `ReloadPlanning()`-Button

**DoD:**
- Alle Empty States korrekt angezeigt
- Retry-Button löst `ReloadPlanning()` aus

---

## Task 8.3 – Toasts und Confirm-Dialoge standardisieren

**Ziel:** Alle Schreibaktionen haben konsistentes Feedback.

**Toast-Texte:**
- Budget gespeichert / aktualisiert / gelöscht
- Einkommen gespeichert / aktualisiert / gelöscht
- Beitragsbaustein gespeichert / aktualisiert / gelöscht
- Fehler: „Speichern fehlgeschlagen – bitte erneut versuchen"

**Confirm-Dialog-Texte (Rückwirkungshinweis):**
- Bei Budget-Delete: „Diese Änderung kann bereits berechnete Monatsansichten rückwirkend verändern. Budget trotzdem löschen?"
- Bei Income-Delete: „Wenn dadurch eine ProRata-Verteilung nicht mehr berechenbar ist, erscheint ein Planungs-Hinweis. Einkommen trotzdem löschen?"
- Bei Rule-Delete: „Diese Regel fließt in die monatlichen Sollwerte ein. Beitragsbaustein trotzdem löschen?"

**DoD:**
- Alle Toasts erscheinen nach Schreibaktionen
- Alle Confirm-Dialoge mit Rückwirkungstext

---

## Task 8.4 – Zahlenkonsistenz mit Month View prüfen

**Ziel:** Die Vorschau-Karte (`memberDuePreview`) muss dieselben Werte liefern wie die Month View für denselben Monat und dieselbe Datenbasis.

**Vorgehen:**
- Testaccount mit bekannten Budgets und Einkommen aufsetzen
- `GET /api/accounts/:id/planning?month=YYYY-MM` aufrufen
- `GET /api/accounts/:id/month-view?month=YYYY-MM` aufrufen
- `preview.memberDuePreview[].dueMinor` == `month-view.members[].dueMinor` prüfen
- Bei Abweichung: Ursache in `contrib.ts`-Aufrufen finden (beide Routes müssen dieselbe Funktion mit identischen Inputs aufrufen)

**DoD:**
- Vorschau-Werte stimmen mit Month View überein
- Abweichungen dokumentiert und behoben

---

**Zustand nach Abschluss Baustein 8:** Planung-Page ist vollständig, responsiv, konsistent und produktionsreif.

---

# 5. Zusammenfassung der Bausteine

| Baustein | Inhalt | Nach Abschluss lauffähig |
|---|---|:---:|
| 0 | Backend: Bug-Fixes, Guards, Generator, ReadModel | ✅ |
| 1 | Route, Tab, Grundgerüst | ✅ |
| 2 | Interfaces, State, Actions | ✅ |
| 3 | ReadModel read-only anzeigen | ✅ |
| 4 | Budget-CRUD | ✅ |
| 5 | Income-CRUD | ✅ |
| 6 | Contribution Rules CRUD | ✅ |
| 7 | Stammdaten-Cross-Link | ✅ |
| 8 | Polish, Mobile, QA | ✅ |
