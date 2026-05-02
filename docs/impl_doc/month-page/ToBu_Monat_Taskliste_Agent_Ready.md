# ToBu – Monat-Seite: Agent-Ready Taskliste

## 1. Ziel der Taskliste

Diese Taskliste zerlegt die Umsetzung der **Monat-Seite** in sinnvolle, voneinander trennbare Arbeitspakete.  
Sie ist so aufgebaut, dass ein neuer Entwickler oder Agent:

- den Zweck der Monat-Seite versteht,
- die Reihenfolge der Umsetzung nachvollziehen kann,
- Abhängigkeiten zwischen Daten, Berechnung und UI erkennt,
- und die Seite iterativ bauen kann, ohne die Domänenlogik zu beschädigen.

Die Monat-Seite ist im Produkt keine zweite Overview-Seite, sondern ein **operativer Monats-Arbeitsbereich**.  
Sie beantwortet die Kernfrage der Monatsplanung: **Wie viel sollte jedes Mitglied diesen Monat einzahlen, was wurde bereits gezahlt, wie ist der aktuelle Kategorie-Status, und wie wird dieser Wert berechnet?**

---

## 2. Grundannahmen vor Start

Vor Beginn dieser Tasks gelten folgende fachliche Rahmenbedingungen:

- Die Seite arbeitet auf **Monatsebene** (`YYYY-MM` / Month Anchor).
- Die Seite ist **accountgebunden**.
- Die Seite ist ein eigener operativer Bereich neben:
  - Übersicht
  - Buchungen
- Die Seite nutzt für den MVP **Live-Berechnung** statt eingefrorenem Monatsstatement.
- Pending wird fachlich berücksichtigt, die endgültige zentrale Umschaltlogik wurde aber bewusst zurückgestellt.
- Die Seite soll **Cards als Primärdarstellung** und **Accordion/Tabellen als Detailstufe** verwenden.
- Die Erfassung von Einzahlungen darf direkt aus der Monat-Seite heraus möglich sein.
- Die Berechnungslogik muss für Nutzer transparent erklärt werden.

---

## 3. Empfohlene Umsetzungsstrategie

Sinnvolle Gesamt-Reihenfolge (jeder Baustein hinterlässt die App in einem vollständig lauffähigen Zustand):

0. **Backend: Month-View-API-Endpunkt**
1. **AccountShell + Seitenrahmen + Navigation**
2. **Datenbasis und Read-Model festziehen**
3. **Berechnungslogik für Monatswerte**
4. **Header + KPI-Leiste**
5. **Member-Cards**
6. **Einzahlungs-Quick-Flow**
7. **Kategorien-Zweispalter**
8. **Accordion-Detailtabellen**
9. **Beitragslogik-Bereich**
10. **Edge Cases / Loading / Empty / Errors**
11. **Polish / Mobile / QA**

Wichtig:  
Die Seite sollte **nicht zuerst visuell komplett gebaut** und danach mit Logik gefüllt werden.  
Sinnvoller ist ein inkrementeller Aufbau:

- zuerst Datenmodell + Berechnung,
- dann Primärflächen,
- dann Detailbereiche.

---

## 4. Taskliste im Detail

---

# Baustein 0 – Backend: Month-View-API-Endpunkt

## Task 0.1 ✅ – Endpunkt `GET /api/accounts/{id}/month-view` implementieren
**Ziel:** Der dedizierte Month-View-Endpunkt liefert ein vollständig berechnetes Read-Model für einen Monat.

**Vorbild:** Analog zu `GET /api/accounts/{id}/overview`.

**Umsetzung:**
- `src/routes/month-view.ts` befüllen
- Query-Parameter: `month=YYYY-MM`
- Response: aggregiertes Month-View-Read-Model (Members, KPIs, berechnete Beitragsbausteine, Kategoriestatus)
- bestehende Berechnungslogik aus `src/utils/contrib.ts` nutzen
- Rohdaten über `GET /api/accounts/{id}/expanded` beziehen (alle benötigten Entities sind dort bereits verfügbar)
- Route in `src/server.ts` registrieren
- `GET /api/accounts/{id}/expanded` als Datengrundlage nutzen (aggregiert bereits Members, Transactions, Budgets, ContributionRules, MemberIncomes, Carryovers)

**DoD:**
- `GET /api/accounts/:id/month-view?month=2025-08` gibt strukturiertes JSON zurück
- Berechnungslogik ist gekapselt
- Route ist in `server.ts` registriert

---

## Task 0.2 ✅ – OpenAPI-Spezifikation erweitern
**Ziel:** Endpunkt ist vollständig in der OpenAPI-Spec dokumentiert.

**Umsetzung:**
- Pfad `/api/accounts/{id}/month-view` in `docs/openapi.yaml` eintragen
- Response-Schema `MonthViewResponse` definieren
- Query-Parameter `month` (YYYY-MM) dokumentieren

**DoD:**
- Swagger/Docs zeigen den neuen Endpunkt
- Response-Schema stimmt mit der Implementierung überein

---

**Zustand nach Abschluss Baustein 0:** Backend liefert Month-View-Daten. Frontend und alle bestehenden Features bleiben vollständig unverändert und lauffähig.

---

# Baustein 1 – AccountShell, Rahmen und Routing

## Task 1.1 ✅ – AccountShell-Component als gemeinsamer Rahmen
**Ziel:** Gemeinsame Account-Hülle (Header, Tab-Leiste) für alle Account-Tabs ohne Code-Duplikation.

**Umsetzung:**
- neue `AccountShell`-Component als Route-Wrapper anlegen
- `accounts.routes.ts` umstrukturieren: `AccountShell` als Parent-Route mit `<router-outlet>`
- Tab-Leiste mit „Übersicht“, „Buchungen“, „Monat“ in der Shell – nicht in jeder Seite einzeln
- `AccountOverview` und `TransactionsView` aus Tab-Verantwortung herauslösen
- Account-Basisdaten (Name, Member-Liste) werden in der Shell einmalig geladen

**DoD:**
- Tab-Leiste erscheint auf allen drei Account-Bereichen identisch
- kein Code-Duplikat der Tab-Navigation
- App bleibt vollständig lauffähig, bestehende Routen funktionieren weiterhin

---

## Task 1.2 ✅ – Monat-Route und Tab registrieren
**Ziel:** Die Monat-Seite ist als eigene Route erreichbar und im Tab-Menü sichtbar.

**Umsetzung:**
- Route `month` als Child unter `AccountShell` in `accounts.routes.ts` eintragen
- Tab „Monat“ in der Tab-Leiste der Shell ergänzen
- `month-view`-Component registrieren

**DoD:**
- `/accounts/:id/month` navigiert zur Monat-Seite
- Tab-Auswahl wechselt korrekt
- Deep-Link funktioniert (kein Blank-Screen bei direktem Aufruf)

---

## Task 1.3 ✅ – Seitenlayout-Grundgerüst anlegen
**Ziel:** Feste Hauptstruktur der MonthView ohne echte Logik.

**Enthalten:**
- Headerbereich (Monat-Titel + Datepicker-Platzhalter)
- KPI-Leiste (4 Felder, Werte noch statisch)
- Member-Cards-Bereich (Platzhalter-Cards)
- Kategorienbereich (2-spaltig)
- Beitragslogik-Bereich unterhalb
- Accordion-Platzhalter für Details

**DoD:**
- Struktur entspricht finaler Seitenarchitektur
- Reihenfolge stimmt
- App bleibt vollständig navigierbar und lauffähig

---

# Phase 2 – Datenbasis und Read-Model

## Task 2.1 ✅ – Monatssicht-Datenquellen definieren
**Ziel:** Klar festlegen, welche Entities und Endpunkte für die Seite benötigt werden.

**Für die Monat-Seite relevant:**
- Account
- Members
- Categories
- Transactions
- CategoryBudgets
- ContributionRules
- MemberIncomes
- Carryovers

**Datenquelle:**
- `GET /api/accounts/{id}/month-view?month=YYYY-MM` (nach Abschluss Baustein 0 verfügbar)
- liefert ein vollständig aggregiertes ReadModel direkt vom Backend
- kein eigenes Frontend-Aggregieren aus mehreren parallelen Requests

**DoD:**
- dokumentiert, welche Daten die Seite zwingend braucht
- dokumentiert, welche Daten nur optional / später sind
- Query-Umfang pro Monat ist klar

---

## Task 2.2 ✅ – Monatsspezifisches Read-Model im Frontend definieren
**Ziel:** Rohdaten aus API nicht direkt ins UI geben, sondern in eine Monats-Sichtstruktur transformieren.

**Empfohlene View-Model-Bereiche:**
- `monthHeader`
- `kpis`
- `memberContributionCards`
- `categoryStatusItems`
- `categoryHistory`
- `calculationBreakdown`
- `tableRows`

**DoD:**
- ViewModel-Schnitt ist definiert
- UI muss nicht direkt gegen Roh-Entities rechnen
- klare Trennung zwischen API-Modell und UI-Modell

---

# Phase 3 – Monatsberechnung

## Task 3.1 ✅ – Monatsbedarf berechnen
**Ziel:** Ein zentraler Wert „Monatsbedarf“ wird korrekt hergeleitet.

**Zusammensetzung:**
- Summe aktiver CategoryBudgets
- plus relevante Zusatz-/Sonderbeträge
- plus/minus Überträge
- ggf. weitere definierte Monatskorrekturen

**Wichtig:**
Nicht einfach „Ausgaben dieses Monats“ verwenden.  
Der Monatsbedarf ist ein **Plan-/Soll-Wert**, kein reiner Ist-Wert.

**DoD:**
- Berechnung ist reproduzierbar
- Inputquellen sind eindeutig
- Wert wird für KPI und Beitragslogik verwendet

---

## Task 3.2 ✅ – Aktive Beitragsbausteine für den Monat auflösen
**Ziel:** Für den ausgewählten Monat alle relevanten Beitragsbausteine ermitteln.

**Bausteintypen laut Modell:**
- `base`
- `additional`
- `topup`

**Je Baustein auflösen:**
- Aktivität im Monat
- Betrag
- Distribution Mode
- relevante Mitglieder
- ggf. referenzierte Einkommensbasis

**DoD:**
- Monat kennt nicht „eine Regel“, sondern eine Liste aktiver Bausteine
- pro Baustein ist klar, wie er verteilt wird
- diese Liste speist sowohl Erklärung als auch Tabellen

---

## Task 3.3 ✅ – Member-Sollwerte (`monthlyDue`) berechnen
**Ziel:** Für jedes Mitglied den Monats-Sollwert berechnen.

**Grundlage:**
- Summe aller aktiven Beitragsbausteine
- je Baustein Verteilung über:
  - `perMember`
  - `customSplit`
  - `proRataIncome`

**Wichtig:**
Der Sollwert ist kein einzelner Budgetwert, sondern das Ergebnis mehrerer aktiver Bausteine.

**DoD:**
- pro Mitglied existiert ein berechneter Sollwert
- Breakdown je Baustein bleibt nachvollziehbar
- Werte stimmen mit der späteren Detailtabelle überein

---

## Task 3.4 ✅ – Tatsächlich gezahlte Beiträge (`paidAmount`) bestimmen
**Ziel:** Für jedes Mitglied erfassen, was im Monat tatsächlich eingezahlt wurde.

**MVP-Regel:**
- Einzahlungen laufen über Transactions
- Einzahlungen müssen fachlich erkennbar sein
- Kategorie „Einzahlung“ / „Beitrag“ ist zulässige MVP-Konvention

**Zusätzlich erfassen:**
- letzte Einzahlung
- Anzahl/Datum relevanter Einzahlungen

**DoD:**
- pro Mitglied existiert ein `paidAmount`
- letzte Einzahlung kann in der Card dargestellt werden
- Aggregation ist monatsbezogen sauber

---

## Task 3.5 ✅ – Private Vorleistungen berechnen
**Ziel:** Sichtbar machen, welche privat bezahlten Transaktionen je Mitglied relevant sind.

**Grundlage:**
- `isFromSharedAccount=false`
- `paidByMemberId` gesetzt

**Nutzen:**
- in Member-Cards als Zusatzkontext
- später evtl. in Ausgleichslogik verwendbar

**DoD:**
- je Mitglied existiert ein Vorleistungswert
- im UI von eigentlichen Einzahlungen getrennt darstellbar

---

# Phase 4 – Header und KPI-Leiste

## Task 4.1 ✅ – Month Header mit Month-only Auswahl
**Ziel:** Monat klar fokussieren.

**UI:**
- Titel „Monat“
- month-only datepicker
- Vor/Zurück-Navigation optional zusätzlich

**DoD:**
- Wechsel des Monats lädt/berechnet neue Sicht
- kein Tageskonzept in der UI
- Monatsfokus ist klar

---

## Task 4.2 ✅ – KPI-Leiste bauen
**Ziel:** Vier zentrale Monatskennzahlen auf oberster Ebene zeigen.

**Final festgezurrte KPIs:**
- Monatsbedarf
- Eingezahlt
- Ausgegeben
- Übertrag

**DoD:**
- genau diese vier Werte werden angezeigt
- Begriffe sind klar und stabil
- keine zusätzliche Haupt-KPI „Offen“ in der Kopfzeile

---

# Phase 5 – Member-Cards

## Task 5.1 ✅ – Member-Cards als Primärdarstellung
**Ziel:** Beiträge je Mitglied nicht tabellarisch, sondern als Cards darstellen.

**Pro Card:**
- Name
- Soll
- Gezahlt
- Offen
- Übertrag
- Progressbar
- letzte Einzahlung
- private Vorleistung
- CTA „Einzahlung buchen“

**DoD:**
- nur echte Mitglieder
- keine künstlichen/fremden Platzhalter
- Card beantwortet die Frage „was muss diese Person tun?“

---

## Task 5.2 ✅ – Offen-Wert berechnen
**Ziel:** Restbetrag je Mitglied anzeigen.

**Formel:**
- Offen = Soll – Gezahlt
- optional spätere Anpassung durch weitere Fachlogik möglich

**DoD:**
- Offen ist korrekt
- Negativ- oder Überschussfälle definiert behandelt
- Card bleibt verständlich

---

# Phase 6 – Einzahlung-Flow aus der Monat-Seite

## Task 6.1 ✅ – CTA „Einzahlung buchen“ an Member koppeln
**Ziel:** Einzahlungen direkt aus der Member-Card starten.

**Flow:**
- Klick auf Card-Button
- Sidebar öffnet sich
- Member vorausgewählt
- Kategorie „Einzahlung“ vorausgewählt
- offener Betrag als Vorschlag
- Datum = heute
- Notiz optional

**DoD:**
- schneller Kontext-Flow ohne extra Auswahlhürden
- Eingabe kann aus Monat-Seite abgeschlossen werden

---

## Task 6.2 ✅ – Technische Speicherung der Einzahlung definieren
**Ziel:** Klarheit, wie die Einzahlung in Transactions persistiert wird.

**MVP-Vorschlag:**
- `type = income`
- dedizierte Kategorie „Einzahlung“ / „Beitrag“
- Member im Flow auswählbar/vorausgefüllt

**DoD:**
- Monatsseite kann `paidAmount` zuverlässig wiederfinden
- keine unklare Sonderbehandlung im UI

---

# Phase 7 – Kategorienbereich (Zweispaltig)

## Task 7.1 ✅ – Linke Kategoriespalte bauen
**Ziel:** Aktuellen Monatsstatus je Kategorie kompakt darstellen.

**Darstellung pro Kategorie:**
- Name
- geplantes Budget
- aktuelle Ausgaben
- visuelle Balkendarstellung Budget vs Ist
- Farblogik für Budgetstatus

**DoD:**
- kompakte Scannbarkeit
- Budget und Ist klar unterscheidbar
- keine Volltabelle als Default nötig

---

## Task 7.2 ✅ – Rechte Statistik-Spalte bauen
**Ziel:** Historische Budget-/Verlaufssicht ergänzen.

**Verhalten:**
- Standard: Gesamtansicht
- Auswahl einer Kategorie links aktualisiert die rechte Seite
- zeigt Verlauf über mehrere Monate

**DoD:**
- rechte Spalte hängt sichtbar an linker Auswahl
- Historie unterstützt Verständnis, statt nur dekorativ zu sein

---

## Task 7.3 ✅ – „Alle Kategorien anzeigen“-Verhalten definieren
**Ziel:** Top-Kategorien standardmäßig kompakt halten, Rest auf Wunsch sichtbar machen.

**DoD:**
- Button erweitert Inline-Liste
- kein unerwarteter Seitenwechsel
- gleiche visuelle Logik für neu sichtbare Kategorien

---

# Phase 8 – Accordion und Detailtabellen

## Task 8.1 ✅ – Accordion-Struktur ergänzen
**Ziel:** Detailebene sauber unterbringen, ohne Standardansicht zu überladen.

**Empfohlene Positionen:**
- im Kategorienbereich
- im Beitragslogik-Bereich

**DoD:**
- Details nur bei Bedarf sichtbar
- Hauptseite bleibt scanbar

---

## Task 8.2 ✅ – Detailtabelle „Contribution Breakdown“ umsetzen
**Ziel:** Nachvollziehbar machen, aus welchen Bausteinen sich der Sollwert je Mitglied zusammensetzt.

**Typische Spalten:**
- Member
- Base
- Additional
- TopUp
- Gesamt

**DoD:**
- Summen stimmen mit Member-Cards überein
- Breakdown ist verständlich
- Nutzer kann nachvollziehen, warum Soll-Werte so sind
- abgeleitete Base-Blöcke aus CategoryBudgets und `customSplit`-Pools sind genauso sichtbar wie explizit persistierte `additional`-/`topup`-Blöcke

---

## Task 8.3 ✅ – Detailtabelle „Income Basis“ umsetzen
**Ziel:** Prorata-Berechnung transparent machen.

**Typische Spalten:**
- Member
- Einkommen
- Anteil
- Gültigkeit/Monat optional

**DoD:**
- nur sichtbar/relevant, wenn prorata überhaupt genutzt wird
- Werte passen zur Verteilung in den Beitragsbausteinen

---

## Task 8.4 ✅ – Detailtabelle „Kategorie-Details“ definieren
**Ziel:** Detailliertere Kategorie-Infos aufklappbar machen.

**Mögliche Inhalte:**
- Kategorie
- Budget
- Ist-Ausgaben
- Abweichung
- ggf. letzte Buchungen oder Transaktionsanzahl

**DoD:**
- ergänzende Analyse, keine Dopplung der Primärliste
- im Accordion versteckt

---

# Phase 9 – Bereich „Beitragslogik“

## Task 9.1 ✅ – Erklärblock Monatsbedarf
**Ziel:** Zeigen, wie der Monatsbedarf entsteht.

**Inhalte:**
- Budgetsumme
- Sonderzahlungen
- Übertrag
- resultierender Monatsbedarf

**DoD:**
- Nutzer versteht Planwert-Herkunft
- keine Blackbox-Berechnung

---

## Task 9.2 ✅ – Aktive Beitragsbausteine als Liste/Karten darstellen
**Ziel:** Mehrere gleichzeitig aktive Beitragsbausteine transparent darstellen.

**Wichtig:**
Nicht als „eine aktive Rule“, sondern als mehrere Bausteine:
- Basisbeitrag
- Zusatzbeitrag
- TopUp
- evtl. weitere spätere Typen

**DoD:**
- jeder Baustein zeigt Betrag + Verteilungsart
- Nutzer erkennt Zusammenspiel mehrerer Regeln

---

## Task 9.3 ✅ – Einkommensbasis nur kontextbezogen anzeigen
**Ziel:** ProRata-Berechnung erklären, ohne unnötig technische UI zu zeigen.

**Regel:**
- nur zeigen, wenn mindestens ein aktiver Baustein ProRataIncome nutzt

**DoD:**
- Bereich bleibt schlank
- Erklärung ist bei Bedarf sichtbar

---

# Phase 10 – Zustände und Edge Cases

## Task 10.1 ✅ – Loading / Empty / Error States
**Ziel:** Monat-Seite fühlt sich robust an.

**Fälle:**
- keine Budgets
- keine Contribution Rules
- keine Incomes vorhanden, obwohl ProRata aktiv wäre
- keine Einzahlungen
- keine Kategorien
- Request fehlgeschlagen

**DoD:**
- jeder Zustand hat klare Nutzerkommunikation
- keine leeren/kaputten Teilflächen ohne Erklärung

---

## Task 10.2 ✅ – Null-/Anfangszustände definieren
**Ziel:** Neue oder unvollständig eingerichtete Accounts sauber behandeln.

**Wichtig bei MVP:**
- Monat-Seite darf nicht implizit „0 = alles ok“ suggerieren
- fehlende Grundlage muss als fehlende Grundlage sichtbar sein
- fehlendes `paidByMemberId`, fehlende ProRata-Einkommen oder nicht auflösbare Custom-Split-Pools müssen gezielt als Daten-/Setup-Lücke erkennbar sein

**DoD:**
- klare Missing-State-Komponenten
- Setup-Lücken sind verständlich

---

# Phase 11 – UI/UX-Polish und Responsive

## Task 11.1 ✅ – Responsive Verhalten definieren
**Ziel:** Desktop zuerst, mobil mitdenken.

**Empfohlen:**
- KPI-Leiste stacked
- Member-Cards untereinander
- Kategorien zweispaltig → mobil untereinander
- Accordion bleibt erhalten

**DoD:**
- mobile Darstellung bleibt bedienbar
- Informationen bleiben in sinnvoller Reihenfolge

---

## Task 11.2 ✅ – Visuelle Semantik finalisieren
**Ziel:** Farbe und Status nicht beliebig verwenden.

**Semantische Richtung:**
- grün/türkis = positiv / primär / ok
- gelb/orange = Hinweis / offen / Zwischenstatus
- rot = kritisch / Budget überschritten
- blau/violett = neutral / informativ / sekundär

**DoD:**
- konsistente Semantik
- gleiche Farbe = gleiche Bedeutung

---

# Phase 12 – QA / Fachliche Verifikation

## Task 12.1 ✅ – Zahlenkonsistenz prüfen
**Ziel:** Sicherstellen, dass alle sichtbaren Zahlen zusammenpassen.

**Prüfpunkte:**
- KPI-Werte vs Breakdown
- Member-Soll vs Detailtabelle
- Kategorie-Budget vs Ist
- Monatsbedarf vs Beitragslogik

**DoD:**
- keine widersprüchlichen Summen
- nachvollziehbare Herleitung möglich

---

## Task 12.2 ✅ – Referenzfälle testen
**Ziel:** Reale Haushaltsfälle gegen die Seite prüfen.

**Empfohlene Testfälle:**
- 50/50 Split
- ProRata-Split
- zusätzlicher Sonderbeitrag eines Members
- TopUp mit Custom Split
- Monat mit Carryover
- Monat ohne Budgetdaten
- Monat ohne Einzahlungen

**DoD:**
- Seite funktioniert nicht nur für einen Happy Path
- Kerndomäne ist verifiziert

---

## 5. Empfohlene Mini-Meilensteine

## Milestone A – „Sichtbar“
- Routing
- Header
- KPI-Leiste
- leere Member-Cards
- Layout steht

## Milestone B – „Rechnet“
- Monatsbedarf
- Member-Soll
- `paidAmount`
- Offen
- Kategorienstatus

## Milestone C – „Erklärt“
- Beitragsbausteine
- Monatsbedarf-Erklärung
- Einkommensbasis
- Accordion-Tabellen

## Milestone D – „Handlungsfähig“
- Einzahlung buchen
- Sidebar mit Prefills
- State aktualisiert sich korrekt

## Milestone E – „Robust“
- Edge Cases
- Mobile
- QA

---

## 6. Wichtigste Regeln für neue Agents

1. Die Monat-Seite ist **kein zweites Dashboard**, sondern ein Arbeitsbereich.
2. Member-Cards sind die Primärdarstellung, Tabellen nur Details.
3. Der Kategorienbereich ist **zwingend zweispaltig**.
4. Der Beitragslogik-Bereich liegt **unter** dem Kategorienbereich.
5. Es gibt **mehrere aktive Beitragsbausteine**, nicht nur eine Regel.
6. Die Seite muss erklären, **wie Einzahlungswerte entstehen**.
7. `monthlyDue` und `paidAmount` dürfen nie als Blackbox im UI erscheinen.
8. Einzahlungen können direkt aus der Monat-Seite gestartet werden.
9. Fehlende Daten müssen sichtbar als fehlende Grundlage kommuniziert werden.
10. Die Seite muss für neue Entwickler auch ohne Projektwissen verständlich umsetzbar sein.

---

# ERWEITERUNG – Backend ReadModel & Monatsanker (nachträglich ergänzt)

## Ergänzung A – Backend ReadModel als Pflichtbestandteil

### Neue Tasks (ergänzend zu Phase 2)

> Tasks 2.3–2.5 sind in **Baustein 0** (Tasks 0.1 und 0.2) vollständig abgedeckt und wurden dort konsolidiert.

---