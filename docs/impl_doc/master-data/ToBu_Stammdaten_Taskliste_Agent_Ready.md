# ToBu – Stammdaten-Page: Agent-Ready Taskliste

## 1. Ziel der Taskliste

Diese Taskliste zerlegt die Umsetzung der **Stammdaten-Page** in sinnvolle, voneinander trennbare Arbeitspakete.  
Sie ist so aufgebaut, dass ein neuer Entwickler oder Agent:

- den Zweck der Stammdaten-Page versteht,
- die Reihenfolge der Umsetzung nachvollziehen kann,
- Abhängigkeiten zwischen Backend, State und UI erkennt,
- und die Seite iterativ bauen kann, ohne bestehende Domänenlogik zu beschädigen.

Die Stammdaten-Page ist eine ruhige **Verwaltungsseite für Grundobjekte** eines Accounts.  
Sie beantwortet die Kernfrage: **Welche Account-, Mitglieder- und Kategoriestammdaten existieren in diesem Account, wer darf was, und welche Objekte sind sicher veränderbar?**

---

## 2. Grundannahmen vor Start

- Die Seite liegt unter `/accounts/:accountId/manage/master-data`.
- Sie ist kein Teil der operativen Haupttabs (Übersicht / Buchungen / Monat).
- Sie hat eine eigene interne Bereichsnavigation: **Account · Mitglieder · Kategorien**.
- Alle Add/Edit-Flows verwenden **Sidebars**, keine Dialoge.
- Es gibt **kein globales Speichern** der gesamten Seite, sondern objektbezogenes Speichern.
- Kein optimistisches Speichern: immer Serverantwort abwarten, dann `ReloadMasterData()` + Toast.
- Usage-Infos (`canDelete`, `canRemoveFromAccount`, `usageHints`) kommen **serverseitig** aus dem ReadModel – nie clientseitig errechnen.
- Riskante Aktionen (Entfernen, Löschen) sind **zweifach geschützt**: ReadModel-Flag in der UI + Guard im CRUD-Endpunkt.

---

## 3. Empfohlene Umsetzungsstrategie

Sinnvolle Gesamt-Reihenfolge (jeder Baustein hinterlässt die App in einem vollständig lauffähigen Zustand):

0. **Backend: ReadModel-Endpunkt + API-Guards + Schema-Fixes**
1. **Route, Shell-Anbindung & Seitenlayout-Grundgerüst**
2. **State, Services & Interfaces**
3. **Account-Bereich**
4. **Mitglieder-Bereich**
5. **Kategorien-Bereich**
6. **Polish, Mobile & QA**

Wichtig:  
Nicht zuerst die gesamte UI aufbauen und dann mit Logik füllen.  
Sinnvoller ist:

- zuerst Backend (ReadModel + Guards),
- dann State + Interfaces,
- dann Bereiche nacheinander vollständig (Anzeige → Bearbeitung → Löschen/Entfernen).

---

## 4. Taskliste im Detail

---

# Baustein 0 – Backend: ReadModel-Endpunkt, Guards & Schema-Fixes

Dieser Baustein umfasst alle Backend-Arbeiten. Das Frontend bleibt vollständig unverändert.

---

## Task 0.1 – `GET /api/accounts/:accountId/master-data` implementieren

**Ziel:** Dedizierter Read-Endpunkt für die Stammdaten-Page liefert ein vollständig bewertetes ReadModel.

**Analogie:** Entspricht `GET /api/accounts/:id/overview` für die Overview-Seite.

**Umsetzung:**
- Neue Datei `src/routes/master-data.ts` anlegen
- Query: alle Members des Accounts, alle Categories des Accounts, Account selbst
- Für jeden Member berechnen:
  - `canRemoveFromAccount`: false, wenn Member in `transactions.paidByMemberId`, `categories.customSplit`, `contributionRules.distribution`, `memberIncomes`, `carryovers`, oder letzter Owner/letzter Member
  - `canChangeRole`: false, wenn Member der letzte Owner ist
  - `usageHints`: menschenlesbare Gründe, warum Entfernen geblockt ist
  - `hasUserAccount`: ob Member mit einem User verknüpft ist
- Für jede Kategorie berechnen:
  - `canDelete`: false, wenn Kategorie in `transactions.categoryId`, `categoryBudgets.categoryId`, `recurrences.categoryId` referenziert wird
  - `transactionCount`, `recurrenceCount`, `hasBudget`
  - `usageHints`: menschenlesbare Gründe, warum Löschen geblockt ist
  - `hasCustomSplit`: ob `customSplit.length > 0`
  - `customSplitLabel`: z. B. „Tony 60 %, Caro 40 %" oder `null`
- In `meta` berechnen:
  - `uncategorizedTransactionCount`: Anzahl Transactions mit `categoryId = null`
  - `hasSingleMemberInfo`: `memberCount === 1` (redundant, aber aus Konsistenzgründen mitliefern)
  - `infoHints` und `warningHints` für seitenweite Hinweise
- Route in `src/server.ts` registrieren

**DoD:**
- `GET /api/accounts/:accountId/master-data` gibt strukturiertes JSON zurück
- `canDelete`, `canRemoveFromAccount`, `canChangeRole` und `usageHints` sind korrekt befüllt
- Route ist in `server.ts` registriert
- Alle bestehenden Routes bleiben unverändert

---

## Task 0.2 – Account-Settings-Zod-Schema vollständig definieren

**Ziel:** Das bestehende Validierungsschema in `src/validation/accounts.ts` kennt unter `settings` nur `monthGranularity`. Die neuen Felder fehlen.

**Problem:** Ein `PATCH /api/accounts/:id` mit Settings-Feldern aus Abschnitt 7.2 des Konzepts würde ohne Validierungsfehler durchgehen – die Felder werden nicht geprüft.

**Umsetzung:**
- `src/validation/accounts.ts` erweitern um:
  - `settings.dashboard.historyMonths`: Zahl, 3–24
  - `settings.dashboard.topKCategories`: Zahl, 1–10
  - `settings.alerts.lowBalanceForecastMinor`: Zahl oder null (Minor Units)
  - `settings.alerts.carryoverLargeMinor`: Zahl oder null (Minor Units)
  - `settings.alerts.stalenessDays`: positive Ganzzahl oder null
- Schema darf `monthGranularity` nicht entfernen (Abwärtskompatibilität)
- Schema für `PATCH /api/accounts/:id` anpassen, sodass alle Settings-Teilbäume optional patchbar sind

**DoD:**
- Ungültige Werte werden korrekt abgewiesen
- Gültige Settings-Objekte werden angenommen
- Kein bestehendes Feature ist gebrochen

---

## Task 0.3 – `POST /api/accounts/:id/members` Zod-Validierung ergänzen

**Ziel:** Diese Route ist die einzige in `accounts.ts`, die kein `validateBody(...)` nutzt und direkt auf `req.body` zugreift.

**Umsetzung:**
- Schema in `src/validation/accounts.ts` ergänzen:
  - `memberId`: valide MongoDB-ObjectId, Pflicht
  - `role`: `z.enum(['owner', 'member'])`, Pflicht
- Route `POST /api/accounts/:id/members` mit `validateBody(addMemberSchema)` absichern

**DoD:**
- Fehlende oder falsch typisierte Body-Felder werden mit HTTP 400 abgewiesen
- Bestehender Flow bleibt unverändert
- Konsistenz mit anderen Routes hergestellt

---

## Task 0.4 – Guards in CRUD-Endpunkte einbauen

**Ziel:** Das ReadModel-Flag schützt nur die UI. Direkte API-Calls umgehen diese Prüfung. Beide Ebenen müssen die Blockierlogik enthalten.

**Umsetzung – `DELETE /api/accounts/:id/members/:memberId`:**
- Prüfen, ob der Member in den unter 0.1 beschriebenen Referenzquellen vorkommt
- Wenn referenziert: HTTP 409 mit strukturiertem Fehler-Body
- Prüfen, ob Member der letzte Owner ist: wenn ja, HTTP 409

**Umsetzung – `DELETE /api/categories/:id`:**
- Prüfen, ob Kategorie in Transactions, CategoryBudgets oder Recurrences vorkommt
- Wenn ja: HTTP 409 mit strukturiertem Fehler-Body

**Umsetzung – `PATCH /api/accounts/:id` (members-Array):**
- Wenn der Payload ein `members`-Array enthält: prüfen, ob mindestens ein Owner erhalten bleibt
- Wenn durch das neue Array der letzte Owner entfernt oder herabgestuft würde: HTTP 409
- Hinweis: Die UI nutzt für Rollenänderungen in der Master-Data-Page keinen members-Array-Patch, sondern den Account-Members-Endpunkt. Der Guard schützt trotzdem gegen direkte API-Calls.

**DoD:**
- Alle drei Endpunkte blocken riskante Operationen auch ohne UI-Unterstützung
- Bestehende Happy-Path-Flows bleiben unverändert
- HTTP-Status 409 mit verständlichem Fehler-Body

---

## Task 0.5 – OpenAPI-Spezifikation erweitern

**Ziel:** Neuer Endpunkt und Schema-Erweiterungen sind dokumentiert.

**Umsetzung:**
- Pfad `/api/accounts/{accountId}/master-data` in `docs/openapi.yaml` eintragen
- Response-Schema `AccountMasterDataResponse` mit allen Unter-Schemas definieren
- Bestehende `PATCH /api/accounts/:id` Route um neue Settings-Felder erweitern
- HTTP 409-Fehlerantworten für Guards dokumentieren

**DoD:**
- Swagger/Docs zeigen den neuen Endpunkt
- Response-Schema stimmt mit der Implementierung überein

---

**Zustand nach Abschluss Baustein 0:** Backend liefert das Master-Data-ReadModel und schützt alle riskanten Schreiboperationen. Frontend und alle bestehenden Features bleiben vollständig unverändert und lauffähig.

---

# Baustein 1 – Route, Shell-Anbindung & Grundgerüst

## Task 1.1 – `manage`-Route als Lazy-Loading-Segment anlegen

**Ziel:** Die Route `/accounts/:accountId/manage/master-data` ist erreichbar.

**Umsetzung:**
- In `accounts.routes.ts` unter dem `:accountId`-Child ein `manage`-Segment hinzufügen
- `manage` lädt ein eigenes Routen-Array lazy via `loadChildren`
- Innerhalb des `manage`-Arrays: `master-data` → `MasterDataPageComponent`
- **Wichtig (Impl-Hinweis 21.2.1):** `provideStates([MasterDataPageState])` ausschließlich im `manage`-Route-Level setzen, **nicht** am `:accountId`-Root-Level, damit kein ungewolltes State-Sharing mit Overview/Monat entsteht

**DoD:**
- `/accounts/:id/manage/master-data` ist navigierbar
- Deep-Link funktioniert (kein Blank-Screen)
- Kein State-Leak in bestehende Account-States

---

## Task 1.2 – AccountShell: Einstiegspunkt zur Stammdaten-Page anbinden

**Ziel:** Nutzer können aus der bestehenden Shell zur Verwaltung navigieren.

**Umsetzung:**
- AccountShell: Link oder Icon-Button „Account verwalten" / „Einstellungen" ergänzen
- Navigation zu `/accounts/:accountId/manage/master-data`
- Bestehende Tabs (Übersicht, Buchungen, Monat) bleiben unverändert
- Der Manage-Bereich ist kein gleichwertiger Tab, sondern ein Verwaltungseinstieg (z. B. Zahnrad-Icon oder separater Link)

**DoD:**
- Nutzer erreicht die Stammdaten-Page über die Shell
- Bestehende Tabs und Routen unverändert lauffähig

---

## Task 1.3 – Seitenlayout-Grundgerüst anlegen

**Ziel:** Feste Hauptstruktur der Stammdaten-Page ohne echte Daten oder Logik.

**Komponenten anlegen (nur Grundgerüst):**
```
features/accounts/account-management/master-data/
├── master-data-page.component.ts
├── account-master-section.component.ts
├── member-master-section.component.ts
├── member-editor-sidebar.component.ts
├── category-master-section.component.ts
├── category-editor-sidebar.component.ts
└── custom-split-editor.component.ts
```

**Seitenstruktur:**
- Seitenheader: Titel „Stammdaten", Untertitel laut Konzept
- Desktop: linke Sticky-Sekundärnavigation mit Ankern (Account / Mitglieder / Kategorien), rechte Inhaltsfläche
- Mobile: drei Accordions (Account / Mitglieder / Kategorien) – noch Platzhalter
- Bereiche zeigen statischen Placeholder-Text

**DoD:**
- Struktur entspricht finaler Seitenarchitektur
- Reihenfolge der Bereiche stimmt
- App bleibt vollständig lauffähig und navigierbar

---

# Phase 2 – State, Services & Interfaces

## Task 2.1 – `AccountMasterDataResponse`-Interfaces im Feature-Ordner definieren

**Ziel:** API-Response-Typen für die Stammdaten-Page sauber und isoliert definieren.

**Wichtig (Impl-Hinweis 21.2.2):** Diese Interfaces kommen in eine **eigene Datei** im Feature-Ordner (`account-master-data.models.ts`). Sie dürfen **nicht** das bestehende `AccountModel` aus `src/app/shared/models/account.model.ts` importieren, erweitern oder davon ableiten – das ist ein Legacy-Frontend-Aggregat und hat eine andere Struktur.

**Interfaces:**
```ts
AccountMasterDataResponse {
  account: AccountMasterVm;
  members: MemberMasterItemVm[];
  categories: CategoryMasterItemVm[];
  meta: MasterDataMetaVm;
}

AccountMasterVm {
  _id: string;
  name: string | null;
  currency: string;
  memberCount: number;
  settings: {
    dashboard: { historyMonths: number; topKCategories: number; };
    alerts: {
      lowBalanceForecastMinor: number | null;
      carryoverLargeMinor: number | null;
      stalenessDays: number | null;
    };
  };
}

MemberMasterItemVm {
  memberId: string;
  name: string | null;
  email: string | null;
  avatar?: string | null;
  role: 'owner' | 'member';
  hasUserAccount: boolean;
  canRemoveFromAccount: boolean;
  canChangeRole: boolean;
  usageHints: string[];
}

CategoryMasterItemVm {
  categoryId: string;
  name: string | null;
  customSplit: Array<{ memberId: string; split: number; }>;
  hasCustomSplit: boolean;
  customSplitLabel: string | null;
  transactionCount: number;
  recurrenceCount: number;
  hasBudget: boolean;
  canDelete: boolean;
  usageHints: string[];
}

MasterDataMetaVm {
  uncategorizedTransactionCount: number;
  hasSingleMemberInfo: boolean;
  infoHints: string[];
  warningHints: string[];
}
```

**DoD:**
- Alle Interfaces existieren in einer eigenen Datei
- Kein Import aus `account.model.ts`
- TypeScript-Fehler in Konsumenten würden korrekte Abweichungen anzeigen

---

## Task 2.2 – `MasterDataPageState` und Actions anlegen

**Ziel:** Schlanker Page-State für das ReadModel und UI-Zustände.

**State-Modell:**
```ts
MasterDataPageStateModel {
  vm: AccountMasterDataResponse | null;
  loading: boolean;
  error: string | null;
  activeSection: 'account' | 'members' | 'categories';
  editor:
    | { kind: 'member'; mode: 'create' | 'edit'; memberId?: string }
    | { kind: 'category'; mode: 'create' | 'edit'; categoryId?: string }
    | null;
}
```

**Wichtig:** Dieser State enthält **keine** normalisierten Entity-Maps für Members oder Categories. Er enthält ausschließlich das ViewModel des ReadModel-Calls und UI-Zustandsdaten.

**Actions:**
```ts
LoadMasterData(accountId: string)
ReloadMasterData()
OpenMemberSidebar(mode: 'create' | 'edit', memberId?: string)
OpenCategorySidebar(mode: 'create' | 'edit', categoryId?: string)
CloseMasterDataSidebar()
SaveAccountMasterData(payload)
CreateMemberForAccount(payload)
UpdateMemberForAccount(memberId: string, payload)
RemoveMemberFromAccount(memberId: string)
CreateCategory(payload)
UpdateCategory(categoryId: string, payload)
DeleteCategory(categoryId: string)
```

Nach jeder erfolgreichen Schreibaktion:
1. Sidebar schließen via `CloseMasterDataSidebar()`
2. Toast anzeigen
3. `ReloadMasterData()` ausführen

**DoD:**
- State ist angelegt und über `provideStates` auf dem `manage`-Route-Level registriert
- Alle Actions sind definiert
- `LoadMasterData` wird beim Initialisieren der Page dispatched

---

## Task 2.3 – Master-Data-API-Service anlegen

**Ziel:** HTTP-Calls zur Master-Data-Page sind in einem dedizierten Service gekapselt.

**Umsetzung:**
- `MasterDataApiService` anlegen (oder Methode in bestehendem `AccountDataService`, wenn passend)
- `getMasterData(accountId: string): Observable<AccountMasterDataResponse>`
- Später: Schreibmethoden für Members und Kategorien (können auch aus bestehenden Services kommen)

**DoD:**
- Service ist injizierbar
- HTTP-Call trifft korrekten Endpunkt
- Fehler propagieren korrekt in den State

---

## Task 2.4 – Loading / Error / Empty States bauen

**Ziel:** Die Seite ist in allen Zuständen verständlich.

**Fälle:**
- Laden: Skeleton-Platzhalter pro Sektion
- Fehler: Error-Banner mit Retry-Option
- Keine Mitglieder (Legacy/Fehldaten): Hinweistext laut Konzept 15.1
- Keine Kategorien: Hinweistext

**DoD:**
- Kein unkommentierter leerer Zustand
- Retry-Aktion dispatcht `ReloadMasterData()`

---

# Phase 3 – Bereich „Account"

## Task 3.1 – Account-Basisdaten und Settings anzeigen

**Ziel:** `account-master-section.component.ts` zeigt die Daten aus `AccountMasterVm`.

**Zwei Cards:**
1. Account-Card: Name, Währung (read-only `EUR`), Mitgliederanzahl
2. Settings-Card: historyMonths, topKCategories, Alert-Schwellen (Minor Units → Euro-Anzeige), stalenessDays

**Darstellung der Schwellenwerte:**
- `lowBalanceForecastMinor` und `carryoverLargeMinor` kommen in Minor Units (Cent)
- Anzeige in der UI als Euro-Wert: `value / 100` formatiert
- Speichern in das API als Minor Units: `displayValue * 100`
- `null` → Feld zeigt „Nicht gesetzt"

**DoD:**
- Alle Settings-Felder von `AccountMasterVm.settings` werden angezeigt
- Minor-Units-Konvertierung ist korrekt
- Kein Edit-State, nur Darstellung

---

## Task 3.2 – Account-Name und Settings editierbar machen

**Ziel:** Nutzer können Account-Namen und Settings bearbeiten und speichern.

**Formular-Validierung:**
- Name: Pflichtfeld, 2–64 Zeichen
- `historyMonths`: 3–24
- `topKCategories`: 1–10
- Alert-Schwellen: optionale positive Zahl (Euro-Eingabe, intern als Minor Units)
- `stalenessDays`: optionale positive Ganzzahl

**Speichern via `SaveAccountMasterData`-Action:**
- `PATCH /api/accounts/:id` mit geänderten Feldern
- Erfolg: `ReloadMasterData()` + Toast „Account gespeichert"
- Fehler: Fehlermeldung nahe am Formular, kein Toast

**DoD:**
- Account-Name und alle Settings aus 7.2 des Konzepts sind bearbeitbar
- Validierung verhindert ungültige Speicherungen
- Nach Speichern wird AccountShell-Header (Account-Name) aktualisiert

---

# Phase 4 – Bereich „Mitglieder"

## Task 4.1 – Mitgliederliste anzeigen

**Ziel:** `member-master-section.component.ts` zeigt alle Members aus dem ReadModel als Card-Liste.

**Pro Member-Card:**
- Name (Fallback: „Unbenanntes Mitglied" für Legacy-Daten)
- Rollen-Badge: „Owner" / „Member"
- App-Zugang-Status: „Mit App-Zugang" / „Ohne App-Zugang"
- E-Mail (wenn gesetzt)
- Button „Bearbeiten" → öffnet `OpenMemberSidebar('edit', memberId)`
- Button „Aus Account entfernen":
  - `canRemoveFromAccount=false` → Button disabled oder visuell blockiert + `usageHints` als Tooltip/Hinweistext
  - `canRemoveFromAccount=true` → Button aktiv

**Info-Hinweis bei einzelnem Mitglied:**
- Nicht `hasSingleMemberInfo` aus Meta verwenden, sondern direkt `accountVm.memberCount === 1` prüfen (Impl-Hinweis 21.2.6)
- Hinweistext: „Dieser Account hat aktuell nur ein Mitglied. Für ein Gemeinschaftskonto sind normalerweise mindestens zwei Mitglieder sinnvoll."

**DoD:**
- Alle Members werden korrekt dargestellt
- Blockier-Zustände sind sichtbar
- Kein Zugriff auf `getMembersWithIds` aus `MembersDataService` (Impl-Hinweis 21.2.4)

---

## Task 4.2 – Member-Editor-Sidebar bauen

**Ziel:** `member-editor-sidebar.component.ts` für Create- und Edit-Modus.

**Felder:**
- Name: Pflichtfeld, 2–64 Zeichen
- E-Mail: optional, wenn gesetzt valide
- Rolle: `owner` / `member`, Pflicht
  - Im Edit-Modus: wenn `canChangeRole=false` (letzter Owner) → Feld disabled mit Hinweis „Letzter Owner kann nicht herabgestuft werden"
- App-Zugang-Status: read-only, nur Anzeige
- Avatar: read-only, nur Anzeige falls vorhanden

**Verhalten:**
- Create-Modus: alle Felder leer, Rolle-Default `member`
- Edit-Modus: Werte vorbelegt aus `MemberMasterItemVm`
- Speichern-Button disabled, wenn Formular invalid

**DoD:**
- Sidebar öffnet sich im korrekten Modus
- Validierung greift korrekt
- letzter Owner ist vor Herabstufung geschützt

---

## Task 4.3 – Mitglied hinzufügen (Create-Flow)

**Ziel:** Neues Mitglied anlegen und dem Account zuordnen.

**Flow via `CreateMemberForAccount`-Action:**
1. `POST /api/members` → neuer `Member` in der Members-Collection (Name, E-Mail)
2. `POST /api/accounts/:id/members` → Member dem Account zuordnen (memberId, role)
   - Dieser Endpunkt hat nach Task 0.3 eine Zod-Validierung
3. Erfolg: `CloseMasterDataSidebar()` + Toast „Mitglied hinzugefügt" + `ReloadMasterData()`

**Wichtig (Impl-Hinweis 21.2.4):** Nach dem Create **kein** `getMembersWithIds` aufrufen. Stattdessen ausschließlich `ReloadMasterData()` verwenden – das ReadModel liefert alle nötigen Daten.

**DoD:**
- Member wird erstellt und dem Account zugeordnet
- ReadModel wird neu geladen
- Fehlerfall (z. B. Duplikat) wird sichtbar behandelt

---

## Task 4.4 – Mitglied bearbeiten (Edit-Flow)

**Ziel:** Name, E-Mail und Rolle eines bestehenden Members ändern.

**Flow via `UpdateMemberForAccount`-Action:**
- Namens-/E-Mail-Änderung: `PATCH /api/members/:id`
- Rollenänderung: Der Account-Members-Endpunkt für Rollenänderung nutzen (je nach vorhandenem Endpunkt: `PATCH /api/accounts/:id/members/:memberId` oder `PATCH /api/accounts/:id`)
  - Last-Owner-Check muss hier greifen (Backend-Guard aus Task 0.4)
- Erfolg: `CloseMasterDataSidebar()` + Toast „Mitglied gespeichert" + `ReloadMasterData()`

**DoD:**
- Alle bearbeitbaren Felder können gespeichert werden
- letzter Owner ist serverseitig vor Rollenänderung geschützt
- ReadModel wird neu geladen

---

## Task 4.5 – Mitglied aus Account entfernen

**Ziel:** Mitglied aus dem Account entfernen, sofern serverseitig erlaubt.

**Flow via `RemoveMemberFromAccount`-Action:**
- Prüfung `canRemoveFromAccount` aus ReadModel (UI-Schutz)
- Bei `true`: Confirm-Dialog anzeigen
- Bestätigt: `DELETE /api/accounts/:id/members/:memberId`
  - Backend-Guard aus Task 0.4 greift als zweite Absicherung
- Erfolg: `CloseMasterDataSidebar()` + Toast „Mitglied entfernt" + `ReloadMasterData()`
- Fehler HTTP 409: Hinweistext aus Fehler-Body anzeigen

**Wichtig:** Die UI verwendet **nie** `DELETE /api/members/:id` (globaler Member-Delete ohne Referenzprüfung, Impl-Hinweis 21.1.4). Ausschließlich den Account-Members-Endpunkt nutzen.

**DoD:**
- Entfernen ist nur möglich, wenn `canRemoveFromAccount=true`
- Confirm-Dialog schützt vor versehentlichem Entfernen
- `usageHints` sind im Blockier-Zustand sichtbar

---

# Phase 5 – Bereich „Kategorien"

## Task 5.1 – Kategorienliste anzeigen

**Ziel:** `category-master-section.component.ts` zeigt alle Kategorien als kompakte Liste.

**Pro Kategorie:**
- Name (Fallback: „Unbenannte Kategorie" für Legacy-Daten)
- Split-Label: `customSplitLabel` aus ReadModel (z. B. „Tony 60 %, Caro 40 %") oder „Standard-Verteilung"
- „Wird verwendet in X Buchungen" (aus `transactionCount`)
- Budget-Status: „Budget vorhanden" / „Kein Budget" (aus `hasBudget`)
- Button „Bearbeiten" → `OpenCategorySidebar('edit', categoryId)`
- Lösch-Button:
  - `canDelete=false` → disabled + `usageHints` als Hinweistext
  - `canDelete=true` → aktiv

**Hinweiszeile nicht kategorisierte Buchungen:**
- Wenn `meta.uncategorizedTransactionCount > 0`:
  ```
  Nicht kategorisierte Buchungen: 3
  [In Buchungen anzeigen]
  ```
- Diese Zeile ist keine bearbeitbare Kategorie

**DoD:**
- Alle Kategorien werden korrekt mit Usage-Infos angezeigt
- Blockier-Zustände sind sichtbar
- Hinweiszeile erscheint nur wenn relevant

---

## Task 5.2 – Kategorie-Editor-Sidebar bauen

**Ziel:** `category-editor-sidebar.component.ts` für Create- und Edit-Modus.

**Felder:**
- Name: Pflichtfeld, 2–64 Zeichen
- Toggle „Eigene Verteilung für diese Kategorie verwenden"
- Custom-Split-Editor (eingebettete `custom-split-editor.component.ts`), nur wenn Toggle aktiv

**Zusätzlich im Edit-Modus (read-only):**
- Usage-Hints aus `CategoryMasterItemVm.usageHints`
- Budget-Status + Link „In Planung bearbeiten" (Link zu Planung-Bereich; wenn noch nicht existiert: Link vorbereiten aber deaktiviert)

**Hinweistext Custom Split (laut Konzept 9.8.4):**
```
Diese Verteilung kann für kategoriespezifische Monatsberechnungen verwendet werden.
Ohne eigene Verteilung nutzt die Kategorie die Standardlogik aus der Planung.
```

**DoD:**
- Sidebar öffnet sich im korrekten Modus
- Custom-Split-Editor erscheint ausschließlich wenn Toggle aktiv
- Validierung verhindert Speichern mit ungültigem Split

---

## Task 5.3 – Custom-Split-Editor Komponente

**Ziel:** `custom-split-editor.component.ts` erlaubt das vollständige Bearbeiten eines Custom Split.

**Datenquelle:** Members aus `vm.members` des ReadModel (nicht aus einem separaten Members-State).

**UI:**
- Zeile pro Account-Member: Name + Prozent-Eingabefeld (0–100)
- Summenanzeige: aktueller Stand, farblich markiert (grün bei 100, rot bei Abweichung)
- Warnung bei Member im Split, der nicht mehr im Account ist (inkonsistente historische Daten)

**Validierungslogik (Impl-Hinweis 21.2.5):**

Zwei klar getrennte Zustände:
- **Toggle inaktiv** → `customSplit` wird als `[]` gespeichert; keine Summenvalidierung nötig
- **Toggle aktiv** → Speichern ist blockiert, solange:
  - weniger als 1 Eintrag vorhanden ist, **oder**
  - die Summe nicht exakt 100 ergibt

Dieser Unterschied muss im State/Formular-Modell explizit abgebildet werden. Ein leeres Array bei aktivem Toggle ist ein Validierungsfehler.

**Wichtig (Impl-Hinweis 21.2.3):** `customSplit` im ReadModel ist ausschließlich das Array-Format `{ memberId, split }[]`. Kein Map-Format `{ [memberId]: number }` verwenden oder annehmen – auch nicht in Hilfsfunktionen.

**DoD:**
- Split-Werte können pro Member eingegeben werden
- Summe wird live angezeigt
- Toggle-inaktiv-Zustand speichert `[]` ohne Summencheck
- Toggle-aktiv-Zustand erzwingt gültige Summe
- Kein Map-Format wird genutzt

---

## Task 5.4 – Kategorie hinzufügen (Create-Flow)

**Ziel:** Neue Kategorie anlegen.

**Flow via `CreateCategory`-Action:**
- `POST /api/categories` mit Name und optional `customSplit`-Array
- Erfolg: `CloseMasterDataSidebar()` + Toast „Kategorie hinzugefügt" + `ReloadMasterData()`

**DoD:**
- Neue Kategorie erscheint nach Reload in der Liste
- Optional gesetzter Custom Split wird korrekt gespeichert

---

## Task 5.5 – Kategorie bearbeiten (Edit-Flow)

**Ziel:** Name und Custom Split einer bestehenden Kategorie ändern.

**Flow via `UpdateCategory`-Action:**
- `PATCH /api/categories/:id` mit geänderten Feldern
- Erfolg: `CloseMasterDataSidebar()` + Toast „Kategorie gespeichert" + `ReloadMasterData()`

**DoD:**
- Bearbeitete Kategorie zeigt Änderungen nach Reload
- Custom-Split-Änderungen werden korrekt persistiert

---

## Task 5.6 – Kategorie löschen

**Ziel:** Kategorie löschen, sofern serverseitig erlaubt.

**Flow via `DeleteCategory`-Action:**
- Prüfung `canDelete` aus ReadModel (UI-Schutz)
- Bei `true`: Confirm-Dialog anzeigen
- Bestätigt: `DELETE /api/categories/:id`
  - Backend-Guard aus Task 0.4 greift als zweite Absicherung
- Erfolg: Toast „Kategorie gelöscht" + `ReloadMasterData()`
- Fehler HTTP 409: Hinweistext aus Fehler-Body anzeigen

**DoD:**
- Löschen ist nur möglich, wenn `canDelete=true`
- Confirm-Dialog schützt vor versehentlichem Löschen
- `usageHints` sind im Blockier-Zustand sichtbar

---

# Phase 6 – Polish, Mobile & QA

## Task 6.1 – Mobile Accordions

**Ziel:** Auf Mobile sind die drei Bereiche als Accordions dargestellt statt Sticky-Navigation.

**Umsetzung:**
- Viewport-Breakpoint: unterhalb Desktop werden Account / Mitglieder / Kategorien als Accordions dargestellt
- Sidebars öffnen sich auf Mobile fullscreen
- Reihenfolge: Account → Mitglieder → Kategorien

**DoD:**
- Mobile Darstellung ist ohne Sticky-Navigation bedienbar
- Sidebars decken fullscreen auf Mobile ab

---

## Task 6.2 – Sekundärnavigation: aktive Section markieren und Scroll-Ankoppelung

**Ziel:** Desktop-Navigation zeigt aktiv, auf welcher Section der Nutzer ist.

**Umsetzung:**
- Scroll-Position an `activeSection` im State koppeln
- Klick auf Navigationsitem scrollt zur Section
- Aktives Item in der Sekundärnavigation ist visuell markiert

**DoD:**
- Navigation und Scroll-Position sind synchron
- kein jankendes oder fehlerhaftes Scrollverhalten

---

## Task 6.3 – Confirm-Dialoge konsistent bauen

**Ziel:** Destructive Aktionen (Entfernen, Löschen) sind konsistent abgesichert.

**Confirm-Dialog erscheint nur:**
- Member aus Account entfernen (wenn `canRemoveFromAccount=true`)
- Kategorie löschen (wenn `canDelete=true`)

**Kein Confirm-Dialog bei:**
- blockierten Aktionen (ReadModel sagt false)
- Speichern / Bearbeiten

**DoD:**
- Confirm-Dialog hat klar verständlichen Text mit Objektnamen
- Abbrechen ist prominent möglich
- kein Dialog bei nicht erlaubten Aktionen

---

## Task 6.4 – Toast-System und Fehlerfeedback

**Umsetzung:**
- Erfolgs-Toast bei: Account gespeichert, Mitglied hinzugefügt, Mitglied gespeichert, Mitglied entfernt, Kategorie hinzugefügt, Kategorie gespeichert, Kategorie gelöscht
- Fehler bei Schreiboperationen: Fehlermeldung nahe am Formular, nicht nur als Toast
- HTTP 409 (Guard geblockt): strukturierter Hinweistext aus dem Fehler-Body

**DoD:**
- konsistentes Feedback bei allen Schreiboperationen
- Nutzer weiß immer, ob eine Aktion erfolgreich war oder warum sie fehlgeschlagen ist

---

## Task 6.5 – Edge Cases prüfen

**Ziel:** Alle in Konzept Abschnitt 15 definierten Edge Cases sind abgedeckt.

**Checkliste:**
- Account ohne Mitglieder (Legacy): Hinweistext laut 15.1
- Account mit nur einem Mitglied: Info-Hinweis (via `memberCount === 1`)
- Member ohne Namen: Fallback „Unbenanntes Mitglied"
- Kategorie ohne Namen: Fallback „Unbenannte Kategorie"
- Kategorie mit ungültigem Custom Split: Warnbadge „Split prüfen", Bearbeiten führt direkt in Custom-Split-Bereich
- Settings-Felder mit `null`: Anzeige „Nicht gesetzt", kein Crash
- Nicht kategorisierte Buchungen: Hinweiszeile im Kategorienbereich

**DoD:**
- Jeder Edge Case hat eine sichtbare, klare Nutzerrückmeldung
- Keine leeren/kaputten Teilflächen ohne Erklärung

---

## Task 6.6 – Zahlenkonsistenz und Anzeige-Validierung

**Ziel:** Minor-Units-Konvertierung und Custom-Split-Prozentwerte sind in allen Kontexten konsistent.

**Prüfpunkte:**
- `lowBalanceForecastMinor` und `carryoverLargeMinor`: Frontend zeigt Euro, API speichert Cent
- Custom Split: Summenanzeige stimmt mit gespeichertem Wert überein
- `transactionCount` / `recurrenceCount` aus ReadModel erscheinen korrekt in Listenzeilen

**DoD:**
- Kein Wert wird doppelt konvertiert (Minor Units → Euro → Minor Units)
- Custom-Split-Summe im Editor stimmt immer mit gespeichertem Wert überein

---

## 5. Empfohlene Mini-Meilensteine

### Milestone A – „Erreichbar"
- Backend-Endpunkt liefert Daten
- Route ist navigierbar
- Grundgerüst steht

### Milestone B – „Lesbar"
- Account-Daten werden angezeigt
- Mitgliederliste wird angezeigt
- Kategorienliste wird angezeigt
- Loading/Error States funktionieren

### Milestone C – „Account verwaltbar"
- Account-Name und Settings bearbeitbar und speicherbar

### Milestone D – „Mitglieder verwaltbar"
- Mitglied hinzufügen
- Mitglied bearbeiten
- Mitglied aus Account entfernen (mit Guard und Confirm)

### Milestone E – „Kategorien verwaltbar"
- Kategorie hinzufügen
- Kategorie bearbeiten inkl. Custom-Split-Editor
- Kategorie löschen (mit Guard und Confirm)

### Milestone F – „Robust & fertig"
- Mobile Accordions
- alle Edge Cases abgedeckt
- Toasts und Confirm-Dialoge konsistent
- Minor-Units-Konvertierung verifiziert

---

## 6. Wichtigste Regeln für neue Agents

1. Der einzige Dateneingang für die Seite ist `GET /api/accounts/:accountId/master-data`. Kein eigenes Client-seitiges Berechnen von `canDelete`, `canRemoveFromAccount` oder `usageHints`.
2. **Zwei-Ebenen-Schutz** für riskante Aktionen: ReadModel-Flag blockiert die UI, CRUD-Guard auf dem Server blockt direkte API-Calls.
3. `MasterDataPageState` **nur** auf dem `manage`-Route-Level registrieren, nicht am `:accountId`-Root.
4. Das neue `AccountMasterDataResponse`-ViewModel **nie** aus dem alten `AccountModel` ableiten – eigene Datei, eigene Interfaces.
5. `customSplit` ist immer ein Array `{ memberId, split }[]`, nie eine Map. Auch in Hilfsfunktionen und Tests.
6. Toggle aktiv + leeres Array = Validierungsfehler. Toggle inaktiv + leeres Array = gültiger Zustand.
7. Nach jeder Schreibaktion: `CloseMasterDataSidebar()` → Toast → `ReloadMasterData()`. Kein optimistisches Patchen.
8. Member-Add-Flow nutzt **nie** `getMembersWithIds`. Daten kommen nach Reload aus dem ReadModel.
9. Die UI-Seite nutzt **nie** `DELETE /api/members/:id`. Ausschließlich `DELETE /api/accounts/:id/members/:memberId`.
10. `hasSingleMemberInfo` aus Meta nicht für UI-Logik verwenden – stattdessen `memberCount === 1` direkt auswerten.
