import { useCallback, useEffect, useRef, useState } from 'react';
import type { ColorSegment } from '../../core/analysis';
import { bearing, distance, turnAngle } from '../../core/geo';
import type { LngLat } from '../../core/types';
import { mapillaryErrorText, nextInSequence, photoPageUrl, photosNear, type Photo } from '../mapillary';
import { MiniMap } from './MiniMap';

interface Props {
  token: string;
  start: LngLat;
  segments?: ColorSegment[];
  onClose: () => void;
  onRate: (coords: LngLat, photo: Photo) => void;
}

/** Straßenansicht: Vollbild-Foto, durch das man sich wie bei Street View bewegt */
export function StreetView({ token, start, segments, onClose, onRate }: Props) {
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [heading, setHeading] = useState<number>(0);
  const [message, setMessage] = useState<string | null>('Fotos werden gesucht …');
  const [busy, setBusy] = useState(false);
  const ctrl = useRef<AbortController>();

  const jumpTo = useCallback(
    async (p: LngLat) => {
      ctrl.current?.abort();
      ctrl.current = new AbortController();
      setBusy(true);
      try {
        const list = await photosNear(p, token, 60, ctrl.current.signal);
        if (!list.length) {
          setMessage('Hier gibt es leider keine Fotos. Tippe auf der Mini-Karte auf eine andere Stelle, oder schließe die Straßenansicht.');
          return;
        }
        setPhoto(list[0]);
        setHeading(list[0].compass ?? 0);
        setMessage(null);
      } catch (e) {
        if (!ctrl.current.signal.aborted) setMessage(mapillaryErrorText(e));
      } finally {
        setBusy(false);
      }
    },
    [token],
  );

  useEffect(() => {
    void jumpTo(start);
    return () => ctrl.current?.abort();
  }, [start, jumpTo]);

  /** In Blickrichtung (oder entgegen) zum nächsten Foto gehen */
  const move = async (dir: 'forward' | 'back') => {
    if (!photo) return;
    setBusy(true);
    try {
      const want = dir === 'forward' ? heading : (heading + 180) % 360;
      // Zuerst der Fotoreihe folgen (wie Street View), sonst in der Umgebung suchen
      const inSeq = await nextInSequence(photo, want, token);
      const list = inSeq ? [] : await photosNear(photo.coords, token, 55);
      // Erst eng in Blickrichtung suchen, dann großzügiger
      const pick = (maxAngle: number, maxDist: number) => {
        let best: Photo | null = null;
        let bestScore = Infinity;
        for (const p of list) {
          if (p.id === photo.id) continue;
          const d = distance(photo.coords, p.coords);
          if (d < 2 || d > maxDist) continue;
          const ang = Math.abs(turnAngle(want, bearing(photo.coords, p.coords)));
          if (ang > maxAngle) continue;
          const score = ang / 2 + Math.abs(d - 10);
          if (score < bestScore) {
            bestScore = score;
            best = p;
          }
        }
        return best;
      };
      const best = inSeq ?? pick(45, 35) ?? pick(75, 55);
      if (best) {
        setPhoto(best);
        // Blickrichtung beibehalten, wenn das neue Foto ungefähr in die gleiche Richtung zeigt
        if (best.compass !== null && Math.abs(turnAngle(want, best.compass)) < 70) setHeading(best.compass);
        else setHeading(want);
        setMessage(null);
      } else setMessage('In diese Richtung gibt es kein weiteres Foto.');
    } catch (e) {
      setMessage(mapillaryErrorText(e));
    } finally {
      setBusy(false);
    }
  };

  const turn = (deg: number) => setHeading((h) => (h + deg + 360) % 360);
  // Blickrichtung relativ zur Kamera: das Foto selbst kann nicht gedreht werden, deshalb ein Hinweis
  const offAxis = photo?.compass != null ? Math.round(turnAngle(photo.compass, heading)) : 0;

  return (
    <div className="street-view" role="dialog" aria-modal="true" aria-label="Straßenansicht">
      <div className="sv-image">
        {photo ? <img src={photo.url} alt="Straßenfoto" /> : <div className="sv-empty">{message}</div>}
        {photo && (
          <MiniMap
            segments={segments}
            position={photo.coords}
            heading={heading}
            onTap={(p) => void jumpTo(p)}
            className="sv-mini"
          />
        )}
        <button type="button" className="icon-btn sv-close" onClick={onClose} aria-label="Zur Karte">
          ✕
        </button>
        {photo && (message || Math.abs(offAxis) > 45) && (
          <span className="sv-message">{message ?? `Blick ${offAxis > 0 ? 'nach rechts' : 'nach links'} gedreht – „Vor“ geht in diese Richtung.`}</span>
        )}
      </div>

      <div className="sv-controls">
        <button type="button" className="btn" onClick={() => turn(-90)} disabled={!photo || busy} aria-label="Nach links drehen">
          ↺
        </button>
        <button type="button" className="btn" onClick={() => move('back')} disabled={!photo || busy} aria-label="Zurück gehen">
          ▼
        </button>
        <button type="button" className="btn primary" onClick={() => move('forward')} disabled={!photo || busy} aria-label="Vorwärts gehen">
          ▲ Vor
        </button>
        <button type="button" className="btn" onClick={() => turn(90)} disabled={!photo || busy} aria-label="Nach rechts drehen">
          ↻
        </button>
      </div>

      <div className="sp-bottom">
        {photo && (
          <button type="button" className="link-btn" onClick={() => onRate(photo.coords, photo)}>
            ⭐ Diese Stelle bewerten
          </button>
        )}
        {photo && (
          <span className="fineprint">
            {photo.night ? '🌙 Nachtfoto' : '☀ Tagfoto'}, {photo.capturedAt ? new Date(photo.capturedAt).toLocaleDateString('de-AT', { month: 'long', year: 'numeric' }) : 'Datum unbekannt'} · Foto:{' '}
            {photo.creator ? `© ${photo.creator}, ` : ''}
            <a href={photoPageUrl(photo.id)} target="_blank" rel="noreferrer">
              Mapillary
            </a>
            , CC BY-SA 4.0
          </span>
        )}
      </div>
    </div>
  );
}
