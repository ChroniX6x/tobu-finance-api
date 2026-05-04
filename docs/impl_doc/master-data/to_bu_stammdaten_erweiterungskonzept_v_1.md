# ToBu – Stammdaten-Page Erweiterungskonzept V1

**Stand:** 2026-05-03  
**Status:** Ergänzung zum Stammdaten-Page Konzept V2  
**Ziel:** Strukturierte Sammlung und fachliche Einordnung aller Funktionen, die bewusst **nicht** Teil des MVP der Stammdaten-Page sind, aber später sinnvoll ergänzt werden können.

---

## 1. Zweck dieses Dokuments

Dieses Erweiterungskonzept beschreibt mögliche Ausbaustufen der Stammdaten-Page nach dem MVP.

Das MVP-Konzept der Stammdaten-Page bleibt bewusst schlank und fokussiert auf:

- Account-Basisdaten,
- Account-Settings,
- Mitglieder,
- Kategorien,
- `customSplit`,
- serverseitige Usage-Hinweise,
- sichere Blockierung riskanter Aktionen.

Dieses Dokument sammelt alle Features, die fachlich sinnvoll sind, aber für den ersten MVP nicht zwingend benötigt werden.

Ziel ist, spätere Ideen nicht zu verlieren, aber das MVP nicht mit zu vielen Nebenfunktionen zu überladen.

---

## 2. Leitprinzip für Erweiterungen

Erweiterungen sollen nur dann in die Stammdaten-Page aufgenommen werden, wenn sie mindestens eine dieser Bedingungen erfüllen:

1. Sie verbessern die Verwaltung der Grundobjekte Account, Mitglieder oder Kategorien.
2. Sie lösen ein echtes Datenqualitätsproblem.
3. Sie reduzieren manuelle Korrekturarbeit.
4. Sie verbessern Nachvollziehbarkeit oder Sicherheit.
5. Sie ermöglichen spätere Mehrnutzer-/Endnutzerfähigkeit.

Nicht jede Einstellung gehört automatisch in die Stammdaten. Planung, Wiederkehrer, Kontostand und Buchungen bleiben weiterhin eigene Bereiche.

---

## 3. Übersicht der Erweiterungsbereiche

Die Erweiterungen lassen sich in folgende Gruppen einteilen:

```text
Stammdaten-Erweiterungen
├── Setup & Readiness
├── Mitglieder-Erweiterungen
├── Kategorien-Erweiterungen
├── Account-Settings-Erweiterungen
├── Datenqualität & Wartung
├── Rechte & Sicherheit
├── Historie & Audit
└── UX- und Komfortfunktionen
```

---

# 4. Setup- und Readiness-Erweiterung

## 4.1 Ziel

Der Setup-/Readiness-Bereich soll später prüfen, ob ein Account fachlich vollständig und sinnvoll eingerichtet ist.

Er ist nicht Teil des MVP der Stammdaten-Page, weil für den ersten MVP die direkte Verwaltung der Grunddaten wichtiger ist.

## 4.2 Fachlicher Zweck

Der Setup-Bereich beantwortet:

> Ist dieser Account vollständig genug eingerichtet, damit Übersicht, Buchungen, Monat und Planung sinnvoll funktionieren?

## 4.3 Mögliche Inhalte

- Anzahl Mitglieder prüfen
- Kategorien vorhanden?
- Budgets vorhanden?
- Einkommen für ProRata vorhanden?
- Beitragsregeln vollständig?
- Start-Kontostand gesetzt?
- Wiederkehrer eingerichtet?
- nicht kategorisierte Buchungen vorhanden?
- veralteter Kontostand?
- ungültige Custom Splits?
- offene Datenqualitätsprobleme?

## 4.4 UI-Idee

Ein eigener Tab in der Account-Verwaltung:

```text
Account verwalten
├── Setup
├── Stammdaten
├── Planung
├── Wiederkehrer
└── Kontostand
```

Setup zeigt keine vollständigen Editorflächen, sondern:

- Statuskarten,
- Checklisten,
- nächste empfohlene Aktion,
- Links in die passenden Verwaltungsbereiche.

## 4.5 Abgrenzung

Setup ist keine zweite Stammdaten-Page und keine Planungsseite. Es ist eine Diagnose- und Navigationsschicht.

## 4.6 Priorität

**Später sinnvoll, aber nicht MVP-kritisch.**

Empfohlener Zeitpunkt:

- Nach Fertigstellung von Stammdaten, Planung, Wiederkehrern und Kontostand.

---

# 5. Mitglieder-Erweiterungen

---

## 5.1 Einladungssystem für Members ohne App-Account

### Ziel

Mitglieder ohne App-Zugang sollen später eingeladen werden können, selbst einen User-Account zu erstellen und mit dem bestehenden Member verknüpft zu werden.

### Fachlicher Hintergrund

Im MVP können Members ohne User existieren. Das ist wichtig für gemeinsame Finanzen, bei denen nicht jede Person sofort einen App-Login besitzt.

Später soll aus einem fachlichen Member ein aktiver App-Nutzer werden können.

### Möglicher Flow

1. In der Mitgliederliste steht bei einem Member: „Ohne App-Zugang“.
2. Aktion: „Einladen“.
3. E-Mail wird geprüft oder eingegeben.
4. Einladung wird erzeugt.
5. Eingeladene Person registriert sich.
6. Neuer User wird mit bestehendem Member verknüpft.

### Benötigte Backend-Konzepte

- Invitation-Entity oder Token
- Ablaufdatum
- Status: `pending`, `accepted`, `expired`, `revoked`
- sichere Zuordnung zu `accountId` und `memberId`
- E-Mail-Versand oder späterer Stub für manuelle Einladung

### UI-Erweiterungen

- Statuslabel „Einladung offen“
- Button „Einladung erneut senden“
- Button „Einladung zurückziehen“
- Fehlerstatus bei abgelaufener Einladung

### Priorität

**Hoch für spätere Mehrnutzerfähigkeit**, aber nicht MVP-kritisch für Nutzung durch einen Hauptnutzer.

---

## 5.2 Manuelle User-Member-Verknüpfung

### Ziel

Ein bestehender App-User soll später manuell mit einem vorhandenen Member verknüpft werden können.

### Nutzen

- Korrektur fehlerhafter Einladungen
- Nachträgliche Verknüpfung bestehender Nutzer
- Admin-/Owner-gesteuerte Pflege

### Risiken

- falsche Verknüpfung kann Zugriff auf sensible Finanzdaten geben
- muss streng berechtigt und auditierbar sein

### MVP-Abgrenzung

Im MVP wird die User-Verknüpfung nur angezeigt, nicht bearbeitet.

### Priorität

**Mittel bis hoch**, sobald mehrere echte App-Nutzer pro Account unterstützt werden sollen.

---

## 5.3 Avatar-Upload und Avatar-Bearbeitung

### Ziel

Mitglieder sollen visuell leichter unterscheidbar sein.

### Mögliche Funktionen

- Avatar hochladen
- Avatar entfernen
- Initialen-Fallback
- Farbiger Avatar-Hintergrund
- später: Cropping

### Backend-Fragen

- Speicherung als URL oder Datei-Storage?
- Keine Base64-Großdaten im Member-Dokument bevorzugen.
- Größenlimit und Bildvalidierung.

### MVP-Abgrenzung

Im MVP wird Avatar nur angezeigt, falls vorhanden. Keine Bearbeitung.

### Priorität

**Niedrig bis mittel**. Gut für UX, aber nicht fachkritisch.

---

## 5.4 Member deaktivieren oder archivieren

### Ziel

Ein Member soll aus der aktiven Nutzung verschwinden können, ohne historische Daten zu beschädigen.

### Problem im MVP

Im MVP wird „Aus Account entfernen“ blockiert, wenn der Member noch referenziert wird. Das verhindert Datenleichen, kann aber dazu führen, dass alte Members dauerhaft sichtbar bleiben.

### Erweiterungsidee

Statt Entfernen:

- Member archivieren
- Member bleibt in historischen Daten erhalten
- Member erscheint nicht mehr in neuen Auswahlfeldern
- Historische Buchungen bleiben verständlich

### Mögliche Felder

```ts
archivedAt?: string | null;
isArchived?: boolean;
```

oder auf Account-Mitgliedschaftsebene:

```ts
accounts.members[].status = 'active' | 'archived'
```

### UI-Verhalten

- Aktive Mitglieder in Hauptliste
- Archivierte Mitglieder in separatem Abschnitt
- Reaktivieren möglich
- Historische Hinweise bleiben sichtbar

### Priorität

**Hoch nach MVP**, weil es die bessere Lösung für reale Langzeitnutzung ist als dauerhaftes Blockieren.

---

## 5.5 Member endgültig löschen

### Ziel

Ein Member soll vollständig gelöscht werden können, wenn er wirklich nirgendwo mehr verwendet wird.

### Fachliche Regel

Endgültiges Löschen darf nur möglich sein, wenn keine fachlichen Referenzen existieren.

### Risiken

- historische Daten verlieren Kontext
- Auswertungen können kaputtgehen
- rechtlich/organisatorisch eventuell problematisch

### Empfehlung

Endgültiges Löschen nur als sekundäre Admin-/Wartungsfunktion und nicht prominent in der normalen UI.

### Priorität

**Niedrig**. Archivierung ist wichtiger.

---

# 6. Kategorien-Erweiterungen

---

## 6.1 Kategorie-Archivierung

### Ziel

Verwendete Kategorien sollen aus der aktiven Auswahl entfernt werden können, ohne historische Buchungen zu beschädigen.

### Problem im MVP

Im MVP wird das Löschen verwendeter Kategorien blockiert. Das ist sicher, aber bei langfristiger Nutzung unkomfortabel.

### Erweiterungsidee

Kategorien erhalten einen Archivstatus:

```ts
archivedAt?: string | null;
isArchived?: boolean;
```

### UI-Verhalten

- Archivierte Kategorien erscheinen nicht mehr standardmäßig in neuen Buchungen.
- Historische Buchungen zeigen die Kategorie weiterhin an.
- Archivierte Kategorien können in der Stammdaten-Page in einem separaten Abschnitt angezeigt werden.
- Reaktivieren ist möglich.

### Auswirkungen auf andere Bereiche

- Buchungsfilter sollte archivierte Kategorien weiterhin finden können.
- Planung sollte keine neuen Budgets für archivierte Kategorien empfehlen.
- Month View zeigt historische Werte weiterhin korrekt.

### Priorität

**Hoch nach MVP**, weil es die natürliche Lösung für verwendete Kategorien ist.

---

## 6.2 Umkategorisierung beim Löschen

### Ziel

Beim Entfernen einer Kategorie sollen bestehende Buchungen auf eine andere Kategorie umgezogen werden können.

### Möglicher Flow

1. Nutzer klickt „Kategorie löschen“.
2. System erkennt Referenzen.
3. Statt Blocker bietet UI an:
   - Kategorie archivieren
   - Buchungen umkategorisieren
4. Nutzer wählt Zielkategorie.
5. Server aktualisiert betroffene Buchungen.
6. Alte Kategorie kann gelöscht oder archiviert werden.

### Risiken

- Massenänderung historischer Daten
- Reports ändern sich rückwirkend
- braucht gute Bestätigung und Audit-Log

### Empfehlung

Zuerst Archivierung umsetzen. Umkategorisierung später als bewusstes Wartungswerkzeug.

### Priorität

**Mittel**. Nützlich, aber risikoreicher als Archivierung.

---

## 6.3 Kategorie durch andere Kategorie ersetzen

### Ziel

Eine Kategorie soll in allen relevanten Referenzen durch eine andere ersetzt werden.

### Unterschied zur Umkategorisierung

Umkategorisierung betrifft vor allem Buchungen. „Ersetzen“ kann zusätzlich betreffen:

- Budgets
- Recurrences
- zukünftige Regeln
- gespeicherte Filter oder Templates

### Möglicher Flow

- „Kategorie zusammenführen“
- Quelle wählen
- Ziel wählen
- betroffene Bereiche anzeigen
- bestätigen
- serverseitig in einer kontrollierten Operation ausführen

### Priorität

**Niedrig bis mittel**. Eher Power-User-/Wartungsfunktion.

---

## 6.4 Kategorie-Farben

### Ziel

Kategorien sollen visuell unterscheidbarer werden.

### Nutzen

- bessere Scanbarkeit in Listen
- bessere Charts
- konsistente visuelle Zuordnung über App-Bereiche hinweg

### Mögliche Felder

```ts
color?: string | null;
```

oder begrenzte Palette:

```ts
colorKey?: 'green' | 'blue' | 'violet' | 'amber' | 'red' | ...;
```

### Empfehlung

Für ToBu besser eine begrenzte semantische Palette als freie Hex-Farben, damit Dark Theme und Kontrast kontrollierbar bleiben.

### Priorität

**Mittel**. UX-Verbesserung, aber nicht fachkritisch.

---

## 6.5 Kategorie-Icons

### Ziel

Kategorien sollen durch Icons leichter erkennbar sein.

### Nutzen

- bessere mobile Scanbarkeit
- angenehmere Darstellung in Buchungen und Month View

### Mögliche Felder

```ts
iconKey?: string | null;
```

### UI

- Icon-Auswahl aus definierter Liste
- kein freier Upload im ersten Schritt

### Priorität

**Mittel bis niedrig**. Sinnvoll nach stabiler Kategorienverwaltung.

---

## 6.6 Sortierung von Kategorien

### Ziel

Nutzer sollen Kategorien in einer eigenen Reihenfolge anzeigen können.

### Mögliche Varianten

- alphabetisch automatisch
- nach Nutzungshäufigkeit
- manuelle Sortierung per Drag-and-drop
- Sortierung pro Account speichern

### Mögliche Felder

```ts
sortOrder?: number;
```

### MVP-Abgrenzung

Im MVP reicht eine stabile Standardsortierung, z. B. alphabetisch oder serverseitige Default-Reihenfolge.

### Priorität

**Niedrig bis mittel**.

---

# 7. Account-Settings-Erweiterungen

---

## 7.1 Erweiterte Settings-Page

### Ziel

Account-Settings können später aus der Stammdaten-Page herausgelöst oder erweitert werden.

### Hintergrund

Im MVP werden einfache accountweite Settings bereits im Account-Bereich der Stammdaten gepflegt:

- Dashboard-Verlaufsmonate
- Top-K Kategorien
- Warnschwellen
- Staleness Days

Wenn die Anzahl der Settings wächst, sollte daraus eine eigene Settings-Seite oder ein eigener Bereich werden.

### Mögliche zusätzliche Settings

- Standardmonat beim Öffnen
- Pending standardmäßig einrechnen ja/nein
- Standard-Zahlungsquelle
- Standard-Kategorie für Einzahlungen
- Standard-Split-Verhalten
- Dashboard-Konfiguration
- Insight-Schwellen
- Benachrichtigungsregeln

### Priorität

**Mittel**, sobald Settings deutlich umfangreicher werden.

---

## 7.2 Standardwerte für Buchungen

### Ziel

Accountweite Defaults für neue Buchungen definieren.

### Beispiele

- Standardstatus: `pending` oder `booked`
- Standardquelle: Gemeinschaftskonto
- Standardkategorie für Einzahlungen
- Standarddatum: heute

### Abgrenzung

Teilweise können solche Defaults auch lokal im Frontend als UI-Prefs gespeichert werden. Accountweite Defaults sind sinnvoll, wenn sie für alle Nutzer des Accounts gelten sollen.

### Priorität

**Niedrig bis mittel**.

---

## 7.3 Insight- und Warnschwellen erweitern

### Ziel

Nutzer sollen genauer einstellen können, wann ToBu Hinweise erzeugt.

### Beispiele

- Budgetwarnung ab 80 %
- kritische Budgetwarnung ab 100 %
- Kontostand veraltet ab X Tagen
- Carryover-Hinweis ab X Euro
- niedriger Forecast ab X Euro

### Priorität

**Mittel**, sobald Insights stärker genutzt werden.

---

# 8. Datenqualität und Wartung

---

## 8.1 Datenqualitätsübersicht

### Ziel

Die Stammdaten-Page oder ein späterer Setup-Tab kann Datenprobleme sichtbar machen.

### Mögliche Checks

- Kategorien ohne Namen
- Members ohne Namen
- ungültige Custom Splits
- verwaiste Referenzen
- nicht kategorisierte Buchungen
- private Buchungen ohne Zahler
- Budgets auf archivierten Kategorien
- Recurrences mit ungültiger Kategorie
- Contribution Rules mit nicht mehr aktiven Members

### UI-Idee

Ein Bereich:

```text
Datenqualität
3 Hinweise gefunden

- 2 Buchungen sind nicht kategorisiert
- 1 Kategorie-Split ist ungültig
- 1 Wiederkehrer verwendet eine archivierte Kategorie
```

### Priorität

**Mittel bis hoch**, sobald mehr Daten produktiv genutzt werden.

---

## 8.2 Reparatur-Assistenten

### Ziel

Nicht nur Probleme anzeigen, sondern sichere Korrekturflows anbieten.

### Beispiele

- „Nicht kategorisierte Buchungen anzeigen“
- „Ungültigen Split korrigieren“
- „Verwaiste Kategorie ersetzen“
- „Member archivieren statt entfernen“

### Priorität

**Mittel** nach Datenqualitätsübersicht.

---

## 8.3 Massenbearbeitung

### Ziel

Mehrere Kategorien oder Members effizient bearbeiten.

### Beispiele

- mehrere Kategorien archivieren
- mehrere Kategorien umsortieren
- viele Buchungen umkategorisieren
- mehrere Usage-Probleme nacheinander beheben

### Risiken

- Massenänderungen sind schwer rückgängig zu machen
- brauchen Audit und klare Bestätigung

### Priorität

**Niedrig bis mittel**.

---

# 9. Rechte und Sicherheit

---

## 9.1 Erweiterte Rollenverwaltung

### Ziel

Über `owner` und `member` hinaus können später feinere Rechte entstehen.

### Mögliche Rollen

- Owner
- Admin
- Member
- Viewer

### Mögliche Berechtigungen

- Stammdaten bearbeiten
- Buchungen erfassen
- Buchungen löschen
- Planung bearbeiten
- Kontostand ändern
- Mitglieder verwalten
- Account löschen

### MVP-Abgrenzung

Im MVP reicht `owner` / `member`. Der letzte Owner wird geschützt.

### Priorität

**Mittel bis hoch**, sobald mehrere echte Endnutzer pro Account aktiv sind.

---

## 9.2 Sichtbarkeit sensibler Daten

### Ziel

Später kann gesteuert werden, wer Einkommen, private Vorleistungen oder Kontostände sehen darf.

### Relevanz

Einkommen und private Zahlungen können sensibler sein als Kategorienamen oder Account-Name.

### Mögliche Regeln

- Einkommen nur Owner sichtbar
- eigene Einzahlungen sichtbar
- Gesamtwerte sichtbar, Details eingeschränkt

### Priorität

**Mittel**, wenn die App über den privaten Eigengebrauch hinausgeht.

---

# 10. Historie und Audit

---

## 10.1 Änderungsverlauf für Stammdaten

### Ziel

Änderungen an Stammdaten sollen nachvollziehbar werden.

### Beispiele

- Kategorie umbenannt
- Custom Split geändert
- Member hinzugefügt
- Rolle geändert
- Kategorie archiviert
- Settings geändert

### Mögliche technische Basis

- bestehende oder geplante `events`-Collection
- Event-Codes wie:
  - `member.created`
  - `member.updated`
  - `member.removedFromAccount`
  - `category.created`
  - `category.updated`
  - `category.archived`
  - `account.settings.updated`

### UI-Idee

- kleine Timeline im jeweiligen Bereich
- oder eigene Activity-Seite im Account Overview

### Priorität

**Mittel**, besonders wichtig bei mehreren Nutzern.

---

## 10.2 Undo für Stammdatenänderungen

### Ziel

Bestimmte Änderungen können zurückgenommen werden.

### Geeignete Fälle

- Kategorie umbenannt
- Kategorie archiviert
- Member archiviert
- Settings geändert

### Schwierige Fälle

- Löschen
- Umkategorisierung vieler Buchungen
- User-Member-Verknüpfung

### Priorität

**Niedrig bis mittel**. Audit ist wichtiger als Undo.

---

# 11. UX- und Komfortfunktionen

---

## 11.1 Suche und Filter in Stammdaten

### Ziel

Bei mehr Members oder Kategorien soll die Stammdaten-Page schneller bedienbar bleiben.

### Beispiele

- Kategorien suchen
- nach „mit Budget“ filtern
- nach „eigene Verteilung“ filtern
- archivierte Kategorien ein-/ausblenden

### Priorität

**Niedrig im privaten MVP**, höher bei vielen Kategorien.

---

## 11.2 Inline Editing

### Ziel

Sehr einfache Änderungen direkt in der Liste erlauben.

### Beispiele

- Kategoriename direkt ändern
- Membername direkt ändern

### Empfehlung

Nicht früh priorisieren. Sidebars sind kontrollierter und validierungsfreundlicher.

### Priorität

**Niedrig**.

---

## 11.3 Import/Export von Stammdaten

### Ziel

Stammdaten aus anderen Quellen übernehmen oder sichern.

### Beispiele

- Kategorien aus CSV importieren
- Kategorien exportieren
- Members exportieren
- Account-Konfiguration kopieren

### Priorität

**Niedrig bis mittel**, abhängig davon, ob mehr Accounts/Nutzer entstehen.

---

## 11.4 Account-Vorlagen

### Ziel

Neue Accounts schneller einrichten.

### Beispiele

- Paar-Haushalt Vorlage
- WG-Vorlage
- Standardkategorien
- Standardbudgets
- Standard-Recurrences

### Abgrenzung

Das überschneidet sich mit Setup/Wizard und Planung. Sollte daher nicht direkt in der Stammdaten-Page beginnen.

### Priorität

**Mittel** für spätere Produktreife.

---

# 12. Empfohlene Ausbaureihenfolge

## Stufe 1 – Direkt nach MVP sinnvoll

1. Kategorie-Archivierung
2. Member-Archivierung
3. Datenqualitätsübersicht
4. Einladungssystem vorbereiten
5. Audit-Events für Stammdatenänderungen

## Stufe 2 – Mehrnutzerfähigkeit

1. Einladungssystem vollständig
2. User-Member-Verknüpfung
3. erweiterte Rollen/Berechtigungen
4. Sichtbarkeit sensibler Daten
5. Stammdaten-Activity-Timeline

## Stufe 3 – Komfort und Wartung

1. Kategorie-Umkategorisierung
2. Kategorie-Ersetzen/Zusammenführen
3. Kategorie-Farben und Icons
4. Suche/Filter
5. Massenbearbeitung

## Stufe 4 – Produktreife

1. Setup-/Readiness-Tab
2. Account-Vorlagen
3. Import/Export
4. erweiterte Settings-Page
5. Reparatur-Assistenten

---

# 13. Nicht empfohlene frühe Erweiterungen

Folgende Funktionen sollten nicht zu früh gebaut werden:

- harte Member-Löschung
- freie Hex-Farben ohne Designsystem
- komplexe Rollenmatrix vor echten Mehrnutzerfällen
- Massenbearbeitung ohne Audit-Log
- Umkategorisierung ohne Preview der Auswirkungen
- Inline Editing vor stabiler Validierung
- eigene Settings-Page, solange die Settings noch überschaubar sind

---

# 14. Zusammenhang mit MVP-Konzept

Das MVP der Stammdaten-Page trifft bewusst sichere Entscheidungen:

- verwendete Kategorien werden blockiert statt gelöscht,
- Members mit Referenzen werden blockiert statt entfernt,
- Usage-Infos kommen vom Server,
- Add/Edit läuft über Sidebars,
- Custom Split ist vollständig bearbeitbar,
- Account-Settings sind enthalten,
- Mobile nutzt Accordions.

Dieses Erweiterungskonzept baut darauf auf und beschreibt, wie die Blocker später in bessere Langzeitflows überführt werden können:

- Blockiertes Kategorie-Löschen wird zu Archivierung oder Umkategorisierung.
- Blockiertes Member-Entfernen wird zu Archivierung/Deaktivierung.
- Read-only App-Zugang wird zu Einladung und User-Verknüpfung.
- einfache Usage-Hints werden zu Datenqualitäts- und Reparaturflows.

---

# 15. Kurzfazit

Die wichtigsten Erweiterungen nach dem MVP sind nicht visuelle Komfortfeatures, sondern **Archivierung**, **Einladung/User-Verknüpfung**, **Datenqualität** und **Audit**.

Diese Funktionen lösen die echten Langzeitprobleme der Stammdatenverwaltung:

- historische Daten dürfen nicht kaputtgehen,
- alte Members und Kategorien müssen sauber aus aktiver Nutzung verschwinden können,
- mehrere Nutzer brauchen sichere Zugriffs- und Einladungsflows,
- Änderungen müssen nachvollziehbar bleiben.

Kategorie-Farben, Icons, Suche, Import/Export und Vorlagen sind sinnvolle Komfort- oder Produktreife-Erweiterungen, sollten aber nach den fachlich kritischen Erweiterungen priorisiert werden.

