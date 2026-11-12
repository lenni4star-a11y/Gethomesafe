# Goodway (früher Gethomesafe) – Projekt-Briefing und Regeln

**Name (Nov. 2026):** Die App heißt jetzt **Goodway**, Slogan „Komm gut heim.“ (Arbeitstitel, Markenprüfung offen). Repo, GitHub-Pages-Adresse und der PIN-Hash-Präfix `gethomesafe:` bleiben unverändert. Marke: Design System „Goodway“ (dunkler Grund `--bg`, eine Akzentfarbe `--accent`, keine Emojis, Linien-Symbole aus `src/web/components/Icon.tsx`, Wortmarke „goodway.“). Die aufgenommene Stimme `public/audio/check-hallo` sagt noch den alten Namen: mit Piper (Stimme „kerstin“) neu erzeugen (Text in `scripts/voice-lines.tsv` ist schon angepasst).

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
- **Geheimnisse nie ins Repo:** Mapillary-Token nur in `.env` (lokal, in `.gitignore`) bzw. als GitHub-Secret `MAPILLARY_TOKEN`; Supabase-Adresse und öffentlicher Schlüssel als Secrets `SUPABASE_URL` / `SUPABASE_ANON_KEY` (lokal `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`). Token nicht im Chat erfragen. Den Supabase-Secret-/service_role-Schlüssel nie verwenden.

## Rahmen und Technik
- **Prototyp als PWA** (Vite + React + TypeScript, Karte: MapLibre GL mit OpenFreeMap-Stil). Kartenstil wählbar in den Einstellungen (`src/web/mapStyle.ts`, localStorage): „automatisch“ (Standard: beim Öffnen tagsüber `liberty`, nach Sonnenuntergang `dark`, nach Stadtmitte), „hell“ = OpenFreeMap `liberty`, „dunkel“ = `dark`; Quellenangabe als kleiner Text oben rechts (kein Info-Knopf); Wechsel lädt die App neu (laufende Begleitung bleibt gespeichert).
- **Fahrrad-Routen (gewünscht, Nov. 2026, noch offen):** braucht eigenes Radwegenetz im Datenbau (Radwege, Einbahnen mit/ohne Radfreigabe, Gehwege ohne Radfreigabe ausschließen, `bicycle`-Tags) und eigenes Tempo. Nicht einfach das Fußwegenetz mit höherem Tempo nehmen (führt über Gehwege und gegen Einbahnen). Später **native App (Expo/React Native)**.
- **Logik getrennt von der Oberfläche:** `src/core/` enthält nur Logik ohne Browser-Funktionen (Routing, Sicherheitswert, Öffnungszeiten, Begleit-Eskalation, Bewertungen) und soll in der nativen App wiederverwendet werden. `src/web/` ist die Web-Oberfläche.
- **Speicherung nur lokal im Gerät** (IndexedDB über `src/web/storage.ts`), kein Server, keine Accounts.
- **Pilotgebiet** in `config/gebiet.json`: Bezirke 2, 4, 5, 6, 7, 8, 9, 15, 16; Durchgangs-Bezirke 1 und 3 (Routen dürfen durch, Start/Ziel nicht). Nach Änderung `npm run data`. Daten pro Bezirk getrennt (`public/data/bezirk-XX.json`), die App lädt nur benötigte Bezirke.
- **Mehrere Städte (Nov. 2026):** Wien, **Linz**, **Berlin** (Fokus: ganze Stadt, Thema „gut heim nach dem Feiern“) und **Zürich** (ganze Stadt, 34 statistische Quartiere, Bezirksnummern 401–434, `zuerich-XX.json`). Stadtauswahl in der Kopfleiste, Stadt wechselt mit dem Standort. Bezirksnummern: Wien 1–23, Linz 101–116 (statistische Bezirke, `linz-XX.json`), Berlin 201–297 (97 Ortsteile nach amtl. Schlüssel, `berlin-XX.json`, zusammen ca. 60 MB, App lädt nur benötigte). `index.json` hat `cities` (Fahrplan/Leuchten vorhanden?).
  - Linz: keine offenen Leuchtenstandorte, kein GTFS (nur EFA-Schnittstelle der LINZ AG); Haltestellen aus OSM; Bezirksgrenzen Stadt Linz (CC BY 4.0).
  - Berlin: Ortsteile + alle ~210.000 Leuchten (Geoportal Berlin, Datenlizenz Deutschland – Zero 2.0, ohne Schaltkästen/außer Betrieb), VBB-GTFS (CC BY 4.0) → `transit-berlin.json` (2,7 MB), Linienfarben BVG von Hand. Haltestellen aus OSM.
  - Notrufnummern, stiller Notruf (AT: DEC112, DE: nora) und Hilfsstellen je Land/Stadt in `src/core/helplines.ts` (`emergencyFor`, `helplinesFor`); Feiertage je Stadt in `openingHours.ts` (`setHolidayRegion`).
  - Zürich: Quartiere und ~42.000 Leuchten (Stadt Zürich, CC0, WFS `adm_statistische_quartiere_map`, `ewz_brennstelle_p`), Fahrplan aus dem Schweizer GTFS (opentransportdata.swiss, Permalink, Ersatz Mobility Database) → `transit-zuerich.json`; Notruf 117/144/112, Hilfsstellen 143/142/147. Datensatz „Zürich schaut hin“ (Meldetool Belästigung) hat keine Ortsangaben, nur Ortsart – für Routen nicht nutzbar.
  - Linz-Fahrplan: nur über die Mobilitätsverbünde Österreich (kostenlose Registrierung nötig → Projektinhaber·in fragen).
  - Suche „Wohin?“: Bars, Clubs, Restaurants, Kultur, Hotels mit Namen aus eigenen Daten (`orte-<stadt>.json`, `searchVenues`).
  - Öffi-Suche: bis zu 2 Umstiege (`ROUNDS = 3` in `transit.ts`).
- **Verkehrsmittel wie in Karten-Apps:** Reiter Öffis (Standard, wenn Verbindung) · Zu Fuß (angenehmster/schnellster Weg) · Taxi (Taxi-Zentralen anrufen, Uber-Link mit Ziel – nie mit Zuhause –, Bolt/FreeNow öffnen, grobe Zeit) · Roller (nur grobe Zeit, Hinweis Alkohol; kein Radwegenetz). `src/web/components/TravelModes.tsx`.
- **Anzeige „Gefühl unterwegs“** statt Note 1–10: fünf Balken Rot→Grün mit Wort (sehr angenehm … unangenehm), intern weiter 1–10 (`feelOf`).
- Datenaufbereitung: `scripts/build-data.mjs` (OSM-Export von BBBike + Stadt Wien Open Data).

## Datenquellen und Grundsätze
- **OpenStreetMap:** Wegenetz, `lit`, Orte mit `opening_hours` (Polizei, Tankstellen, Spätis, Bars, Lokale, Apotheken, Hotels …).
- **Stadt Wien (data.wien.gv.at, CC BY 4.0):** Bezirksgrenzen, ca. 173.000 Leuchtenstandorte (Datensatz „Lampentausch“), Öffi-Haltestellen, **Polizei** (POLIZEIOGD, als sichere Orte, mit OSM zusammengeführt), **Taxistandplätze** (TAXIOGD, „Taxistand direkt am Weg“), **öffentliche WCs** (WCANLAGE2OGD, mit Öffnungszeiten), **verkehrswirksame Baustellen** (BAUSTELLENLINOGD/-PKTOGD, mit Beginn/Ende; nur aktive Baustellen werten leicht ab). Zusatzdaten in `public/data/extras.json`.
- **Mapillary-Kartenobjekte:** auf Fotos erkannte Straßenlaternen (`object--street-light`, Vektor-Kacheln `mly_map_feature_point`, Zoom 14) füllen Lücken bei unbekannter Beleuchtung; Gewicht niedriger als OSM-`lit` und Stadt-Wien-Leuchten (`lightRisk` 0,15 statt 0). Namensnennung © Mapillary-Mitwirkende (CC BY-SA 4.0). Token beim Datenbau aus `MAPILLARY_TOKEN` (Umgebung/GitHub-Secret) oder `.env`. Stand Nov. 2026: füllt ca. 4 % der Wegstrecke (unbekannt sinkt von 16,8 % auf 12,8 %).
- **Geschäftsstraßen** (OSM `shop=*` außer leer, Lokale, Banken, Apotheken, Ärzt*innen; Punkte und Flächen): Anzahl im Erdgeschoss bis 20 m neben dem Weg pro 100 m als Kantenfeld 13 (`frontage`). Senkt nachts das Belebtheits-Risiko auch ohne geöffnete Orte (`frontageRisk`: ≥ 10 → 0,6, ≥ 5 → 0,8; nach echten Daten: Neubaugasse ~25, Reindorfgasse ~10 pro 100 m). Begründung „x % Geschäftsstraße“. Alte Daten ohne Feld = 0.
- **Begründung zeigt die Quelle** („Beleuchtung: 97 % laut OpenStreetMap …“, „laut Stadt Wien“, „auf Mapillary-Fotos erkannt“), Details-Abschnitt „Woher die Einschätzung kommt“.
- **Nicht verwendet:** NASA Black Marble (VIIRS) – braucht NASA-Earthdata-Account und hat ca. 500 m Auflösung, in Wien überall „hell“, sagt über einzelne Gassen nichts. Baustellen: die Stadt veröffentlicht nur verkehrswirksame Baustellen.
- **Kartendaten aktualisieren:** GitHub → Actions → „Kartendaten aktualisieren“ (`.github/workflows/update-data.yml`, manuell) baut alles neu, lädt hoch und stößt die Veröffentlichung an.
- **Öffi-Stationen** zählen als „offene Orte“ mit ungefähren Betriebszeiten der Wiener Linien (U-Bahn am Wochenende durchgehend, Nachtlinien 0:30–5:00).
- **Kriminalitätsdaten (geändert Nov. 2026, Entscheidung der Projektinhaber·in):** nur **amtliche** Quellen, nur als **kleiner Abzug** (höchstens ca. 1 Punkt auf 1–10, `WEIGHTS.crime`), nachts voll, tagsüber halb, mit Quelle in der Begründung, in den Einstellungen abschaltbar (`crimeData`). Berlin: Kriminalitätsatlas der Polizei (CC BY-SA, `scripts/krimi-berlin.py`, nur Straßenraub + gefährliche Körperverletzung, als Dichte pro km² statt pro Einwohner*in; oberste 10 % Bezirksregionen Stufe 2, nächste 15 % Stufe 1) und kriminalitätsbelastete Orte (kbO, ab 1.7.2026, ungefähre Kreise, Stufe 3; Rigaer Straße bewusst nicht, da v. a. politisch motivierte Taten). Kantenfeld 15 `crime`. **Keine** „Drogen-/Junkie-Hotspots“ aus Zeitungen oder eigenen Sammlungen. Wien: Waffenverbotszonen sind befristet, Stand unklar – noch nicht eingebaut.
- **Nachts zugesperrte Parks:** OSM-`opening_hours` an Parks → Kantenfeld 14 `parkHours`; außerhalb der Zeiten wird der Weg nie benutzt (`parkClosed`).
- **Keine Orte als „Drogen-Hotspot“ markieren, keine Kategorien über Personengruppen** (amtliche kbO-Liste ist ortsbezogen und erlaubt, siehe oben) – weder in Daten noch in Bewertungsgründen oder Texten. Bewertungen beschreiben nur Ort und Situation.
- **Alkoholverbotszonen:** Stand Oktober 2026 gibt es dazu **keine offenen Geodaten** der Stadt Wien (nur Zeitungsberichte, z. B. Praterstern seit 2018). Nicht von Hand einzeichnen. Erneut prüfen, falls die Stadt einen Datensatz veröffentlicht; dann nur mit Quelle und ohne Abwertung der Menschen vor Ort.
- Wo Daten fehlen, ehrlich „unbekannt“ bzw. gelb anzeigen statt raten.

## Funktionen (Stand und Anforderungen)

### Route und Karte
- Schnellste und sicherste Route und ggf. „Mit Öffis“ (vorausgewählt, wenn der Fußweg ≥ 25 min und Öffis mind. ⅓ schneller sind; `recommendTransit`), jeweils mit Dauer, Länge, **Sicherheitswert 1–10** und kurzer Begründung.
- **Farbstufen je Wegabschnitt mit Legende:** grün = beleuchtet und nicht schlecht bewertet; gelb = teilweise beleuchtet, keine Daten oder mäßig bewertet (zusätzlich gestrichelt); rot = unbeleuchtet oder schlecht bewertet. Tagsüber zählt Beleuchtung nicht.
- **Wochentag und Uhrzeit:** Losgeh-Zeit frei wählbar (Tag + Uhrzeit + Schnellwahl wie „Sa 2:00“). Öffnungszeiten und Bewertungen werden für genau diese Zeit ausgewertet.
- **Offene Orte am Weg** (bis 50 m): Liste in den Details (gruppiert, mit „bis wann geöffnet“) und auf der Karte als schlichte Punkte (keine Emojis; groß erst ab Zoom 16, Name im Popup).
- **Weg im Überblick** (`RouteOverview`, direkt unter den Routen-Karten, vor der Entscheidung): Streifen Start→Ziel in Farbstufen mit Markierungen für Unterführung/Stiege/dunkle Stücke, Anteile gut/mittel/schlecht, die ersten Stellen mit Abstand (antippen = auf der Karte zeigen), Anzahl geöffneter Orte. Bei Öffis: die Teilstrecken als Liste.
- **Parks:** nachts Wege durch oder direkt neben Parks abwerten, nie verbieten. Stärke in den Einstellungen (egal / leicht / normal / stark).
- **Routen-Menü als Bottom Sheet** mit drei Stufen: eingeklappt (Leiste „Wohin?“ bzw. Routen-Zusammenfassung + 🏠), halb, ganz offen. Klappt automatisch ein bei Kartentipp, fertiger Route, Auswahl auf der Karte und Bewerten (Bewerten-Dialog hat Vorrang). Querformat: Seitenleiste.
- **Zuhause:** speichern per Suche, Karte oder Standort (Einstellungen, einmaliger Hinweis beim ersten Start). Haus-Knopf plant sofort die sicherste Route nach Hause. Lieblingsorte als Schnellwahl-Chips. Bei der Begleitung ist Zuhause als Ziel vorausgewählt. **Datenschutz:** nur lokal, nie in Bewertungen, auf einem Server oder in Nachrichten an Kontakte (die bekommen nur den aktuellen Standort); auf der Karte nur ein neutrales, ausblendbares Symbol ohne Beschriftung; Knopf „Zuhause löschen“.
- **Straßenansicht (Mapillary):** Token aus `.env` (`VITE_MAPILLARY_TOKEN`), beim Veröffentlichen aus dem Secret `MAPILLARY_TOKEN`; optional eigener Schlüssel in den Einstellungen.
  - „Weg ansehen“: Fotos entlang der Route in Gehrichtung wie ein Spaziergang; Abspielen/Pause, vor/zurück, Geschwindigkeit, Fortschrittsbalken, Mini-Karte mit Position und Abschnittsfarbe; Lücken anzeigen und dort Kamerafahrt über die Karte; Nachtfotos bevorzugen, Aufnahmedatum zeigen.
  - **Schlicht (Nov. 2026, Wunsch der Projektinhaber·in):** kein Karte/Straße-Umschalter und keine Zoom-Knöpfe auf der Karte (Zoomen mit zwei Fingern), möglichst wenig Text. Straßenfotos über „Weg ansehen“; der Straßenmodus (`streetMode`) ist im Code noch da, aber ohne Knopf.
  - (früher) Umschalter „Karte / Straße“: Vollbild-Foto mit Gehen (vor/zurück) und Drehen, Mini-Karte in der Ecke, Foto-Ebene (grüne Linien) auf der Karte; Bewerten mit passendem Foto (nur Foto-ID wird gespeichert).
  - Namensnennung unter jedem Foto: Urheber·in, Link zu Mapillary, CC BY-SA 4.0. Bei Fehler/Limit freundlicher Hinweis und Rückfall auf die Karte.
  - Technik: Mapillary lehnt in dichten Gegenden große Abfrage-Rechtecke ab („Please reduce the amount of data“). Deshalb Abfragen à ca. 100 m, bei Ablehnung automatisch vierteln. Vor/Zurück in der Straßenansicht folgt der Fotoreihe (`sequence`, `image_ids`), sonst Umgebungssuche.
  - Stand 30.10.2026: Secret `MAPILLARY_TOKEN` ist eingetragen und funktioniert in der veröffentlichten Version (geprüft mit echten Daten).
- Gewichte stehen in `src/core/safety.ts`.

### Notfall-Menü (SOS-Knopf)
- Der **SOS-Knopf ist in allen Ansichten sichtbar und wird nie verdeckt** (liegt über allen Dialogen; nur Anruf-, PIN- und Alarm-Bildschirm liegen darüber). Mit einer Hand bedienbar.
- Bereiche: **NOTRUF** (oben, rot, groß, je Land: AT 133/144/112 + DEC112, DE 110/112 + nora, CH 117/144/112) – **HILFE UND REDEN** (je ein Satz, wofür, und ob 24 h erreichbar) – **MEINE KONTAKTE** (anrufen, SMS/WhatsApp mit aktuellem Standort, Absenden immer selbst) – **FAKE-ANRUF** (sofort, in 10 s, in 30 s) – **ALARM** (unten, sehr laute Sirene in Schleife + blinkender Bildschirm, 112-Knopf).
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

### Einführung und Datenschutz
- Einführung beim ersten Start (4 Schritte, überspringbar, in den Einstellungen erneut aufrufbar): was die App kann, was sie nicht kann (kein Notruf-Ersatz, gesperrter Bildschirm, iPhone ohne Vibration, Prototyp), Zuhause und Kontakte, Testton.
- Datenschutz-Seite in einfacher Sprache (`PrivacyPage`): was wo gespeichert wird, wann der Standort genutzt wird, aufgerufene Dienste (GitHub Pages, OpenFreeMap, Photon/komoot, Mapillary/Meta, Supabase Frankfurt nur beim Live-Link, Spracherkennung in Chrome → Google), was an Kontakte geht, wie man löscht. **Bei jedem neuen Dienst aktualisieren.**
- „Alle meine Daten löschen“ (IndexedDB + local/sessionStorage); nicht während einer laufenden Begleitung (sonst Beenden ohne PIN möglich).

### Begleitmodus: Abweichung, Ankunft, Täuschungs-PIN
- Rückfrage „Alles okay?“ bei Abweichung von der Route (Standard >75 m für >30 s) oder Stillstand (Standard 3 min, nicht im Umkreis von 40 m um Haltestellen); Schwellen einstellbar, abschaltbar. Nach „alles okay“ keine neue Abweichungs-Rückfrage, bis man wieder auf der Route ist. „Bewusst anders – neuen Weg berechnen“ berechnet ab der letzten Position neu.
- „Bist du angekommen?“ im Umkreis (Standard 50 m) ums Ziel; Beenden nur mit PIN, nie automatisch.
- **Täuschungs-PIN** (Einstellungen, nur als Hash): beendet sichtbar normal. Stiller Alarm an Kontakte braucht einen Server – im Prototyp **nicht verfügbar** und in der App deutlich so gekennzeichnet (`src/web/silentAlarm.ts` ist der Platzhalter). Begleitungs-PIN darf nicht gleich der Täuschungs-PIN sein.
- Alles in `src/core/escort.ts` (Ereignisse `position`, `rerouted`, `notArrived`; `classifyPin`) mit Tests.

### Bewertungen
- Wegstücke, Orte und Haltestellen bewerten: Sicherheitsgefühl 1–5, Wochentag und Uhrzeit automatisch (änderbar), Gründe zur Auswahl (dunkel, menschenleer, belebt, gut einsehbar, unangenehme Situation/bedrängt, Belästigung erlebt), optionale Notiz (sanfter Hinweis, wenn Personengruppen beschrieben werden).
- Bewertungen fließen in Farben und sicherste Route ein, gefiltert nach Wochentag und Uhrzeit (±2 h, ähnliche Tage; Nächte zählen zum Vortag).
- Kartenebene filterbar: gewählte Zeit / alle Zeiten / aus. Eigene Bewertungen ansehen und löschen.
- Struktur (`src/core/ratings.ts`) mit stabilen Schlüsseln (OSM-Knoten-IDs), Version und ohne Personendaten, vorbereitet für einen späteren Server.

## Offen / wartet auf Entscheidung
- **Öffis im Routing – Fahrplan umgesetzt (Variante „erst Fahrplan, Live später“):** `scripts/build-transit.mjs` verarbeitet das GTFS der Wiener Linien (CC BY 4.0) zu `public/data/transit.json` (ca. 0,6 MB): Steige im Gebiet mit Beleuchtungs-Flag (Stadt-Wien-Leuchten bis 30 m), Linienverläufe mit Fahrzeiten, Abfahrten je Tagestyp (Mo–Do, Fr, Sa, So; Beispieltage ohne Feiertage), inkl. Nachtbussen und U-Bahn-Nachtbetrieb (gehört zum Samstag/Sonntag-Betriebstag). `src/core/transit.ts`: Suche zu Fuß → bis zu 2 Fahrten (1 Umstieg) → zu Fuß (RAPTOR-ähnlich), nachts Zuschläge für Wartezeit, dunkle Haltestellen und lange Fußwege; Fußwege als sicherste Fußwege. **Sicherheitswert mit Öffis** (`transitScore`, getestet): Mittel über die Zeit, Fahren zählt als sicherster Teil (U-Bahn/Zug 9, Bim/Bus 9 tags, 8 nachts), Warten tags 8, nachts 7 (beleuchtet) bzw. 5 (dunkel/unbekannt), Fußwege mit eigenem Wert. Nachts wird „Mit Öffis“ vorausgewählt, wenn mindestens so sicher wie die sicherste Fußroute und höchstens 5 min länger. „Mit Öffis“ wird immer als dritte Karte angezeigt (ab 5 min Fußweg), auch wenn es nicht schneller ist (dann Hinweis „zu Fuß etwa gleich schnell“); ohne Verbindung ist die Karte ausgegraut mit Grund. **Öffi-Ansicht wie in Karten-Apps:** Fahrten auf der Karte durchgehend in der Linienfarbe (angelehnt an Wiener Linien: U1 rot, U2 violett, U3 orange, U4 grün, U5 türkis, U6 braun; Bim rot, Bus dunkelblau, Nachtbus fast schwarz; `lineColor` in `src/core/transit.ts`), weiß umrandet, Linien-Schild in der Mitte; im Überblick Kette „Gehen › U3 › U1 › Gehen“ und Teilstrecken mit Abfahrt, Richtung, Stationen, Ankunft; Linien-Schilder auch auf der Routen-Karte. Einschränkungen: keine Feiertags-Fahrpläne, keine Live-Verspätungen (Echtzeit-API ohne CORS → bräuchte Proxy, später), Fahrten auf der Karte als Linie zwischen den Stationen. Neu bauen mit `npm run transit` (läuft auch in `npm run data` und im Ablauf „Kartendaten aktualisieren“).
- **Server-Entscheidung (Nov. 2026): Supabase, Region Frankfurt** (Gratis-Tarif, Account der Projektinhaber·in). Einrichtung: `supabase/ANLEITUNG.md`.
- **Live-Standort-Link – umgesetzt (wartet auf Einrichtung des Supabase-Projekts):** In der Begleitung „Link erstellen“ → SMS/WhatsApp/Teilen (Absenden selbst). Standort wird im Browser mit AES-GCM verschlüsselt, Schlüssel nur im Link nach `#` (`?live=ID#SCHLÜSSEL`), Supabase speichert nur Geheimtext. Tabelle `live_shares` ohne direkten Zugriff (RLS ohne Policies), nur RPC-Funktionen `live_put` (mit geheimem Schreib-Token, Hash gespeichert), `live_get`, `live_end` (`supabase/live.sql`, mit lokalem Postgres getestet). Senden alle 15–60 s (bei Bewegung ≥ 20 m früher), Eintrag verfällt 60 min nach letzter Aktualisierung, max. 4 h, beim Beenden der Begleitung sofort gelöscht. Nur aktuelle Position + Genauigkeit + Zeit, nie Ziel/Zuhause/Route/Name. Ist ein Link aktiv, enthalten Hilfe-Nachrichten an Kontakte ihn zusätzlich. Ansicht für Kontakte: `LiveViewer` (Karte, „Standort vor X min“, Hinweis bei veraltetem Standort, 133/112, kein Notruf). Logik `src/core/liveShare.ts` (getestet), Web `src/web/liveShare.ts`, `LiveShareBox`. Ohne Secrets: „noch nicht eingerichtet“.
- **Stiller Alarm (Täuschungs-PIN), gemeinsame Bewertungen (Block 5):** könnten auf demselben Supabase-Projekt aufbauen; vor Umsetzung fragen. Idee für stillen Alarm ohne SMS-Kosten: Täuschungs-PIN lässt einen aktiven Live-Link heimlich weiterlaufen und markiert ihn als „Achtung“. Per SMS bräuchte es zusätzlich einen SMS-Anbieter (Kosten).
- **Gemeinsame Bewertungen vorbereitet** (`src/core/sharedRatings.ts`, getestet): erst ab 3 verschiedenen Geräten wirksam, Halbwertszeit 180 Tage, nach 730 Tagen verfallen, pro Gerät und Wegstück nur die neueste, max. 20 pro Gerät und Tag, Notizen und freie Orte werden nie geteilt. Teilen wäre Opt-in, standardmäßig bleibt alles lokal.
- **Phase 4 Rest:** Manifest und App-Symbole sind da (`public/manifest.webmanifest`, `public/icons/`, Links in `index.html`): „Zum Startbildschirm hinzufügen“ öffnet die App ohne Browserleiste. Offen: Service Worker und Offline-Daten, Barrierefreiheit prüfen (Kontraste, Schriftgrößen, Screenreader).
- **Begleit-Anruf:** Beim Annehmen und beim Start des Zuhörens beginnt die Antwortzeit neu (`callAccepted`), damit das Gespräch nicht mittendrin als „keine Antwort“ abläuft. Gesprochene Antworten wertet `classifyAnswer` (`src/core/escort.ts`, getestet) aus: Verneinungen und Notfall-Wörter gelten immer als „nicht okay“.

## Foto-Pilot (Zustimmung Nov. 2026: „wenn es funktioniert“)
- Erster Schritt, bewusst ohne Bild-KI-Modell (Lizenzen der gängigen Straßen-Modelle sind meist nicht-kommerziell): `scripts/photo-pilot.py` misst die **Helligkeit von Nachtfotos** (Mapillary, 20–5 Uhr, keine 360°-Fotos, Vorschaubild 256 px) je Wegstück eines Bezirks. Keine Personen-Auswertung.
- Prüft selbst, ob es funktioniert: Nachtfotos auf laut Daten beleuchteten Wegen müssen deutlich heller sein als auf unbeleuchteten (Tabelle in der Zusammenfassung).
- Teil 2 (Häkchen „Bild-Text-Modell“): `scripts/photo-clip.py` bewertet Straßenfotos mit CLIP (openai/clip-vit-base-patch32, MIT-Lizenz) gegen Sätze nur über Ort und Licht (Vorbild: UCL „Safest Way“). Zusammenfassung listet am besten/schlechtesten eingeschätzte Straßen mit Foto-Links zur menschlichen Prüfung auf Vorurteile.
- Läuft nur über GitHub → Actions → „Foto-Pilot (Test)“ (Bezirk wählbar), Ergebnis als Download unter „Artifacts“. **Fließt nicht in die App ein**, bis die Projektinhaber·in nach Ansicht der Ergebnisse zustimmt; dann höchstens 10 % Gewicht und nur als Lückenfüller.

## Konzept (nicht umsetzen ohne Zustimmung): KI-Einschätzung aus Straßenfotos
**Idee:** Aus Mapillary-Fotos (bevorzugt Nachtfotos) ein grobes Maß ableiten, wie sicher sich eine Straße *anfühlen könnte* – ähnlich Projekten wie „Safest Way“ oder Forschung am UCL (Wahrnehmung von Straßenräumen aus Bildern).
- **Was erkannt würde – nur Ort und Umgebung, nie Menschen:** Helligkeit/Lichtkegel im Nachtfoto, Anzahl sichtbarer Leuchten, Sichtachsen und Einsehbarkeit, Breite des Gehwegs, Bewuchs/Ecken mit Sichtschutz, beleuchtete Schaufenster/Eingänge, Unterführungen. Personen, Gesichter, Kleidung, Gruppen werden **nicht** ausgewertet (Mapillary verpixelt Gesichter ohnehin); keine Kategorien über Personengruppen.
- **Wie:** offene Bild-Segmentierung (z. B. vortrainiertes Modell für Straßenszenen) einmalig im Daten-Skript über die Fotos des Pilotgebiets; Ergebnis je Wegstück als Zahl 0–1 mit Fotoanzahl und Aufnahmedatum. Kein Senden von Fotos an Dritte zur Laufzeit.
- **Gewichtung:** sehr niedrig (z. B. höchstens 10 % des Risikos), nur wo es genug aktuelle Fotos gibt, nie stärker als Beleuchtungsdaten oder echte Bewertungen; in der Begründung klar als „grobe Schätzung aus Fotos“ gekennzeichnet, abschaltbar.
- **Risiken:** Vorurteile im Modell (z. B. „ärmer aussehende“ Straßen schlechter bewertet), **Stigmatisierung von Grätzln**, veraltete Fotos, Tagfotos sagen wenig über die Nacht, Scheingenauigkeit. Gegenmaßnahmen: keine Personenmerkmale, keine Bezirks-/Grätzl-Ranglisten, keine Karte „unsichere Gegenden“, nur Wegstück-bezogen und relativ; Prüfung der Ergebnisse mit Betroffenen und Fachleuten; Transparenzseite.
- **Kosten:** Rechenzeit einmalig (lokal oder günstige Cloud-GPU, grob einige Euro bis wenige zehn Euro für das Pilotgebiet), Mapillary-Abfragen im Rahmen der freien Nutzung; laufend nur bei Daten-Updates.
- **Entscheidung:** erst nach ausdrücklicher Zustimmung der Projektinhaber·in umsetzen.

## Später (jetzt nicht umsetzen)
- **Native App:** Standort und Begleitung im Hintergrund bzw. bei gesperrtem Bildschirm, echte Benachrichtigungen, **Vibration auch auf dem iPhone**, Klingelton/Alarm unabhängig vom Lautlos-Schalter, automatischer SMS-Versand an Kontakte (mit Zustimmung), stiller Alarm bei Täuschungs-PIN.
- Echter KI-Anruf mit Sprachdialog (auch als echter Telefonanruf).
- Polizei als letzte Eskalationsstufe nur über offiziellen Weg (Leitstelle oder offizieller stiller Notruf), nie automatischer KI-Anruf bei 133.
- Gemeinsame Bewertungen über einen Server, mit Moderation.
- Partnerschaft mit Heimwegtelefon-Initiativen oder einer Leitstelle.

## Befehle
- `npm run dev` / `npm run dev:https` – Entwicklung
- `npm run data` – Kartendaten neu bauen (`-- --refresh` lädt Rohdaten neu)
- `npm test` – Tests (Live-Standort-Link, Öffis, Routing, Farbstufen, Parks, Begleit-Eskalation inkl. Abweichung/Ankunft/Täuschungs-PIN, Bewertungen, gemeinsame Bewertungen, Zusatzdaten)
- `npm run build` – fertige Version in `dist/`
