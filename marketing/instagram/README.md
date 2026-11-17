# Goodway – Instagram-Material

Hier entsteht täglich neues Material für den Instagram-Kanal von Goodway (geplante Aufgabe „Goodway Instagram täglich“).
Nichts davon gehört zur App; dieser Zweig (`instagram`) wird nie nach `main` gemischt.

## Stil
- Dunkler Grund, eine Akzentfarbe (Lavendel), warmes Laternenlicht. Farben und Bausteine in `scripts/compose.py` (`NIGHT`, `INK`, `MUTED`, `LAV`, `LIT`, `wordmark`, `text_block`, `lightmap`, `load_map`).
- Schrift Inter (InterDisplay), keine Emojis, Wortmarke „goodway.“ oben links, Slogan „Komm gut heim.“, Link goodwayapp.com.
- Formate: Post/Slider 1080×1350, Story/Reel 1080×1920 (Reel mit ffmpeg, H.264, `-preset veryfast`).
- Beispiele: `scripts/reel2.py`, `reel5.py`, `slider.py`, `teaser.py`, `people.py` (gezeichnete Figuren, keine echten Fotos). Diese Skripte lasen früher `*.npy` – jetzt `load_map('…')` aus `compose.py` nehmen.

## Ton
Deutsch, gendergerecht, locker, ehrlich, ein bisschen Witz, Nachtleben-Realität („Akku 4 %“, „Füße tot“). Haltung: Nicht das Outfit oder die Uhrzeit ist das Problem.

## Regeln
- Nur zeigen, was die App wirklich kann (siehe `CLAUDE.md` im Hauptzweig). Live-Standort-Link, stiller Alarm, Fahrrad-Routen, native App: noch NICHT fertig – höchstens als „kommt bald“.
- „Kein Ersatz für den Notruf“ wo es um Sicherheit geht.
- Keine „Drogen-Hotspots“, keine Gegenden schlechtmachen, keine Gruppen von Menschen beschreiben, keine Schimpfwörter.
- Keine Fotos echter Menschen, keine Logos von Clubs/Marken, keine erfundenen Zitate oder Bewertungen von „Nutzer·innen“.
- Statistiken nur mit Quelle (z. B. FRA-Studie, Statistik Austria) und nur, wenn geprüft.
- Nie selbst posten oder Nachrichten senden – nur Material liefern.

## Logbuch
`log.md` – eine Zeile pro Tag: Datum, Format, Thema, Dateien. Vor jedem neuen Material lesen, damit sich nichts wiederholt.
