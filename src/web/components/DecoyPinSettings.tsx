import { useState } from 'react';
import { hashPin } from '../signals';
import { SILENT_ALARM_AVAILABLE } from '../silentAlarm';
import { PinPad } from './PinPad';

interface Props {
  decoyPinHash: string | null;
  onChange: (hash: string | null) => void;
}

/** Täuschungs-PIN festlegen oder entfernen */
export function DecoyPinSettings({ decoyPinHash, onChange }: Props) {
  const [step, setStep] = useState<'first' | 'repeat' | null>(null);
  const [first, setFirst] = useState('');
  const [error, setError] = useState<string | null>(null);

  return (
    <section className="settings-section">
      <h3>Täuschungs-PIN</h3>
      <p className="fineprint">
        Für den Fall, dass dich jemand zwingt, die Begleitung zu beenden: Gibst du statt deiner richtigen PIN die Täuschungs-PIN ein, sieht es so aus, als wäre
        alles normal beendet. Sie muss sich von deiner Begleitungs-PIN unterscheiden.
      </p>
      {!SILENT_ALARM_AVAILABLE && (
        <p className="demo-note">
          <b>Wichtig, im Prototyp:</b> Die Täuschungs-PIN benachrichtigt deine Kontakte noch <b>nicht</b>. Unbemerkt Nachrichten verschicken geht nur mit einem
          Server (geplant). Bis dahin zeigt sie nur das normale Ende an. Verlass dich nicht darauf.
        </p>
      )}
      <div className="tp-row">
        <button type="button" className="chip" onClick={() => (setError(null), setStep('first'))}>
          {decoyPinHash ? '✓ Festgelegt · ändern' : 'Täuschungs-PIN festlegen'}
        </button>
        {decoyPinHash && (
          <button type="button" className="chip" onClick={() => onChange(null)}>
            Entfernen
          </button>
        )}
      </div>
      {step && (
        <PinPad
          title={step === 'first' ? 'Täuschungs-PIN festlegen' : 'Täuschungs-PIN wiederholen'}
          text={step === 'first' ? 'Mindestens 4 Ziffern, anders als deine Begleitungs-PIN.' : 'Bitte noch einmal eingeben.'}
          confirmLabel={step === 'first' ? 'Weiter' : 'Speichern'}
          error={error}
          onCancel={() => setStep(null)}
          onSubmit={async (p) => {
            if (step === 'first') {
              setFirst(p);
              setError(null);
              setStep('repeat');
            } else if (p === first) {
              onChange(await hashPin(p));
              setStep(null);
            } else {
              setError('Die PINs stimmen nicht überein. Bitte neu festlegen.');
              setStep('first');
            }
          }}
        />
      )}
    </section>
  );
}
