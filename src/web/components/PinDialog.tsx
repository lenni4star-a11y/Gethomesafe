import { useState } from 'react';
import { Modal } from './Modal';

interface Props {
  title: string;
  text: string;
  check: (pin: string) => Promise<boolean>;
  onSuccess: () => void;
  onClose: () => void;
}

/** PIN abfragen, damit niemand anderes die Begleitung beenden kann */
export function PinDialog({ title, text, check, onSuccess, onClose }: Props) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const submit = async () => {
    if (await check(pin)) onSuccess();
    else {
      setError(true);
      setPin('');
    }
  };
  return (
    <Modal title={title} onClose={onClose}>
      <p>{text}</p>
      <label className="field">
        <span>PIN</span>
        <input
          type="password"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          maxLength={6}
          autoFocus
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          className="pin-input"
        />
      </label>
      {error && <p className="message">Die PIN stimmt nicht.</p>}
      <div className="actions">
        <button type="button" className="btn primary" onClick={submit} disabled={pin.length < 4}>
          Bestätigen
        </button>
        <button type="button" className="btn" onClick={onClose}>
          Zurück
        </button>
      </div>
    </Modal>
  );
}
