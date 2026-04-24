# ToBu – Monat-Seite: Detailtabellen-Konzept (Accordion)

## 1. Ziel dieses Dokuments

Dieses Dokument beschreibt die **Detailtabellen**, die in der Monat-Seite **nicht direkt sichtbar**, sondern in **Accordion-Bereichen** untergebracht werden.

Die Grundidee der Monat-Seite ist:

- **Primäransicht = scanbar und handlungsorientiert**
- **Detailansicht = nachvollziehbar, präzise, prüfbar**

Darum werden Tabellen bewusst **nicht als Hauptdarstellung** eingesetzt.  
Stattdessen werden sie erst sichtbar, wenn der Nutzer gezielt mehr Details sehen will.

Dieses Dokument beschreibt:

- warum die Tabellen im Accordion liegen,
- welche Tabellen es geben soll,
- welche Daten sie zeigen,
- welchen fachlichen Zweck sie erfüllen,
- wie sie sich zu den sichtbaren Hauptbereichen verhalten,
- und wie sie UI/UX-seitig aufgebaut sein sollten.

---

## 2. Warum Tabellen im Accordion?

Die Monat-Seite soll im Standardzustand nicht wie Excel wirken.  
Die Primärseite ist daher bewusst aufgebaut aus:

- KPI-Leiste
- Member-Cards
- kompaktem Kategorien-Zweispalter
- erklärender Beitragslogik

Tabellen haben dort nur eine **sekundäre Funktion**:

- Detailprüfung
- Nachvollziehbarkeit
- Debuggability für Nutzer
- Unterstützung für Power-Scanning bei Bedarf

### UX-Prinzip
- Standard: kompakt, verständlich, entscheidungsorientiert
- Expandiert: präzise, kontrollierbar, prüfbar

Darum liegen die Tabellen in Accordions.

---

## 3. Position der Accordions auf der Monat-Seite

Es gibt zwei sinnvolle Accordion-Zonen:

## A. Accordion im Kategorienbereich
Unter oder innerhalb des Kategorien-Zweispalters.

**Zweck:**
- detailliertere Kategorieprüfung
- Zahlen hinter der kompakten Balkenliste

## B. Accordion im Bereich „Beitragslogik"
Unterhalb der Beitragslogik.

**Zweck:**
- genaue Herleitung der Einzahlungswerte
- Transparenz für Soll-Beträge
- Einsicht in verwendete Einkommensbasis

---

## 4. Gesamtübersicht der empfohlenen Detailtabellen

Empfohlen sind im MVP drei Haupttabellen und eine optionale vierte:

1. **Contribution Breakdown Tabelle**
2. **Income Basis Tabelle**
3. **Kategorie-Details Tabelle**
4. optional: **Einzahlungs-Historie je Mitglied**

Die ersten drei sind die wichtigsten.

---

# 5. Tabelle 1 – Contribution Breakdown

## 5.1 Zweck
Die wichtigste Detailtabelle der Monat-Seite.

Sie beantwortet die Frage:

> „Wie setzt sich der Soll-Betrag jedes Mitglieds konkret zusammen?“

Diese Tabelle ist die tabellarische Entsprechung der visuellen Member-Cards und des Bereichs  
**„So wird dein Monat berechnet“**.

Während die Member-Cards nur Endwerte zeigen, zerlegt diese Tabelle den Wert je Mitglied in seine Beitragsbausteine.

---

## 5.2 Fachlicher Hintergrund

Im System gibt es nicht eine einzige Beitragsregel, sondern mehrere gleichzeitig wirksame Beitragsbausteine, z. B.:

- Basisbeitrag (`base`)
- Zusatzbeitrag (`additional`)
- TopUp (`topup`)

Diese Bausteine können über unterschiedliche Distributionsarten verteilt werden:

- `perMember`
- `customSplit`
- `proRataIncome`

Die Tabelle muss deshalb sichtbar machen:

- welche Bausteine aktiv sind,
- welchen Betrag sie beitragen,
- und wie daraus pro Mitglied der Gesamt-Sollbetrag entsteht.

Für den Month-View dürfen Base-Blöcke dabei auch aus `CategoryBudget`-Bedarfen und gruppierten `customSplit`-Pools abgeleitet werden. Explizit persistierte Contribution Rules bleiben daneben für `additional`, `topup` und Sonderkorrekturen sichtbar.

---

## 5.3 Position im UI
Im Accordion innerhalb des Bereichs:

**„So wird dein Monat berechnet“**

Möglicher Accordion-Titel:
- „Details zur Berechnung“
- „Beitragsdetails“
- „Soll-Beträge im Detail“

---

## 5.4 Spaltenvorschlag (MVP)
Empfohlene Grundversion:

- Mitglied
- Base
- Additional
- TopUp
- Gesamt

### Beispiel
| Mitglied | Base | Additional | TopUp | Gesamt |
|---|---:|---:|---:|---:|
| Tony | 1.200 € | 200 € | 700 € | 2.100 € |
| Caro | 800 € | 0 € | 300 € | 1.100 € |

---

## 5.5 Alternative erweiterte Version
Wenn es später mehr als drei Bausteintypen geben sollte, kann die Tabelle dynamischer gebaut werden:

- Mitglied
- [Baustein 1]
- [Baustein 2]
- [Baustein 3]
- …
- Gesamt

Dann orientieren sich die Spalten nicht an Typen, sondern an den im Monat aktiven Beitragsbausteinen.

Für den MVP ist die feste Spaltenstruktur aber meist lesbarer.

---

## 5.6 Anforderungen an die Logik
- Summen müssen exakt mit `monthlyDue` der Member-Cards übereinstimmen.
- Reihen-/Spaltensummen müssen nachvollziehbar sein.
- Nullwerte dürfen sichtbar sein, aber visuell unaufdringlich.
- Tabelle darf keine „versteckte zweite Berechnung“ enthalten, sondern muss denselben Selector/ViewModel-Output nutzen wie die Cards.

---

## 5.7 UX-Hinweise
- Zahlen rechtsbündig
- Gesamtspalte visuell hervorgehoben
- Nullwerte dezent
- Tooltip auf Spaltenüberschriften möglich:
  - Base = reguläre Grundverteilung
  - Additional = Zusatzbeiträge
  - TopUp = Auffüll-/Korrekturbeiträge

---

# 6. Tabelle 2 – Income Basis

## 6.1 Zweck
Diese Tabelle erklärt die Einkommensbasis, die für `proRataIncome` verwendet wird.

Sie beantwortet die Frage:

> „Auf welcher Einkommensgrundlage wurde die pro-rata-Verteilung berechnet?“

Diese Tabelle ist besonders wichtig, weil pro-rata-Berechnungen sonst für Nutzer oft wie eine Blackbox wirken.

---

## 6.2 Position im UI
Im selben Accordion-Kontext wie die Beitragsdetails, unterhalb oder als zweites Accordion-Panel.

Mögliche Titel:
- „Verwendete Einkommensbasis“
- „Einkommen für ProRata“
- „ProRata-Grundlage“

---

## 6.3 Sichtbarkeitsregel
Diese Tabelle soll **nicht immer sichtbar** sein.

Sie wird nur angezeigt, wenn im aktuellen Monat mindestens ein aktiver Beitragsbaustein  
`distribution.mode = proRataIncome` verwendet.

Wenn kein ProRata aktiv ist, entfällt die Tabelle vollständig.

Sie bezieht sich nur auf echte ProRata-Blöcke, nicht automatisch auf Base-Custom-Split-Blöcke.

---

## 6.4 Spaltenvorschlag
- Mitglied
- Einkommen
- Anteil
- Gültig ab / Zeitraum optional

### Beispiel
| Mitglied | Einkommen | Anteil |
|---|---:|---:|
| Tony | 2.400 € | 60 % |
| Caro | 1.600 € | 40 % |

Optional:
| Mitglied | Einkommen | Anteil | Gültig ab |
|---|---:|---:|---|
| Tony | 2.400 € | 60 % | 2026-01 |
| Caro | 1.600 € | 40 % | 2026-01 |

---

## 6.5 Anforderungen an die Logik
- Nur tatsächlich für den Monat aktive Einkommen verwenden
- Zeitraumauflösung muss klar sein
- Prozentanteile müssen exakt zu den pro-rata-Bausteinen passen

---

## 6.6 UX-Hinweise
- Diese Tabelle ist eine Erklärtabelle, keine Bearbeitungstabelle
- Bearbeiten eher über Shortcut/Link, nicht inline im MVP
- Prozentanteile können visuell hervorgehoben werden
- Optional kleine Infozeile:
  - „Diese Werte werden für alle pro-rata Bausteine im ausgewählten Monat verwendet.“

---

# 7. Tabelle 3 – Kategorie-Details

## 7.1 Zweck
Diese Tabelle erweitert die linke kompakte Kategorienliste.

Die kompakte Liste zeigt nur:
- Name
- Budget
- aktuelle Ausgaben
- visuelle Budgetauslastung

Die Detailtabelle beantwortet zusätzlich:

> „Wie sehen die Zahlen je Kategorie genau aus?“

---

## 7.2 Position im UI
Im Kategorienbereich, idealerweise unterhalb des Buttons  
**„Alle Kategorien anzeigen“** oder in einem eigenen Accordion darunter.

Mögliche Titel:
- „Kategorie-Details“
- „Alle Kategorien im Detail“
- „Budgetdetails“

---

## 7.3 Spaltenvorschlag
Empfohlen:

- Kategorie
- Budget
- Ist-Ausgaben
- Abweichung
- Status

### Beispiel
| Kategorie | Budget | Ist | Abweichung | Status |
|---|---:|---:|---:|---|
| Miete | 1.200 € | 1.100 € | -100 € | Im Budget |
| Lebensmittel | 400 € | 450 € | +50 € | Überschritten |
| Internet | 50 € | 50 € | 0 € | Exakt |

---

## 7.4 Alternative Zusatzspalten
Später optional:
- Transaktionsanzahl
- letzte Buchung
- Trend zur Vorperiode
- Hinweis auf verwendeten `customSplit`

Diese Spalten sind für MVP nicht zwingend.

---

## 7.5 Anforderungen an die Logik
- Budget muss mit dem aktuell gültigen CategoryBudget des Monats übereinstimmen
- Ist-Ausgaben müssen auf Monats-Transactions beruhen
- Abweichung = Ist – Budget oder Budget – Ist muss eindeutig gewählt und beschriftet werden

### Empfehlung
Nimm:
- **Abweichung = Ist – Budget**

Dann gilt:
- positiver Wert = über Budget
- negativer Wert = unter Budget

Das ist fachlich oft am direktesten.

---

## 7.6 UX-Hinweise
- Status zusätzlich farblich markieren
- rot = über Budget
- grün = im Budget
- gelb/orange = nahe am Limit oder nur leicht überzogen
- Zahlen rechtsbündig
- gleiche Sortierung wie die kompakte Liste

---

# 8. Optionale Tabelle 4 – Einzahlungs-Historie je Mitglied

## 8.1 Zweck
Diese Tabelle ist kein MVP-Muss, aber eine sinnvolle spätere Ergänzung.

Sie beantwortet:
> „Welche konkreten Einzahlungen wurden diesem Mitglied im Monat zugeordnet?“

---

## 8.2 Position
Im Member-Card-Kontext oder im Beitrags-Accordion.

---

## 8.3 Spaltenvorschlag
- Datum
- Mitglied
- Betrag
- Typ/Kategorie
- Notiz optional

---

## 8.4 Nutzen
- Nachvollziehbarkeit von `paidAmount`
- einfache fachliche Prüfung bei Rückfragen
- gute Ergänzung für spätere Power-User-Ansichten

---

# 9. Zusammenspiel mit den sichtbaren Hauptbereichen

## Member-Cards ↔ Contribution Breakdown
- Cards zeigen Ergebnis
- Tabelle zeigt Zusammensetzung
- Übertrag bleibt als eigener Card-Wert sichtbar und ist nicht einfach nur eine Breakdown-Spalte.
- Private Vorleistung / Ausgleich bleibt getrennt von normalen Mitgliedseinzahlungen.

## Beitragslogik ↔ Income Basis
- Beitragslogik erklärt qualitativ
- Income-Tabelle zeigt die konkrete Prorata-Grundlage

## Kategorienliste ↔ Kategorie-Details
- Liste ist Scan-Ansicht
- Tabelle ist Prüf-Ansicht

Dieses Verhältnis darf bei der Umsetzung nicht verschwimmen.

---

# 10. Nicht-Ziele der Detailtabellen

Die Tabellen sollen im MVP **nicht** sein:

- Inline-CRUD-Flächen für alles
- vollständige Buchungslisten
- ein zweites Dashboard
- Excel-Ersatz als Hauptmodus

Sie sind unterstützende Detailebenen.

---

# 11. Empfohlene technische Form

## Accordion-Struktur
Empfehlung:

### Accordion 1 – Kategorien
- Panel: Kategorie-Details

### Accordion 2 – So wird dein Monat berechnet
- Panel: Contribution Breakdown
- Panel: Income Basis (nur falls relevant)

Optional später:
- Panel: Einzahlungs-Historie

---

# 12. Qualitätskriterien

Die Detailtabellen sind gut umgesetzt, wenn:

1. sie nicht für die Primärnutzung erforderlich sind,
2. sie aber alle sichtbaren Hauptwerte transparent nachprüfbar machen,
3. die Summen exakt mit Cards/KPIs übereinstimmen,
4. sie fachlich dieselbe Berechnungslogik nutzen wie die Hauptansicht,
5. sie visuell ruhig und sekundär bleiben.

---

# 13. Wichtigste Umsetzungsregeln für Agents

1. Tabellen niemals als Hauptdarstellung der Monat-Seite bauen.
2. Contribution Breakdown ist die wichtigste Detailtabelle.
3. Income Basis nur zeigen, wenn ProRata im Monat aktiv ist.
4. Kategorie-Details ergänzen die linke Kategorie-Liste, ersetzen sie nicht.
5. Summen in Tabellen müssen exakt zu KPIs und Cards passen.
6. Tabellen sind Read-/Explain-Ebene, keine komplexe Bearbeitungsebene.
