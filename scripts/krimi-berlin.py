#!/usr/bin/env python3
"""
Kriminalitätsatlas Berlin (Polizei Berlin, CC BY-SA) → data-raw/berlin-krimi.json

Nur Delikte, die auf dem Heimweg zählen: Straßenraub/Handtaschenraub und gefährliche/schwere
Körperverletzung, als Fallzahlen des letzten Jahres je Bezirksregion (LOR-Schlüssel).
Die Dichte (Fälle pro km²) rechnet build-data.mjs mit den Grenzen der Bezirksregionen aus.
Läuft im Ablauf „Kartendaten aktualisieren“ vor npm run data (braucht openpyxl).
"""
import json, os, re, sys, urllib.request
import openpyxl

URL = 'https://www.berlin.de/polizei/_assets/dienststellen/lka/fallzahlen_hz-2016-2025.xlsx'
OUT = os.path.join(os.path.dirname(__file__), '..', 'data-raw', 'berlin-krimi.json')
os.makedirs(os.path.dirname(OUT), exist_ok=True)
path = os.path.join(os.path.dirname(OUT), 'berlin-krimi.xlsx')
urllib.request.urlretrieve(URL, path)
wb = openpyxl.load_workbook(path, read_only=True)
sheet = sorted(n for n in wb.sheetnames if n.startswith('Fallzahlen_'))[-1]
ws = wb[sheet]
header = None
out = {}
for row in ws.iter_rows(values_only=True):
    if header is None:
        if row[0] and str(row[0]).startswith('LOR-Schl'):
            header = [re.sub(r'\s+', ' ', str(c or '')).replace('-', '') for c in row]
        continue
    code = str(row[0] or '').strip()
    if not re.fullmatch(r'\d{6}', code) or code.endswith('0000'):
        continue  # nur Bezirksregionen, keine Bezirkssummen
    get = lambda pat: next((row[i] for i, h in enumerate(header) if re.search(pat, h, re.I)), 0) or 0
    out[code] = {'name': row[1], 'raub': int(get(r'Straßenraub')), 'kv': int(get(r'Gefährl'))}
json.dump({'jahr': sheet.split('_')[-1], 'quelle': 'Polizei Berlin, Kriminalitätsatlas (CC BY-SA)', 'regionen': out}, open(OUT, 'w'), ensure_ascii=False)
print(f'{sheet}: {len(out)} Bezirksregionen → {OUT}')
