import { aggregateLights, lightsInBox } from '../../core/lights';
import maplibregl, { type GeoJSONSource, type Map as MLMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import type { RouteSummary } from '../../core/analysis';
import { along, bearing, lineLength, turnAngle } from '../../core/geo';
import { closesAt } from '../../core/openingHours';
import type { PlanResult } from '../../core/planner';
import type { Selection } from '../App';
import { textOn } from './Icon';
import { ICON_FOR, svgIcon } from '../placeIcons';
import { cityOf, type DataIndex, type LngLat, type Poi } from '../../core/types';
import { placeKindLabel, placeName } from '../places';
import { mapStyleUrl, styleUrlFor } from '../mapStyle';

// Freier Kartenstil von OpenFreeMap (kein Account, keine Nutzungsgrenze für faire Nutzung)
const STYLE_URL = mapStyleUrl();
/** eigene Ebenen bleiben beim Wechsel hell/dunkel erhalten; Licht-Ebenen unter die Schrift */
const isLightLayer = (id: string) => id.startsWith('lights');

/** Farbstufen: grün = gut, gelb = mäßig / keine Daten, rot = schlecht */
export const CLASS_COLORS = { good: '#4fd18b', medium: '#ffd166', bad: '#ff5c7a' };
export const LIT_COLORS = { yes: '#ffd166', unknown: '#a99fd0', no: '#ff5c7a' };

/** Bewertungspunkt auf der Karte */
export interface RatingPoint {
  id: string;
  coords: LngLat;
  score: number;
  label: string;
}

export interface MapHandle {
  showPlan(plan: PlanResult | null, selected: Selection, date: Date): void;
  setPoints(start: LngLat | null, end: LngLat | null): void;
  setRatings(points: RatingPoint[]): void;
  /** Zuhause als neutrales Symbol (ohne Beschriftung), null = ausblenden */
  setHome(p: LngLat | null): void;
  /** Ebene „hier gibt es Straßenfotos“ (Mapillary), null = aus */
  setPhotoCoverage(tilesUrl: string | null): void;
  center(): LngLat;
  flyAlong(route: RouteSummary, onDone: () => void): void;
  stopFly(): void;
  focus(p: LngLat, zoom?: number): void;
}

interface Props {
  index: DataIndex | null;
  /** gewählte Stadt: Karte zeigt deren Pilotgebiet */
  city?: string;
  onMapClick: (p: LngLat) => void;
  /** Licht-Ansicht nachts: liefert beleuchtete Wege im Ausschnitt; fehlt sie, ist die Ansicht aus */
  /** Kartenstil „automatisch“: true = dunkel, false = hell; undefined = feste Wahl der Nutzer·in */
  darkMap?: boolean;
  /** Laternen-Standorte der Stadt (nur nachts gesetzt) */
  lightSource?: (() => Promise<LngLat[] | null>) | null;
}

const empty: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

export const MapView = forwardRef<MapHandle, Props>(function MapView({ index, city = 'wien', onMapClick, lightSource = null, darkMap }, ref) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const ready = useRef<Promise<void>>();
  const styleUrl = useRef(STYLE_URL);
  const baseSources = useRef<Set<string>>(new Set());
  const baseLayers = useRef<Set<string>>(new Set());
  const markers = useRef<{ start?: maplibregl.Marker; end?: maplibregl.Marker }>({});
  const placeMarkers = useRef<maplibregl.Marker[]>([]);
  const homeMarker = useRef<maplibregl.Marker>();
  const flight = useRef<number | null>(null);
  const flyDot = useRef<maplibregl.Marker>();
  const lineBadges = useRef<maplibregl.Marker[]>([]);
  const clickRef = useRef(onMapClick);
  clickRef.current = onMapClick;
  const lightRef = useRef(lightSource);
  lightRef.current = lightSource;
  const updateLights = useRef<() => void>(() => {});

  // Licht-Ansicht an- oder ausschalten, wenn sich Tag/Nacht oder die Stadt ändert
  useEffect(() => {
    void ready.current?.then(() => updateLights.current());
  }, [lightSource]);

  // hell/dunkel automatisch wechseln (Stadtwechsel, Sonnenuntergang) ohne Neuladen; Routen, Lichter usw. bleiben
  useEffect(() => {
    if (darkMap === undefined) return;
    const url = styleUrlFor(darkMap);
    void ready.current?.then(() => {
      const map = mapRef.current;
      if (!map || styleUrl.current === url) return;
      styleUrl.current = url;
      map.setStyle(url, {
        transformStyle: (prev, next) => {
          if (!prev) return next;
          const ownSources = Object.fromEntries(Object.entries(prev.sources).filter(([id]) => !baseSources.current.has(id)));
          const ownLayers = prev.layers.filter((l) => !baseLayers.current.has(l.id));
          baseSources.current = new Set(Object.keys(next.sources));
          baseLayers.current = new Set(next.layers.map((l) => l.id));
          const lastShape = next.layers.reduce((last, l, i) => (l.type !== 'symbol' ? i : last), -1);
          const labelIdx = next.layers.findIndex((l, i) => i > lastShape && l.type === 'symbol');
          const cut = labelIdx < 0 ? next.layers.length : labelIdx;
          return {
            ...next,
            sources: { ...next.sources, ...ownSources },
            layers: [
              ...next.layers.slice(0, cut),
              ...ownLayers.filter((l) => isLightLayer(l.id)),
              ...next.layers.slice(cut),
              ...ownLayers.filter((l) => !isLightLayer(l.id)),
            ],
          };
        },
      });
    });
  }, [darkMap]);

  useEffect(() => {
    const map = new maplibregl.Map({
      container: container.current!,
      style: STYLE_URL,
      center: [13.405, 52.52],
      zoom: 11,
      attributionControl: false,
      maxPitch: 70,
    });
    mapRef.current = map;
    if (import.meta.env.DEV) (window as unknown as { __map: MLMap }).__map = map;
    // keine Zoom-Knöpfe: am Handy mit zwei Fingern zoomen (schlichte Oberfläche)
    // Quellenangabe: beim Öffnen 5 Sekunden sichtbar, dann (oder beim ersten Verschieben) eingeklappt zu einem kleinen ⓘ.
    // Das erlauben die Attribution Guidelines der OpenStreetMap Foundation, solange die Angabe per ⓘ auffindbar bleibt.
    // Die Datenquellen der Städte stehen auf der Datenschutz-Seite.
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'top-right');
    const attrib = () => container.current?.querySelector<HTMLElement>('.maplibregl-ctrl-attrib');
    const setAttribOpen = (open: boolean) => {
      const el = attrib();
      if (!el) return;
      el.classList.toggle('maplibregl-compact-show', open);
      if (open) el.setAttribute('open', '');
      else el.removeAttribute('open');
    };
    setAttribOpen(true);
    const attribTimer = window.setTimeout(() => setAttribOpen(false), 5000);
    map.once('movestart', () => (window.clearTimeout(attribTimer), setAttribOpen(false)));
    // Bei weitem Zoom Orts-Symbole als kleine Punkte zeigen
    const updateFar = () => container.current?.classList.toggle('far', map.getZoom() < 16);
    map.on('zoomend', updateFar);
    updateFar();
    map.on('click', (e) => {
      // Klicks auf Orts-Symbole nicht als Kartenklick werten
      if ((e.originalEvent.target as HTMLElement)?.closest?.('.place-marker')) return;
      clickRef.current([e.lngLat.lng, e.lngLat.lat]);
    });

    // für automatische Testfotos (?kartentest): Karte von außen steuerbar
    if (location.search.includes('kartentest')) (window as unknown as { __gwMap: maplibregl.Map }).__gwMap = map;

    ready.current = new Promise((resolve) => {
      map.on('load', () => {
        // was zum Grundkarten-Stil gehört (alles andere sind eigene Ebenen, die einen Stilwechsel überleben)
        baseSources.current = new Set(Object.keys(map.getStyle().sources ?? {}));
        baseLayers.current = new Set((map.getStyle().layers ?? []).map((l) => l.id));

        map.addSource('area', { type: 'geojson', data: empty });
        // Bezirksgrenzen werden bewusst nicht gezeichnet (schlichte Karte)

        // Licht-Ansicht (nur nachts, unter den Routen): von weit weg ein warmes Lichtermeer (Heatmap),
        // beim Hineinzoomen löst es sich in die einzelnen Laternen auf (Lichtpunkte mit Schein).
        // zwei Quellen: zusammengefasste Felder (weit weg) und einzelne Laternen im Ausschnitt (nah)
        map.addSource('lights-cells', { type: 'geojson', data: empty, tolerance: 0 });
        map.addSource('lights', { type: 'geojson', data: empty, tolerance: 0 });
        // unter die Straßennamen, damit sie lesbar bleiben
        // über Straßen und Flächen, aber unter die Beschriftungen (erste Schrift-Ebene nach der letzten Nicht-Schrift-Ebene)
        const styleLayers = map.getStyle().layers ?? [];
        const lastShape = styleLayers.reduce((last, l, i) => (l.type !== 'symbol' ? i : last), -1);
        const labelLayer = styleLayers.slice(lastShape + 1).find((l) => l.type === 'symbol')?.id;
        // Stufen: Stadt (Zoom ≤ 11) feines Leuchten entlang der Straßen · Viertel (12–13) Leuchten wird dünner,
        // erste Lichtpunkte · Straße (≥ 14) nur noch einzelne Laternen mit kleinem Schein.
        map.addLayer(
          {
            id: 'lights-heat',
            type: 'heatmap',
            source: 'lights-cells',
            maxzoom: 15.5,
            paint: {
              'heatmap-weight': ['interpolate', ['linear'], ['get', 'n'], 0, 0, 3, 0.4, 12, 1],
              'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 9, 0.35, 10.5, 0.45, 12, 0.55, 13, 0.8, 14, 1],
              'heatmap-radius': ['interpolate', ['exponential', 1.6], ['zoom'], 9, 2.5, 10.5, 4, 12, 8, 13, 12, 14, 16, 15, 22],
              'heatmap-color': [
                'interpolate',
                ['linear'],
                ['heatmap-density'],
                0, 'rgba(255,150,40,0)',
                0.1, 'rgba(255,150,40,0.15)',
                0.3, 'rgba(240,145,45,0.55)',
                0.6, 'rgba(255,190,90,0.8)',
                0.85, 'rgba(255,225,150,0.92)',
                1, 'rgba(255,245,210,1)',
              ],
              'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 10, 0.45, 12, 0.6, 13, 0.75, 14, 0.45, 15.5, 0],
            },
          },
          labelLayer,
        );
        // Fernsicht wie ein Nachtfoto aus dem All: helle Punkte je Feld, je mehr Laternen, desto heller
        map.addLayer(
          {
            id: 'lights-cells-dot',
            type: 'circle',
            source: 'lights-cells',
            maxzoom: 12.3,
            paint: {
              'circle-color': ['interpolate', ['linear'], ['get', 'n'], 1, '#ffa94d', 6, '#ffd27a', 15, '#fff2cf'],
              'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 1.1, 11, 1.7, 12, 2.1, 13, 2.6],
              'circle-blur': 0.35,
              'circle-opacity': [
                'interpolate',
                ['linear'],
                ['zoom'],
                11.2,
                ['interpolate', ['linear'], ['get', 'n'], 1, 0.45, 5, 0.85, 12, 1],
                12.2,
                0,
              ],
            },
          },
          labelLayer,
        );
        map.addLayer(
          {
            id: 'lights-glow',
            type: 'circle',
            source: 'lights',
            minzoom: 12,
            paint: {
              'circle-color': '#ffb24a',
              'circle-radius': ['interpolate', ['exponential', 1.8], ['zoom'], 12, 1.5, 15, 6, 17, 18, 19, 40],
              'circle-blur': 1,
              'circle-opacity': ['interpolate', ['linear'], ['zoom'], 12, 0.1, 14, 0.35, 16, 0.45],
            },
          },
          labelLayer,
        );
        map.addLayer(
          {
            id: 'lights-core',
            type: 'circle',
            source: 'lights',
            minzoom: 12,
            paint: {
              'circle-color': '#ffe9b8',
              'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 0.6, 14, 1.2, 16, 2, 19, 4],
              'circle-blur': 0.2,
              'circle-opacity': ['interpolate', ['linear'], ['zoom'], 12, 0.8, 13.5, 0.95, 15, 1],
            },
          },
          labelLayer,
        );
        let lightJob = 0;
        let allLights: LngLat[] | null = null;
        const pointFC = (pts: LngLat[]) => ({
          type: 'FeatureCollection' as const,
          features: pts.map((c) => ({ type: 'Feature' as const, properties: {}, geometry: { type: 'Point' as const, coordinates: c } })),
        });
        // einzelne Laternen nur im sichtbaren Ausschnitt und erst ab Zoom 12 – das hält die Karte auch auf älteren Handys flüssig
        const updateNear = () => {
          const src = map.getSource('lights') as GeoJSONSource | undefined;
          if (!src) return;
          if (!allLights || map.getZoom() < 12) return src.setData(empty);
          const b = map.getBounds();
          const pad = 0.2;
          const w = b.getEast() - b.getWest();
          const h = b.getNorth() - b.getSouth();
          src.setData(pointFC(lightsInBox(allLights, [b.getWest() - w * pad, b.getSouth() - h * pad, b.getEast() + w * pad, b.getNorth() + h * pad])));
        };
        updateLights.current = () => {
          const cells = map.getSource('lights-cells') as GeoJSONSource | undefined;
          const fn = lightRef.current;
          if (!cells) return;
          const job = ++lightJob;
          if (!fn) {
            allLights = null;
            cells.setData(empty);
            return updateNear();
          }
          void fn().then((pts) => {
            if (job !== lightJob) return;
            allLights = pts;
            cells.setData(
              pts
                ? {
                    type: 'FeatureCollection',
                    features: aggregateLights(pts, 100).map((c) => ({ type: 'Feature' as const, properties: { n: c.n }, geometry: { type: 'Point' as const, coordinates: c.at } })),
                  }
                : empty,
            );
            updateNear();
          });
        };
        map.on('moveend', updateNear);
        updateLights.current();

        for (const id of ['other', 'chosen'] as const) map.addSource(`route-${id}`, { type: 'geojson', data: empty });
        map.addLayer({
          id: 'route-other',
          type: 'line',
          source: 'route-other',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#8c8aa3', 'line-width': 5, 'line-opacity': 0.55, 'line-dasharray': [1.5, 1.5] },
        });
        map.addLayer({
          id: 'route-casing',
          type: 'line',
          source: 'route-chosen',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#15131f', 'line-width': 11 },
        });
        for (const cls of ['good', 'medium', 'bad'] as const)
          map.addLayer({
            id: `route-${cls}`,
            type: 'line',
            source: 'route-chosen',
            filter: ['==', ['get', 'cls'], cls],
            layout: { 'line-cap': cls === 'medium' ? 'butt' : 'round', 'line-join': 'round' },
            paint: {
              'line-color': CLASS_COLORS[cls],
              'line-width': 7,
              // gelb zusätzlich gestrichelt, damit es auch ohne Farbsehen unterscheidbar ist
              ...(cls === 'medium' ? { 'line-dasharray': [1.4, 0.7] } : {}),
            },
          });

        // Öffi-Fahrten wie in Karten-Apps: durchgehende Linie in der Linienfarbe (U3 orange …), weiß umrandet, Haltestellen als weiße Punkte
        map.addSource('route-rides', { type: 'geojson', data: empty });
        map.addLayer({
          id: 'route-rides-casing',
          type: 'line',
          source: 'route-rides',
          filter: ['==', ['geometry-type'], 'LineString'],
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#ffffff', 'line-width': 11 },
        });
        map.addLayer({
          id: 'route-rides',
          type: 'line',
          source: 'route-rides',
          filter: ['==', ['geometry-type'], 'LineString'],
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': ['coalesce', ['get', 'color'], '#1f4e9c'], 'line-width': 7 },
        });
        map.addLayer({
          id: 'route-rides-stops',
          type: 'circle',
          source: 'route-rides',
          filter: ['==', ['geometry-type'], 'Point'],
          paint: { 'circle-radius': 6, 'circle-color': '#ffffff', 'circle-stroke-color': ['coalesce', ['get', 'color'], '#1f4e9c'], 'circle-stroke-width': 3 },
        });

        // Bewertungen (Phase 3)
        map.addSource('ratings', { type: 'geojson', data: empty });
        map.addLayer({
          id: 'ratings',
          type: 'circle',
          source: 'ratings',
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 4, 17, 10],
            'circle-color': ['step', ['get', 'score'], CLASS_COLORS.bad, 2.5, CLASS_COLORS.medium, 3.5, CLASS_COLORS.good],
            'circle-opacity': 0.85,
            'circle-stroke-color': '#15131f',
            'circle-stroke-width': 2,
          },
        });
        map.on('click', 'ratings', (e) => {
          const f = e.features?.[0];
          if (!f) return;
          new maplibregl.Popup({ closeButton: false }).setLngLat(e.lngLat).setText(String(f.properties.label)).addTo(map);
        });
        resolve();
      });
    });
    return () => map.remove();
  }, []);

  useEffect(() => {
    if (!index) return;
    ready.current?.then(() => {
      const map = mapRef.current!;
      const pilot = index.bezirke.filter((b) => !b.transit && cityOf(b) === city);
      if (!pilot.length) return;
      (map.getSource('area') as GeoJSONSource).setData({
        type: 'FeatureCollection',
        features: pilot.map((b) => ({
          type: 'Feature',
          properties: { name: b.name },
          geometry: { type: 'LineString', coordinates: b.outline },
        })),
      });
      const box = pilot.reduce(
        (acc, b) => [Math.min(acc[0], b.bbox[0]), Math.min(acc[1], b.bbox[1]), Math.max(acc[2], b.bbox[2]), Math.max(acc[3], b.bbox[3])],
        [180, 90, -180, -90],
      );
      map.fitBounds(box as [number, number, number, number], {
        padding: { top: 70, left: 20, right: 20, bottom: sheetHeight() + 10 },
        duration: 0,
      });
    });
  }, [index, city]);

  useImperativeHandle(ref, () => ({
    showPlan(plan, selected, date) {
      ready.current?.then(() => {
        const map = mapRef.current!;
        const chosen = selected === 'transit' ? (plan?.transit ?? plan?.safest) : plan?.[selected];
        const other = plan && selected !== 'transit' && !plan.same ? plan[selected === 'safest' ? 'fastest' : 'safest'] : null;
        (map.getSource('route-rides') as GeoJSONSource).setData({
          type: 'FeatureCollection',
          features: [
            ...(chosen?.rides ?? []).map((path, i) => ({
              type: 'Feature' as const,
              properties: { color: chosen?.rideInfo?.[i]?.color ?? null },
              geometry: { type: 'LineString' as const, coordinates: path },
            })),
            ...(chosen?.rides ?? []).flatMap((path, i) =>
              [path[0], path[path.length - 1]].map((c) => ({
                type: 'Feature' as const,
                properties: { color: chosen?.rideInfo?.[i]?.color ?? null },
                geometry: { type: 'Point' as const, coordinates: c },
              })),
            ),
          ],
        });
        (map.getSource('route-chosen') as GeoJSONSource).setData({
          type: 'FeatureCollection',
          features: (chosen?.segments ?? []).map((s) => ({ type: 'Feature', properties: { cls: s.cls }, geometry: { type: 'LineString', coordinates: s.coords } })),
        });
        (map.getSource('route-other') as GeoJSONSource).setData(
          other ? { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: other.coords } } : empty,
        );

        // Linien-Schild (z. B. „U3“) in der Mitte jeder Fahrt
        lineBadges.current.forEach((m) => m.remove());
        lineBadges.current = (chosen?.rides ?? []).map((path, i) => {
          const info = chosen?.rideInfo?.[i];
          const el = document.createElement('span');
          el.className = `line-badge${info?.mode === 1 ? ' ubahn' : ''}`;
          el.textContent = info?.line ?? '';
          el.style.background = info?.color ?? '#1f4e9c';
          el.style.color = textOn(info?.color ?? '#1f4e9c');
          el.setAttribute('aria-hidden', 'true');
          return new maplibregl.Marker({ element: el }).setLngLat(path[Math.floor(path.length / 2)]).addTo(map);
        });

        placeMarkers.current.forEach((m) => m.remove());
        placeMarkers.current = (chosen?.openPlaces ?? []).map((p) => placeMarker(p, date).addTo(map));

        if (chosen) {
          const all = [...chosen.coords, ...(other?.coords ?? [])];
          const lons = all.map((c) => c[0]);
          const lats = all.map((c) => c[1]);
          map.fitBounds([Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)], {
            padding: { top: 70, bottom: sheetHeight() + 20, left: 40, right: 40 },
            pitch: 0,
            bearing: 0,
            duration: 600,
          });
        }
      });
    },

    setPoints(start, end) {
      const map = mapRef.current!;
      const set = (key: 'start' | 'end', p: LngLat | null) => {
        markers.current[key]?.remove();
        markers.current[key] = undefined;
        if (!p) return;
        const el = document.createElement('div');
        el.className = `pin pin-${key}`;
        el.setAttribute('aria-label', key === 'start' ? 'Start' : 'Ziel');
        markers.current[key] = new maplibregl.Marker({ element: el }).setLngLat(p).addTo(map);
      };
      set('start', start);
      set('end', end);
    },

    setPhotoCoverage(tilesUrl) {
      ready.current?.then(() => {
        const map = mapRef.current!;
        if (map.getLayer('mly-seq')) map.removeLayer('mly-seq');
        if (map.getLayer('mly-img')) map.removeLayer('mly-img');
        if (map.getSource('mly')) map.removeSource('mly');
        if (!tilesUrl) return;
        map.addSource('mly', { type: 'vector', tiles: [tilesUrl], minzoom: 6, maxzoom: 14 });
        map.addLayer(
          { id: 'mly-seq', type: 'line', source: 'mly', 'source-layer': 'sequence', minzoom: 12, paint: { 'line-color': '#35af6d', 'line-width': 2, 'line-opacity': 0.75 } },
          'route-other',
        );
        map.addLayer(
          { id: 'mly-img', type: 'circle', source: 'mly', 'source-layer': 'image', minzoom: 16, paint: { 'circle-color': '#35af6d', 'circle-radius': 3 } },
          'route-other',
        );
      });
    },

    center() {
      const c = mapRef.current!.getCenter();
      return [c.lng, c.lat];
    },

    setHome(p) {
      homeMarker.current?.remove();
      homeMarker.current = undefined;
      if (!p || !mapRef.current) return;
      const el = document.createElement('div');
      el.className = 'home-pin';
      el.setAttribute('aria-hidden', 'true');
      homeMarker.current = new maplibregl.Marker({ element: el }).setLngLat(p).addTo(mapRef.current);
    },

    setRatings(points) {
      ready.current?.then(() => {
        (mapRef.current!.getSource('ratings') as GeoJSONSource).setData({
          type: 'FeatureCollection',
          features: points.map((p) => ({
            type: 'Feature',
            properties: { score: p.score, label: p.label },
            geometry: { type: 'Point', coordinates: p.coords },
          })),
        });
      });
    },

    flyAlong(route, onDone) {
      const map = mapRef.current!;
      if (flight.current) cancelAnimationFrame(flight.current);
      const coords = route.coords;
      const total = lineLength(coords);
      // ca. 12–30 Sekunden, je nach Länge
      const duration = Math.min(30000, Math.max(12000, total * 8));
      const t0 = performance.now();
      let heading = bearing(coords[0], along(coords, 60));
      const dotEl = document.createElement('div');
      dotEl.className = 'fly-dot';
      flyDot.current?.remove();
      flyDot.current = new maplibregl.Marker({ element: dotEl }).setLngLat(coords[0]).addTo(map);
      const step = (now: number) => {
        const t = Math.min(1, (now - t0) / duration);
        const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
        const d = eased * total;
        const pos = along(coords, d);
        const target = bearing(pos, along(coords, Math.min(total, d + 60)));
        heading = (heading + turnAngle(heading, target) * 0.06 + 360) % 360;
        map.jumpTo({ center: pos, bearing: heading, pitch: 62, zoom: 17.2 });
        flyDot.current?.setLngLat(pos);
        if (t < 1) flight.current = requestAnimationFrame(step);
        else {
          flight.current = null;
          flyDot.current?.remove();
          onDone();
        }
      };
      flight.current = requestAnimationFrame(step);
    },

    stopFly() {
      if (flight.current) cancelAnimationFrame(flight.current);
      flight.current = null;
      flyDot.current?.remove();
      mapRef.current?.easeTo({ pitch: 0, bearing: 0, duration: 400 });
    },

    focus(p, zoom = 17) {
      mapRef.current?.easeTo({ center: p, zoom, duration: 600 });
    },
  }));

  return <div ref={container} className="map" role="region" aria-label="Karte" />;
});

function placeMarker(p: Poi, date: Date): maplibregl.Marker {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = `place-marker cat-${p.cat}`;
  el.innerHTML = svgIcon(ICON_FOR[p.cat] ?? 'star');
  // Symbol statt Emoji, aus der Ferne nur ein Punkt; Name und Art stehen im Popup
  el.setAttribute('aria-label', `${placeName(p)}, ${placeKindLabel(p)}, gerade geöffnet`);
  const until = closesAt(p, date);
  const popup = new maplibregl.Popup({ closeButton: false, offset: 14 }).setText(
    `${placeName(p)} · ${placeKindLabel(p)} · geöffnet${until ? ` bis ${until.toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' })}` : ''}`,
  );
  return new maplibregl.Marker({ element: el }).setLngLat([p.lon, p.lat]).setPopup(popup);
}

/** Höhe des unteren Bereichs, damit Routen nicht verdeckt werden (am Desktop seitlich) */
function sheetHeight(): number {
  if (window.innerWidth >= 760) return 20;
  const el = document.querySelector('.sheet');
  return Math.min(el ? el.getBoundingClientRect().height : 0, window.innerHeight * 0.6);
}
