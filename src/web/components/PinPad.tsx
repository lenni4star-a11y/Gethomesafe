import { useState } from 'react';

interface Props {
  title: string;
  text?: string;
  /** Länge 4–6 */
  maxLength?: number;
  error?: string | null;
  confirmLabel?: string;
  onSubmit: (pin: string) => void;
  onCancel: () => void;
}

/** Ziffernblock wie eine Handy-Sperre: Punkte oben, 3×4 Tasten, „Bestätigen“ unten über die ganze Breite */
export function PinPad({ title, text, maxLength = 6, error, confirmLabel = 'Bestätigen', onSubmit, onCancel }: Props) {
  const [pin, setPin] = useState('');
  const press = (d: string) => setPin((p) => (p.length < maxLength ? p + d : p));
  const del = () => setPin((p) => p.slice(0, -1));
  const submit = () => {
    if (pin.length < 4) return;
    onSubmit(pin);
    setPin('');
  };

  return (
    <div className="pinpad-screen" role="dialog" aria-modal="true" aria-label={title}>
      <div className="pinpad">
        <h2>{title}</h2>
        {text && <p className="pinpad-text">{text}</p>}
        <div className="pin-dots" aria-label={`${pin.length} Ziffern eingegeben`}>
          {Array.from({ length: Math.max(4, Math.min(maxLength, Math.max(4, pin.length))) }, (_, i) => (
            <span key={i} className={i < pin.length ? 'filled' : ''} />
          ))}
        </div>
        <p className="pin-error" role="alert">
          {error ?? ''}
        </p>
        <div className="keys">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
            <button key={d} type="button" className="key" onClick={() => press(d)}>
              {d}
            </button>
          ))}
          <button type="button" className="key key-small" onClick={onCancel}>
            Zurück
          </button>
          <button type="button" className="key" onClick={() => press('0')}>
            0
          </button>
          <button type="button" className="key key-small" onClick={del} aria-label="Letzte Ziffer löschen">
            ⌫
          </button>
        </div>
        <button type="button" className="btn primary pin-confirm" onClick={submit} disabled={pin.length < 4}>
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}
