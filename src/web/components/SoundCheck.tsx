import { useState } from 'react';
import { canVibrate, germanVoice, isIOS, loop, say, unlockAudio, vibrate, type VoiceMode } from '../signals';

/** Testknöpfe für Ton, Vibration und Stimme */
export function SoundCheck({ voiceMode }: { voiceMode: VoiceMode }) {
  const [result, setResult] = useState<string | null>(null);

  const testSound = () => {
    unlockAudio();
    const stop = loop('ringtone');
    setResult('Klingelton läuft 4 Sekunden. Nichts gehört? Medienlautstärke hochdrehen (Lautstärketaste während der Ton läuft).');
    setTimeout(stop, 4000);
  };

  const testVibration = () => {
    if (!canVibrate()) {
      setResult(
        isIOS()
          ? 'Auf dem iPhone können Web-Apps nicht vibrieren. Die App nutzt stattdessen lauten Ton und einen blinkenden Bildschirm.'
          : 'Dieser Browser unterstützt keine Vibration.',
      );
      return;
    }
    const ok = vibrate([300, 150, 300]);
    setResult(
      ok
        ? 'Vibration gestartet. Nichts gespürt? In den Android-Einstellungen „Vibration“ bzw. „Haptisches Feedback“ einschalten und „Nicht stören“ prüfen.'
        : 'Der Browser hat die Vibration abgelehnt. Bitte zuerst irgendwo in die App tippen und nochmal versuchen.',
    );
  };

  const testVoice = async () => {
    unlockAudio();
    setResult('Stimme spricht …');
    const voice = await germanVoice();
    const how = await say('Hallo, hier ist deine Begleitung von Gethomesafe.', 'check-hallo', voiceMode);
    setResult(
      how === 'device'
        ? `Gerätestimme: ${voice?.name ?? 'deutsch'}.`
        : how === 'recording'
          ? 'Aufgenommene Stimme (keine deutsche Gerätestimme gefunden oder abgeschaltet).'
          : 'Es kam kein Ton. Bitte Lautstärke prüfen.',
    );
  };

  return (
    <div className="sound-check">
      <div className="tp-row">
        <button type="button" className="chip" onClick={testSound}>
          🔔 Testton
        </button>
        <button type="button" className="chip" onClick={testVibration}>
          📳 Vibration
        </button>
        <button type="button" className="chip" onClick={testVoice}>
          🗣 Stimme
        </button>
      </div>
      {result && (
        <p className="fineprint" role="status">
          {result}
        </p>
      )}
    </div>
  );
}
