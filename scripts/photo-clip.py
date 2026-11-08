#!/usr/bin/env python3
"""
Pilot, Teil 2: „Wie sicher wirkt diese Straße?“ aus Straßenfotos mit einem Bild-Text-Modell (CLIP).

Vorbild: Das „Safest Way“-Projekt des UCL (London) bewertet Straßenfotos mit CLIP gegen Sätze wie
„fühlt sich sicher an“ / „wirkt riskant“; laut UCL stimmten die Werte bei 500 Londoner Fotos stark mit
menschlichen Einschätzungen überein.

Modell: openai/clip-vit-base-patch32 (MIT-Lizenz, läuft ohne Grafikkarte).
Was bewertet wird: das ganze Bild als Straßenszene. Es werden KEINE Personen erkannt oder beschrieben,
die Sätze beschreiben nur Ort und Licht. Gesichter sind auf Mapillary verpixelt.

Gefahr: Ein solches Modell kann „ärmer“ oder „unordentlicher“ aussehende Straßen schlechter bewerten.
Deshalb listet die Zusammenfassung die am besten und am schlechtesten bewerteten Straßen mit Foto-Links,
damit Menschen prüfen können, ob das Ergebnis Sinn ergibt oder Vorurteile zeigt.
Das Ergebnis fließt NICHT in die App ein.

Aufruf: MAPILLARY_TOKEN=… python3 scripts/photo-clip.py 7
"""

import io
import json
import os
import sys
import urllib.request

import importlib.util

import torch
from PIL import Image
from transformers import CLIPModel, CLIPProcessor

spec = importlib.util.spec_from_file_location("pilot", os.path.join(os.path.dirname(__file__), "photo-pilot.py"))
pilot = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pilot)

BEZIRK = int(sys.argv[1]) if len(sys.argv) > 1 else 7
MAX_PHOTOS = int(os.environ.get("MAX_CLIP_PHOTOS", "1500"))
PER_EDGE = 2
OUT = "photo-pilot"

# Nur Ort und Licht, nie Menschen
SAFE = [
    "a well-lit street with shop windows and open entrances",
    "a wide, open street where you can see far ahead",
    "a busy, lively city street",
]
UNSAFE = [
    "a dark, poorly lit street",
    "a narrow, enclosed passage or underpass with no view",
    "a deserted street with hidden corners and dense bushes",
]


def main():
    if not pilot.TOKEN:
        sys.exit("MAPILLARY_TOKEN fehlt")
    os.makedirs(OUT, exist_ok=True)
    edges = pilot.load_edges(BEZIRK)
    lons = [c[0] for e in edges for c in e["coords"]]
    lats = [c[1] for e in edges for c in e["coords"]]
    W, S, E, N = min(lons), min(lats), max(lons), max(lats)

    grid = {}
    for e in edges:
        for c in e["coords"]:
            grid.setdefault((int(c[0] * pilot.MX / 30), int(c[1] * pilot.MY / 30)), set()).add(e["idx"])

    def nearest(p):
        gx, gy = int(p[0] * pilot.MX / 30), int(p[1] * pilot.MY / 30)
        best, bd = None, pilot.MATCH_M
        for i in range(gx - 1, gx + 2):
            for j in range(gy - 1, gy + 2):
                for idx in grid.get((i, j), ()):
                    for c in edges[idx]["coords"]:
                        d = pilot.dist(p, c)
                        if d < bd:
                            best, bd = idx, d
        return best

    # Fotos sammeln: je Wegstück höchstens 2, keine 360°-Fotos, Tag und Nacht
    dx, dy = pilot.CELL_M / pilot.MX, pilot.CELL_M / pilot.MY
    chosen = {}
    seen = set()
    y = S
    while y < N:
        x = W
        while x < E:
            for im in pilot.images_in((x, y, x + dx, y + dy)):
                if im["id"] in seen or im.get("is_pano") or not im.get("thumb_256_url"):
                    continue
                seen.add(im["id"])
                g = (im.get("computed_geometry") or im.get("geometry") or {}).get("coordinates")
                if not g:
                    continue
                idx = nearest(g)
                if idx is None or len(chosen.get(idx, [])) >= PER_EDGE:
                    continue
                chosen.setdefault(idx, []).append({"id": im["id"], "url": im["thumb_256_url"], "night": pilot.is_night(im.get("captured_at") or 0)})
            x += dx
        y += dy
    todo = [(idx, ph) for idx, lst in chosen.items() for ph in lst][:MAX_PHOTOS]
    print(f"Bezirk {BEZIRK}: {len(todo)} Fotos auf {len(chosen)} Wegstücken")

    model = CLIPModel.from_pretrained("openai/clip-vit-base-patch32").eval()
    proc = CLIPProcessor.from_pretrained("openai/clip-vit-base-patch32")
    texts = SAFE + UNSAFE
    with torch.no_grad():
        t_in = proc(text=texts, return_tensors="pt", padding=True)
        t_emb = model.get_text_features(**t_in)
        t_emb = t_emb / t_emb.norm(dim=-1, keepdim=True)

    scores = {}
    batch = []

    def run(batch):
        imgs = [b[2] for b in batch]
        with torch.no_grad():
            i_in = proc(images=imgs, return_tensors="pt")
            i_emb = model.get_image_features(**i_in)
            i_emb = i_emb / i_emb.norm(dim=-1, keepdim=True)
            probs = (100 * i_emb @ t_emb.T).softmax(dim=-1)
        for (idx, ph, _), p in zip(batch, probs):
            safe = float(p[: len(SAFE)].sum())
            scores.setdefault(idx, []).append({"id": ph["id"], "safe": round(safe, 3), "night": ph["night"]})

    for idx, ph in todo:
        try:
            with urllib.request.urlopen(ph["url"], timeout=30) as r:
                img = Image.open(io.BytesIO(r.read())).convert("RGB")
        except Exception as ex:
            print("  Foto übersprungen:", ex)
            continue
        batch.append((idx, ph, img))
        if len(batch) == 32:
            run(batch)
            batch = []
    if batch:
        run(batch)

    result = {
        idx: {"wirkt_sicher": round(sum(s["safe"] for s in lst) / len(lst), 3), "fotos": [s["id"] for s in lst], "nachtfotos": sum(s["night"] for s in lst)}
        for idx, lst in scores.items()
    }
    json.dump({"bezirk": BEZIRK, "modell": "openai/clip-vit-base-patch32", "wegstuecke": result}, open(f"{OUT}/clip-bezirk-{BEZIRK:02d}.json", "w"))

    # Prüfung 1: passt es zu den Beleuchtungsdaten?
    groups = {}
    for idx, r in result.items():
        groups.setdefault(edges[idx]["lit"], []).append(r["wirkt_sicher"])
    total_len = sum(e["len"] for e in edges)
    cov = sum(edges[idx]["len"] for idx in result) / total_len * 100
    lines = [
        f"# Foto-Pilot Teil 2 (Bild-Text-Modell) – Bezirk {BEZIRK}",
        "",
        f"- Bewertet: {sum(len(v) for v in scores.values())} Fotos auf {len(result)} Wegstücken ({cov:.1f} % der Wegstrecke)",
        "- Wert „wirkt sicher“ von 0 bis 1 (Anteil der sicheren Beschreibungen)",
        "",
        "## Prüfung: Durchschnitt nach Beleuchtung laut Daten",
        "",
        "| Beleuchtung | Wegstücke | wirkt sicher (Ø) |",
        "| --- | --- | --- |",
    ]
    for k in ("ja", "ja (Stadt)", "unbekannt", "nein"):
        v = groups.get(k, [])
        lines.append(f"| {k} | {len(v)} | {sum(v) / len(v):.3f} |" if v else f"| {k} | 0 | – |")

    # Prüfung 2: Menschen schauen sich die Extreme an (Vorurteile erkennen)
    by_name = {}
    for idx, r in result.items():
        n = edges[idx]["name"] or "(ohne Namen)"
        by_name.setdefault(n, []).append((r["wirkt_sicher"], r["fotos"][0]))
    ranked = sorted(((sum(v[0] for v in lst) / len(lst), n, lst[0][1], len(lst)) for n, lst in by_name.items() if len(lst) >= 3 and n != "(ohne Namen)"))
    link = lambda pid: f"https://www.mapillary.com/app/?pKey={pid}"
    lines += ["", "## Bitte von Menschen prüfen: am sichersten eingeschätzt", ""]
    lines += [f"- {n}: {s:.2f} ({c} Wegstücke) – [Foto]({link(p)})" for s, n, p, c in ranked[::-1][:10]]
    lines += ["", "## Bitte von Menschen prüfen: am wenigsten sicher eingeschätzt", ""]
    lines += [f"- {n}: {s:.2f} ({c} Wegstücke) – [Foto]({link(p)})" for s, n, p, c in ranked[:10]]
    lines += [
        "",
        "Fragen für die Prüfung: Stimmt das mit dem Gefühl vor Ort überein? Werden Straßen nur schlechter bewertet,",
        "weil sie älter, ärmer oder unordentlicher aussehen? Dann taugt das Maß so nicht.",
    ]
    open(f"{OUT}/zusammenfassung-modell.md", "w").write("\n".join(lines) + "\n")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
