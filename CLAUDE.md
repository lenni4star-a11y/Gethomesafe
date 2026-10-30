# Gethomesafe – Projekt-Briefing und Regeln

Diese Datei gilt für alle künftigen Sitzungen. Bitte zuerst lesen.

## Worum es geht
Eine App, die FLINTA* und andere marginalisierte Menschen abends und nachts sicherer nach Hause bringt:
1. **Heimweg planen:** Route, die gut beleuchtete und als sicher bewertete Wege bevorzugt, mit Dauer und Vorschau.
2. **Wege bewerten:** Straßen, Wege, Orte und Haltestellen mit Wochentag und Uhrzeit bewerten.
3. **Begleitmodus:** Begleitung auf dem Heimweg mit Eskalationsstufen, wenn man nicht reagiert.

## Zusammenarbeit (wichtig)
- Die Projektinhaberin bzw. der Projektinhaber ist **keine Programmiererin / kein Programmierer**: Schritte und Entscheidungen kurz und in einfachem Deutsch erklären.
- In **Phasen bzw. Blöcken** arbeiten. Nach jedem Block kurz sagen, was gemacht wurde und **wie man es am Handy testet**.
- **Vor neuen Diensten mit Kosten oder Accounts fragen.**
- App-Sprache: Deutsch, gendergerecht, freundlich und ruhig.
- Testen am Handy: Die App wird bei jedem Push auf `main` automatisch auf GitHub Pages veröffentlicht: https://lenni4star-a11y.github.io/Gethomesafe/ (Workflow `.github/workflows/pages.yml`). Lokal mit https: `npm run dev:https`.

## Rahmen und Technik
- **Prototyp als PWA** (Vite + React + TypeScript, Karte: MapLibre GL mit OpenFreeMap-Stil). Später **native App (Expo/React Native)**.
- **Logik getrennt von der Oberfläche:** `src/core/` enthält nur Logik ohne Browser-Funktionen (Routing, Sicherheitswert, Öffnungszeiten, Begleit-Eskalation, Bewertungen) und soll in der nativen App wiederverwendet werden. `src/web/` ist die Web-Oberfläche.
- **Speicherung nur lokal im Gerät** (IndexedDB über `src/web/storage.ts`), kein Server, keine Accounts.
- **Pilotgebiet** in `config/gebiet.json`: Bezirke 2, 4, 5, 6, 7, 8, 9, 15, 16; Durchgangs-Bezirke 1 und 3 (Routen dürfen durch, Start/Ziel nicht). Nach Änderung `npm run data`. Daten pro Bezirk getrennt (`public/data/bezirk-XX.json`), die App lädt nur benötigte Bezirke.
- Datenaufbereitung: `scripts/build-data.mjs` (OSM-Export von BBBike + Stadt Wien Open Data).

## Datenquellen und Grundsätze
- **OpenStreetMap:** Wegenetz, `lit`, Orte mit `opening_hours` (Polizei, Tankstellen, Spätis, Bars, Lokale, Apotheken, Hotels …).
- **Stadt Wien (data.wien.gv.at, CC BY 4.0):** Bezirksgrenzen, ca. 173.000 Leuchtenstandorte (Datensatz „Lampentausch“), Öffi-Haltestellen.
- **Öffi-Stationen** zählen als „offene Orte“ mit ungefähren Betriebszeiten der Wiener Linien (U-Bahn am Wochenende durchgehend, Nachtlinien 0:30–5:00).
- **Keine Kriminalitätsdaten** (nicht kleinräumig verfügbar, Stigmatisierungsgefahr).
- **Keine Orte als „Drogen-Hotspot“ markieren, keine Kategorien über Personengruppen** – weder in Daten noch in Bewertungsgründen oder Texten. Bewertungen beschreiben nur Ort und Situation.
- **Alkoholverbotszonen:** Stand Oktober 2026 gibt es dazu **keine offenen Geodaten** der Stadt Wien (nur Zeitungsberichte, z. B. Praterstern seit 2018). Nicht von Hand einzeichnen. Erneut prüfen, falls die Stadt einen Datensatz veröffentlicht; dann nur mit Quelle und ohne Abwertung der Menschen vor Ort.
- Wo Daten fehlen, ehrlich „unbekannt“ bzw. gelb anzeigen statt raten.

## Funktionen (Stand und Anforderungen)

### Route und Karte
- Schnellste und sicherste Route, jeweils mit Dauer, Länge, **Sicherheitswert 1–10** und kurzer Begründung.
- **Farbstufen je Wegabschnitt mit Legende:** grün = beleuchtet und nicht schlecht bewertet; gelb = teilweise beleuchtet, keine Daten oder mäßig bewertet (zusätzlich gestrichelt); rot = unbeleuchtet oder schlecht bewertet. Tagsüber zählt Beleuchtung nicht.
- **Wochentag und Uhrzeit:** Losgeh-Zeit frei wählbar (Tag + Uhrzeit + Schnellwahl wie „Sa 2:00“). Öffnungszeiten und Bewertungen werden für genau diese Zeit ausgewertet.
- **Offene Orte am Weg** (bis 50 m): Liste in den Details (gruppiert, mit „bis wann geöffnet“) und Symbole auf der Karte.
- **Parks:** nachts Wege durch oder direkt neben Parks abwerten, nie verbieten. Stärke in den Einstellungen (egal / leicht / normal / stark).
- **Vorschau:** Mapillary-Straßenfotos zum Durchklicken oder Abspielen, wenn in den Einstellungen ein Mapillary-Zugangsschlüssel eingetragen ist; sonst Kamerafahrt über die Karte, deutlich als „Kartenfahrt (keine Fotos)“ gekennzeichnet.
- Gewichte stehen in `src/core/safety.ts`.

### Notfall-Menü (auf jeder Ansicht, SOS-Knopf)
- Eigene Notfallkontakte anlegen/bearbeiten, mit einem Tipp anrufen, SMS/WhatsApp mit aktuellem Standort öffnen (Absenden immer selbst).
- Knöpfe 133 Polizei, 144 Rettung, 112 Euronotruf.
- Hilfsstellen nur mit geprüfter Nummer und Quelle (`src/core/helplines.ts`, Stand Oktober 2026, regelmäßig prüfen): 24-Stunden Frauennotruf der Stadt Wien 01 71 71 9, Frauenhelpline 0800 222 555, Opfer-Notruf 0800 112 112, Sozialpsychiatrischer Notdienst 01 31330, Telefonseelsorge 142, Rat auf Draht 147, Polizei-SMS 0800 133 133. Ein Heimwegtelefon speziell für Wien wurde nicht gefunden (das NÖ-Heimwegtelefon gilt nur für Niederösterreich).
- Hinweis und Links zur offiziellen Notruf-App **DEC112** mit stillem Notruf.
- Fake-Anruf jederzeit startbar.

### Begleitmodus
- Modi „Knopf gedrückt halten“ und „regelmäßig bestätigen“ (Intervall einstellbar).
- Eskalation: Rückfrage mit Vibration und Ton → simulierter Anruf mit Stimme („Alles okay? Wie fühlst du dich?“, Antwort per Knopf oder Sprache) → bei „Nein“ oder keiner Antwort Notfallkontakte mit Standort benachrichtigen (vorbereitete SMS/WhatsApp, Demo-Hinweis) → großer Notruf-Bildschirm.
- **Keine automatische Polizei-Alarmierung.**
- Antwortzeit und Anzahl der Anrufversuche einstellbar.
- „Ich bin angekommen“ beendet (optional Kontakt benachrichtigen); Beenden und Fehlalarm-Abbruch nur mit **PIN** (nur als Hash gespeichert).
- **Datenschutz:** Standort nur während der Begleitung, gespeichert wird nur die letzte Position, beim Ende wird alles gelöscht.
- Ehrlicher Hinweis: Prototyp, nicht zuverlässig bei gesperrtem Bildschirm, **kein Ersatz für den Notruf**.
- Logik in `src/core/escort.ts` (reiner Zustandsautomat, getestet).

### Bewertungen
- Wegstücke, Orte und Haltestellen bewerten: Sicherheitsgefühl 1–5, Wochentag und Uhrzeit automatisch (änderbar), Gründe zur Auswahl (dunkel, menschenleer, belebt, gut einsehbar, unangenehme Situation/bedrängt, Belästigung erlebt), optionale Notiz (sanfter Hinweis, wenn Personengruppen beschrieben werden).
- Bewertungen fließen in Farben und sicherste Route ein, gefiltert nach Wochentag und Uhrzeit (±2 h, ähnliche Tage; Nächte zählen zum Vortag).
- Kartenebene filterbar: gewählte Zeit / alle Zeiten / aus. Eigene Bewertungen ansehen und löschen.
- Struktur (`src/core/ratings.ts`) mit stabilen Schlüsseln (OSM-Knoten-IDs), Version und ohne Personendaten, vorbereitet für einen späteren Server.

## Phase 4 (noch offen): Feinschliff
- Installierbar als PWA (Manifest, Service Worker, Offline-Daten), Dunkelmodus ist schon Standard.
- Barrierearm prüfen (Kontraste, Schriftgrößen, Screenreader).
- Kurze Einführung beim ersten Start.
- Datenschutz-Seite in einfacher Sprache.

## Später (jetzt nicht umsetzen)
- Native App mit Standort im Hintergrund und echten Benachrichtigungen.
- Echter KI-Anruf mit Sprachdialog (auch als echter Telefonanruf).
- Polizei als letzte Eskalationsstufe nur über offiziellen Weg (Leitstelle oder offizieller stiller Notruf), nie automatischer KI-Anruf bei 133.
- Gemeinsame Bewertungen über einen Server, mit Moderation.
- Partnerschaft mit Heimwegtelefon-Initiativen oder einer Leitstelle.

## Befehle
- `npm run dev` / `npm run dev:https` – Entwicklung
- `npm run data` – Kartendaten neu bauen (`-- --refresh` lädt Rohdaten neu)
- `npm test` – Tests (Routing, Farbstufen, Parks, Begleit-Eskalation, Bewertungen)
- `npm run build` – fertige Version in `dist/`
