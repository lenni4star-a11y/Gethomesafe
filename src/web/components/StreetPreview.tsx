import { useEffect, useMemo, useRef, useState } from 'react';
import type { RouteSummary } from '../../core/analysis';
import { along, bearing, lineLength } from '../../core/geo';
import type { SafetyClass } from '../../core/safety';
import type { LngLat } from '../../core/types';
import { formatDistance } from '../format';
import { loadPhotoWalk, mapillaryErrorText, photoPageUrl, type Photo, type PhotoWalk } from '../mapillary';
import { MiniMap } from './MiniMap';
import { Modal } from './Modal';

interface Props {
  route: RouteSummary;
  token: string;
  onClose: () => void;
  /** Kamerafahrt über die ganze Route (Ersatz ohne Fotos) */
  onMapFlight: () => void;
  onRate: (coords: LngLat, photo: Photo | null) => void;
}

type State = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ok'; walk: PhotoWalk };

const CLASS_LABEL: Record<SafetyClass, string> = { good: 'grün', medium: 'gelb', bad: 'rot' };
const SPEEDS = [0.5, 1, 2] as const;

/** „Weg ansehen“: Fotos entlang der Route in Gehrichtung, wie ein Spaziergang */
export function StreetPreview({ route, token, onClose, onMapFlight, onRate }: Props) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [gapProgress, setGapProgress] = useState(0);
  const timer = useRef<number>();

  useEffect(() => {
    if (!token) return;
    const ctrl = new AbortController();
    setState({ kind: 'loading' });
    loadPhotoWalk(route.coords, token, ctrl.signal)
      .then((walk) => {
        setState({ kind: 'ok', walk });
        setIndex(0);
        setPlaying(walk.steps.length > 0);
      })
      .catch((e) => !ctrl.signal.aborted && setState({ kind: 'error', message: mapillaryErrorText(e) }));
    return () => ctrl.abort();
  }, [route, token]);

  const steps = state.kind === 'ok' ? state.walk.steps : [];
  const step = steps[index];
  const total = useMemo(() => lineLength(route.coords), [route]);

  // Abspielen: Fotos ca. 1,4 s, Lücken als Kamerafahrt je nach Länge
  useEffect(() => {
    if (!playing || !step) return;
    const duration = (step.type === 'photo' ? 1400 : Math.min(5000, Math.max(1500, step.length * 20))) / speed;
    const t0 = performance.now();
    let raf = 0;
    if (step.type === 'gap') {
      const tick = (now: number) => {
        setGapProgress(Math.min(1, (now - t0) / duration));
        if (now - t0 < duration) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }
    timer.current = window.setTimeout(() => {
      if (index < steps.length - 1) setIndex(index + 1);
      else setPlaying(false);
    }, duration);
    return () => {
      clearTimeout(timer.current);
      cancelAnimationFrame(raf);
    };
  }, [playing, index, step, steps.length, speed]);

  useEffect(() => setGapProgress(0), [index]);

  // Nächstes Foto vorladen
  useEffect(() => {
    const next = steps.slice(index + 1).find((s) => s.type === 'photo');
    if (next?.type === 'photo') new Image().src = next.photo.url;
  }, [index, steps]);

  if (!token)
    return (
      <Modal title="Weg ansehen" onClose={onClose}>
        <p>Die Straßenfotos sind in dieser Version noch nicht eingerichtet (es fehlt der Mapillary-Zugangsschlüssel).</p>
        <button type="button" className="btn primary big" onClick={onMapFlight}>
          Stattdessen Kamerafahrt über die Karte
        </button>
      </Modal>
    );

  if (state.kind === 'loading')
    return (
      <Modal title="Weg ansehen" onClose={onClose}>
        <p role="status">Fotos entlang der Route werden gesucht … (dauert bei längeren Wegen ein paar Sekunden)</p>
      </Modal>
    );

  if (state.kind === 'error' || steps.length === 0)
    return (
      <Modal title="Weg ansehen" onClose={onClose}>
        <p>{state.kind === 'error' ? state.message : 'Für diese Route gibt es bei Mapillary leider keine Fotos.'}</p>
        <button type="button" className="btn primary big" onClick={onMapFlight}>
          Kamerafahrt über die Karte
        </button>
      </Modal>
    );

  const walk = (state as { walk: PhotoWalk }).walk;
  const offset = step.type === 'photo' ? step.offset : step.offset + step.length * gapProgress;
  const position = along(route.coords, offset);
  const heading = bearing(position, along(route.coords, Math.min(total, offset + 15)));
  const cls = classAt(route, offset);
  const photo = step.type === 'photo' ? step.photo : null;

  return (
    <div className="street-preview" role="dialog" aria-modal="true" aria-label="Weg ansehen mit Straßenfotos">
      <div className="sp-top">
        <span className={`cls-badge cls-${cls}`}>Abschnitt {CLASS_LABEL[cls]}</span>
        <span>nach {formatDistance(offset)}</span>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Weg ansehen schließen">
          ✕
        </button>
      </div>

      <div className="sp-image">
        {photo ? (
          <img src={photo.url} alt={`Straßenfoto nach ${formatDistance(offset)} der Route`} />
        ) : (
          <>
            <MiniMap segments={route.segments} position={position} heading={heading} zoom={17} className="sp-gapmap" />
            <span className="sp-gap">Hier keine Fotos: ca. {formatDistance((step as { length: number }).length)} als Kamerafahrt über die Karte</span>
          </>
        )}
        {photo && <MiniMap segments={route.segments} position={position} heading={heading} className="sp-mini" />}
        {photo && (
          <span className="sp-date">
            {photo.night ? '🌙 Nachtfoto' : '☀ Tagfoto'}, {photo.capturedAt ? new Date(photo.capturedAt).toLocaleDateString('de-AT', { month: 'long', year: 'numeric' }) : 'Datum unbekannt'}
          </span>
        )}
      </div>

      <input
        className="sp-seek"
        type="range"
        min={0}
        max={steps.length - 1}
        value={index}
        onChange={(e) => (setPlaying(false), setIndex(Number(e.target.value)))}
        aria-label="Fortschritt"
      />

      <div className="sp-controls">
        <button type="button" className="btn" onClick={() => (setPlaying(false), setIndex(Math.max(0, index - 1)))} disabled={index === 0} aria-label="Zurück">
          ◀
        </button>
        <button type="button" className="btn primary" onClick={() => (index === steps.length - 1 && !playing ? (setIndex(0), setPlaying(true)) : setPlaying(!playing))}>
          {playing ? 'Pause' : index === steps.length - 1 ? 'Nochmal' : 'Abspielen'}
        </button>
        <button type="button" className="btn" onClick={() => (setPlaying(false), setIndex(Math.min(steps.length - 1, index + 1)))} disabled={index === steps.length - 1} aria-label="Weiter">
          ▶
        </button>
        <button type="button" className="btn speed" onClick={() => setSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length])} aria-label={`Geschwindigkeit ${speed}-fach`}>
          {speed}×
        </button>
      </div>

      <div className="sp-bottom">
        <button type="button" className="link-btn" onClick={() => (setPlaying(false), onRate(position, photo))}>
          ⭐ Diese Stelle bewerten
        </button>
        <span className="fineprint">
          Fotos für {Math.round(walk.coverage * 100)} % der Strecke{walk.nightShare > 0 ? `, ${Math.round(walk.nightShare * 100)} % davon nachts` : ''}.{' '}
          {photo && (
            <>
              Foto: {photo.creator ? `© ${photo.creator}, ` : ''}
              <a href={photoPageUrl(photo.id)} target="_blank" rel="noreferrer">
                Mapillary
              </a>
              , CC BY-SA 4.0
            </>
          )}
        </span>
      </div>
    </div>
  );
}

function classAt(route: RouteSummary, offset: number): SafetyClass {
  let d = 0;
  for (const s of route.segments) {
    const l = lineLength(s.coords);
    if (offset <= d + l) return s.cls;
    d += l;
  }
  return route.segments[route.segments.length - 1]?.cls ?? 'medium';
}
