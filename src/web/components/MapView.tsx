import maplibregl, { type GeoJSONSource, type Map as MLMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import type { RouteSummary } from '../../core/analysis';
import { along, bearing, lineLength, turnAngle } from '../../core/geo';
import { closesAt } from '../../core/openingHours';
import type { PlanResult } from '../../core/planner';
import type { RouteMode } from '../../core/routing';
import type { DataIndex, LngLat, Poi } from '../../core/types';
import { PLACE_META, placeKindLabel, placeName } from '../places';

// Freier Kartenstil von OpenFreeMap (kein Account, keine Nutzungsgrenze für faire Nutzung)
const STYLE_URL = 'https://tiles.openfreemap.org/styles/dark';

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
  showPlan(plan: PlanResult | null, selected: RouteMode, date: Date): void;
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
  onMapClick: (p: LngLat) => void;
}

const empty: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

export const MapView = forwardRef<MapHandle, Props>(function MapView({ index, onMapClick }, ref) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const ready = useRef<Promise<void>>();
  const markers = useRef<{ start?: maplibregl.Marker; end?: maplibregl.Marker }>({});
  const placeMarkers = useRef<maplibregl.Marker[]>([]);
  const homeMarker = useRef<maplibregl.Marker>();
  const flight = useRef<number | null>(null);
  const flyDot = useRef<maplibregl.Marker>();
  const clickRef = useRef(onMapClick);
  clickRef.current = onMapClick;

  useEffect(() => {
    const map = new maplibregl.Map({
      container: container.current!,
      style: STYLE_URL,
      center: [16.36, 48.2],
      zoom: 12.5,
      attributionControl: false,
      maxPitch: 70,
    });
    mapRef.current = map;
    if (import.meta.env.DEV) (window as unknown as { __map: MLMap }).__map = map;
    map.addControl(
      new maplibregl.AttributionControl({
        compact: true,
        customAttribution: 'Daten: © OpenStreetMap-Mitwirkende, Stadt Wien – data.wien.gv.at',
      }),
      'bottom-right',
    );
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
    // Bei weitem Zoom Orts-Symbole als kleine Punkte zeigen
    const updateFar = () => container.current?.classList.toggle('far', map.getZoom() < 14.5);
    map.on('zoomend', updateFar);
    updateFar();
    map.on('click', (e) => {
      // Klicks auf Orts-Symbole nicht als Kartenklick werten
      if ((e.originalEvent.target as HTMLElement)?.closest?.('.place-marker')) return;
      clickRef.current([e.lngLat.lng, e.lngLat.lat]);
    });

    ready.current = new Promise((resolve) => {
      map.on('load', () => {
        // Quellenangabe zuerst eingeklappt (per ⓘ aufklappbar)
        container.current?.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');

        map.addSource('area', { type: 'geojson', data: empty });
        map.addLayer({ id: 'area-line', type: 'line', source: 'area', paint: { 'line-color': '#c7b8ff', 'line-width': 1.5, 'line-opacity': 0.5, 'line-dasharray': [3, 2] } });

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
      const pilot = index.bezirke.filter((b) => !b.transit);
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
  }, [index]);

  useImperativeHandle(ref, () => ({
    showPlan(plan, selected, date) {
      ready.current?.then(() => {
        const map = mapRef.current!;
        const chosen = plan?.[selected];
        const other = plan && !plan.same ? plan[selected === 'safest' ? 'fastest' : 'safest'] : null;
        (map.getSource('route-chosen') as GeoJSONSource).setData({
          type: 'FeatureCollection',
          features: (chosen?.segments ?? []).map((s) => ({ type: 'Feature', properties: { cls: s.cls }, geometry: { type: 'LineString', coordinates: s.coords } })),
        });
        (map.getSource('route-other') as GeoJSONSource).setData(
          other ? { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: other.coords } } : empty,
        );

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
  el.textContent = PLACE_META[p.cat].icon;
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
