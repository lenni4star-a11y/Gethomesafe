import maplibregl, { type GeoJSONSource, type Map as MLMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import type { RouteSummary } from '../../core/analysis';
import { along, bearing, lineLength, turnAngle } from '../../core/geo';
import type { PlanResult } from '../../core/planner';
import type { RouteMode } from '../../core/routing';
import type { DataIndex, LngLat } from '../../core/types';

// Freier Kartenstil von OpenFreeMap (kein Account, keine Nutzungsgrenze für faire Nutzung)
const STYLE_URL = 'https://tiles.openfreemap.org/styles/dark';

export const LIT_COLORS = { yes: '#ffd166', unknown: '#a99fd0', no: '#ff5c7a' };

export interface MapHandle {
  showPlan(plan: PlanResult | null, selected: RouteMode): void;
  setPoints(start: LngLat | null, end: LngLat | null): void;
  flyAlong(route: RouteSummary, onDone: () => void): void;
  stopFly(): void;
  focus(p: LngLat): void;
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
    map.on('click', (e) => clickRef.current([e.lngLat.lng, e.lngLat.lat]));

    ready.current = new Promise((resolve) => {
      map.on('load', () => {
        // Quellenangabe zuerst eingeklappt (per ⓘ aufklappbar)
        container.current?.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');
        map.addSource('area', { type: 'geojson', data: empty });
        map.addLayer({ id: 'area-line', type: 'line', source: 'area', paint: { 'line-color': '#c7b8ff', 'line-width': 1.5, 'line-opacity': 0.5, 'line-dasharray': [3, 2] } });

        for (const id of ['other', 'chosen'] as const) map.addSource(`route-${id}`, { type: 'geojson', data: empty, lineMetrics: true });
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
        for (const lit of ['yes', 'unknown', 'no'] as const)
          map.addLayer({
            id: `route-${lit}`,
            type: 'line',
            source: 'route-chosen',
            filter: ['==', ['get', 'lit'], lit],
            layout: { 'line-cap': lit === 'unknown' ? 'butt' : 'round', 'line-join': 'round' },
            paint: {
              'line-color': LIT_COLORS[lit],
              'line-width': 7,
              ...(lit === 'unknown' ? { 'line-dasharray': [1.2, 0.8] } : {}),
            },
          });

        map.addSource('places', { type: 'geojson', data: empty });
        map.addLayer({
          id: 'places',
          type: 'circle',
          source: 'places',
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 2.5, 16, 7],
            'circle-color': '#5ee0b0',
            'circle-stroke-color': '#15131f',
            'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 12, 0.5, 16, 2],
          },
        });
        map.on('click', 'places', (e) => {
          const f = e.features?.[0];
          if (!f) return;
          new maplibregl.Popup({ closeButton: false, className: 'place-popup' })
            .setLngLat(e.lngLat)
            .setText(`${f.properties.name} · gerade geöffnet`)
            .addTo(map);
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
      (map.getSource('area') as GeoJSONSource).setData({
        type: 'FeatureCollection',
        features: index.bezirke.filter((b) => !b.transit).map((b) => ({
          type: 'Feature',
          properties: { name: b.name },
          geometry: { type: 'LineString', coordinates: b.outline },
        })),
      });
      const box = index.bezirke.filter((b) => !b.transit).reduce(
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
    showPlan(plan, selected) {
      ready.current?.then(() => {
        const map = mapRef.current!;
        const chosen = plan?.[selected];
        const other = plan && !plan.same ? plan[selected === 'safest' ? 'fastest' : 'safest'] : null;
        (map.getSource('route-chosen') as GeoJSONSource).setData({
          type: 'FeatureCollection',
          features: (chosen?.segments ?? []).map((s) => ({ type: 'Feature', properties: { lit: s.lit }, geometry: { type: 'LineString', coordinates: s.coords } })),
        });
        (map.getSource('route-other') as GeoJSONSource).setData(
          other ? { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: other.coords } } : empty,
        );
        (map.getSource('places') as GeoJSONSource).setData({
          type: 'FeatureCollection',
          features: (chosen?.openPlaces ?? []).map((p) => ({
            type: 'Feature',
            properties: { name: p.name ?? placeLabel(p.cat) },
            geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
          })),
        });
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

    focus(p) {
      mapRef.current?.easeTo({ center: p, zoom: 17, duration: 600 });
    },
  }));

  return <div ref={container} className="map" role="region" aria-label="Karte" />;
});

/** Höhe des unteren Bereichs, damit Routen nicht verdeckt werden (am Desktop seitlich) */
function sheetHeight(): number {
  if (window.innerWidth >= 760) return 20;
  const el = document.querySelector('.sheet');
  return Math.min(el ? el.getBoundingClientRect().height : 0, window.innerHeight * 0.6);
}

export function placeLabel(cat: string): string {
  return (
    {
      police: 'Polizei',
      hospital: 'Spital mit Notaufnahme',
      fuel: 'Tankstelle',
      shop: 'Geschäft',
      bar: 'Bar / Lokal',
      food: 'Lokal',
      culture: 'Kino / Theater',
      pharmacy: 'Apotheke',
      hotel: 'Hotel',
    } as Record<string, string>
  )[cat] ?? 'Ort';
}
