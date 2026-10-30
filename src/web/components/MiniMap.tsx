import maplibregl, { type GeoJSONSource, type Map as MLMap } from 'maplibre-gl';
import { useEffect, useRef } from 'react';
import type { ColorSegment } from '../../core/analysis';
import type { LngLat } from '../../core/types';
import { CLASS_COLORS } from './MapView';

const STYLE_URL = 'https://tiles.openfreemap.org/styles/dark';

interface Props {
  /** Route mit Farbstufen (optional) */
  segments?: ColorSegment[];
  position: LngLat;
  heading?: number | null;
  /** Kamera fährt weich zur Position (für Kamerafahrt in Lücken) */
  follow?: boolean;
  zoom?: number;
  onTap?: (p: LngLat) => void;
  className?: string;
}

/** Kleine Karte in der Ecke: Position und Abschnittsfarbe */
export function MiniMap({ segments, position, heading, follow = true, zoom = 16, onTap, className }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const marker = useRef<maplibregl.Marker>();
  const ready = useRef<Promise<void>>();
  const tapRef = useRef(onTap);
  tapRef.current = onTap;

  useEffect(() => {
    const m = new maplibregl.Map({ container: el.current!, style: STYLE_URL, center: position, zoom, attributionControl: false, interactive: Boolean(onTap) });
    map.current = m;
    const dot = document.createElement('div');
    dot.className = 'mini-dot';
    marker.current = new maplibregl.Marker({ element: dot, rotationAlignment: 'map' }).setLngLat(position).addTo(m);
    m.on('click', (e) => tapRef.current?.([e.lngLat.lng, e.lngLat.lat]));
    ready.current = new Promise((resolve) =>
      m.on('load', () => {
        m.addSource('seg', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        m.addLayer({ id: 'seg-casing', type: 'line', source: 'seg', paint: { 'line-color': '#15131f', 'line-width': 7 } });
        m.addLayer({
          id: 'seg',
          type: 'line',
          source: 'seg',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': ['match', ['get', 'cls'], 'good', CLASS_COLORS.good, 'medium', CLASS_COLORS.medium, CLASS_COLORS.bad], 'line-width': 4 },
        });
        resolve();
      }),
    );
    return () => m.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    ready.current?.then(() =>
      (map.current?.getSource('seg') as GeoJSONSource | undefined)?.setData({
        type: 'FeatureCollection',
        features: (segments ?? []).map((s) => ({ type: 'Feature', properties: { cls: s.cls }, geometry: { type: 'LineString', coordinates: s.coords } })),
      }),
    );
  }, [segments]);

  useEffect(() => {
    marker.current?.setLngLat(position);
    if (heading != null) marker.current?.setRotation(heading);
    if (follow) map.current?.easeTo({ center: position, duration: 400 });
  }, [position, heading, follow]);

  return <div ref={el} className={`minimap ${className ?? ''}`} aria-hidden={!onTap} />;
}
