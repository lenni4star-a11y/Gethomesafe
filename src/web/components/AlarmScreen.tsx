import { useEffect } from 'react';
import { keepScreenOn, loop, vibrate } from '../signals';

/** Lauter Alarm: Sirene in Schleife, blinkender Bildschirm, Vibration (Android) */
export function AlarmScreen({ onStop }: { onStop: () => void }) {
  useEffect(() => {
    const stop = loop('siren');
    let release: (() => void) | undefined;
    keepScreenOn().then((r) => (release = r));
    vibrate([1000, 300, 1000, 300, 1000]);
    const id = setInterval(() => vibrate([1000, 300, 1000, 300, 1000]), 4000);
    return () => {
      stop();
      clearInterval(id);
      vibrate(0);
      release?.();
    };
  }, []);

  return (
    <div className="alarm-screen" role="alertdialog" aria-modal="true" aria-label="Alarm läuft">
      <div className="alarm-text">ALARM</div>
      <a className="emergency-btn alarm-call" href="tel:112">
        <b>112</b>
        <span>Euronotruf anrufen</span>
      </a>
      <button type="button" className="btn big alarm-stop" onClick={onStop}>
        Alarm beenden
      </button>
    </div>
  );
}
