import { useState } from 'react';
import { noteWarning, REASONS, SCORE_LABELS, type Rating, type RatingTarget, type Reason } from '../../core/ratings';
import type { LngLat } from '../../core/types';
import { Modal } from './Modal';

interface Props {
  target: RatingTarget;
  coords: LngLat;
  /** Vorschlag für Wochentag/Uhrzeit (z. B. gewählte Losgeh-Zeit), sonst jetzt */
  when?: Date;
  onSave: (r: Omit<Rating, 'id' | 'version' | 'createdAt'>) => void;
  onClose: () => void;
}

const WEEKDAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const FACES = ['', '😟', '🙁', '😐', '🙂', '😌'];

const TARGET_LABEL: Record<RatingTarget['type'], string> = { edge: 'Wegstück', stop: 'Haltestelle', place: 'Ort' };

/** Abschnitt, Ort oder Station bewerten */
export function RatingForm({ target, coords, when, onSave, onClose }: Props) {
  const start = when ?? new Date();
  const [score, setScore] = useState<Rating['score'] | null>(null);
  const [weekday, setWeekday] = useState(start.getDay());
  const [hour, setHour] = useState(start.getHours());
  const [reasons, setReasons] = useState<Reason[]>([]);
  const [note, setNote] = useState('');
  const warning = noteWarning(note);

  return (
    <Modal title="Wie sicher hast du dich gefühlt?" onClose={onClose}>
      <p className="muted">
        {TARGET_LABEL[target.type]}: <b>{target.name || 'ohne Namen'}</b>
      </p>

      <div className="score-row" role="radiogroup" aria-label="Sicherheitsgefühl von 1 bis 5">
        {([1, 2, 3, 4, 5] as const).map((s) => (
          <button key={s} type="button" role="radio" aria-checked={score === s} className={`score-btn ${score === s ? 'active' : ''}`} onClick={() => setScore(s)}>
            <span aria-hidden>{FACES[s]}</span>
            <b>{s}</b>
            <small>{SCORE_LABELS[s]}</small>
          </button>
        ))}
      </div>

      <div className="pin-row">
        <label className="field">
          <span>Wochentag</span>
          <select value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>
            {WEEKDAYS.map((d, i) => (
              <option key={d} value={i}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Uhrzeit</span>
          <select value={hour} onChange={(e) => setHour(Number(e.target.value))}>
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {h}:00–{h}:59
              </option>
            ))}
          </select>
        </label>
      </div>

      <fieldset className="field reasons">
        <legend>Was war los? (optional)</legend>
        <div className="reason-chips">
          {(Object.keys(REASONS) as Reason[]).map((r) => (
            <label key={r} className={`chip ${reasons.includes(r) ? 'active' : ''}`}>
              <input
                type="checkbox"
                className="sr-only"
                checked={reasons.includes(r)}
                onChange={(e) => setReasons(e.target.checked ? [...reasons, r] : reasons.filter((x) => x !== r))}
              />
              {REASONS[r]}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="field">
        <span>Notiz (optional)</span>
        <textarea rows={2} maxLength={280} value={note} onChange={(e) => setNote(e.target.value)} placeholder="z. B. Unterführung sehr dunkel, niemand unterwegs" />
      </label>
      {warning && <p className="message">{warning}</p>}
      <p className="fineprint">Beschreibe den Ort und die Situation, nicht Menschen. Deine Bewertung bleibt auf diesem Gerät.</p>

      <button
        type="button"
        className="btn primary big"
        disabled={score === null}
        onClick={() => score && onSave({ target, coords, score, weekday, hour, reasons, note: note.trim() })}
      >
        Bewertung speichern
      </button>
    </Modal>
  );
}
