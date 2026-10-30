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
- Immer auf iPhone (Safari) und Android (Chrome), im Hoch- und Querformat und auf kleinem Bildschirm (z. B. iPhone SE) prüfen. In der Cloud-Umgebung gibt es nur einen Test-Chrome mit Handy-Größe; echte Geräte-Tests (Ton, Vibration, Lautlos-Schalter) muss die Projektinhaber·in machen – das ehrlich sagen.
- **Geheimnisse nie ins Repo:** Mapillary-Token nur in `.env` (lokal, in `.gitignore`) bzw. als GitHub-Secret `MAPILLARY_TOKEN`. Token nicht im Chat erfragen.

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
- **Routen-Menü als Bottom Sheet** mit drei Stufen: eingeklappt (Leiste „Wohin?“ bzw. Routen-Zusammenfassung + 🏠), halb, ganz offen. Klappt automatisch ein bei Kartentipp, fertiger Route, Auswahl auf der Karte und Bewerten (Bewerten-Dialog hat Vorrang). Querformat: Seitenleiste.
- **Zuhause:** speichern per Suche, Karte oder Standort (Einstellungen, einmaliger Hinweis beim ersten Start). Haus-Knopf plant sofort die sicherste Route nach Hause. Lieblingsorte als Schnellwahl-Chips. Bei der Begleitung ist Zuhause als Ziel vorausgewählt. **Datenschutz:** nur lokal, nie in Bewertungen, auf einem Server oder in Nachrichten an Kontakte (die bekommen nur den aktuellen Standort); auf der Karte nur ein neutrales, ausblendbares Symbol ohne Beschriftung; Knopf „Zuhause löschen“.
- **Straßenansicht (Mapillary):** Token aus `.env` (`VITE_MAPILLARY_TOKEN`), beim Veröffentlichen aus dem Secret `MAPILLARY_TOKEN`; optional eigener Schlüssel in den Einstellungen.
  - „Weg ansehen“: Fotos entlang der Route in Gehrichtung wie ein Spaziergang; Abspielen/Pause, vor/zurück, Geschwindigkeit, Fortschrittsbalken, Mini-Karte mit Position und Abschnittsfarbe; Lücken anzeigen und dort Kamerafahrt über die Karte; Nachtfotos bevorzugen, Aufnahmedatum zeigen.
  - Umschalter „Karte / Straße“: Vollbild-Foto mit Gehen (vor/zurück) und Drehen, Mini-Karte in der Ecke, Foto-Ebene (grüne Linien) auf der Karte; Bewerten mit passendem Foto (nur Foto-ID wird gespeichert).
  - Namensnennung unter jedem Foto: Urheber·in, Link zu Mapillary, CC BY-SA 4.0. Bei Fehler/Limit freundlicher Hinweis und Rückfall auf die Karte.
- Gewichte stehen in `src/core/safety.ts`.

### Notfall-Menü (SOS-Knopf)
- Der **SOS-Knopf ist in allen Ansichten sichtbar und wird nie verdeckt** (liegt über allen Dialogen; nur Anruf-, PIN- und Alarm-Bildschirm liegen darüber). Mit einer Hand bedienbar.
- Bereiche: **NOTRUF** (oben, rot, groß: 133 Polizei, 144 Rettung, 112 Euronotruf, Hinweis auf DEC112 mit stillem Notruf) – **HILFE UND REDEN** (je ein Satz, wofür, und ob 24 h erreichbar) – **MEINE KONTAKTE** (anrufen, SMS/WhatsApp mit aktuellem Standort, Absenden immer selbst) – **FAKE-ANRUF** (sofort, in 10 s, in 30 s) – **ALARM** (unten, sehr laute Sirene in Schleife + blinkender Bildschirm, 112-Knopf).
- Hilfsstellen nur mit geprüfter Nummer und Quelle, zentral in `src/core/helplines.ts` (Stand Oktober 2026, regelmäßig prüfen): 24-Stunden Frauennotruf der Stadt Wien 01 71 71 9, Frauenhelpline 0800 222 555, Telefonseelsorge 142, Opfer-Notruf 0800 112 112, COURAGE (LGBTIQ*-Beratung, nicht 24 h) 01 585 69 66, Sozialpsychiatrischer Notdienst 01 31330, Rat auf Draht 147, Polizei-SMS 0800 133 133. Nicht aufgenommen, weil nur in Fremdquellen gefunden: Türkis Rosa Lila Villa, Queer Base. Ein Heimwegtelefon speziell für Wien wurde nicht gefunden (das NÖ-Heimwegtelefon gilt nur für Niederösterreich).

### Begleitmodus
- Modi „Knopf gedrückt halten“ und „regelmäßig bestätigen“ (Intervall einstellbar).
- Eskalation: Rückfrage mit Vibration und Ton → simulierter Anruf mit Stimme („Alles okay? Wie fühlst du dich?“, Antwort per Knopf oder Sprache) → bei „Nein“ oder keiner Antwort Notfallkontakte mit Standort benachrichtigen (vorbereitete SMS/WhatsApp, Demo-Hinweis) → großer Notruf-Bildschirm.
- **Keine automatische Polizei-Alarmierung.**
- Antwortzeit und Anzahl der Anrufversuche einstellbar.
- „Ich bin angekommen“ beendet (optional Kontakt benachrichtigen); Beenden und Fehlalarm-Abbruch nur mit **PIN** (nur als Hash gespeichert).
- **Datenschutz:** Standort nur während der Begleitung, gespeichert wird nur die letzte Position, beim Ende wird alles gelöscht.
- Ehrlicher Hinweis in der App: Bei gesperrtem Bildschirm oder anderer App pausiert der Browser die Begleitung (keine Rückfragen, kein Ton, kein Standort); beim Zurückkommen werden verpasste Rückfragen sofort nachgeholt und die Pause angezeigt. **Kein Ersatz für den Notruf**.
- Eingeklappt zeigt die Begleitung nur Ziel, Dauer, **Restweg** (aus geplanter Route und letzter Position) und den Bestätigen-Knopf.
- Logik in `src/core/escort.ts` (reiner Zustandsautomat, getestet).

### Ton, Stimme, Vibration (`src/web/signals.ts`)
- Beim Start der Begleitung bzw. beim ersten Tipp **Audio und Sprachausgabe freischalten** (`unlockAudio()` direkt im Tipp), **Wake Lock** anfordern.
- Töne (Klingelton, Sirene, Testton) über **HTML-Audio-Elemente** (Medienwiedergabe), nicht über die Web Audio API; auf dem iPhone zusätzlich `navigator.audioSession.type = 'playback'`, damit der Lautlos-Schalter möglichst nicht greift. Klingelton/Sirene selbst erzeugt (`scripts/make-tones.py`, frei verwendbar), laut, in Schleife bis Annehmen/Ablehnen.
- Sprache: Stimmen laden abwarten, deutsche Gerätestimme (de-AT, sonst de-DE); Rückfall auf aufgenommene Sätze in `public/audio/` (Piper, Stimme „kerstin“, CC0, Texte in `scripts/voice-lines.tsv`). **Untertitel immer anzeigen.** Einstellung „Stimme im Anruf“: automatisch / nur Gerät / nur Aufnahme.
- Realistischer Anruf-Bildschirm (Annehmen/Ablehnen, Gesprächszeit, Untertitel).
- Testknöpfe in den Einstellungen (Ton, Vibration, Stimme) und Erinnerung an hohe Medienlautstärke beim Start der Begleitung.
- Vibration (Android): wird im Tipp beim Start angestoßen, Testknopf meldet, ob der Browser sie angenommen hat. **iPhone: keine Vibration für Web-Apps** – Ersatz: lauter Ton, rot blinkender Bildschirm, großes Overlay, einmalige Erklärung beim Start.
- **PIN-Eingabe wie eine Handy-Sperre** (`PinPad`): Punkte oben mittig, Ziffernblock 3×4 zentriert, „Bestätigen“ unten über die ganze Breite, große Tasten, auch auf kleinen Bildschirmen und im Querformat; auch zum Festlegen der PIN.

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
- **Native App:** Standort und Begleitung im Hintergrund bzw. bei gesperrtem Bildschirm, echte Benachrichtigungen, **Vibration auch auf dem iPhone**, Klingelton/Alarm unabhängig vom Lautlos-Schalter, automatischer SMS-Versand an Kontakte (mit Zustimmung).
- Echter KI-Anruf mit Sprachdialog (auch als echter Telefonanruf).
- Polizei als letzte Eskalationsstufe nur über offiziellen Weg (Leitstelle oder offizieller stiller Notruf), nie automatischer KI-Anruf bei 133.
- Gemeinsame Bewertungen über einen Server, mit Moderation.
- Partnerschaft mit Heimwegtelefon-Initiativen oder einer Leitstelle.

## Befehle
- `npm run dev` / `npm run dev:https` – Entwicklung
- `npm run data` – Kartendaten neu bauen (`-- --refresh` lädt Rohdaten neu)
- `npm test` – Tests (Routing, Farbstufen, Parks, Begleit-Eskalation, Bewertungen)
- `npm run build` – fertige Version in `dist/`
