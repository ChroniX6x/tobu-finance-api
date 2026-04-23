# ToBu Finance – Agent‑Ready Konzept „Monat“-Seite

**Stand:** 2026-03-22  
**Ziel:** Präzise, umsetzbare Spezifikation für die neue **Monat**-Seite im ToBu‑Accountbereich.  
**Zielgruppe:** Neue Entwickler, Agents, Designer oder Reviewer, die das Projekt noch nicht kennen.

---
## 1. Ziel dieser Seite

Die Monat‑Seite soll für einen ausgewählten Monat auf einen Blick zeigen:
1. **wie hoch der Monatsbedarf ist**,  
2. **wie viel bereits eingezahlt wurde**,  
3. **wie viel ausgegeben wurde**,  
4. **welcher Übertrag mitwirkt**,  
5. **welcher Betrag pro Mitglied fällig / offen / bereits gezahlt ist**,  
6. **warum diese Werte so berechnet wurden**.

Die Seite ist damit die fachliche Brücke zwischen:
- **Buchungen / tatsächlichen Geldbewegungen**,
- **Budgets / geplanten Monatskosten**,
- **Beitragsbausteinen / Verteilungslogik**,
- **Mitgliedsbezogenen Einzahlungen**.

---

## 2. Einordnung im Produkt

ToBu Finance kombiniert laut Masterkonzept drei Hauptbereiche:
1. Buchungsverwaltung,
2. Monatsplanung,
3. Account‑Übersicht / Dashboard.  
Die Monat‑Seite ist die konkrete UX‑Ausprägung des Bereichs **Monatsplanung**. fileciteturn7file2

### Abgrenzung zu bestehenden Screens

#### 2.1 Account Overview
Die Account Overview ist eine **Management-/Cockpit-Sicht** mit KPIs, Charts, Insights und Timeline. Sie beantwortet vor allem:
- Wie steht der Account aktuell da?
- Welche Warnungen und Aufgaben gibt es?
- Wie hat sich der Kontostand entwickelt?  
Das ist bereits im Overview‑Read‑Model angelegt. fileciteturn7file3

#### 2.2 Buchungsseite
Die Buchungsseite ist der operative Bereich für **Transaktionen**, Splits, Filter, Editor und Capture‑Dock. Sie fokussiert einzelne Vorgänge und deren Erfassung / Bearbeitung. fileciteturn7file0

#### 2.3 Monat-Seite
Die Monat‑Seite ist ein **monatsfokussierter Arbeitsbereich**. Sie beantwortet:
- Was ist in diesem Monat geplant?
- Was ist tatsächlich passiert?
- Was muss noch eingezahlt werden?
- Wie kommt der Soll‑Betrag pro Mitglied zustande?

---

## 3. Grundidee der Seite in einem Satz

> Die Monat‑Seite ist das monatliche Arbeitsblatt eines Accounts: Sie zeigt Plan, Ist, Verteilung und Berechnungslogik so, dass Nutzer sofort handeln und die Herleitung der Einzahlungswerte nachvollziehen können.

---

## 4. Warum diese Seite im MVP wichtig ist

Das Masterkonzept benennt explizit die Monatsplanung als Kernscreen und gleichzeitig als noch nicht vollständig geschlossenes Read‑Model. Es fehlt vor allem eine dedizierte, erklärbare Sicht für `monthlyDue` vs. `paidAmount` pro Mitglied. fileciteturn7file2

Zusätzlich ist im Domänenmodell bereits alles vorhanden, was für diese Seite nötig ist:
- `transactions`,
- `category_budgets`,
- `contribution_rules`,
- `member_incomes`,
- `carryovers`,
- `account_balances`. fileciteturn7file1turn7file2turn7file3

Die Monat‑Seite ist daher ein sinnvoller nächster Schritt nach Wizard, Accounts, Account Overview und Buchungsseite.

Wichtig für die Umsetzung im MVP:
- Die Monat‑Seite baut auf einem **dedizierten Month-View-ReadModel** auf.
- Sie ist **keine bloße Erweiterung des Overview-ReadModels**.
- Frontend und Backend erhalten dafür einen eigenen Month-View-Pfad im Account-Kontext.

---

## 5. Kanonische Begriffe für diese Seite

Damit neue Entwickler die Seite korrekt umsetzen, gelten diese Begriffe:

### 5.1 Monat
Der gesamte Screen ist auf **einen Monat** bezogen. Monatshandling folgt dem Systemprinzip Month‑Anchor. fileciteturn7file2turn7file3

Für den MVP gilt zusätzlich:
- externer Query-/Request-Vertrag zunächst über **`YYYY-MM`**,
- interne Normalisierung auf den jeweiligen Monatsanker ist weiterhin erlaubt.

### 5.2 Monatsbedarf
Gesamtwert, der ausdrückt, welcher Bedarf für den aktuellen Monat entsteht.

### 5.3 Eingezahlt
Summe der als Mitgliedseinzahlungen erfassten Zahlungen in diesem Monat.

### 5.4 Ausgegeben
Summe aller relevanten Monatsausgaben.

### 5.5 Übertrag
Korrekturwert aus `carryovers`, der in die Monatslogik einfließt. Carryovers sind im Modell explizit als Übertrag/Korrektur pro Mitglied vorgesehen und können positiv oder negativ sein. fileciteturn7file1turn7file2

Für die KPI-Leiste bedeutet das im MVP:
- **`Übertrag` = Summe aller Carryovers des ausgewählten Monats**.

### 5.6 Beitragsbausteine
Die Einzahlungslogik basiert **nicht** auf genau einer aktiven Regel, sondern auf mehreren gleichzeitig wirksamen Bausteinen. Das folgt aus dem Modell `contribution_rules` mit `type = base | additional | topup`. fileciteturn7file1turn7file3

### 5.7 Einzahlungslogik / Berechnungsgrundlage
Unterer Bereich der Seite, der verständlich erklärt, wie die Einzahlungswerte zustande kommen.

---

## 6. Endgültige Benennung und Navigation

### 6.1 Tab-Name
Der Name der Seite ist final:

**`Monat`**

Nicht verwenden:
- Planung
- Monatsplanung als primärer UI-Tabname

Begründung:
- „Planung“ wirkt zu abstrakt.
- Die Seite ist nicht nur Planungsoberfläche, sondern ein Mix aus Abgleich, Status und Aktion.
- „Monat“ ist für Nutzer klarer und alltagstauglicher.

### 6.2 Position im Accountbereich
Die Seite ist als **zusätzlicher Tab** im Accountbereich gedacht, neben:
- Übersicht
- Buchungen
- Monat
So bleibt die Seite klar im Kontext eines Accounts und wirkt nicht wie ein komplett eigener Navigationsbereich.

---

## 7. Endgültige Header-Struktur

### 7.1 Monatsauswahl
Im Header gibt es eine Monat/Jahr-Auswahl.

**Finale Entscheidung:**
- Verwendung eines **PrimeNG `p-datepicker` im Month‑Only Modus**.
- Optional flankiert durch Vor/Zurück-Navigation für schnelles Blättern.

### 7.2 Pending-Logik im Header
**Nicht verwenden:** eigener prominenter Pending-Switch direkt auf der Monat-Seite.

Begründung:
- Ein solcher Switch wäre redundant, wenn mehrere Seiten Pending berücksichtigen.
- Pending ist laut Systemprinzip global relevant und soll konsistent, aber nicht als großer Sonderblock pro Seite auftauchen. 

**Finale Entscheidung:**
- Pending wird **vereinheitlicht im Account-Kontext** behandelt.
- Die Monat‑Seite kann höchstens einen kleinen Statushinweis / Chip anzeigen, ob Pending enthalten ist.
- Kein großer Schalter als dominantes Seitenelement.
- Pending wird im MVP **fachlich mit eingerechnet**.
- UI und State sollen aber bereits so vorbereitet werden, dass ein späterer Pending-Switch ohne strukturellen Umbau ergänzt werden kann.

---

## 8. Endgültige Top-Actions

Oben rechts befindet sich ein primärer Aktionsbereich.

### 8.1 Primäraktion
**Einzahlung buchen**

### 8.2 Split-Button
Der Split-Button soll **visuell von Anfang an mitgedacht** werden.

**Enthaltene Aktionen:**
- Ausgabe hinzufügen
- TopUp
- Sonderzahlung

**Nicht aufnehmen:**
- „Wiederkehrer ausführen“, weil wiederkehrende Buchungen laut Entscheidung automatisch als `pending` erzeugt werden und nicht manuell im Monat‑Tab ausgeführt werden sollen.

### 8.3 UX-Ziel
Die wichtigsten Monatsaktionen sollen sichtbar sein, ohne die Seite mit gleichwertigen Buttons zu überladen.

---

## 9. Endgültige KPI-Leiste

Direkt unter dem Header befindet sich eine kompakte KPI‑Leiste mit **genau vier Werten**:

1. **Monatsbedarf**
2. **Eingezahlt**
3. **Ausgegeben**
4. **Übertrag**

### 9.1 Begründung
Diese vier Werte wurden bewusst priorisiert, weil sie den Monat makroseitig am besten erklären.

**`Offen`** ist zwar wichtig, soll aber **nicht** als oberste KPI erscheinen, sondern primär auf Mitgliedsebene sichtbar sein.

### 9.2 Bedeutung der Werte

#### Monatsbedarf
Fachlich der Gesamtbedarf des Monats. Im UI soll er als Hauptorientierungswert verstanden werden.

#### Eingezahlt
Summe der in diesem Monat als Mitgliedseinzahlungen erfassten Zahlungen.

#### Ausgegeben
Summe der Monatsausgaben.

#### Übertrag
Expliziter Korrekturwert, der aus dem vorherigen Monat in diesen Monat hineinwirkt.

---

## 10. Mitgliederbereich – Hauptfläche der Seite

Nach der KPI-Leiste folgt die wichtigste Arbeitsfläche: **Member Cards**.

### 10.1 Darstellungsform
**Finale Entscheidung:**
- Hauptdarstellung als **Cards**, nicht als Tabelle.

Begründung:
- besser scanbar,
- emotional zugänglicher,
- mobiltauglicher,
- weniger „Excel-/Backoffice-Gefühl“.

### 10.2 Pro Card anzuzeigende Inhalte
Jede Member-Card zeigt:
- Mitgliedsname
- Soll
- Gezahlt
- Offen
- Übertrag
- Progressbar
- letzte Einzahlung
- private Vorleistung
- CTA „Einzahlung buchen“

### 10.3 Bedeutung der Felder

#### Soll
Der pro Mitglied erwartete Monatsbetrag. Dieser Wert kommt aus der **Einzahlungs-/Beitragslogik**.

#### Gezahlt
Tatsächlich geleistete Mitgliedseinzahlungen für den Monat.

#### Offen
Differenz zwischen Soll und Gezahlt.

#### Übertrag
Zeigt den für dieses Mitglied wirksamen Carryover-Wert des ausgewählten Monats.

#### Letzte Einzahlung
Zeigt die letzte erfasste Einzahlung dieses Mitglieds im aktuellen oder letzten relevanten Zeitraum.

#### Private Vorleistung
Zeigt private, für den Account relevante Vorleistungen des Mitglieds. Diese Information ist eine wichtige Erweiterung, weil ToBu private Vorleistungen explizit modelliert. fileciteturn7file2

### 10.4 CTA-Verhalten
Der Button **„Einzahlung buchen“** ist pro Card kontextbezogen.

Beim Klick öffnet sich idealerweise eine **Sidebar** mit:
- Mitglied vorausgewählt,
- Kategorie „Einzahlung / Beitrag“ vorausgewählt,
- vorgeschlagenem Betrag (z. B. Offen-Betrag),
- Datum = heute,
- Notiz optional.

### 10.5 Wichtige Domänenentscheidung zur Einzahlungserfassung
Die Monat‑Seite darf Einzahlungen direkt anlegen, obwohl Einzahlungen aktuell auch über die Buchungsseite erfasst werden. Das ist ausdrücklich gewünscht: die Monat‑Seite ist ein **spezialisierter Flow für Einzahlungen**.

`paidByMemberId` soll **nicht global für alle Incomes verpflichtend** werden. Stattdessen ist der Monat‑Flow spezialisierter: Mitgliedseinzahlung kann über Kategorie/Flow gekennzeichnet und im UI sinnvoll geführt werden.

Für die Month-View-Logik gilt dabei zusätzlich:
- Kategorie/Flow allein reichen nicht als einzige Wiedererkennungslogik.
- **`paidByMemberId` ist ein zentraler Identifikator** für mitgliedsbezogene Einzahlungen und Vorleistungen.
- Mitgliedseinzahlungen müssen im ReadModel so wiederauffindbar sein, dass `paidAmount` pro Mitglied eindeutig und reproduzierbar berechnet werden kann.

---

## 11. Kategorienbereich – finaler Aufbau

Unterhalb der Member-Cards liegt der **Kategorienbereich**.

### 11.1 Struktur
**Finale Entscheidung:** zweispaltiger Aufbau.

#### Linke Spalte
Kompakte **Kategorieliste** mit Budget vs. Ist.

#### Rechte Spalte
**Historische Statistik / Verlauf**.

Diese Zweiteilung ist wichtig und wurde nachträglich explizit festgezurrt.

### 11.2 Linke Spalte: kompakte Kategorieliste
Die linke Statistik zeigt pro Kategorie:
- Kategoriename,
- geplantes Budget,
- aktuelle Ausgaben,
- Balkendarstellung,
- visuelle Hervorhebung des Budgetstatus.

### 11.3 Visualisierung links
Die Balken sollen das Verhältnis von:
- geplantem Budget,
- bereits ausgegebenem Betrag
zeigen.

Mögliche Darstellung:
- Budget als Grundbalken,
- aktuelle Ausgaben als farbiger Fortschritts-/Overlay-Balken.

### 11.4 Rechte Spalte: historische Budgethalte-Statistik
Die rechte Statistik zeigt einen Verlauf über mehrere Monate.

**Interaktion:**
- Klick auf eine Kategorie links → rechts wird der Verlauf für genau diese Kategorie gezeigt.
- Keine Kategorie ausgewählt → rechts wird ein Gesamtverlauf über alle Kategorien gezeigt.

### 11.5 Button „Alle Kategorien anzeigen“
Der Button erweitert **inline** die links angezeigten Kategorien.
Er soll **nicht** auf eine andere Seite wechseln.

### 11.6 Detailtabellen per Accordion
Unter oder innerhalb des Kategorienbereichs gibt es **Accordions** für detaillierte Tabellen.

Wichtig:
- die kompakten Statistiken bleiben der Default,
- die detaillierten tabellarischen Aufschlüsselungen erscheinen erst über Accordion / Expand.

Diese Entscheidung wurde explizit festgezurrt, nachdem erste Bildentwürfe die Detailstruktur nicht sauber abgebildet hatten.

---

## 12. Bereich unterhalb der Kategorien: Erklärbereich für die Einzahlungslogik

Unter dem gesamten Kategorienbereich liegt ein eigener Bereich.

### 12.1 Finaler Zweck
Dieser Bereich muss verständlich machen:

> **Wie werden die Einzahlungswerte pro Mitglied berechnet?**

Das ist eines der wichtigsten Ziele der Seite.

### 12.2 Geeignete Namen
Folgende UI-Namen wurden als passend bewertet:
- **Beitragslogik**
- **So wird dein Monat berechnet**
- **Berechnungsgrundlage**

Der stärkste inhaltliche Titel für die ganze Fläche ist:

**„So wird dein Monat berechnet“**

Darin können Unterabschnitte z. B. „Beitragslogik“ oder „Berechnungsgrundlage“ heißen.

### 12.3 Zentrale Korrektur gegenüber früherem Denkmodell
Dieser Bereich darf **nicht** so wirken, als gäbe es genau **eine aktive Contribution Rule**.

Das wäre fachlich falsch.

Warum?
Weil das Domänenmodell `contribution_rules` mehrere gleichzeitig wirksame Regeltypen kennt:
- `base`
- `additional`
- `topup` fileciteturn7file1turn7file3

Damit ist die korrekte UI-Denke:
- **mehrere Beitragsbausteine wirken zusammen**,
- nicht „eine Regel bestimmt alles“.

### 12.4 Inhaltliche Struktur des Bereichs

#### Abschnitt A – Monatsbasis / Monatsbedarf
Zeigt, woraus sich der Monatsbedarf zusammensetzt, z. B.:
- Budgetsumme,
- Sonderzahlungen / Additionals,
- Übertrag,
- ggf. weitere monatliche Korrekturanteile.

Für die fachliche Berechnung im MVP gilt:
- `category_budgets` liefern den monatlichen Bedarf,
- Kategorien **ohne** `customSplit` fließen in einen gemeinsamen Base-ProRata-Block,
- Kategorien **mit** identischem `customSplit` fließen in eigene abgeleitete Base-Custom-Blöcke,
- explizit persistierte Contribution Rules bleiben für `additional`, `topup` und sonstige Sonderkorrekturen bestehen.

Dadurch bleibt die Contribution-Logik die primäre Quelle für Einzahlungs-Sollwerte, ohne dass kategoriespezifische Sonderverteilungen verloren gehen.

#### Abschnitt B – Beitragsbausteine
Listet die aktiven Bausteine dieses Monats, jeweils mit:
- Name / Beschreibung,
- Betrag,
- Verteilungsart,
- ggf. Gültigkeit,
- Effekt pro Mitglied.

Typische Beispiele:
- Basisbeitrag – pro-rata Einkommen,
- Basisbeitrag – Kategoriepool mit Custom Split 70/30,
- Zusatzbeitrag – Tony 100 %,
- TopUp – custom split 60/40.

Wichtig:
- Der Bereich muss zwischen **Bedarf**, **Verteilung**, **tatsächlicher Zahlung**, **privater Vorleistung/Ausgleich** und **Carryover** unterscheiden.
- Nicht jeder sichtbare Beitragsblock muss einer manuell persistierten Rule 1:1 entsprechen; Base-Blöcke dürfen im Month-ReadModel aus Budgets und Kategorieverteilungen abgeleitet werden.

#### Abschnitt C – Einkommensbasis
Nur relevant, wenn pro-rata verteilt wird.
Dann anzeigen:
- Einkommen je Mitglied,
- Verhältnis / Anteil,
- abgeleitete Verteilung (z. B. 60/40).

Die Income-Basis gilt nur für echte ProRata-Blöcke, nicht automatisch für Base-Custom- oder PerMember-Blöcke.

#### Abschnitt D – Private Vorleistungen / Ausgleich
Wenn gemeinsame Ausgaben privat bezahlt wurden, muss die Monat-Seite zusätzlich erklären:
- wer die Ausgabe tatsächlich bezahlt hat,
- welcher Anteil fachlich auf andere Mitglieder entfällt,
- welcher Vorleistungs- bzw. Ausgleichswert daraus entsteht.

Diese Vorleistungs-/Ausgleichswerte sind **kein normaler Contribution-Rule-Baustein**, sondern ein separater Settlement-Kanal.
Ob dieser Ausgleich sofort in `monthlyDue` einfließt oder zunächst separat bis zum Carryover geführt wird, bleibt eine fachliche Detailentscheidung.

### 12.5 Detaillierte Tabellen per Accordion
Auch hier gilt:
- kompakte Zusammenfassung als Default,
- detaillierte Tabellen über Accordion.

Beispiele:
- Tabelle „Contribution Breakdown“ pro Mitglied,
- Tabelle „Income Basis“.

Diese Accordion-Entscheidung ist fest und soll explizit umgesetzt werden.

---

## 13. Endgültige visuelle und UI/UX-Entscheidungen

### 13.1 Grundrichtung
Die Seite orientiert sich visuell an deinem bestehenden dunklen ToBu-UI.

### 13.2 Farbwelt aus dem ersten Referenzbild
Das erste generierte Bild war fachlich nicht vollständig korrekt, hatte aber eine nützliche visuelle Richtung. Daraus lassen sich folgende Farb- und Stilprinzipien ableiten:

#### Hintergrund
- sehr dunkler, fast schwarzer Hintergrund,
- leicht bläulich / anthrazit,
- große ruhige Flächen.

#### Cards und Flächen
- dunkle Panels mit leichtem Glow / Gradient,
- leichte farbige Schimmer statt harter Kanten,
- deutliche, aber elegante Trennung der Funktionsflächen.

#### Primärfarben
Aus dem ersten Bild lassen sich grob folgende Farbstimmungen ableiten:
- **grün/türkis** für positive / primäre Aktionen,
- **violett/lila** für sekundäre Mitgliedsflächen oder alternative Akzentkarten,
- **gold/orange/amber** für Übertrag / Zwischenstatus / hervorzuhebende finanzielle Korrekturen,
- **blau** für Informations- oder neutrale Werte,
- **rot** nur zurückhaltend für Warn-/kritische Zustände.

#### Progressbars / Kategorie-Balken
- sanfte, leuchtende Balken,
- keine flachen Excel-Füllungen,
- Budget vs. Ist muss farblich klar lesbar sein.

### 13.3 Semantisches Farbsystem
Final gewünscht:
- **grün** = positiv / ok / Aktion,
- **gelb/orange** = offen / Zwischenstatus / Übertrag,
- **rot** = kritisch / überschritten,
- **blau/violett** = neutral / informativ / sekundär.

### 13.4 Stilziel
Die Seite soll wirken wie:
- modernes PrimeNG/Tailwind-Desktop-UI,
- hochwertiges Finanztool,
- nicht wie Excel,
- nicht wie ein generisches Dashboard,
- nicht wie ein Admin-CRUD.

---

## 14. Fehler und Unschärfen im ersten generierten Referenzbild

Das erste Bild war nützlich als visuelle Richtung, aber **nicht fachlich final korrekt**.

### 14.1 Was am ersten Bild gut war
- Grundstimmung des dunklen Themes,
- klare Blockstruktur,
- Member-Cards als Hauptdarstellung,
- prominenter Einzahlungs-CTA,
- Idee eines untergeordneten Erklär-/Regelbereichs,
- kompakter Kategorienbereich,
- generelle visuelle Passung zum bestehenden ToBu-UI.

### 14.2 Was am ersten Bild fachlich oder strukturell falsch / unpräzise war

#### Fehler A – drittes „Mitglied“ / falsche Card
Im ersten Bild erschien eine zusätzliche Card („Kita“ o. ä.), obwohl die Hauptlogik auf echte Mitglieder bezogen sein muss.

**Korrektur:**
- nur reale Mitgliederkarten,
- keine falschen Platzhalter als Mitglieds-Card.

#### Fehler B – Pending als prominenter Seitenblock
Im ersten Bild war Pending zu stark als eigener Block / Schalter auf der Seite inszeniert.

**Korrektur:**
- kein dominanter Pending-Switch auf der Monat-Seite,
- Pending nur vereinheitlicht im Account-Kontext oder als kleiner Statushinweis.

#### Fehler C – KPI-Struktur war nicht endgültig
Im ersten Bild waren KPIs und rechte Zusatzflächen noch uneindeutig.

**Korrektur:**
- genau vier obere KPIs:
  1. Monatsbedarf,
  2. Eingezahlt,
  3. Ausgegeben,
  4. Übertrag.

#### Fehler D – Kategorienbereich nicht final logisch aufgebaut
Frühere Bildversionen haben den Kategorienbereich nicht sauber als **linke aktuelle Statistik + rechte Verlaufsgrafik** abgebildet.

**Korrektur:**
- klare Zweiteilung links/rechts,
- links kompakte Kategorieliste,
- rechts historische Statistik,
- Detailtabellen per Accordion.

#### Fehler E – Erklärbereich zu hoch / an falscher Stelle
In späteren Bildversionen lag der Bereich zur Berechnungslogik nicht korrekt **unterhalb** des Kategorienbereichs.

**Korrektur:**
- „So wird dein Monat berechnet“ liegt unter dem gesamten Kategorienblock.

#### Fehler F – zu starkes Denken in „eine aktive Regel“
In ersten Konzeptstufen wurde die Logik zu sehr als einzelne Contribution Rule interpretiert.

**Korrektur:**
- Darstellung als mehrere Beitragsbausteine,
- Basisbeitrag, Zusatzbeiträge, TopUps etc. getrennt sichtbar.

#### Fehler G – fehlende Accordions
Die gewünschten Detailtabellen waren in den generierten Bildern nicht konsequent als Accordions dargestellt.

**Korrektur:**
- explizite Accordions im Kategorienbereich und im Bereich „So wird dein Monat berechnet“.

#### Fehler H – Action-Menü noch nicht final zugeschnitten
In früheren Varianten tauchte teils „Wiederkehrer ausführen“ auf.

**Korrektur:**
- nicht im Monat-Tab,
- Split-Button nur mit relevanten Aktionen.

---

## 15. Endgültige Änderungen gegenüber dem ersten Referenzbild

Hier die konkret festgezurrten Änderungen, die gegenüber dem ersten Bild gelten:

1. **Tabname final = „Monat“** statt alternativer Bezeichnungen.  
2. **Month-only Datepicker** als offizielle Monatsauswahl.  
3. **Kein prominenter Pending-Switch** mehr auf der Seite.  
4. **Top-Actions finalisiert** auf Einzahlung buchen + Split-Button.  
5. **Split-Button finalisiert** mit:
   - Ausgabe hinzufügen,
   - TopUp,
   - Sonderzahlung.  
6. **Vier KPI-Karten finalisiert**:
   - Monatsbedarf,
   - Eingezahlt,
   - Ausgegeben,
   - Übertrag.  
7. **Mitgliedskarten finalisiert** mit:
   - Soll,
   - Gezahlt,
   - Offen,
   - Progressbar,
   - letzte Einzahlung,
   - private Vorleistung,
   - Einzahlung buchen.  
8. **Einzahlungsflow finalisiert** als Sidebar mit vorausgefüllten Inhalten.  
9. **Kategorienbereich finalisiert als 2-Spalten-Block**.  
10. **Linke Kategorie-Statistik finalisiert** als Budget-vs-Ist-Liste mit Balken.  
11. **Rechte Statistik finalisiert** als historischer Verlauf je Kategorie oder gesamt.  
12. **„Alle Kategorien anzeigen“** erweitert inline.  
13. **Detailtabellen final per Accordion**.  
14. **Unterer Logikbereich finalisiert** als Erklärfläche unterhalb des Kategorienbereichs.  
15. **Contribution-Logik korrigiert** von „eine Regel“ zu „mehrere Beitragsbausteine“.  
16. **Einkommensbasis** wird sichtbar, wenn pro-rata relevant ist.  
17. **Namensraum des Logikbereichs finalisiert**: „So wird dein Monat berechnet“ / „Beitragslogik“ / „Berechnungsgrundlage“.  

---

## 16. Empfohlene Seitenstruktur (finale Reihenfolge)

1. Account-Tabs (Übersicht / Buchungen / Monat)  
2. Monat-Header mit Month-Only-Auswahl  
3. Top-Action-Zeile (Einzahlung buchen + Split-Button)  
4. KPI-Leiste mit 4 Werten  
5. Member-Cards  
6. Kategorienbereich (2 Spalten)  
7. Accordions für Kategoriedetails  
8. Bereich „So wird dein Monat berechnet“  
9. Accordions für Contribution-/Income-Details  

---

## 17. Technische und fachliche Hinweise für die Umsetzung

### 17.1 Datenbasis
Die Seite kann im MVP auf einem Read‑Model über vorhandene Domänenobjekte aufbauen:
- `transactions`,
- `category_budgets`,
- `contribution_rules`,
- `member_incomes`,
- `carryovers`,
- `account_balances`. fileciteturn7file1turn7file2turn7file3

Dieses ReadModel soll als **dedizierter Month-View-Endpunkt** umgesetzt werden und nicht als bloße Ableitung des bestehenden Overview-Endpunkts.

### 17.2 Domänenrealität zu Contribution Rules
Contribution Rules sind laut Schema persistierte Regeln mit Typen `base`, `additional`, `topup` und unterschiedlichen Verteilungsmodi (`perMember`, `customSplit`, `proRataIncome`). Das UI muss diese Vielfalt erklären, nicht verstecken. fileciteturn7file1turn7file3

### 17.3 Einzahlungsverständnis
Im Masterkonzept ist noch offen, dass Mitgliedseinzahlungen fachlich nicht vollständig typisiert sind (GAP 2). Die Monat‑Seite sollte diese Lücke UX-seitig kompensieren, indem Einzahlungen für Nutzer klar als solcher Flow erkennbar sind. fileciteturn7file2

### 17.4 Pending
Pending zählt im MVP mit, muss aber markiert sein. Diese Systemregel bleibt gültig. Die Monat‑Seite soll Pending sichtbar, aber nicht redundant prominent machen. fileciteturn7file2

---

Für die technische Umsetzung gilt an dieser Stelle zusätzlich:
- `paidByMemberId` ist der zentrale Identifier für mitgliedsbezogene Einzahlungen und private Vorleistungen.
- Ein echter Pending-Switch ist später möglich; ReadModel, State und UI-Slots sollen dafür aber bereits vorbereitet werden.

## 18. Nicht-Ziele dieser Seite

Diese Seite ist **nicht**:
- die primäre CRUD-Verwaltung für Kategorien,
- die komplette Bearbeitungsseite für Contribution Rules,
- die primäre Recurrence-Verwaltung,
- die Timeline-/Insights-Hauptseite,
- eine reine Tabelle,
- ein zweites Overview.

Sie ist ein **monatlicher Arbeitsbereich mit Erklärbarkeit**.

---

## 19. Finales Fazit für neue Entwickler / Agents

Wenn du diese Seite neu umsetzen musst, merke dir:

1. **„Monat“ ist ein eigener operativer Tab**, kein weiteres Dashboard.  
2. **Die Seite ist monatszentriert**, nicht accountweit abstrakt.  
3. **Oben stehen 4 KPIs**, nicht mehr, nicht weniger.  
4. **Member-Cards sind die Hauptfläche**.  
5. **Der Kategorienblock ist zweispaltig**: links aktuell, rechts historisch.  
6. **Detailtabellen gehören in Accordions**, nicht in die Default-Ansicht.  
7. **Unter dem Kategorienbereich liegt die Erklärfläche für die Einzahlungslogik**.  
8. **Es gibt mehrere Beitragsbausteine**, nicht nur eine einzelne Regel.  
9. **Die Seite muss verständlich zeigen, warum ein Mitglied genau diesen Einzahlungswert hat.**  
10. **Das erste Bild ist nur Stilreferenz** – nicht Strukturreferenz ohne Korrekturen.

