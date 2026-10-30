import { useMemo } from 'react';

interface Props {
  /** null = jetzt */
  value: Date | null;
  onChange: (d: Date | null) => void;
}

const WEEKDAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const pad = (n: number) => String(n).padStart(2, '0');

function dayLabel(d: Date, offset: number): string {
  if (offset === 0) return 'Heute';
  if (offset === 1) return 'Morgen';
  return WEEKDAYS[d.getDay()];
}

/** Nächster Termin an Wochentag (0 = So) zur Uhrzeit, ab jetzt */
export function nextAt(weekday: number, hour: number, minute = 0, from = new Date()): Date {
  const d = new Date(from);
  d.setHours(hour, minute, 0, 0);
  let add = (weekday - d.getDay() + 7) % 7;
  if (add === 0 && d < from) add = 7;
  d.setDate(d.getDate() + add);
  return d;
}

/** Losgeh-Zeit: jetzt oder ein späterer Zeitpunkt (Tag + Uhrzeit) */
export function TimePicker({ value, onChange }: Props) {
  const now = new Date();
  const days = useMemo(() => {
    const out: { offset: number; date: Date }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() + i);
      out.push({ offset: i, date: d });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now.toDateString()]);

  const current = value ?? now;
  const dayOffset = Math.max(0, Math.round((new Date(current).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / 86400000));
  const time = `${pad(current.getHours())}:${pad(current.getMinutes())}`;

  const set = (offset: number, hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + offset);
    d.setHours(h || 0, m || 0);
    onChange(d);
  };

  const presets = [
    { label: 'Heute 23:00', date: () => nextAt(now.getDay(), 23, 0) },
    { label: 'Fr 23:00', date: () => nextAt(5, 23) },
    { label: 'Sa 2:00', date: () => nextAt(6, 2) },
    { label: 'So 4:00', date: () => nextAt(0, 4) },
  ];

  return (
    <div className="timepicker">
      <div className="tp-row">
        <button type="button" className={`chip ${value === null ? 'active' : ''}`} aria-pressed={value === null} onClick={() => onChange(null)}>
          Jetzt
        </button>
        <label className="tp-field">
          <span className="sr-only">Tag</span>
          <select value={value === null ? '' : dayOffset} onChange={(e) => set(Number(e.target.value), time)}>
            {value === null && <option value="">Tag wählen</option>}
            {days.map((d) => (
              <option key={d.offset} value={d.offset}>
                {dayLabel(d.date, d.offset)}, {d.date.getDate()}.{d.date.getMonth() + 1}.
              </option>
            ))}
          </select>
        </label>
        <label className="tp-field">
          <span className="sr-only">Uhrzeit</span>
          <input type="time" value={time} step={300} onChange={(e) => e.target.value && set(value === null ? 0 : dayOffset, e.target.value)} />
        </label>
      </div>
      <div className="tp-row presets" aria-label="Schnellauswahl">
        {presets.map((p) => (
          <button key={p.label} type="button" className="chip small" onClick={() => onChange(p.date())}>
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}
