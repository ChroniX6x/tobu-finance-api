# ToBu – Stammdaten-Page Konzept V2

**Stand:** 2026-05-03  
**Status:** V2-Konzept mit festgezurrten MVP-Entscheidungen  
**Ziel:** Agent-ready Konzept für die Stammdaten-Verwaltung im Account-Kontext von ToBu.

---

## 1. Ziel der Stammdaten-Page

Die Stammdaten-Page ist die zentrale Verwaltungsseite für die stabilen Grundobjekte eines Accounts.

Sie beantwortet die Frage:

> Welche grundlegenden Objekte existieren in diesem Account und wie sind sie benannt, zugeordnet und verwendbar?

Zur Stammdaten-Page gehören im MVP:

1. **Account-Basisdaten**
2. **Account-Settings**
3. **Mitglieder**
4. **Kategorien**

Die Seite ist bewusst keine Planungsseite, keine Buchungsseite, keine Wiederkehrer-Verwaltung und kein Kontostandsabgleich.

---

## 2. Einordnung in die Account-Verwaltung

Die Account-Verwaltung wird in folgende Hauptbereiche getrennt:

```text
Account verwalten
├── Setup              spätere Readiness-/Checklisten-Ebene, für MVP zurückgestellt
├── Stammdaten         Account, Settings, Mitglieder, Kategorien
├── Planung            Budgets, Einkommen, Beitragsregeln, TopUps
├── Wiederkehrer       Wiederkehrende Ausgaben und Einnahmen
└── Kontostand         Kontostand-Snapshots, Startsaldo, Carryovers
```

Für den MVP wird der Setup-Tab zurückgestellt. Die Stammdaten-Page wird als erster Verwaltungsbereich umgesetzt, weil sie die Basisobjekte bereitstellt, auf die Buchungen, Monat, Planung und Overview referenzieren.

---

## 3. Fachliche Abgrenzung

### 3.1 Was sind Stammdaten?

Stammdaten sind in ToBu die relativ stabilen Grundobjekte eines Accounts:

- Der Account selbst
- Accountweite Settings
- Die Mitglieder des Accounts
- Die Kategorien für Buchungen

Sie ändern sich nicht zwingend jeden Monat und bilden die Grundlage für operative und planerische Bereiche.

### 3.2 Was sind keine Stammdaten?

Nicht in die Stammdaten-Page gehören:

| Thema | Zielbereich | Begründung |
|---|---|---|
| Category Budgets | Planung | Budgets sind zeitabhängige Planwerte. |
| Member Incomes | Planung | Einkommen sind historische/zeitabhängige Berechnungsgrundlagen. |
| Contribution Rules | Planung | Regeln bestimmen monatliche Sollwerte. |
| TopUps / Sonderbeiträge | Planung | Sie beeinflussen die Monatslogik. |
| Recurrences | Wiederkehrer | Vorlagen, aus denen echte Buchungen entstehen. |
| Account Balances | Kontostand | Reale Kontostand-Snapshots. |
| Carryovers | Kontostand / Korrekturen | Überträge zwischen Monaten. |
| Transactions | Buchungen | Operative Geldbewegungen. |
| Einzahlungen | Monat / Buchungen | Monatsbezogene operative Vorgänge. |

### 3.3 Sonderfall Kategorie-Split

Kategorien können einen `customSplit` besitzen. Das ist fachlich ein Grenzfall:

- Die Kategorie selbst ist Stammdatum.
- Der `customSplit` beeinflusst spätere Berechnungen.

Für den MVP ist `customSplit` in der Kategorieverwaltung vollständig bearbeitbar, weil er direkt an der Kategorie hängt. Die UI muss klar machen, dass dieser Wert berechnungsrelevant ist.

---

## 4. Seitenziel aus Nutzersicht

Nutzer sollen auf der Stammdaten-Page:

- den Account-Namen ändern können,
- accountweite Settings pflegen können,
- sehen, welche Mitglieder zum Account gehören,
- Mitglieder hinzufügen und bearbeiten können,
- Mitglieder ohne App-Account verwalten können,
- Rollen im Account verwalten können,
- Kategorien anlegen, bearbeiten und löschen können,
- Kategorie-spezifische `customSplit`-Verteilungen vollständig bearbeiten können,
- erkennen, ob eine Kategorie bereits verwendet wird,
- erkennen, ob eine Kategorie ein Budget besitzt,
- bei riskanten Änderungen klare Hinweise und Blocker erhalten.

Die Seite soll nicht wie eine technische Datenbankverwaltung wirken. Sie ist eine ruhige, übersichtliche Verwaltungsfläche für Grunddaten.

---

## 5. Route und Navigation

### 5.1 Finale Route

```text
/accounts/:accountId/manage/master-data
```

Die technische Route ist englisch. Die UI verwendet den deutschen Begriff:

```text
Account verwalten > Stammdaten
```

### 5.2 Position in der Account-Verwaltung

Die Stammdaten-Page liegt unter `Account verwalten`. Sie ist nicht direkt Teil der operativen Haupttabs:

- Übersicht
- Buchungen
- Monat

Diese Seiten bleiben operative Account-Bereiche. Die Stammdaten-Page ist eine Verwaltungsseite.

### 5.3 Navigation innerhalb der Page

Die Page besteht fachlich aus einer gemeinsamen Seite mit interner Bereichsnavigation:

```text
Stammdaten
├── Account
├── Mitglieder
└── Kategorien
```

Desktop:

- linke Sticky-Sekundärnavigation
- rechte Inhaltsfläche
- Bereiche: Account, Mitglieder, Kategorien

Mobile:

- Bereiche als Accordions
- Reihenfolge: Account, Mitglieder, Kategorien
- Editor-Sidebars öffnen fullscreen

---

## 6. Grundlayout

### 6.1 Seitenheader

```text
Stammdaten
Verwalte Account, Mitglieder und Kategorien. Planungswerte wie Budgets und Einkommen werden separat gepflegt.
```

Es gibt keine globale Speichern-Aktion für die gesamte Seite.

### 6.2 Speichern

Die Page speichert objektbezogen:

- Account-Bereich speichert Account-Name und Settings.
- Mitglieder-Sidebar speichert genau ein Mitglied bzw. eine Mitgliedschaft.
- Kategorien-Sidebar speichert genau eine Kategorie.

Begründung:

- bessere Fehlerbehandlung
- geringeres Risiko bei parallelen Änderungen
- klarere API-Zuordnung
- weniger komplexer UI-State

---

# 7. Bereich „Account“

## 7.1 Zweck

Der Account-Bereich verwaltet die grundlegenden Eigenschaften des aktuellen Accounts sowie einfache accountweite Settings.

## 7.2 MVP-Felder

| Feld | Bearbeitbar | Bemerkung |
|---|---:|---|
| Account-Name | Ja | Pflichtfeld in der UI |
| Währung | Nein | Für MVP read-only `EUR` |
| Mitgliederanzahl | Nein | Info aus Account-Members |
| Dashboard History Months | Ja | Account-Setting |
| Dashboard Top-K Kategorien | Ja | Account-Setting |
| Low-Balance-Forecast-Schwelle | Ja | Account-Setting |
| Carryover-Large-Schwelle | Ja | Account-Setting |
| Staleness Days | Ja | Account-Setting |

## 7.3 Nicht im Account-Bereich

Nicht hier pflegen:

- Startsaldo
- Kontostand-Snapshots
- Carryovers
- Budgets
- Einkommen
- Beitragsregeln
- Wiederkehrer

Diese Daten gehören in die separaten Bereiche Planung, Wiederkehrer und Kontostand.

## 7.4 UI-Struktur

Der Account-Bereich besteht aus zwei Cards:

```text
Account
- Name
- Währung read-only
- Mitgliederanzahl

Account-Settings
- Dashboard-Verlauf
- Top-K Kategorien
- Warnschwellen
- Staleness Days
```

## 7.5 Validierung

Account-Name:

- Pflichtfeld
- 2–64 Zeichen
- Fallback für Legacy-Daten: „Unbenannter Account“ anzeigen, aber beim Speichern Name verlangen

Währung:

- MVP: read-only `EUR`

Settings:

- `historyMonths`: 3–24
- `topKCategories`: 1–10
- Schwellenwerte als Minor Units speichern, in UI als Euro anzeigen
- `stalenessDays`: positive Ganzzahl

## 7.6 API

Speichern über:

```text
PATCH /api/accounts/:id
```

Nach erfolgreichem Speichern:

- Account-State aktualisieren
- Account-Shell/Header aktualisieren
- Toast: „Account gespeichert“

---

# 8. Bereich „Mitglieder“

## 8.1 Zweck

Der Mitgliederbereich verwaltet die fachlichen Personen, die zu einem Account gehören.

Mitglieder sind nicht zwingend App-User. Ein Mitglied kann ohne Login existieren und trotzdem für Einzahlungen, private Vorleistungen, Splits, Budgets und Auswertungen relevant sein.

## 8.2 User vs. Member

Ein `User` ist die technische Login-Identität. Ein `Member` ist die fachliche Person im Account.

Daraus folgt:

- Ein eingeloggter User kann mit einem Member verknüpft sein.
- Ein Member kann ohne User existieren.
- Ein Member kann in Account-Members mit einer Rolle geführt werden.

## 8.3 MVP-Felder pro Mitglied

| Feld | Bearbeitbar | Bemerkung |
|---|---:|---|
| Name | Ja | Pflichtfeld |
| E-Mail | Ja | Optional, aber wenn gesetzt valide |
| Avatar | Nein | Nur Anzeige, falls vorhanden |
| App-Zugang / User-Verknüpfung | Nein | Nur Statusanzeige |
| Account-Rolle | Ja | `owner` oder `member` |

## 8.4 App-Zugang

`hasUserAccount` wird nur angezeigt:

- „Mit App-Zugang“
- „Ohne App-Zugang“

Nicht Bestandteil von V2:

- Einladungssystem
- User manuell verknüpfen
- Login-Zuordnung ändern

## 8.5 Darstellung

Für Mitglieder wird eine Card-/Listenansicht verwendet, keine schwere Tabelle.

Beispiel:

```text
Mitglieder
Personen, die diesem Account zugeordnet sind.

[+ Mitglied hinzufügen]

Tony
Owner · Mit App-Zugang
E-Mail: tony@example.com
[Bearbeiten]

Caro
Member · Ohne App-Zugang
E-Mail: optional
[Bearbeiten] [Aus Account entfernen]
```

## 8.6 Mitglieder-Sidebar

Alle Add/Edit-Flows öffnen rechts eine Sidebar.

Desktop:

- rechte Sidebar

Mobile:

- fullscreen Sidebar

Sidebar-Felder:

- Name
- E-Mail
- Rolle
- Status App-Zugang read-only

## 8.7 Mitglied hinzufügen

Flow:

1. Button „Mitglied hinzufügen“
2. Sidebar öffnet sich
3. Name und optional E-Mail eingeben
4. Rolle wählen, Default `member`
5. Speichern
6. System erstellt Member und ordnet ihn dem Account zu

MVP-API-Variante:

1. `POST /api/members`
2. `POST /api/accounts/:id/members`

Wenn später ein Composite-Endpunkt existiert, kann der Flow intern vereinfacht werden. Die UI bleibt gleich.

## 8.8 Mitglied bearbeiten

Bearbeitbar:

- Name
- E-Mail
- Rolle im Account

Nicht bearbeitbar:

- User-Verknüpfung
- Login-Status
- Avatar

## 8.9 Mitglied aus Account entfernen

In V2 gibt es nur:

```text
Aus Account entfernen
```

Es gibt kein hartes Löschen eines Members in der Stammdaten-Page.

### 8.9.1 Grundproblem Datenleichen

Ein reines Entfernen aus dem Account kann Datenleichen oder widersprüchliche historische Daten erzeugen, wenn der Member noch referenziert wird.

Beispiele:

- private Buchungen mit `paidByMemberId`
- Category-`customSplit`
- Contribution Rules
- Member Incomes
- Carryovers
- Account-Rolle Owner

Deshalb gilt für den MVP:

> Entfernen wird blockiert, wenn der Member noch fachlich relevante Referenzen besitzt.

Damit entstehen keine neuen Datenleichen durch den Stammdaten-Flow.

### 8.9.2 Server-seitige Blocker

`canRemoveFromAccount=false`, sobald der Member in mindestens einem der folgenden Bereiche referenziert wird:

- `transactions.paidByMemberId`
- `categories.customSplit.memberId`
- `contributionRules.distribution.memberId`
- `contributionRules.distribution.customSplit.memberId`
- `memberIncomes.memberId`
- `carryovers.memberId`
- letzter Owner
- letzter Account-Member

### 8.9.3 UI-Verhalten

Wenn `canRemoveFromAccount=false`:

- Button deaktiviert oder sichtbar blockiert
- Hinweis mit Gründen aus `usageHints`
- kein Confirm-Dialog

Wenn `canRemoveFromAccount=true`:

- Button aktiv
- Confirm-Dialog
- danach API-Call

## 8.10 Letzter Owner

Der letzte Owner darf nicht entfernt oder auf `member` heruntergestuft werden.

Diese Regel muss serverseitig und frontendseitig geschützt werden.

## 8.11 Account mit nur einem Mitglied

Ein Account mit nur einem Mitglied ist erlaubt.

Die UI zeigt einen Info-Hinweis:

```text
Dieser Account hat aktuell nur ein Mitglied. Für ein Gemeinschaftskonto sind normalerweise mindestens zwei Mitglieder sinnvoll.
```

Dieser Hinweis ist kein Blocker. Später kann er zusätzlich über das Insights-System erscheinen.

## 8.12 Validierung

- Name: Pflicht, 2–64 Zeichen
- E-Mail: optional, valide wenn gesetzt
- Rolle: Pflicht, `owner` oder `member`
- letzter Owner geschützt
- Entfernen nur bei `canRemoveFromAccount=true`

---

# 9. Bereich „Kategorien“

## 9.1 Zweck

Kategorien klassifizieren Buchungen. Sie helfen dabei, Ausgaben und Einnahmen fachlich zu gruppieren und später Budgets, Auswertungen und Monatslogik nachvollziehbar zu machen.

Kategorien sind accountgebunden.

## 9.2 MVP-Felder pro Kategorie

| Feld | Bearbeitbar | Bemerkung |
|---|---:|---|
| Name | Ja | Pflichtfeld |
| Custom Split aktiv | Ja | Optional |
| Custom Split Werte | Ja | Vollständig bearbeitbar |
| Verwendungsstatus | Nein | Server-seitig berechnet |
| Budgetstatus | Nein | Server-seitig berechnet |
| Löschbarkeit | Nein | Server-seitig berechnet |

## 9.3 Darstellung

Kategorien werden als kompakte Liste dargestellt.

Beispiel:

```text
Kategorien
Kategorien werden zur Einordnung von Buchungen verwendet.

[+ Kategorie hinzufügen]

Lebensmittel
Standard-Verteilung
Verwendet in 24 Buchungen
Budget vorhanden
[Bearbeiten]

Miete
Eigene Verteilung: Tony 60 %, Caro 40 %
Verwendet in 12 Buchungen
Budget vorhanden
[Bearbeiten]
```

## 9.4 Kategorie-Sidebar

Alle Add/Edit-Flows öffnen rechts eine Sidebar.

Desktop:

- rechte Sidebar

Mobile:

- fullscreen Sidebar

Sidebar-Felder:

- Name
- Toggle „Eigene Verteilung verwenden“
- Custom-Split-Editor, wenn aktiv
- Usage-Hinweise read-only

## 9.5 Kategorie hinzufügen

Flow:

1. Button „Kategorie hinzufügen“
2. Sidebar öffnet sich
3. Name eingeben
4. Optional eigene Verteilung aktivieren
5. Speichern

Pflichtfelder:

- Name
- Account-ID aus Route/State

## 9.6 Kategorie bearbeiten

Bearbeitbar:

- Name
- Custom Split aktiv/inaktiv
- Custom Split je Mitglied

Nicht bearbeiten:

- Budgets
- historische Buchungen
- Monatswerte

## 9.7 Kategorie löschen

Verwendete Kategorien werden im MVP nicht gelöscht.

`canDelete=false`, sobald die Kategorie in mindestens einem der folgenden Bereiche referenziert wird:

- `transactions.categoryId`
- `categoryBudgets.categoryId`
- `recurrences.categoryId`

Wenn `canDelete=false`:

- Löschen ist blockiert
- UI zeigt `usageHints`
- kein Confirm-Dialog

Wenn `canDelete=true`:

- Löschen ist möglich
- Confirm-Dialog wird angezeigt
- danach API-Call

Spätere Erweiterungen:

- Kategorie archivieren
- Buchungen umkategorisieren
- Kategorie durch andere Kategorie ersetzen

## 9.8 Custom Split

### 9.8.1 Zweck

Ein Custom Split erlaubt eine kategoriespezifische Verteilung.

Beispiel:

- Miete: Tony 60 %, Caro 40 %
- Lebensmittel: Standard-Verteilung

### 9.8.2 UI-Verhalten

```text
[ ] Eigene Verteilung für diese Kategorie verwenden
```

Wenn aktiv:

```text
Tony   [60] %
Caro   [40] %
Summe: 100 %
```

### 9.8.3 Validierung

- Custom Split wird über die aktuellen Account-Members gepflegt.
- Jeder Account-Member darf maximal einmal vorkommen.
- Split-Werte: 0–100
- Summe muss exakt 100 ergeben.
- Entfernte oder nicht mehr vorhandene Member im Split erzeugen einen blockierenden Validierungsfehler.
- Speichern ist erst möglich, wenn der Split bereinigt ist.

### 9.8.4 Hinweistext

```text
Diese Verteilung kann für kategoriespezifische Monatsberechnungen verwendet werden. Ohne eigene Verteilung nutzt die Kategorie die Standardlogik aus der Planung.
```

## 9.9 Nicht kategorisierte Buchungen

`categoryId = null` ist ein gültiger Zustand und bedeutet „nicht kategorisiert“.

V2 zeigt im Kategorienbereich eine Systemzeile, wenn es nicht kategorisierte Buchungen gibt:

```text
Nicht kategorisierte Buchungen: 3
[In Buchungen anzeigen]
```

Diese Zeile ist keine bearbeitbare Kategorie.

## 9.10 Budget-Hinweis

Jede Kategorie zeigt einen Budgetstatus:

- „Budget vorhanden“
- „Kein Budget“

Bearbeitung erfolgt nicht in den Stammdaten.

Aktion:

```text
In Planung bearbeiten
```

Wenn der Planung-Bereich noch nicht umgesetzt ist, wird die Aktion sichtbar vorbereitet, aber deaktiviert oder als TODO markiert.

---

# 10. Server-seitiges Master-Data-ReadModel

## 10.1 Entscheidung

Usage-Infos werden für den MVP serverseitig berechnet.

Es wird nicht versucht, `canDelete`, `canRemoveFromAccount`, `transactionCount`, `hasBudget` oder `usageHints` vollständig im Client aus Rohdaten zu berechnen.

Begründung:

- Client-seitige Usage-Berechnung ist fehleranfällig.
- Referenzlogik gehört fachlich näher ans Backend.
- Der Server kann Lösch-/Entfern-Regeln konsistent mit der API-Validation halten.
- Die UI soll keine riskanten Aktionen erlauben, nur weil ein Include vergessen wurde.

## 10.2 Neuer MVP-Endpunkt

Für V2 wird ein dedizierter Read-Endpunkt eingeführt:

```text
GET /api/accounts/:accountId/master-data
```

Dieser Endpunkt ist ein spezialisiertes ReadModel für die Stammdaten-Page.

## 10.3 Response-Struktur

```ts
export interface AccountMasterDataResponse {
  account: AccountMasterVm;
  members: MemberMasterItemVm[];
  categories: CategoryMasterItemVm[];
  meta: MasterDataMetaVm;
}
```

### AccountMasterVm

```ts
export interface AccountMasterVm {
  _id: string;
  name: string | null;
  currency: string;
  memberCount: number;
  settings: {
    dashboard: {
      historyMonths: number;
      topKCategories: number;
    };
    alerts: {
      lowBalanceForecastMinor: number | null;
      carryoverLargeMinor: number | null;
      stalenessDays: number | null;
    };
  };
}
```

### MemberMasterItemVm

```ts
export interface MemberMasterItemVm {
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
```

### CategoryMasterItemVm

```ts
export interface CategoryMasterItemVm {
  categoryId: string;
  name: string | null;
  customSplit: Array<{
    memberId: string;
    split: number;
  }>;
  hasCustomSplit: boolean;
  customSplitLabel: string | null;
  transactionCount: number;
  recurrenceCount: number;
  hasBudget: boolean;
  canDelete: boolean;
  usageHints: string[];
}
```

### MasterDataMetaVm

```ts
export interface MasterDataMetaVm {
  uncategorizedTransactionCount: number;
  hasSingleMemberInfo: boolean;
  infoHints: string[];
  warningHints: string[];
}
```

## 10.4 CRUD-Endpunkte bleiben getrennt

Der neue `master-data`-Endpunkt ist nur für das Lesen der Stammdaten-Page zuständig.

Schreiboperationen laufen weiterhin über die Entity-Endpunkte:

- `PATCH /api/accounts/:id`
- `POST /api/members`
- `PATCH /api/members/:id`
- `POST /api/accounts/:id/members`
- `DELETE /api/accounts/:id/members/:memberId`
- `POST /api/categories`
- `PATCH /api/categories/:id`
- `DELETE /api/categories/:id`

Nach Schreiboperationen wird das Master-Data-ReadModel neu geladen oder gezielt aktualisiert.

---

# 11. Expanded-Route

`GET /api/accounts/:id/expanded` bleibt als Multi-Use-Route für andere komplexe Client-Sichten bestehen.

Für die Stammdaten-Page V2 ist jedoch der neue `master-data`-Endpunkt die primäre Datenquelle.

Begründung:

- `expanded` liefert Rohdaten.
- Stammdaten brauchen serverseitig bewertete Usage-Infos.
- Die UI soll nicht aus Rohdaten ableiten müssen, ob Löschen/Entfernen erlaubt ist.

---

# 12. Frontend-State-Architektur

## 12.1 Entscheidung

Es wird kein großer persistenter `MasterDataState` eingeführt, der Accounts, Members und Categories als eigene Kopie hält.

Stattdessen gilt:

- Persistierte Entities bleiben in ihren fachlichen States oder Services.
- Die Stammdaten-Page besitzt einen schlanken Page-State für das ReadModel und UI-Zustände.

## 12.2 Begründung

Ein dedizierter Page-State ist sinnvoll, aber kein zweiter Entity-Store.

Das verhindert:

- doppelte Entity-Wahrheiten,
- Sync-Probleme zwischen `MembersState`, `CategoriesState` und `MasterDataState`,
- schwer nachvollziehbare Updates nach CRUD-Aktionen.

## 12.3 Empfohlene Struktur

```ts
export interface MasterDataPageStateModel {
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

Dieser State enthält:

- geladenes serverseitiges ReadModel,
- Lade-/Fehlerstatus,
- aktive Section,
- Sidebar-Zustand.

Er enthält nicht:

- separate Normalized-Entity-Maps für Members/Kategorien,
- eigene Kopien globaler Entities,
- komplexe Berechnungslogik.

## 12.4 Actions

```ts
LoadMasterData(accountId)
ReloadMasterData()
OpenMemberSidebar(mode, memberId?)
OpenCategorySidebar(mode, categoryId?)
CloseMasterDataSidebar()
SaveAccountMasterData(payload)
CreateMemberForAccount(payload)
UpdateMemberForAccount(memberId, payload)
RemoveMemberFromAccount(memberId)
CreateCategory(payload)
UpdateCategory(categoryId, payload)
DeleteCategory(categoryId)
```

Nach jeder erfolgreichen Schreibaktion:

- Sidebar schließen
- Toast anzeigen
- `ReloadMasterData()` ausführen

Für den MVP ist diese Strategie robuster als optimistisches Patchen komplexer Usage-Infos.

---

# 13. Komponentenstruktur

Finale Feature-Struktur:

```text
features/accounts/account-management/master-data/
├── master-data-page.component.ts
├── account-master-section.component.ts
├── member-master-section.component.ts
├── member-editor-sidebar.component.ts
├── category-master-section.component.ts
├── category-editor-sidebar.component.ts
└── custom-split-editor.component.ts
```

Zusätzlich möglich:

```text
features/accounts/account-management/master-data/state/
├── master-data.actions.ts
├── master-data.state.ts
└── master-data.selectors.ts
```

---

# 14. UI-Prinzipien

## 14.1 Keine Tabellen als Hauptdarstellung

Die Stammdaten-Page verwendet Cards/Listen statt schwerer Tabellen.

## 14.2 Sidebar statt Dialog

Alle Add/Edit-Flows verwenden Sidebars.

Confirm-Dialoge werden nur für destruktive Aktionen verwendet:

- Member aus Account entfernen
- Kategorie löschen

## 14.3 Kein optimistisches Speichern

Stammdaten werden nicht optimistisch gespeichert.

Ablauf:

1. Speichern klick
2. Loading-State
3. Serverantwort abwarten
4. ReadModel neu laden
5. Toast anzeigen

## 14.4 Feedback

- Erfolgstoast bei Speichern
- Fehler nahe am Feld bei Validierungsproblemen
- Blockierhinweise bei nicht erlaubten Aktionen
- Confirm-Dialog nur bei tatsächlich erlaubten destruktiven Aktionen

---

# 15. Edge Cases

## 15.1 Account ohne Mitglieder

Dieser Zustand sollte regulär nicht entstehen, weil der Account-Wizard mindestens ein Mitglied verlangt.

Falls der Zustand durch Legacy-/Fehlerdaten trotzdem existiert:

```text
Noch keine Mitglieder vorhanden.
Füge mindestens ein Mitglied hinzu, damit Einzahlungen, private Zahlungen und Verteilungen zugeordnet werden können.
```

## 15.2 Account mit nur einem Mitglied

Erlaubt, aber Info-Hinweis.

## 15.3 Member ohne Namen

Fallback nur für Legacy-/kaputte Daten:

```text
Unbenanntes Mitglied
```

Neue und bearbeitete Members erfordern Namen mit 2–64 Zeichen.

## 15.4 Kategorie ohne Namen

Fallback nur für Legacy-/kaputte Daten:

```text
Unbenannte Kategorie
```

Neue und bearbeitete Kategorien erfordern Namen mit 2–64 Zeichen.

## 15.5 Kategorie mit ungültigem Custom Split

Anzeige:

- Warnbadge „Split prüfen“
- Bearbeiten führt direkt in den Custom-Split-Bereich
- Speichern bleibt blockiert, bis Summe und Member-Zuordnung gültig sind

## 15.6 Verwendete Kategorie

Löschen blockiert mit klarer Begründung.

## 15.7 Member mit Referenzen

Entfernen blockiert mit klarer Begründung.

---

# 16. UX-Texte und Begriffe

## 16.1 Seitentitel

```text
Stammdaten
```

Untertitel:

```text
Verwalte Account, Mitglieder und Kategorien. Planungswerte wie Budgets und Einkommen werden separat gepflegt.
```

## 16.2 Bereichsnamen

- Account
- Mitglieder
- Kategorien

## 16.3 Button-Texte

- Account speichern
- Mitglied hinzufügen
- Mitglied bearbeiten
- Aus Account entfernen
- Kategorie hinzufügen
- Kategorie bearbeiten
- Kategorie löschen
- In Planung bearbeiten
- In Buchungen anzeigen

## 16.4 Statuslabels

Mitglieder:

- Mit App-Zugang
- Ohne App-Zugang
- Owner
- Member

Kategorien:

- Standard-Verteilung
- Eigene Verteilung
- Budget vorhanden
- Kein Budget
- Wird verwendet
- Nicht verwendet
- Löschen blockiert

---

# 17. MVP-Scope

## 17.1 Muss für MVP

- Route `/accounts/:accountId/manage/master-data`
- Desktop: Sticky-Sekundärnavigation
- Mobile: Accordions
- Account-Basisdaten anzeigen und Name ändern
- Account-Settings anzeigen und bearbeiten
- Währung read-only `EUR`
- Mitglieder anzeigen
- Mitglied hinzufügen
- Mitglied bearbeiten
- Rolle ändern
- letzter Owner geschützt
- Mitglied aus Account entfernen, sofern serverseitig erlaubt
- Mitglieder ohne App-Account anzeigen und bearbeiten
- Kategorien anzeigen
- Kategorie hinzufügen
- Kategorie bearbeiten
- Kategorie löschen, sofern serverseitig erlaubt
- verwendete Kategorien blockieren
- Custom Split vollständig bearbeiten
- Custom Split Summe exakt 100 %
- nicht kategorisierte Buchungen anzeigen, wenn vorhanden
- Budgetstatus pro Kategorie anzeigen
- serverseitiges Master-Data-ReadModel
- Loading/Error/Empty States
- Sidebars für Add/Edit

## 17.2 Sollte für MVP

- Usage-Hints verständlich anzeigen
- Blockiergründe pro Member/Kategorie anzeigen
- Link „In Planung bearbeiten“ pro Kategorie
- Link „In Buchungen anzeigen“ für nicht kategorisierte Buchungen
- Info-Hinweis bei Account mit nur einem Mitglied
- konsistente Toasts und Confirm-Dialoge

## 17.3 Nicht für MVP, aber spätere Erweiterungen

Folgende Funktionen werden nicht in V2/MVP umgesetzt, sollen aber als mögliche Erweiterungen dokumentiert bleiben:

- Setup-/Readiness-Tab
- Einladungssystem für Members ohne App-Account
- manuelle User-Member-Verknüpfung
- Avatar-Upload oder Avatar-Bearbeitung
- Kategorie-Farben
- Kategorie-Icons
- Kategorie-Archivierung
- Kategorie-Umkategorisierung beim Löschen
- Member endgültig löschen
- Member deaktivieren/archivieren
- Massenbearbeitung
- Drag-and-drop Sortierung von Kategorien
- eigene Berechtigungsverwaltung über `owner/member` hinaus
- separater Audit-/Änderungsverlauf für Stammdaten
- Inline-Budgetbearbeitung in Stammdaten
- Dashboard-/Alert-Settings als eigene erweiterte Settings-Page

---

# 18. Empfohlene Umsetzungsreihenfolge

## Phase 1 – Backend ReadModel

- `GET /api/accounts/:accountId/master-data` implementieren
- serverseitige Usage-Infos für Members und Kategorien berechnen
- `canRemoveFromAccount`, `canDelete`, `usageHints` liefern
- OpenAPI erweitern

## Phase 2 – Grundseite

- Route anlegen
- Page-Komponente erstellen
- Account-Management-Navigation anbinden
- Desktop- und Mobile-Struktur vorbereiten

## Phase 3 – Daten laden

- Master-Data-ReadModel laden
- Loading/Error States bauen
- erste Cards/Listen darstellen

## Phase 4 – Account bearbeiten

- Account-Name und Settings editierbar machen
- Speichern via API
- Reload MasterData

## Phase 5 – Mitglieder verwalten

- Mitgliederliste bauen
- Member-Sidebar
- Add/Edit
- Rolle ändern
- Entfernen mit serverseitigem Blocker

## Phase 6 – Kategorien verwalten

- Kategorienliste bauen
- Kategorie-Sidebar
- Add/Edit
- Custom-Split-Editor
- Löschen mit serverseitigem Blocker

## Phase 7 – Polishing

- Mobile Accordions
- Empty States
- Toasts
- Confirm-Dialoge
- Usage-Hints
- visuelle Konsistenz

---

# 19. Qualitätskriterien

Die Stammdaten-Page ist gut umgesetzt, wenn:

1. klar erkennbar ist, dass hier nur Grundobjekte und accountweite Settings gepflegt werden,
2. Planung, Wiederkehrer, Kontostand und Buchungen nicht vermischt werden,
3. Mitglieder ohne App-Account sauber unterstützt werden,
4. der letzte Owner geschützt ist,
5. Account mit einem Mitglied erlaubt, aber sichtbar eingeordnet ist,
6. Kategorien verständlich verwaltet werden können,
7. `customSplit` vollständig und sicher bearbeitbar ist,
8. riskante Lösch-/Entfern-Aktionen serverseitig blockiert werden,
9. Usage-Hinweise aus dem Backend kommen,
10. die Page auf Desktop und mobil bedienbar bleibt,
11. spätere Erweiterungen klar abgegrenzt sind.

---

# 20. Kurzfazit

Die Stammdaten-Page ist eine gemeinsame Verwaltungsseite für Account, Settings, Mitglieder und Kategorien. Sie bildet die stabile Grundlage des Accounts und bleibt bewusst getrennt von Planung, Wiederkehrern, Kontostand und Buchungen.

Für den MVP wird eine Page mit klar getrennten Bereichen umgesetzt. Desktop nutzt eine Sticky-Sekundärnavigation, mobile Darstellung nutzt Accordions. Add/Edit erfolgt über Sidebars. Usage-Infos und Blockierlogik werden serverseitig über ein dediziertes Master-Data-ReadModel geliefert.

---

# 21. Implementierungshinweise

Dieser Abschnitt dokumentiert konkrete technische Punkte, die bei der Umsetzung zu beachten sind. Sie ergeben sich aus dem Abgleich dieses Konzepts mit den bestehenden Codestrukturen von `tobu-finance` und `tobu-finance-api`.

---

## 21.1 Backend-Hinweise

### 21.1.1 Guards müssen in CRUD-Endpunkte, nicht nur im ReadModel

Das `canDelete`- und `canRemoveFromAccount`-Flag im ReadModel schützt nur die UI. Wer direkt gegen die API geht, kann aktuell beliebig löschen oder Member entfernen. Die Blockierlogik muss deshalb **auch serverseitig in den Schreibendpunkten** vorhanden sein:

- `DELETE /api/accounts/:id/members/:memberId` → Last-Owner-Check, Referenz-Check
- `DELETE /api/categories/:id` → Referenz-Check auf Transactions/Budgets/Recurrences
- `PATCH /api/accounts/:id` mit neuem `members`-Array → Last-Owner nicht entfernbar, last Owner nicht auf `member` herabstufbar

Das Konzept verwendet das ReadModel-Flag nie als einzige Absicherung. Beide Ebenen (ReadModel + CRUD-Guard) sind erforderlich.

### 21.1.2 Account-Settings-Validierungsschema muss erweitert werden

Das bestehende Zod-Schema in `src/validation/accounts.ts` kennt unter `settings` nur `monthGranularity`. Die im Account-Bereich (Abschnitt 7.2) genannten Felder fehlen im Validierungsschema vollständig:

- `settings.dashboard.historyMonths`
- `settings.dashboard.topKCategories`
- `settings.alerts.lowBalanceForecastMinor`
- `settings.alerts.carryoverLargeMinor`
- `settings.alerts.stalenessDays`

Ein `PATCH /api/accounts/:id` mit diesen Feldern würde ohne Validierungsfehler durchgehen. Das Schema muss vor oder parallel zur Account-Settings-UI vollständig definiert werden.

### 21.1.3 `POST /api/accounts/:id/members` hat keine Zod-Validierung

Diese Route greift direkt auf `req.body` zu, ohne `validateBody(...)` zu verwenden. Alle anderen Routen in `accounts.ts` nutzen Middleware-Validierung. Beim Implementieren des Member-Hinzufügen-Flows (Abschnitt 8.7) muss ein Schema für `memberId` und `role` ergänzt werden.

### 21.1.4 Globaler `DELETE /api/members/:id` ist unkontrolliert

Das Konzept sieht nur „Aus Account entfernen" via `DELETE /api/accounts/:id/members/:memberId` vor. Der globale `DELETE /api/members/:id`-Endpunkt löscht direkt aus der Members-Collection ohne jede Referenzprüfung (Transactions, ContributionRules, MemberIncomes, Categories). Im Stammdaten-Flow ist dieser Endpunkt nicht vorgesehen. Sicherstellen, dass die UI **ausschließlich** den Account-Members-Endpunkt nutzt und nie den globalen Member-Delete.

---

## 21.2 Frontend-Hinweise

### 21.2.1 `manage`-Route und State-Bereitstellung

Die Route `/accounts/:accountId/manage/master-data` erfordert ein `manage`-Lazy-Loading-Segment als Child unter dem `:accountId`-Level in `accounts.routes.ts`. Wichtig dabei:

- Der `MasterDataPageState` darf **nicht** am `:accountId`-Root-Level registriert werden, sondern am `manage`-Route-Level via `provideStates([MasterDataPageState])` in der `manage`-Routes-Konfiguration.
- Der bestehende `AccountOverviewState` bleibt auf dem `:accountId`-Level. Die Grenze muss sauber gezogen werden, um ungewolltes State-Sharing zu vermeiden.

### 21.2.2 `AccountModel` nicht mit neuen Master-Data-Interfaces mischen

Das bestehende `AccountModel`-Interface in `src/app/shared/models/account.model.ts` ist ein Legacy-Frontend-Aggregat mit Feldern wie `balances`, `monthlyIncomes`, `monthlyPlannedContributions`. Es entspricht nicht dem tatsächlichen API-Response. Das neue `AccountMasterDataResponse`-ViewModel (Abschnitt 10.3) muss in einem **eigenen File** im Feature-Ordner definiert werden und darf nie auf das bestehende `AccountModel` verweisen oder es erweitern.

### 21.2.3 `CategoryModel.customSplit` hat einen inkonsistenten Union-Typ

Das bestehende `CategoryModel`-Interface deklariert `customSplit` als `{ [memberId: string]: number } | { memberId: string, split: number }[]`. Die API gibt ausschließlich das Array-Format zurück. Der neue `CategoryMasterItemVm` (Abschnitt 10.3) ist korrekt als Array typisiert. Sicherstellen, dass kein Consumer-Code zwischen `custom-split-editor.component.ts` und den bestehenden Services das Map-Format annimmt.

### 21.2.4 `MembersDataService.getMembersWithIds` – bestehender Bug

`getMembersWithIds` in `member-data.service.ts` baut `?id=x&id=y`-Queries, die `GET /api/members` nicht unterstützt (nur `?userId=...`). Diese Methode ist für den Master-Data-Flow nicht relevant, da Members aus dem `master-data`-ReadModel kommen. Beim Testen kann der Bug aber zu Verwirrung führen. Beim Member-Add-Flow (`POST /api/members` + `POST /api/accounts/:id/members`, Abschnitt 8.7) **nicht** auf `getMembersWithIds` zurückgreifen, sondern danach `ReloadMasterData()` ausführen.

### 21.2.5 `customSplit`-Toggle: leeres Array ≠ kein Split aktiv

Wenn der Toggle „Eigene Verteilung verwenden" aktiv ist, aber alle Einträge gelöscht wurden, ist `customSplit: []` zwar fachlich leer, aber das Backend würde einen `customSplit`-Summencheck nicht auslösen (leeres Array → keine Summe). Die UI-Validierung (Abschnitt 9.8.3) muss deshalb zwischen zwei Zuständen unterscheiden:

- Toggle **inaktiv** → `customSplit` wird als `[]` gespeichert, keine Summenvalidierung nötig
- Toggle **aktiv** → mindestens ein Eintrag erforderlich AND Summe muss exakt 100 ergeben, sonst Speichern blockieren

Dieser Unterschied muss explizit im State-Modell des `custom-split-editor.component.ts` abgebildet werden.

### 21.2.6 `hasSingleMemberInfo` im `MasterDataMetaVm` ist redundant

`MasterDataMetaVm.hasSingleMemberInfo` lässt sich vollständig aus `AccountMasterVm.memberCount === 1` ableiten. Der Client braucht das Flag nicht separat. Es kann dennoch vom Backend geliefert werden, sollte aber im Frontend nicht für eigene Logik verwendet werden – stattdessen direkt `memberCount` auswerten.

