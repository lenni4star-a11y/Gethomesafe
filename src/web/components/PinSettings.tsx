import { useState } from 'react';
import { hashPin } from '../signals';
import { SILENT_ALARM_AVAILABLE } from '../silentAlarm';
import { PinPad } from './PinPad';

/** PIN zweimal eingeben lassen und als Prüfwert (Hash) zurückgeben. Nie im Klartext speichern. */
export function PinSetupFlow({
  title,
  forbiddenHash,
  forbiddenMessage,
  onDone,
  onCancel,
}: {
  title: string;
  /** diese PIN ist nicht erlaubt (App-PIN und Täuschungs-PIN müssen verschieden sein) */
  forbiddenHash?: string | null;
  forbiddenMessage?: string;
  onDone: (hash: string) => void;
  onCancel: () => void;
}) {
  const [step, setStep] = useState<'first' | 'repeat'>('first');
  const [first, setFirst] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <PinPad
      title={step === 'first' ? title : 'Noch einmal'}
      text={step === 'first' ? 'Mindestens 4 Ziffern' : 'Bitte wiederholen'}
      confirmLabel={step === 'first' ? 'Weiter' : 'Speichern'}
      error={error}
      onCancel={onCancel}
      onSubmit={async (p) => {
        if (step === 'first') {
          if (forbiddenHash && (await hashPin(p)) === forbiddenHash) {
            setError(forbiddenMessage ?? 'Bitte wähle eine andere PIN.');
            return;
          }
          setFirst(p);
          setError(null);
          setStep('repeat');
        } else if (p === first) {
          onDone(await hashPin(p));
        } else {
          setError('Stimmt nicht überein. Bitte neu.');
          setStep('first');
        }
      }}
    />
  );
}

interface Props {
  appPinHash: string | null;
  decoyPinHash: string | null;
  onAppPin: (hash: string) => void;
  onDecoyPin: (hash: string | null) => void;
  /** während einer Begleitung nicht änderbar */
  locked?: boolean;
}

/** Eine PIN für die ganze App (Begleitung beenden, Fehlalarm abbrechen) und optional die Täuschungs-PIN */
export function PinSettings({ appPinHash, decoyPinHash, onAppPin, onDecoyPin, locked = false }: Props) {
  const [edit, setEdit] = useState<'app' | 'decoy' | null>(null);
  return (
    <section className="settings-section">
      <h3>PIN</h3>
      <p className="fineprint">Damit beendest du die Begleitung. {locked ? 'Während einer Begleitung nicht änderbar.' : 'Vergessen? Einfach neu festlegen.'}</p>
      <div className="tp-row">
        <button type="button" className="chip" disabled={locked} onClick={() => setEdit('app')}>
          {appPinHash ? 'PIN ändern' : 'PIN festlegen'}
        </button>
        <button type="button" className="chip" disabled={locked} onClick={() => setEdit('decoy')}>
          {decoyPinHash ? 'Täuschungs-PIN ändern' : 'Täuschungs-PIN'}
        </button>
        {decoyPinHash && (
          <button type="button" className="chip" disabled={locked} onClick={() => onDecoyPin(null)}>
            Täuschungs-PIN entfernen
          </button>
        )}
      </div>
      {edit === 'decoy' && (
        <p className="fineprint">
          Die Täuschungs-PIN beendet die Begleitung scheinbar normal, falls dich jemand zwingt.
          {!SILENT_ALARM_AVAILABLE && <b> Im Prototyp benachrichtigt sie noch niemanden.</b>}
        </p>
      )}
      {edit === 'app' && (
        <PinSetupFlow
          title="PIN festlegen"
          forbiddenHash={decoyPinHash}
          forbiddenMessage="Das ist deine Täuschungs-PIN. Bitte eine andere."
          onCancel={() => setEdit(null)}
          onDone={(h) => (onAppPin(h), setEdit(null))}
        />
      )}
      {edit === 'decoy' && (
        <PinSetupFlow
          title="Täuschungs-PIN"
          forbiddenHash={appPinHash}
          forbiddenMessage="Das ist deine normale PIN. Bitte eine andere."
          onCancel={() => setEdit(null)}
          onDone={(h) => (onDecoyPin(h), setEdit(null))}
        />
      )}
    </section>
  );
}
