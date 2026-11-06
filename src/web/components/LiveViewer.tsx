import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef, useState } from 'react';
import { formatAge, LIVE_RULES, type LivePayload } from '../../core/liveShare';
import { fetchLive, LIVE_AVAILABLE } from '../liveShare';
import { mapStyleUrl } from '../mapStyle';

const STYLE_URL = mapStyleUrl();

type State = { kind: 'loading' } | { kind: 'waiting' } | { kind: 'live'; payload: LivePayload; updatedAt: number } | { kind: 'ended' } | { kind: 'error'; text: string };

/** Ansicht für Kontakte, die einen Live-Standort-Link öffnen (…?live=ID#SCHLÜSSEL) */
export function LiveViewer({ id, keyB64 }: { id: string; keyB64: string }) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [now, setNow] = useState(Date.now());
  const mapEl = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const marker = useRef<maplibregl.Marker | null>(null);
  const centered = useRef(false);
  const [follow, setFollow] = useState(true);

  // regelmäßig nachfragen
  useEffect(() => {
    if (!LIVE_AVAILABLE || !keyB64) {
      setState({ kind: 'error', text: keyB64 ? 'Diese Version der App ist nicht mit dem Server verbunden.' : 'Der Link ist unvollständig. Bitte öffne ihn genau so, wie du ihn bekommen hast.' });
      return;
    }
    let stop = false;
    let ended = false;
    const tick = async () => {
      try {
        const res = await fetchLive(id, keyB64);
        if (stop) return;
        if (!res) {
          ended = true;
          setState({ kind: 'ended' });
        } else if (!res.payload) setState({ kind: 'waiting' });
        else setState({ kind: 'live', ...res, payload: res.payload });
      } catch (e) {
        if (stop) return;
        if (e instanceof Error && e.message === 'key') {
          ended = true;
          setState({ kind: 'error', text: 'Der Link ist unvollständig oder beschädigt. Bitte öffne ihn genau so, wie du ihn bekommen hast.' });
        } else setState((s) => (s.kind === 'live' ? s : { kind: 'error', text: 'Standort konnte gerade nicht geladen werden. Wir versuchen es weiter.' }));
      }
    };
    void tick();
    const t = window.setInterval(() => !ended && void tick(), LIVE_RULES.pollSec * 1000);
    const c = window.setInterval(() => setNow(Date.now()), 5000);
    return () => {
      stop = true;
      window.clearInterval(t);
      window.clearInterval(c);
    };
  }, [id, keyB64]);

  // Karte
  useEffect(() => {
    const m = new maplibregl.Map({ container: mapEl.current!, style: STYLE_URL, center: [16.3725, 48.2083], zoom: 12, attributionControl: { compact: true } });
    m.on('dragstart', () => setFollow(false));
    map.current = m;
    return () => m.remove();
  }, []);

  useEffect(() => {
    if (state.kind !== 'live' || !map.current) return;
    const c = state.payload.c;
    if (!marker.current) {
      const el = document.createElement('div');
      el.className = 'live-marker';
      marker.current = new maplibregl.Marker({ element: el }).setLngLat(c).addTo(map.current);
    } else marker.current.setLngLat(c);
    if (!centered.current || follow) {
      map.current.easeTo({ center: c, zoom: centered.current ? map.current.getZoom() : 16 });
      centered.current = true;
    }
  }, [state, follow]);

  const age = state.kind === 'live' ? now - state.payload.t : 0;
  const stale = state.kind === 'live' && age > 3 * 60_000;

  return (
    <div className="live-viewer">
      <div ref={mapEl} className="live-map" />
      <section className="live-card" aria-live="polite">
        <h1>Live-Standort</h1>
        {state.kind === 'loading' && <p>Wird geladen …</p>}
        {state.kind === 'waiting' && <p>Die Begleitung läuft, der Standort wird noch gesucht …</p>}
        {state.kind === 'ended' && (
          <p>
            <b>Der Link ist beendet.</b> Die Begleitung wurde beendet oder der Link ist abgelaufen. Der Standort wurde gelöscht.
          </p>
        )}
        {state.kind === 'error' && <p>{state.text}</p>}
        {state.kind === 'live' && (
          <>
            <p>
              <b>Standort {formatAge(age)}</b>
              {state.payload.a ? ` · Genauigkeit ca. ${state.payload.a} m` : ''}
            </p>
            {stale && (
              <p className="notice">
                Seit einigen Minuten kein neuer Standort. Das passiert oft, wenn der Bildschirm gesperrt ist oder keine Verbindung besteht – es muss nichts Schlimmes bedeuten. Ruf im Zweifel an.
              </p>
            )}
            {!follow && (
              <button type="button" className="btn small" onClick={() => setFollow(true)}>
                Wieder mitverfolgen
              </button>
            )}
          </>
        )}
        <p className="fineprint">
          Geteilt mit Goodway während einer Heimweg-Begleitung. Nur der aktuelle Standort, verschlüsselt. Dies ist <b>kein Notruf</b>: Bei Gefahr ruf die Polizei.
        </p>
        <div className="tp-row">
          <a className="btn danger small" href="tel:133">
            133 Polizei
          </a>
          <a className="btn danger small" href="tel:112">
            112 Notruf
          </a>
        </div>
      </section>
    </div>
  );
}
