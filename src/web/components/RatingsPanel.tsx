import { REASONS, SCORE_LABELS, WEEKDAY_SHORT, type Rating } from '../../core/ratings';
import type { LngLat } from '../../core/types';
import { Modal } from './Modal';

export type RatingsView = 'time' | 'all' | 'off';

interface Props {
  ratings: Rating[];
  view: RatingsView;
  onViewChange: (v: RatingsView) => void;
  /** Beschriftung der gewählten Zeit, z. B. „Sa, 02:00“ */
  timeLabel: string;
  visibleCount: number;
  onStartRating: () => void;
  onDelete: (id: string) => void;
  onFocus: (p: LngLat) => void;
  onClose: () => void;
}

/** Bewertungen: neue abgeben, auf der Karte filtern, eigene verwalten */
export function RatingsPanel({ ratings, view, onViewChange, timeLabel, visibleCount, onStartRating, onDelete, onFocus, onClose }: Props) {
  const sorted = [...ratings].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <Modal title="Bewertungen" onClose={onClose}>
      <button type="button" className="btn primary big" onClick={onStartRating}>
        ⭐ Stelle auf der Karte bewerten
      </button>
      <p className="fineprint">Danach auf einen Weg, einen Ort oder eine Haltestelle tippen.</p>

      <section className="settings-section">
        <h3>Auf der Karte zeigen</h3>
        <div className="tp-row" role="radiogroup" aria-label="Bewertungen filtern">
          {(
            [
              ['time', `Zur gewählten Zeit (${timeLabel})`],
              ['all', 'Alle Zeiten'],
              ['off', 'Aus'],
            ] as const
          ).map(([v, label]) => (
            <button key={v} type="button" role="radio" aria-checked={view === v} className={`chip ${view === v ? 'active' : ''}`} onClick={() => onViewChange(v)}>
              {label}
            </button>
          ))}
        </div>
        <p className="fineprint">
          {view === 'off' ? 'Bewertungen sind ausgeblendet.' : `${visibleCount} von ${ratings.length} Bewertungen sichtbar.`} „Zur gewählten Zeit“ zeigt Bewertungen ±2 Stunden, an ähnlichen Tagen
          (Werktag bzw. Wochenend-Nacht). Die Uhrzeit stellst du unten bei „Losgehen“ ein.
        </p>
      </section>

      <section className="settings-section">
        <h3>Meine Bewertungen ({ratings.length})</h3>
        {sorted.length === 0 && <p className="muted">Noch keine Bewertungen.</p>}
        <ul className="rating-list">
          {sorted.map((r) => (
            <li key={r.id}>
              <button type="button" className="link-btn" onClick={() => onFocus(r.coords)}>
                {r.target.name || 'Ort ohne Namen'}
              </button>
              <span>
                <b>{r.score}</b> – {SCORE_LABELS[r.score]} · {WEEKDAY_SHORT[r.weekday]} {r.hour}:00
              </span>
              {(r.reasons.length > 0 || r.note) && (
                <span className="muted">
                  {r.reasons.map((x) => REASONS[x]).join(', ')}
                  {r.note ? ` · „${r.note}“` : ''}
                </span>
              )}
              <button type="button" className="link-btn" onClick={() => window.confirm('Diese Bewertung löschen?') && onDelete(r.id)}>
                Löschen
              </button>
            </li>
          ))}
        </ul>
        <p className="fineprint">
          Bewertungen fließen in die Farben und in die sicherste Route ein. Sie sind nur auf diesem Gerät gespeichert; später sollen sie mit anderen geteilt werden können (mit Moderation).
        </p>
      </section>
    </Modal>
  );
}
