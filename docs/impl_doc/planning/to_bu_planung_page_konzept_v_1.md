# ToBu – Planung-Page Konzept V2

**Stand:** 2026-05-07  
**Status:** V2 mit aktualisierter Navigations- und Positionsentscheidung  
**Ziel:** Konzept für die Planung-Page als sichtbaren Account-Hauptbereich nach Übersicht, Buchungen und Monat. Die bereits umgesetzte Stammdaten-Page bleibt im Account-verwalten-/Zahnradbereich.

---

## 1. Ziel der Planung-Page

Die Planung-Page ist die zentrale Verwaltungsseite für alle zeitabhängigen und berechnungsrelevanten Grundlagen eines Accounts.

Sie beantwortet die Frage:

> Wie soll der monatliche Bedarf entstehen und wie soll dieser Bedarf auf die Mitglieder verteilt werden?

Zur Planung-Page gehören im MVP:

1. **Kategorie-Budgets**
2. **Einkommensbasis**
3. **Beitragsregeln**
4. **TopUps / Zusatzbeiträge / Sonderbausteine**

Die Planung-Page ist bewusst keine Stammdaten-Page. Account, Mitglieder und Kategorien werden dort nur referenziert, aber nicht grundsätzlich verwaltet.

---

## 2. Einordnung in die Account-Navigation

Die Planung-Page wird nicht im Account-verwalten-/Zahnradbereich versteckt, sondern als sichtbarer Account-Hauptbereich geführt.

Finale Hauptnavigation im Account-Kontext:

```text
Account
├── Übersicht
├── Buchungen
├── Monat
├── Planung
└── Account verwalten / Zahnrad
    └── Stammdaten
```

Begründung:

- Stammdaten sind eher administrative Grunddaten und passen in den Account-verwalten-/Zahnradbereich.
- Planung ist fachlich näher an der Month View, weil sie Budgets, Einkommen, Beitragslogik und TopUps vorbereitet.
- Planung wird häufiger benötigt als reine Account-/Stammdatenpflege und sollte deshalb sichtbar in der Account-Navigation liegen.

Die Stammdaten-Page liefert die Grundobjekte. Die Planung-Page nutzt diese Grundobjekte, um daraus die monatliche Berechnungsbasis zu bilden.

> **Änderungsbedarf an bestehender Seite:** Die Stammdaten-Page ist bereits implementiert. Im Zuge der Planning-Implementierung muss die Stammdaten-Page um einen „In Planung bearbeiten"-Link je Kategorie ergänzt werden, der auf `/accounts/:accountId/planning` verweist. Diese Änderung ist Teil des Planning-Scopes.

---

## 3. Fachliche Rolle der Planung-Page

Die Month View zeigt im operativen Monatsbereich bereits:

- Monatsbedarf,
- Eingezahlt,
- Ausgegeben,
- Übertrag,
- Soll/Gezahlt/Offen pro Mitglied,
- Beitragslogik und Herleitung.

Die Planung-Page ist die Verwaltungsseite für genau die Daten, die diese Monatswerte vorbereiten.

Sie ist nicht der Ort, an dem ein konkreter Monat abgerechnet wird. Sie ist der Ort, an dem die Regeln, Beträge und zeitlichen Grundlagen gepflegt werden, aus denen die monatliche Sicht berechnet wird.

---

## 4. Abgrenzung zu anderen Seiten

### 4.1 Abgrenzung zu Stammdaten

Stammdaten verwalten:

- Account-Basisdaten,
- Account-Settings,
- Mitglieder,
- Kategorien,
- Kategorie-Custom-Splits.

Planung verwaltet:

- Budgets je Kategorie und Zeitraum,
- Einkommen je Mitglied und Zeitraum,
- Beitragsregeln,
- Zusatzbeiträge,
- TopUps.

Wichtig:

> Kategorie ≠ Budget.

Die Kategorie „Lebensmittel“ ist Stammdatum. Das Budget „400 € ab Mai 2026“ ist Planung.

### 4.2 Abgrenzung zur Month View

Die Month View ist ein monatsbezogener Arbeitsbereich. Sie zeigt, was für einen konkreten Monat gilt und passiert ist.

Die Planung-Page ist eine Verwaltungsseite. Sie pflegt Regeln und Werte, die über Zeiträume hinweg gelten können.

Beispiel:

- Planung: „Lebensmittelbudget ab 2026-05 = 400 €“
- Monat: „Im Mai wurden 362 € von 400 € ausgegeben“

### 4.3 Abgrenzung zu Wiederkehrern

Wiederkehrer sind Vorlagen, die echte Buchungen erzeugen.

Planung erzeugt nicht direkt Buchungen. Planung erzeugt Sollwerte, Budgets und Berechnungsgrundlagen.

### 4.4 Abgrenzung zu Kontostand

Kontostand und Carryovers sind Abgleichs- und Korrekturdaten. Sie beschreiben, was tatsächlich bekannt oder zu übertragen ist.

Planung beschreibt, was erwartet, verteilt oder vorgesehen ist.

---

## 5. Seitenziel aus Nutzersicht

Nutzer sollen auf der Planung-Page:

- Budgets je Kategorie pflegen können,
- sehen, welche Budgets aktuell gültig sind,
- Einkommen je Mitglied mit Gültigkeitszeiträumen pflegen können,
- erkennen, ob ProRata-Verteilungen berechenbar sind,
- Beitragsregeln anlegen und bearbeiten können,
- Zusatzbeiträge und TopUps definieren können,
- Gültigkeitszeiträume verständlich verwalten können,
- Vorschauwerte für einen ausgewählten Monat prüfen können,
- Datenlücken erkennen, die die Month View beeinflussen.

---

## 6. Finale Route und Navigation

### 6.1 Route

```text
/accounts/:accountId/planning
```

UI-Name im Account-Tab:

```text
Planung
```

### 6.2 Position

Die Planung-Page ist ein sichtbarer Account-Haupttab neben:

```text
[Übersicht] [Buchungen] [Monat] [Planung]
```

Sie liegt bewusst nicht im Zahnrad-/Account-verwalten-Bereich.

Das Zahnrad bleibt für seltenere administrative Bereiche reserviert, insbesondere:

```text
Account verwalten
└── Stammdaten
```

Der Setup-Tab bleibt für MVP zurückgestellt.

---

## 7. Grundkonzept der Page

Die Planung-Page besteht als sichtbarer Account-Hauptbereich aus einer gemeinsamen Seite mit klar getrennten Bereichen.

```text
Planung
├── Überblick
├── Budgets
├── Einkommensbasis
├── Beitragsregeln
└── Sonderbausteine / TopUps
```

Desktop:

- linke Sticky-Sekundärnavigation
- rechte Inhaltsfläche
- Bereiche untereinander oder per Anchor erreichbar

Mobile:

- Bereiche als Accordions
- Reihenfolge bleibt identisch
- Editor-Sidebars öffnen fullscreen

---

## 8. Bereich „Überblick“

## 8.1 Zweck

Der Überblick fasst zusammen, ob die Planung für den aktuell ausgewählten Referenzmonat berechenbar ist.

Er ist keine vollständige Setup-Checkliste, sondern eine planungsspezifische Statusübersicht.

## 8.2 Referenzmonat

Die Page erhält oben eine einfache Monatsauswahl:

```text
Referenzmonat: Mai 2026
```

Dieser Monat dient nur zur Vorschau:

- Welche Budgets sind in diesem Monat aktiv?
- Welche Einkommen gelten?
- Welche Beitragsregeln greifen?
- Welche TopUps sind aktiv?
- Gibt es Datenlücken?

Die Planung-Page arbeitet aber nicht ausschließlich für einen Monat. Viele Werte haben Zeiträume.

## 8.3 Überblick-KPIs

Empfohlene Karten:

1. **Aktive Budgetsumme**
2. **Aktive Beitragsbausteine**
3. **ProRata-Berechenbarkeit**
4. **Planungs-Hinweise**

Beispiel:

```text
Aktive Budgetsumme: 1.850 €
Aktive Beitragsbausteine: 4
ProRata: vollständig
Hinweise: 1
```

## 8.4 Hinweise

Planungs-Hinweise können sein:

- ProRata-Regel aktiv, aber Einkommen fehlt für ein Mitglied.
- Kategorie ohne Budget.
- Budget verweist auf nicht mehr aktive Kategorie.
- Beitragsregel hat ungültigen Zeitraum.
- CustomSplit enthält nicht mehr vorhandenes Mitglied.
- TopUp endet in diesem Monat.

Diese Hinweise sind planungsbezogen, nicht allgemeine Account-Readiness.

---

# 9. Bereich „Budgets“

## 9.1 Zweck

Der Budgetbereich verwaltet `category_budgets`.

Ein Budget legt fest, welcher geplante Betrag für eine Kategorie in einem Zeitraum gilt.

Budgets sind der wichtigste Input für den Monatsbedarf.

## 9.2 Fachliche Regeln

- Budget gehört immer zu einem Account.
- Budget gehört immer zu einer Kategorie.
- Betrag wird als Minor Units gespeichert.
- Zeitraum wird über Month-Anchor gedacht.
- `fromMonth` kann offen oder gesetzt sein.
- `toMonth` kann offen sein.
- Pro Kategorie darf es für denselben Zeitraum keine widersprüchlich überlappenden aktiven Budgets geben.

## 9.3 MVP-Felder

| Feld | Pflicht | Bemerkung |
|---|---:|---|
| Kategorie | Ja | Auswahl aus aktiven Kategorien |
| Betrag | Ja | Euro UI, Minor Units API |
| Gültig ab | Ja | Month-only |
| Gültig bis | Nein | Optional offen |
| Notiz | Nein | Nicht MVP, spätere Erweiterung |

## 9.4 Darstellung

Budgetliste gruppiert nach Kategorie.

Beispiel:

```text
Budgets
[+ Budget hinzufügen]

Lebensmittel
Aktuell: 400 € ab 2026-05
Historie: 350 € bis 2026-04
[Bearbeiten]

Miete
Aktuell: 1.200 € ab 2026-01
[Bearbeiten]
```

## 9.5 Budget-Sidebar

Alle Add/Edit-Flows öffnen rechts eine Sidebar.

Desktop:

- rechte Sidebar

Mobile:

- fullscreen Sidebar

Felder:

- Kategorie
- Betrag
- Gültig ab
- Gültig bis

## 9.6 Erstellen eines neuen Budgets

Beim Erstellen eines neuen Budgets für eine Kategorie mit bereits aktivem offenem Budget gilt:

- Das bestehende offene Budget wird nicht still überschrieben.
- Die UI zeigt einen Hinweis.
- Nutzer kann einen neuen Zeitraum anlegen.
- Wenn der neue Zeitraum direkt anschließt, kann das vorherige Budget automatisch beendet werden, aber nur nach sichtbarer Bestätigung.

MVP-Vereinfachung:

> Es darf pro Kategorie und Monat nur ein aktives Budget geben. Überlappende Zeiträume werden serverseitig blockiert.

## 9.7 Bearbeiten eines Budgets

Bearbeitbar:

- Betrag
- Gültig ab
- Gültig bis

Wichtig:

- Änderungen können historische Monate beeinflussen, weil der MVP mit Live-Berechnung arbeitet.
- Die UI zeigt bei Änderung an alten Zeiträumen einen Hinweis.

Beispiel:

```text
Diese Änderung kann bereits angezeigte Monate rückwirkend verändern.
```

## 9.8 Löschen eines Budgets

Budgets dürfen im MVP gelöscht werden, wenn keine serverseitige Regel dagegen spricht.

Da Budgets Planungswerte sind, ist Löschen weniger kritisch als bei Kategorien, kann aber historische Month Views verändern.

MVP-Regel:

- Löschen erlaubt.
- Confirm-Dialog erforderlich.
- Hinweis auf rückwirkende Auswirkung.

Spätere Erweiterung:

- Budget archivieren/deaktivieren statt löschen.
- Änderungsverlauf für Budgetwerte.

---

# 10. Bereich „Einkommensbasis“

## 10.1 Zweck

Die Einkommensbasis verwaltet `member_incomes`.

Sie ist relevant, wenn Beitragsbausteine über `proRataIncome` verteilt werden.

Die Einkommensbasis erklärt, warum ein Mitglied bei einkommensbasierter Verteilung einen bestimmten Anteil trägt.

## 10.2 Fachliche Regeln

- Einkommen gehört zu Account und Member.
- Betrag wird als Minor Units gespeichert.
- Zeitraum wird über Month-Anchor gedacht.
- Ein Member darf in einem Monat nur eine aktive Einkommensbasis für dieselbe relevante Einkommensart haben.
- Einkommen kann historisiert werden.
- Einkommen ist keine Transaktion und erzeugt keine Buchung.

## 10.3 MVP-Felder

| Feld | Pflicht | Bemerkung |
|---|---:|---|
| Mitglied | Ja | Account-Member |
| Betrag | Ja | Euro UI, Minor Units API |
| Gültig ab | Ja | Month-only |
| Gültig bis | Nein | Optional offen |
| Quelle | Nein | Default `salary` oder ausgeblendet |
| Notiz | Nein | Optional später |

## 10.4 Darstellung

Einkommen werden pro Mitglied gruppiert.

Beispiel:

```text
Einkommensbasis
[+ Einkommen hinzufügen]

Tony
Aktuell: 2.800 € ab 2026-01
Anteil im Referenzmonat: 58 %

Caro
Aktuell: 2.000 € ab 2026-01
Anteil im Referenzmonat: 42 %
```

Wenn im Referenzmonat ProRata aktiv ist, wird der Anteil sichtbar hervorgehoben.

Wenn kein ProRata aktiv ist, bleibt die Einkommensbasis trotzdem pflegbar, aber der Hinweis lautet:

```text
Im ausgewählten Referenzmonat wird keine einkommensbasierte Verteilung verwendet.
```

## 10.5 Income-Sidebar

Felder:

- Mitglied
- Betrag
- Gültig ab
- Gültig bis
- Quelle optional, im MVP Default

## 10.6 Fehlende Einkommen

Wenn ProRata aktiv ist und für ein Mitglied kein gültiges Einkommen existiert:

- Bereich zeigt Warnhinweis.
- Mitglied wird in der Liste mit Status „Einkommen fehlt“ angezeigt.
- Button „Einkommen ergänzen“ öffnet Sidebar mit vorausgewähltem Mitglied.

## 10.7 Einkommen bearbeiten

Bei Änderung historischer Einkommen:

- Hinweis auf rückwirkende Auswirkungen anzeigen.
- Keine stille Anpassung von Contribution Rules.

## 10.8 Einkommen löschen

MVP-Regel:

- Löschen erlaubt, aber Confirm erforderlich.
- Wenn dadurch ein aktiver ProRata-Baustein nicht berechenbar wird, zeigt der Server/ReadModel danach einen Planungs-Hinweis.

Spätere Erweiterung:

- Einkommen deaktivieren oder Zeitraum beenden statt löschen.
- Änderungsverlauf für Einkommenswerte.

---

# 11. Bereich „Beitragsregeln“

## 11.1 Zweck

Der Beitragsregeln-Bereich verwaltet `contribution_rules`.

Beitragsregeln definieren explizite Bausteine, die in die monatlichen Sollwerte einfließen.

Wichtig:

> Es gibt nicht genau eine aktive Beitragsregel. Mehrere Beitragsbausteine können gleichzeitig wirken.

## 11.2 Fachliche Typen

Beitragsregeln kennen im aktuellen Modell:

- `base`
- `additional`
- `topup`

Für die Planung-Page gilt:

- `base` wird vorsichtig behandelt, weil die Month View Base-Blöcke auch aus CategoryBudgets und Kategorie-Custom-Splits ableiten kann.
- Explizit persistierte Regeln sind vor allem für `additional`, `topup` und Sonderkorrekturen relevant.
- Der UI-Begriff „Beitragsbaustein“ ist verständlicher als „Contribution Rule“.

## 11.3 MVP-Strategie für Base

Die Planung-Page soll vermeiden, Nutzer durch doppelte Base-Logik zu verwirren.

MVP-Festlegung:

- Kategorie-Budgets bilden den regulären Monatsbedarf.
- Die Standardverteilung dieses Bedarfs wird über die allgemeine Beitragslogik abgebildet.
- Kategoriespezifische CustomSplits kommen aus den Kategorien.
- Explizite Contribution Rules in der UI werden primär als Zusatzbausteine und TopUps gepflegt.

Der Bereich „Beitragsregeln“ zeigt trotzdem alle aktiven Bausteine, auch abgeleitete Base-Blöcke, aber abgeleitete Blöcke sind read-only und verweisen auf Budgets/Kategorien.

## 11.4 Darstellung

Beitragsbausteine werden als Cards/Liste dargestellt.

Beispiel:

```text
Beitragsregeln
[+ Zusatzbeitrag] [+ TopUp]

Basisbedarf aus Budgets
1.850 € · ProRata Einkommen
Abgeleitet aus Kategorie-Budgets
[Budgets anzeigen]

Zusatzbeitrag Urlaubspuffer
200 € · 50/50 · aktiv ab 2026-05
[Bearbeiten]

TopUp Kontopuffer
500 € · Tony 60 %, Caro 40 % · einmalig 2026-05
[Bearbeiten]
```

## 11.5 Rule-Sidebar

Felder:

- Typ: `additional` oder `topup` im MVP-Create-Flow
- Beschreibung
- Betrag
- Wiederkehrend ja/nein
- Gültig ab
- Gültig bis
- Distribution Mode
- Distribution Details

## 11.6 Distribution Modes

### 11.6.1 Per Member

Ein bestimmtes Mitglied trägt den Betrag vollständig.

Felder:

- Mitglied

### 11.6.2 Custom Split

Betrag wird prozentual verteilt.

Felder:

- Split je Mitglied
- Summe exakt 100 %

### 11.6.3 ProRata Income

Betrag wird anhand der gültigen Einkommensbasis verteilt.

Felder:

- keine manuelle Prozentpflege
- Vorschau zeigt berechnete Anteile für den Referenzmonat

Wenn Einkommen fehlt:

- Speichern ist erlaubt oder blockiert?

MVP-Festlegung:

> Eine ProRata-Regel darf nur gespeichert werden, wenn für den Gültigkeitsstart alle aktuellen Account-Members eine Einkommensbasis besitzen oder die UI explizit einen Warnzustand zeigt.

Für saubere MVP-Logik wird Speichern blockiert, wenn der Startmonat nicht berechenbar ist.

## 11.7 Wiederkehrend vs. einmalig

`recurring=true` bedeutet, dass der Baustein in jedem Monat des Gültigkeitszeitraums wirkt.

`recurring=false` bedeutet, dass der Baustein nur im Startmonat wirkt oder über einen explizit kurzen Zeitraum abgebildet wird.

MVP-Festlegung:

- Einmalig: `fromMonth = Zielmonat`, `toMonth = Zielmonat`, `recurring=false`
- Wiederkehrend: `fromMonth` gesetzt, `toMonth` optional, `recurring=true`

## 11.8 Löschen von Beitragsregeln

MVP-Regel:

- Löschen erlaubt.
- Confirm erforderlich.
- Hinweis auf rückwirkende Auswirkungen.

Spätere Erweiterung:

- Deaktivieren statt löschen.
- Änderungsverlauf.

---

# 12. Bereich „Sonderbausteine / TopUps“

## 12.1 Zweck

TopUps und Sonderbausteine sind spezielle Planungsbausteine, die zusätzliche Beträge in die Monatslogik bringen.

Fachlich sind sie `contribution_rules` mit Typ `topup` oder `additional`, werden aber in der UI besonders hervorgehoben, weil sie für Nutzer oft als konkrete Aktion gedacht sind.

## 12.2 Warum eigener sichtbarer Bereich?

TopUps und Zusatzbeiträge haben eine andere Nutzung als normale Budgetpflege:

- temporärer Mehrbedarf,
- einmalige Sonderzahlung,
- Puffer auffüllen,
- zusätzliche Belastung für ein Mitglied,
- Sonderverteilung.

## 12.3 Darstellung

Der Bereich zeigt aktive und geplante Sonderbausteine.

Beispiel:

```text
Sonderbausteine
[+ TopUp] [+ Zusatzbeitrag]

TopUp Kontopuffer
500 € · einmalig Mai 2026 · 60/40

Zusatzbeitrag Nebenkosten
120 € · wiederkehrend ab 2026-06 · Tony 100 %
```

## 12.4 Technische Zuordnung

Im Backend bleiben diese Einträge `contribution_rules`.

Die UI trennt sie nur zur besseren Verständlichkeit.

## 12.5 MVP-Entscheidung

Die Planung-Page darf „Beitragsregeln“ und „Sonderbausteine“ visuell trennen, aber technisch dieselbe Datenquelle verwenden.

Damit entstehen keine zusätzlichen Domänenobjekte.

---

# 13. Vorschau und Auswirkungen

## 13.1 Zweck

Die Planung-Page soll nicht nur CRUD sein. Sie soll zeigen, welche Auswirkungen die Planung für den Referenzmonat hat.

## 13.2 Vorschau-Karte

Im Überblick oder am Ende der Seite:

```text
Vorschau für Mai 2026
Monatsbedarf: 1.850 €
Tony Soll: 1.070 €
Caro Soll: 780 €
```

## 13.3 Keine zweite Month View

Die Vorschau bleibt kompakt.

Sie ersetzt nicht die Month View und zeigt keine Ist-Zahlungen, Buchungen oder offene Einzahlungen im Detail.

Sie zeigt nur:

- Planbedarf,
- aktive Bausteine,
- voraussichtliche Sollverteilung.

---

# 14. Server-seitiges Planning-ReadModel

## 14.1 Entscheidung

Für die Planung-Page wird ein dediziertes serverseitiges ReadModel empfohlen.

Grund:

- Die Page braucht berechnete Status- und Gültigkeitsinformationen.
- Client-seitige Berechnung von aktiven Budgets, ProRata-Berechenbarkeit und Rule-Konflikten wäre fehleranfällig.
- Die Month View basiert ebenfalls auf serverseitiger Berechnung; Planung und Month View müssen konsistent bleiben.

Implementierungshinweis:

> Das Planning-ReadModel **muss** `src/utils/contrib.ts` für alle ProRata- und Verteilungsberechnungen wiederverwenden. Diese Utility wird bereits von `month-view.ts` genutzt und ist die einzige zentrale ProRata-Logik im Backend. Eine eigene Berechnung im Planning-Route würde zu Abweichungen führen.

## 14.2 Endpunkt

```text
GET /api/accounts/:accountId/planning?month=YYYY-MM
```

`month` ist der Referenzmonat für Vorschau und Status.

## 14.3 Response-Struktur

```ts
export interface AccountPlanningResponse {
  accountId: string;
  referenceMonth: string;
  overview: PlanningOverviewVm;
  budgets: BudgetPlanningItemVm[];
  incomes: IncomePlanningMemberVm[];
  contributionBlocks: ContributionBlockVm[];
  specialBlocks: ContributionBlockVm[];
  preview: PlanningPreviewVm;
  hints: PlanningHintVm[];
}
```

### PlanningOverviewVm

```ts
export interface PlanningOverviewVm {
  activeBudgetSumMinor: number;
  activeBudgetCount: number;
  activeContributionBlockCount: number;
  proRataStatus: 'notUsed' | 'complete' | 'incomplete';
  hintCount: number;
}
```

### BudgetPlanningItemVm

```ts
export interface BudgetPlanningItemVm {
  budgetId: string;
  categoryId: string;
  categoryName: string;
  amountMinor: number;
  fromMonth: string;
  toMonth: string | null;
  isActiveInReferenceMonth: boolean;
  hasOverlapConflict: boolean;
  usageHints: string[];
}
```

### IncomePlanningMemberVm

```ts
export interface IncomePlanningMemberVm {
  memberId: string;
  memberName: string;
  activeIncome: {
    incomeId: string;
    amountMinor: number;
    fromMonth: string;
    toMonth: string | null;
  } | null;
  incomeSharePct: number | null;
  missingForProRata: boolean;
  history: Array<{
    incomeId: string;
    amountMinor: number;
    fromMonth: string;
    toMonth: string | null;
  }>;
}
```

### ContributionBlockVm

```ts
export interface ContributionBlockVm {
  id: string;
  source: 'derivedBudgetBase' | 'contributionRule';
  ruleId: string | null;
  type: 'base' | 'additional' | 'topup';
  title: string;
  description: string | null;
  amountMinor: number;
  recurring: boolean;
  fromMonth: string | null;
  toMonth: string | null;
  distribution: {
    mode: 'perMember' | 'customSplit' | 'proRataIncome';
    memberId?: string;
    customSplit?: Array<{ memberId: string; split: number }>;
  };
  isActiveInReferenceMonth: boolean;
  isEditable: boolean;
  effectByMember: Array<{
    memberId: string;
    amountMinor: number;
    sharePct: number;
  }>;
  usageHints: string[];
}
```

### PlanningPreviewVm

```ts
export interface PlanningPreviewVm {
  month: string;
  plannedNeedMinor: number;
  memberDuePreview: Array<{
    memberId: string;
    memberName: string;
    dueMinor: number;
    breakdown: Array<{
      blockId: string;
      title: string;
      amountMinor: number;
    }>;
  }>;
}
```

### PlanningHintVm

```ts
export interface PlanningHintVm {
  code: string;
  severity: 'info' | 'warn' | 'error';
  message: string;
  target:
    | { kind: 'budget'; id: string }
    | { kind: 'income'; memberId: string }
    | { kind: 'contributionRule'; id: string }
    | { kind: 'general' };
}
```

## 14.4 CRUD bleibt getrennt

Der Planning-Endpunkt ist ein ReadModel.

Schreiboperationen laufen über:

- `POST /api/category-budgets`
- `PATCH /api/category-budgets/:id`
- `DELETE /api/category-budgets/:id`
- `POST /api/member-incomes`
- `PATCH /api/member-incomes/:id`
- `DELETE /api/member-incomes/:id`
- `POST /api/contribution-rules`
- `PATCH /api/contribution-rules/:id`
- `DELETE /api/contribution-rules/:id`

Nach Schreiboperationen wird das Planning-ReadModel neu geladen.

---

# 15. Frontend-State-Architektur

## 15.1 Entscheidung

Wie bei der Stammdaten-Page wird kein zweiter großer Entity-Store aufgebaut.

Die Planung-Page nutzt einen schlanken Page-State für das serverseitige ReadModel und UI-Zustände.

## 15.2 StateModel

```ts
export interface PlanningPageStateModel {
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

## 15.3 Actions

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

Nach erfolgreicher Schreibaktion:

- Sidebar schließen
- Toast anzeigen
- Planning-ReadModel neu laden

Kein optimistisches Speichern im MVP.

---

# 16. Komponentenstruktur

> **Hinweis zur Ordnerstruktur:** Die bestehende Frontend-Codebasis verwendet `src/app/accounts/` als Wurzel. Es gibt keinen `features/`-Ordner. Alle Pfadangaben folgen dieser bestehenden Struktur.

```text
accounts/account-management/planning/
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
└── planning-hints.component.ts
```

Optional:

```text
accounts/account-management/planning/state/
├── planning.actions.ts
├── planning.state.ts
└── planning.selectors.ts
```

---

# 17. UI-Prinzipien

## 17.1 Keine Tabellen als Hauptmodus

Die Page nutzt Cards und Listen als Hauptdarstellung.

Tabellen können später als Detail-/Power-Ansicht ergänzt werden, sind aber nicht MVP-Hauptmodus.

## 17.2 Sidebars für Add/Edit

Alle Add/Edit-Flows laufen über Sidebars:

- Budget-Sidebar
- Income-Sidebar
- Rule-Sidebar

Mobile:

- fullscreen Sidebar

## 17.3 Mobile als Accordions

Auf Mobile werden die Hauptbereiche als Accordions dargestellt:

1. Überblick
2. Budgets
3. Einkommensbasis
4. Beitragsregeln
5. Sonderbausteine

## 17.4 Keine stille Rückwirkung

Wenn eine Änderung historische Monate beeinflussen kann, muss die UI das anzeigen.

Beispiel:

```text
Diese Änderung kann bereits berechnete Monatsansichten rückwirkend verändern.
```

## 17.5 Vorschau statt Blackbox

Jede Planungsänderung soll nach dem Speichern in der Vorschau nachvollziehbar werden.

---

# 18. Validierungsregeln

## 18.1 Allgemein

- Geldwerte immer positiv als Minor Units speichern.
- UI zeigt Euro-Beträge.
- Monate über Month-only Eingabe.
- `fromMonth <= toMonth`, falls `toMonth` gesetzt ist.

## 18.2 Budgets

- Kategorie erforderlich.
- Betrag > 0.
- Pro Kategorie kein überlappendes Budget für denselben Monat.
- Kategorie muss zum Account gehören.

## 18.3 Einkommen

- Member erforderlich.
- Betrag >= 0, empfohlen > 0.
- Pro Member kein überlappendes Einkommen im selben Monat.
- Member muss zum Account gehören.

## 18.4 Contribution Rules

- Typ erforderlich.
- Betrag > 0.
- Distribution Mode erforderlich.
- Bei `perMember`: Member erforderlich.
- Bei `customSplit`: Summe exakt 100 %.
- Bei `proRataIncome`: Startmonat muss berechenbar sein.
- Zeitraum gültig.

---

# 19. Empty, Error und Missing States

## 19.1 Keine Budgets

```text
Noch keine Budgets eingerichtet.
Budgets bilden die Grundlage für deinen geplanten Monatsbedarf.

[Budget hinzufügen]
```

## 19.2 Keine Einkommen

```text
Noch keine Einkommensbasis gepflegt.
Diese wird benötigt, wenn Beiträge einkommensbasiert verteilt werden sollen.

[Einkommen hinzufügen]
```

## 19.3 ProRata aktiv, Einkommen fehlt

```text
Einkommensbasierte Verteilung ist aktiv, aber für mindestens ein Mitglied fehlt ein gültiges Einkommen im Referenzmonat.
```

## 19.4 Keine Beitragsregeln

```text
Noch keine Zusatzbeiträge oder TopUps eingerichtet.
Reguläre Budget-Bausteine können trotzdem aus den Kategorie-Budgets entstehen.
```

## 19.5 Fehler beim Laden

```text
Planungsdaten konnten nicht geladen werden.
[Erneut versuchen]
```

---

# 20. MVP-Scope

## 20.1 Muss für MVP

- Route `/accounts/:accountId/planning`
- Referenzmonat-Auswahl
- Planning-ReadModel `GET /api/accounts/:accountId/planning?month=YYYY-MM`
- Überblick mit planungsbezogenen KPIs
- Budgetliste nach Kategorien
- Budget hinzufügen/bearbeiten/löschen
- Einkommensbasis je Mitglied anzeigen
- Einkommen hinzufügen/bearbeiten/löschen
- Beitragsbausteine anzeigen
- Additional/TopUp anlegen/bearbeiten/löschen
- Distribution Editor für `perMember`, `customSplit`, `proRataIncome`
- ProRata-Missing-State
- Vorschau für Mitglieds-Sollwerte im Referenzmonat
- Sidebars für Add/Edit
- Mobile Accordions
- keine optimistischen Schreibaktionen
- Loading/Error/Empty States

## 20.2 Sollte für MVP

- Hinweis auf rückwirkende Auswirkungen
- aktive/inaktive Items im Referenzmonat markieren
- abgeleitete Base-Blöcke read-only anzeigen
- Budgetstatus je Kategorie sichtbar machen
- Income-Anteile für Referenzmonat anzeigen
- klare Planungs-Hints mit Severity

## 20.3 Nicht für MVP, aber spätere Erweiterungen

- Budget-Archivierung statt Löschen
- Income-Archivierung oder Versionierungs-Flow
- detaillierter Änderungsverlauf für Planung
- Kopieren einer Planung in neue Monate
- Simulation ohne Speichern
- mehrere Szenarien/Planvarianten
- Import aus Excel/CSV
- Bulk-Editing von Budgets
- Tabellen-/Power-User-Modus
- automatische Budgetvorschläge aus Buchungshistorie
- Forecast-basierte Budgetempfehlungen
- Approval-/Freigabeprozess für Planungsänderungen

---

# 21. Umsetzungsreihenfolge

## Phase 1 – Backend ReadModel

- `GET /api/accounts/:accountId/planning?month=YYYY-MM` erstellen
- aktive Budgets für Referenzmonat berechnen
- aktive Einkommensbasis je Member berechnen
- ProRata-Status berechnen
- Beitragsbausteine inkl. abgeleiteter Base-Blöcke liefern
- Vorschau `memberDuePreview` liefern
- Hints liefern
- OpenAPI erweitern

## Phase 2 – Page-Grundstruktur

- Route anlegen
- Page-Komponente erstellen
- Account-Hauptnavigation anbinden
- Desktop-Navigation und Mobile-Accordions vorbereiten

## Phase 3 – ReadModel anzeigen

- Overview-Karten
- Budgetliste read-only
- Einkommensbasis read-only
- Beitragsbausteine read-only
- Vorschau-Karte
- Hints

## Phase 4 – Budget-CRUD

- Budget-Sidebar
- Create/Edit/Delete
- Reload nach Speichern
- Validierungen

## Phase 5 – Income-CRUD

- Income-Sidebar
- Create/Edit/Delete
- Missing-ProRata-Flow
- Reload nach Speichern

## Phase 6 – Contribution Rules

- Rule-Sidebar
- Distribution Editor
- Additional/TopUp Create/Edit/Delete
- ProRata-Validierung

## Phase 7 – Polish und QA

- Mobile Accordions
- Empty/Error States
- Toasts/Confirm-Dialoge
- Rückwirkungs-Hinweise
- Zahlenkonsistenz mit Month View prüfen

---

# 22. Qualitätskriterien

Die Planung-Page ist gut umgesetzt, wenn:

1. sie klar von Stammdaten, Month View, Wiederkehrern und Kontostand getrennt ist,
2. Budgets als Planwerte und nicht als Kategorien verstanden werden,
3. Einkommen als Berechnungsbasis und nicht als Buchung verstanden wird,
4. mehrere Beitragsbausteine gleichzeitig sichtbar und verständlich sind,
5. ProRata nur dann als vollständig gilt, wenn alle benötigten Einkommen vorhanden sind,
6. historische Rückwirkungen sichtbar gemacht werden,
7. die Vorschau mit der Month-View-Logik konsistent ist,
8. keine zweite Month View entsteht,
9. Add/Edit über Sidebars sauber funktioniert,
10. Mobile über Accordions bedienbar bleibt.

---

# 23. Kurzfazit

Die Planung-Page ist der nächste zentrale Account-Bereich nach der umgesetzten Stammdaten-Page, wird aber nicht im Account-verwalten-/Zahnradbereich geführt.

Sie verwaltet die berechnungsrelevanten Grundlagen des Accounts:

- Kategorie-Budgets,
- Einkommensbasis,
- Beitragsbausteine,
- TopUps und Zusatzbeiträge.

Sie ist keine operative Monatsabrechnung wie die Month View, sondern der sichtbare Planungsbereich für die Werte, aus denen die Month View ihre Sollwerte und Erklärungen ableitet.

Für den MVP sollte die Page ein dediziertes serverseitiges Planning-ReadModel verwenden, Add/Edit über Sidebars lösen, mobile Accordions nutzen und eine kompakte Vorschau für den Referenzmonat anbieten.

