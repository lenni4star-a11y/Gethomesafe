import { useEffect, useRef, useState } from 'react';
import type { RouteSummary } from '../../core/analysis';
import { formatDistance } from '../format';
import { loadPhotoRoute, type PhotoRoute } from '../mapillary';
import { Modal } from './Modal';

interface Props {
  route: RouteSummary;
  token: string;
  onClose: () => void;
  /** Kamerafahrt über die Karte starten (Ersatz, wenn es keine Fotos gibt) */
  onMapFlight: () => void;
  onOpenSettings: () => void;
}

type State = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ok'; data: PhotoRoute };

/** Vorschau wie Street View: Straßenfotos entlang der Route zum Durchklicken oder Abspielen */
export function StreetPreview({ route, token, onClose, onMapFlight, onOpenSettings }: Props) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const timer = useRef<number>();

  useEffect(() => {
    if (!token) return;
    const ctrl = new AbortController();
    setState({ kind: 'loading' });
    loadPhotoRoute(route.coords, token, ctrl.signal)
      .then((data) => setState({ kind: 'ok', data }))
      .catch((e) => {
        if (ctrl.signal.aborted) return;
        setState({
          kind: 'error',
          message: e instanceof Error && e.message === 'token' ? 'Der Mapillary-Zugangsschlüssel wurde nicht akzeptiert.' : 'Die Fotos konnten gerade nicht geladen werden.',
        });
      });
    return () => ctrl.abort();
  }, [route, token]);

  const frames = state.kind === 'ok' ? state.data.frames : [];

  useEffect(() => {
    if (!playing) return;
    timer.current = window.setTimeout(() => {
      if (index < frames.length - 1) setIndex(index + 1);
      else setPlaying(false);
    }, 1300);
    return () => clearTimeout(timer.current);
  }, [playing, index, frames.length]);

  // Nächstes Bild vorladen
  useEffect(() => {
    const next = frames[index + 1];
    if (next) new Image().src = next.url;
  }, [index, frames]);

  if (!token) {
    return (
      <Modal onClose={onClose} title="Straßenfotos">
        <p>Für die Fotovorschau braucht die App einen kostenlosen Zugangsschlüssel von Mapillary. Er kann in den Einstellungen eingetragen werden.</p>
        <div className="actions">
          <button type="button" className="btn primary" onClick={onMapFlight}>
            Stattdessen Kartenfahrt
          </button>
          <button type="button" className="btn" onClick={onOpenSettings}>
            Einstellungen
          </button>
        </div>
      </Modal>
    );
  }

  if (state.kind === 'loading') return <Modal onClose={onClose} title="Straßenfotos"><p role="status">Fotos entlang der Route werden gesucht …</p></Modal>;

  if (state.kind === 'error' || frames.length === 0) {
    return (
      <Modal onClose={onClose} title="Straßenfotos">
        <p>{state.kind === 'error' ? state.message : 'Für diese Route gibt es bei Mapillary leider keine Fotos.'}</p>
        <button type="button" className="btn primary" onClick={onMapFlight}>
          Kartenfahrt starten
        </button>
      </Modal>
    );
  }

  const f = frames[index];
  const prev = frames[index - 1];
  const gap = prev ? f.offset - prev.offset : f.offset;
  const coverage = state.kind === 'ok' ? Math.round(state.data.coverage * 100) : 0;

  return (
    <div className="street-preview" role="dialog" aria-modal="true" aria-label="Straßenfotos entlang der Route">
      <div className="sp-top">
        <span>
          Foto {index + 1} von {frames.length} · nach {formatDistance(f.offset)}
        </span>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Fotovorschau schließen">
          ✕
        </button>
      </div>
      <div className="sp-image">
        <img src={f.url} alt={`Straßenfoto nach ${formatDistance(f.offset)} der Route`} />
        {gap > 120 && <span className="sp-gap">Davor ca. {formatDistance(gap)} ohne Fotos</span>}
      </div>
      <div className="sp-progress" aria-hidden>
        <span style={{ width: `${((index + 1) / frames.length) * 100}%` }} />
      </div>
      <div className="sp-controls">
        <button type="button" className="btn" onClick={() => setIndex(Math.max(0, index - 1))} disabled={index === 0} aria-label="Vorheriges Foto">
          ◀
        </button>
        <button type="button" className="btn primary" onClick={() => setPlaying(!playing)}>
          {playing ? 'Pause' : index === frames.length - 1 ? 'Nochmal' : 'Abspielen'}
        </button>
        <button type="button" className="btn" onClick={() => setIndex(Math.min(frames.length - 1, index + 1))} disabled={index === frames.length - 1} aria-label="Nächstes Foto">
          ▶
        </button>
      </div>
      <p className="fineprint">
        Fotos für {coverage} % der Strecke. Aufgenommen {f.capturedAt ? new Date(f.capturedAt).toLocaleDateString('de-AT', { month: 'long', year: 'numeric' }) : 'unbekannt'}, meist bei Tag.{' '}
        Fotos: <a href={`https://www.mapillary.com/app/?pKey=${f.imageId}`} target="_blank" rel="noreferrer">Mapillary</a> (CC BY-SA).{' '}
        <button type="button" className="link-btn" onClick={onMapFlight}>
          Kartenfahrt
        </button>
      </p>
    </div>
  );
}
