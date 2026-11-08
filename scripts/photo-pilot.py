#!/usr/bin/env python3
"""
Pilot: Einschätzung aus Straßenfotos (Mapillary) für einen Bezirk.

Was gemessen wird – nur Ort und Licht, nie Menschen:
  Wie hell wirkt ein Wegstück auf NACHTFOTOS (mittlere Helligkeit, Anteil heller Bildpunkte)?
  Dafür reichen kleine Vorschaubilder (256 px). Gesichter werden von Mapillary ohnehin verpixelt,
  Personen werden hier nicht erkannt oder ausgewertet.

Prüfung „funktioniert es?“: Wenn das Maß etwas taugt, müssen Nachtfotos auf laut Daten
beleuchteten Wegen deutlich heller sein als auf unbeleuchteten oder unbekannten.
Das Skript rechnet das aus und schreibt das Ergebnis in die Zusammenfassung.

Das Ergebnis fließt NICHT in die App ein. Es ist nur zum Ansehen und Entscheiden.

Aufruf: MAPILLARY_TOKEN=… python3 scripts/photo-pilot.py 7
Ausgabe: photo-pilot/bezirk-07.json, photo-pilot/bezirk-07.geojson, photo-pilot/zusammenfassung.md
"""

import io
import json
import math
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

from PIL import Image

TOKEN = os.environ.get("MAPILLARY_TOKEN", "").strip()
BEZIRK = int(sys.argv[1]) if len(sys.argv) > 1 else 7
OUT = "photo-pilot"
MAX_PHOTOS = int(os.environ.get("MAX_PHOTOS", "1500"))
CELL_M = 150
MATCH_M = 15
MX = 111320 * math.cos(math.radians(48.2))
MY = 110540


def dist(a, b):
    return math.hypot((a[0] - b[0]) * MX, (a[1] - b[1]) * MY)


def vienna_hour(ms):
    """Ortszeit Wien (Sommerzeit grob: letzter So im März bis letzter So im Oktober)"""
    t = datetime.fromtimestamp(ms / 1000, tz=timezone.utc)
    y = t.year
    start = max(datetime(y, 3, d, 1, tzinfo=timezone.utc) for d in range(25, 32) if datetime(y, 3, d).weekday() == 6)
    end = max(datetime(y, 10, d, 1, tzinfo=timezone.utc) for d in range(25, 32) if datetime(y, 10, d).weekday() == 6)
    off = 2 if start <= t < end else 1
    return (t + timedelta(hours=off)).hour


def is_night(ms):
    h = vienna_hour(ms)
    return h >= 20 or h < 5


def get_json(url, tries=3):
    for i in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=30) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", "ignore")
            if "reduce the amount of data" in body:
                raise ValueError("zu groß")
            if e.code in (429, 500, 502, 503) and i < tries - 1:
                time.sleep(3 * (i + 1))
                continue
            raise
        except urllib.error.URLError:
            if i < tries - 1:
                time.sleep(3)
                continue
            raise


def images_in(bbox, depth=0):
    w, s, e, n = bbox
    q = urllib.parse.urlencode(
        {
            "access_token": TOKEN,
            "fields": "id,captured_at,computed_geometry,geometry,is_pano,thumb_256_url",
            "bbox": f"{w:.6f},{s:.6f},{e:.6f},{n:.6f}",
            "limit": 500,
        }
    )
    try:
        data = get_json("https://graph.mapillary.com/images?" + q)
        return data.get("data", [])
    except ValueError:
        if depth > 3:
            return []
        mx, my = (w + e) / 2, (s + n) / 2
        out = []
        for b in ((w, s, mx, my), (mx, s, e, my), (w, my, mx, n), (mx, my, e, n)):
            out += images_in(b, depth + 1)
        return out


def brightness(url):
    with urllib.request.urlopen(url, timeout=30) as r:
        img = Image.open(io.BytesIO(r.read())).convert("L")
    px = list(img.getdata())
    mean = sum(px) / len(px) / 255
    bright = sum(1 for p in px if p >= 170) / len(px)
    return round(mean, 3), round(bright, 3)


def load_edges(nr):
    d = json.load(open(f"public/data/bezirk-{nr:02d}.json"))
    nodes = d["nodes"]
    pt = lambda i: (nodes[3 * i + 1] / 1e5, nodes[3 * i + 2] / 1e5)
    edges = []
    for idx, e in enumerate(d["edges"]):
        coords = [pt(e[0])] + [(e[8][k] / 1e5, e[8][k + 1] / 1e5) for k in range(0, len(e[8]), 2)] + [pt(e[1])]
        lit = {1: "ja", 0: "nein"}.get(e[5]) or ("ja (Stadt)" if e[6] >= 50 else "unbekannt")
        edges.append({"idx": idx, "coords": coords, "len": e[2], "lit": lit, "name": d["names"][e[4]] if e[4] < len(d["names"]) else ""})
    return edges


def main():
    if not TOKEN:
        sys.exit("MAPILLARY_TOKEN fehlt")
    os.makedirs(OUT, exist_ok=True)
    edges = load_edges(BEZIRK)
    lons = [c[0] for e in edges for c in e["coords"]]
    lats = [c[1] for e in edges for c in e["coords"]]
    W, S, E, N = min(lons), min(lats), max(lons), max(lats)
    print(f"Bezirk {BEZIRK}: {len(edges)} Wegstücke, Gebiet {W:.4f},{S:.4f} – {E:.4f},{N:.4f}")

    # Raster zum schnellen Finden des nächsten Wegstücks
    grid = {}
    for e in edges:
        for c in e["coords"]:
            grid.setdefault((int(c[0] * MX / 30), int(c[1] * MY / 30)), set()).add(e["idx"])

    def nearest(p):
        gx, gy = int(p[0] * MX / 30), int(p[1] * MY / 30)
        best, bd = None, MATCH_M
        for i in range(gx - 1, gx + 2):
            for j in range(gy - 1, gy + 2):
                for idx in grid.get((i, j), ()):
                    for c in edges[idx]["coords"]:
                        d = dist(p, c)
                        if d < bd:
                            best, bd = idx, d
        return best

    # 1. Fotos suchen (nur Nachtfotos, keine 360°-Fotos)
    dx, dy = CELL_M / MX, CELL_M / MY
    seen, night = set(), []
    all_count = 0
    y = S
    while y < N:
        x = W
        while x < E:
            for im in images_in((x, y, x + dx, y + dy)):
                if im["id"] in seen:
                    continue
                seen.add(im["id"])
                all_count += 1
                if im.get("is_pano") or not im.get("thumb_256_url") or not im.get("captured_at"):
                    continue
                if is_night(im["captured_at"]):
                    g = (im.get("computed_geometry") or im.get("geometry") or {}).get("coordinates")
                    if g:
                        night.append({"id": im["id"], "at": g, "ms": im["captured_at"], "url": im["thumb_256_url"]})
            x += dx
        y += dy
    print(f"Fotos im Gebiet: {all_count}, davon Nachtfotos: {len(night)}")

    # 2. Nachtfotos den Wegstücken zuordnen und Helligkeit messen (begrenzt)
    per_edge = {}
    measured = 0
    for ph in night:
        if measured >= MAX_PHOTOS:
            break
        idx = nearest(ph["at"])
        if idx is None:
            continue
        try:
            mean, bright = brightness(ph["url"])
        except Exception as ex:  # einzelne Fotos dürfen fehlschlagen
            print("  Foto übersprungen:", ex)
            continue
        measured += 1
        per_edge.setdefault(idx, []).append({"id": ph["id"], "mean": mean, "bright": bright, "year": datetime.fromtimestamp(ph["ms"] / 1000).year})
    print(f"Gemessene Nachtfotos: {measured}, auf {len(per_edge)} Wegstücken")

    # 3. Ergebnis je Wegstück
    result = {}
    for idx, lst in per_edge.items():
        result[idx] = {
            "fotos": len(lst),
            "helligkeit": round(sum(p["mean"] for p in lst) / len(lst), 3),
            "hell_anteil": round(sum(p["bright"] for p in lst) / len(lst), 3),
            "jahre": sorted({p["year"] for p in lst}),
            "foto_ids": [p["id"] for p in lst[:3]],
        }

    # 4. Prüfung: Sind Nachtfotos auf beleuchteten Wegen heller?
    groups = {}
    for idx, r in result.items():
        groups.setdefault(edges[idx]["lit"], []).append(r["helligkeit"])
    total_len = sum(e["len"] for e in edges)
    covered_len = sum(edges[idx]["len"] for idx in result)

    lines = [
        f"# Foto-Pilot Bezirk {BEZIRK}",
        "",
        f"- Fotos im Gebiet: {all_count}, davon Nachtfotos (20–5 Uhr): {len(night)}",
        f"- Gemessen: {measured} Nachtfotos auf {len(result)} von {len(edges)} Wegstücken",
        f"- Abdeckung: {covered_len / total_len * 100:.1f} % der Wegstrecke haben mindestens ein Nachtfoto",
        "",
        "## Funktioniert es? Mittlere Helligkeit der Nachtfotos nach Beleuchtungsdaten",
        "",
        "| Beleuchtung laut Daten | Wegstücke | mittlere Helligkeit (0–1) |",
        "| --- | --- | --- |",
    ]
    for k in ("ja", "ja (Stadt)", "unbekannt", "nein"):
        v = groups.get(k, [])
        lines.append(f"| {k} | {len(v)} | {sum(v) / len(v):.3f} |" if v else f"| {k} | 0 | – |")
    lit_v = groups.get("ja", []) + groups.get("ja (Stadt)", [])
    dark_v = groups.get("nein", [])
    if lit_v and dark_v and len(dark_v) >= 5:
        diff = sum(lit_v) / len(lit_v) - sum(dark_v) / len(dark_v)
        verdict = "Das Maß trennt beleuchtete und unbeleuchtete Wege deutlich." if diff >= 0.05 else "Das Maß trennt beleuchtete und unbeleuchtete Wege kaum – so noch nicht brauchbar."
        lines += ["", f"Unterschied beleuchtet − unbeleuchtet: {diff:+.3f}. {verdict}"]
    else:
        lines += ["", "Zu wenige Nachtfotos auf unbeleuchteten Wegen für einen Vergleich."]
    lines += ["", "Hinweis: Nur Nachtfotos, nur Helligkeit. Keine Auswertung von Personen. Fließt nicht in die App ein."]
    open(f"{OUT}/zusammenfassung.md", "w").write("\n".join(lines) + "\n")
    print("\n".join(lines))

    json.dump({"bezirk": BEZIRK, "erstellt": datetime.now(timezone.utc).isoformat(), "wegstuecke": result}, open(f"{OUT}/bezirk-{BEZIRK:02d}.json", "w"))
    feats = [
        {
            "type": "Feature",
            "properties": {"helligkeit": r["helligkeit"], "fotos": r["fotos"], "beleuchtung": edges[idx]["lit"], "name": edges[idx]["name"]},
            "geometry": {"type": "LineString", "coordinates": [list(c) for c in edges[idx]["coords"]]},
        }
        for idx, r in result.items()
    ]
    json.dump({"type": "FeatureCollection", "features": feats}, open(f"{OUT}/bezirk-{BEZIRK:02d}.geojson", "w"))


if __name__ == "__main__":
    main()
