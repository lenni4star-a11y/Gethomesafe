import { useEffect, useRef, useState } from 'react';
import { canListen, listenForAnswer, ring, speak, stopSpeaking } from '../signals';

interface Props {
  /** 'fake' = zum Beschäftigt-Wirken / Reden, 'check' = Rückfrage der Begleitung */
  kind: 'fake' | 'check';
  caller: string;
  /** Sekunden bis zum automatischen Ende ohne Annehmen (nur check) */
  secondsLeft?: number | null;
  onAnswer?: (ok: boolean) => void;
  onHangup: () => void;
}

const FAKE_SCRIPT = [
  'Hey, ich bin’s! Schön, dass du abhebst.',
  'Wo bist du gerade? Bist du schon auf dem Heimweg?',
  'Okay. Ich bleib einfach dran, bis du zu Hause bist.',
  'Erzähl mal, wie war dein Abend?',
  'Mhm. Ja. Das klingt gut.',
  'Ich bin da. Sag Bescheid, wenn du angekommen bist.',
];

const CHECK_TEXT = 'Hallo, hier ist deine Begleitung von Gethomesafe. Ist alles okay bei dir? Wie fühlst du dich gerade? Sag einfach „gut“ oder „nicht gut“, oder tipp auf einen Knopf.';

/** Simulierter Anruf: Klingeln, Annehmen, Stimme aus dem Browser */
export function CallScreen({ kind, caller, secondsLeft, onAnswer, onHangup }: Props) {
  const [accepted, setAccepted] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [listening, setListening] = useState(false);
  const stopRing = useRef<() => void>();
  const active = useRef(true);

  useEffect(() => {
    stopRing.current = ring();
    return () => {
      active.current = false;
      stopRing.current?.();
      stopSpeaking();
    };
  }, []);

  useEffect(() => {
    if (!accepted) return;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [accepted]);

  const accept = async () => {
    stopRing.current?.();
    setAccepted(true);
    if (kind === 'fake') {
      for (const line of FAKE_SCRIPT) {
        if (!active.current) return;
        await speak(line);
        await new Promise((r) => setTimeout(r, 3500));
      }
      return;
    }
    await speak(CHECK_TEXT);
    if (!active.current || !canListen()) return;
    setListening(true);
    const { result } = listenForAnswer();
    const ok = await result;
    setListening(false);
    if (!active.current || ok === null) return;
    await speak(ok ? 'Schön. Ich begleite dich weiter.' : 'Okay. Ich helfe dir jetzt, jemanden zu benachrichtigen.');
    onAnswer?.(ok);
  };

  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');

  return (
    <div className="call-screen" role="dialog" aria-modal="true" aria-label={`Anruf von ${caller}`}>
      <div className="call-top">
        <div className="call-avatar" aria-hidden>
          {caller.slice(0, 1)}
        </div>
        <div className="call-name">{caller}</div>
        <div className="call-status">
          {accepted ? `${mm}:${ss}` : kind === 'check' ? 'Rückfrage deiner Begleitung' : 'Mobil'}
          {!accepted && kind === 'check' && secondsLeft != null && ` · noch ${secondsLeft} s`}
        </div>
      </div>

      {kind === 'check' && (
        <div className="call-answers">
          <button type="button" className="btn big ok" onClick={() => onAnswer?.(true)}>
            Alles gut
          </button>
          <button type="button" className="btn big danger" onClick={() => onAnswer?.(false)}>
            Nicht gut
          </button>
          {listening && <p className="muted" role="status">Ich höre zu … sag „gut“ oder „nicht gut“.</p>}
        </div>
      )}

      <div className="call-buttons">
        {!accepted && (
          <button type="button" className="call-btn accept" onClick={accept} aria-label="Annehmen">
            📞
          </button>
        )}
        {kind === 'fake' && (
          <button type="button" className="call-btn hangup" onClick={onHangup} aria-label="Auflegen">
            📞
          </button>
        )}
      </div>
    </div>
  );
}
