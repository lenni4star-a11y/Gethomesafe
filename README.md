# Gethomesafe (Arbeitstitel)

Prototyp einer Web-App (PWA), die FLINTA* und andere marginalisierte Menschen abends und nachts sicherer nach Hause bringt.
Pilotgebiet: Wiener Bezirke mit vielen Studierenden.

**Stand: Phasen 1–3 (Route, Notfall-Menü und Begleitmodus, Bewertungen).** Alle Anforderungen und Regeln stehen in [CLAUDE.md](CLAUDE.md).

## Was die App gerade kann

- Start und Ziel wählen: über die Suche (Adressen, Orte, Öffi-Haltestellen), den eigenen Standort oder durch Tippen auf die Karte
- Zwei Routen: **schnellste** und **sicherste**, jeweils mit Dauer, Länge und einem **Sicherheitswert von 1 bis 10** samt kurzer Begründung
- Beleuchtung auf der Karte: gelb = beleuchtet, lila gestrichelt = unbekannt, rot = unbeleuchtet
- Losgeh-Zeit änderbar (zum Testen: einfach 23:30 Uhr einstellen)
- Details: Hinweise wie „260 m unbeleuchteter Abschnitt“ mit „Zeigen“ und „Fotos“ (Mapillary), Schritt-für-Schritt-Beschreibung, gerade geöffnete Orte am Weg
- „Vorschau abfliegen“: Die Kamera fährt den Weg einmal ab

## So wird die „sicherste“ Route berechnet

Jedes Wegstück bekommt einen Risiko-Wert von 0 bis 1. Er setzt sich zusammen aus:

| Faktor | nachts | tagsüber | Woher |
| --- | --- | --- | --- |
| Beleuchtung | 45 % | – | OSM-Tag `lit` und Leuchtenstandorte der Stadt Wien |
| Art des Weges | 35 % | 75 % | OSM: Hauptstraße, Gasse, Fußweg, Park, Unterführung, Stiege … |
| Belebtheit | 20 % | 25 % | geöffnete Lokale, Spätis, Tankstellen, Polizei in max. 40 m Entfernung (Öffnungszeiten aus OSM) |
| eigene Bewertungen | ab Phase 3 | | |

Die sicherste Route nimmt Umwege in Kauf: Ein Wegstück mit hohem Risiko „zählt“ bis zu viermal so lang.
Alle Gewichte stehen in `src/core/safety.ts`.

**Ehrlichkeit bei Lücken:** Wo weder OSM noch die Stadt-Daten etwas über Beleuchtung sagen, steht „unbekannt“. Orte ohne Öffnungszeiten werden nicht als „geöffnet“ gezählt.
Kriminalitätsdaten werden bewusst nicht verwendet.

## Datenquellen

- **OpenStreetMap** (© OpenStreetMap-Mitwirkende, ODbL): Wegenetz, Beleuchtung, Orte mit Öffnungszeiten. Export für Wien von [BBBike](https://download.bbbike.org/osm/bbbike/Wien/), wöchentlich aktualisiert
- **Stadt Wien, data.wien.gv.at** (CC BY 4.0): Bezirksgrenzen, rund 173.000 Leuchtenstandorte (Datensatz „Lampentausch“), Haltestellen
- **Kartenbild:** [OpenFreeMap](https://openfreemap.org) (frei, ohne Account)
- **Adresssuche:** [Photon](https://photon.komoot.io) von komoot (frei, faire Nutzung)
- **Straßenfotos:** Link zu [Mapillary](https://www.mapillary.com)

## Pilotgebiet ändern

In `config/gebiet.json` stehen die Bezirksnummern. Danach einmal `npm run data` ausführen.
Pro Bezirk entsteht eine eigene Datei (140 KB bis 1 MB). Die App lädt nur die Bezirke, die für eine Route gebraucht werden.
„Durchgangs-Bezirke“ (derzeit 1. und 3.) werden nur geladen, damit Routen dort durchführen können.

## Aufbau (für später: native App)

```
src/core/   Logik ohne Oberfläche: Wegenetz, Routing (A*), Sicherheitswert, Öffnungszeiten, Sonnenstand
src/web/    Web-Oberfläche (React + MapLibre)
scripts/    Vorverarbeitung der Rohdaten
public/data Fertige Daten pro Bezirk
```

`src/core` verwendet keine Browser-Funktionen und kann später direkt in einer Expo/React-Native-App genutzt werden.

## Am Computer starten

Voraussetzung: [Node.js](https://nodejs.org) (Version 20 oder neuer).

```bash
npm install
npm run dev          # öffnet http://localhost:5173
```

## Am Handy testen

Der Standort funktioniert im Browser nur über **https**. Zwei Möglichkeiten:

**A) Im eigenen WLAN (ohne weitere Dienste)**

1. Computer und Handy im selben WLAN
2. `npm run dev:https` ausführen
3. In der Ausgabe steht eine Zeile `Network: https://192.168.x.x:5173`. Diese Adresse am Handy öffnen
4. Der Browser warnt vor dem Zertifikat (das ist ein selbst erstelltes Test-Zertifikat). „Erweitert“ → „Trotzdem fortfahren“ wählen

**B) Online über GitHub Pages (empfohlen)**

Die App wird bei jeder Änderung auf `main` automatisch veröffentlicht unter
**https://lenni4star-a11y.github.io/Gethomesafe/**. Diesen Link einfach am Handy öffnen oder an Testpersonen schicken.

Einmalige Einrichtung (Repo muss öffentlich sein, sonst braucht GitHub Pages ein Bezahl-Abo):
1. Repo → **Settings** → **General** → ganz unten „Danger Zone“ → **Change visibility** → **Make public**
2. Repo → **Settings** → **Pages** → bei „Source“ **GitHub Actions** wählen
3. Repo → **Actions** → „App veröffentlichen“ → **Run workflow**. Nach 1 bis 2 Minuten ist die App online

## Straßenfotos (Mapillary) einrichten

1. Kostenlosen „Client Token“ erstellen: https://www.mapillary.com/dashboard/developers
2. **Lokal:** `.env.example` zu `.env` kopieren und den Token bei `VITE_MAPILLARY_TOKEN=` eintragen. `.env` wird nie hochgeladen.
3. **Online (für alle Nutzer·innen):** GitHub → Repo → Settings → Secrets and variables → Actions → „New repository secret“, Name `MAPILLARY_TOKEN`, Wert = Token. Danach unter Actions „App veröffentlichen“ neu starten.

## Befehle

| Befehl | Was er macht |
| --- | --- |
| `npm run dev` | Entwicklungsserver |
| `npm run dev:https` | Entwicklungsserver mit https, im WLAN erreichbar |
| `npm run data` | Kartendaten neu bauen (lädt Rohdaten beim ersten Mal, ca. 2 Minuten) |
| `npm run data -- --refresh` | Rohdaten neu herunterladen |
| `npm test` | automatische Tests |
| `npm run build` | fertige Version in `dist/` bauen |

## Hinweis

Prototyp. Die Bewertung beruht auf offenen Daten und kann Lücken haben. **Kein Ersatz für den Notruf: 133 (Polizei), 112 (Euronotruf).**
