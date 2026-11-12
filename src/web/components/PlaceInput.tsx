import { useEffect, useId, useRef, useState } from 'react';
import { searchAddress, searchStops, searchVenues, type Place } from '../geocode';
import { currentCity } from '../region';
import { SvgIcon } from './Icon';

interface Props {
  label: string;
  value: Place | null;
  onChange: (p: Place | null) => void;
  bbox: [number, number, number, number];
  onLocate?: () => void;
  onPickOnMap: () => void;
  picking: boolean;
  /** Knopf „auf der Karte wählen“ ausblenden */
  hidePick?: boolean;
}

export function PlaceInput({ label, value, onChange, bbox, onLocate, onPickOnMap, picking, hidePick }: Props) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<Place[]>([]);
  const [busy, setBusy] = useState(false);
  const listId = useId();
  const inputId = useId();
  const abort = useRef<AbortController>();

  useEffect(() => {
    setText(value?.label ?? '');
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const q = text.trim();
    if (q.length < 2 || q === value?.label) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      abort.current?.abort();
      abort.current = new AbortController();
      setBusy(true);
      try {
        const [stops, venues, addresses] = await Promise.all([
          searchStops(q, bbox),
          searchVenues(q, currentCity()).catch(() => []),
          searchAddress(q, bbox, abort.current.signal).catch(() => []),
        ]);
        // Doppelte (gleicher Name, fast gleiche Lage) aus der Adresssuche weglassen
        const dup = (a: Place) => venues.some((v) => v.label === a.label && Math.abs(v.coords[0] - a.coords[0]) < 0.002 && Math.abs(v.coords[1] - a.coords[1]) < 0.002);
        setResults([...venues, ...stops, ...addresses.filter((a) => !dup(a))].slice(0, 10));
      } finally {
        setBusy(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [text, open, bbox, value]);

  return (
    <div className="place-input">
      <label htmlFor={inputId} className="place-label">
        {label}
      </label>
      <div className="place-row">
        <input
          id={inputId}
          type="search"
          role="combobox"
          aria-expanded={open && results.length > 0}
          aria-controls={listId}
          autoComplete="off"
          placeholder="Adresse, Bar, Club oder Haltestelle"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
            if (!e.target.value) onChange(null);
          }}
          onFocus={(e) => {
            setOpen(true);
            e.target.select();
          }}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
        />
        {onLocate && (
          <button type="button" className="icon-btn" onClick={onLocate} aria-label="Meinen Standort verwenden" title="Mein Standort">
            ◎
          </button>
        )}
        {!hidePick && <button
          type="button"
          className={`icon-btn ${picking ? 'active' : ''}`}
          onClick={onPickOnMap}
          aria-pressed={picking}
          aria-label={`${label} auf der Karte wählen`}
          title="Auf der Karte wählen"
        >
          ⌖
        </button>}
      </div>
      {open && (results.length > 0 || busy) && (
        <ul id={listId} className="suggestions" role="listbox">
          {busy && results.length === 0 && <li className="muted">Suche …</li>}
          {results.map((r, i) => (
            <li key={i} role="option" aria-selected={false}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(r);
                  setOpen(false);
                }}
              >
                <span className="sugg-label">
                  {r.kind === 'stop' ? <SvgIcon name="tram" /> : r.kind === 'venue' ? <SvgIcon name="people" /> : null}
                  {r.label}
                </span>
                {r.detail && <span className="sugg-detail">{r.detail}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
