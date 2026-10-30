import { useEffect, useRef, useState } from 'react';
import { canListen, listenForAnswer, ring, say, stopSpeaking, type VoiceClip, type VoiceMode } from '../signals';

interface Props {
  /** 'fake' = zum Beschäftigt-Wirken / Reden, 'check' = Rückfrage der Begleitung */
  kind: 'fake' | 'check';
  caller: string;
  voiceMode?: VoiceMode;
  /** Sekunden bis „keine Antwort“ (nur check) */
  secondsLeft?: number | null;
  onAnswer?: (ok: boolean) => void;
  onHangup: () => void;
}

type Line = { text: string; clip: VoiceClip; pause: number };

const FAKE_SCRIPT: Line[] = [
  { text: 'Hey, ich bin’s! Schön, dass du abhebst.', clip: 'fake-1', pause: 2500 },
  { text: 'Wo bist du gerade? Bist du schon auf dem Heimweg?', clip: 'fake-2', pause: 4000 },
  { text: 'Okay. Ich bleib einfach dran, bis du zu Hause bist.', clip: 'fake-3', pause: 3500 },
  { text: 'Erzähl mal, wie war dein Abend?', clip: 'fake-4', pause: 6000 },
  { text: 'Mhm. Ja. Das klingt gut.', clip: 'fake-5', pause: 5000 },
  { text: 'Ich bin da. Sag Bescheid, wenn du angekommen bist.', clip: 'fake-6', pause: 8000 },
];

const CHECK_SCRIPT: Line[] = [
  { text: 'Hallo, hier ist deine Begleitung von Gethomesafe.', clip: 'check-hallo', pause: 300 },
  { text: 'Ist alles okay bei dir?', clip: 'check-okay', pause: 300 },
  { text: 'Wie fühlst du dich gerade? Sag einfach „gut“ oder „nicht gut“. Oder tipp auf einen Knopf.', clip: 'check-gefuehl', pause: 0 },
];

/** Simulierter Anruf mit Klingelton, Stimme und Untertiteln */
export function CallScreen({ kind, caller, voiceMode = 'auto', secondsLeft, onAnswer, onHangup }: Props) {
  const [accepted, setAccepted] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [subtitle, setSubtitle] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [silent, setSilent] = useState(false);
  const stopRing = useRef<() => void>();
  const active = useRef(true);

  useEffect(() => {
    active.current = true;
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

  const speakLine = async (l: Line) => {
    setSubtitle(l.text);
    const how = await say(l.text, l.clip, voiceMode);
    if (how === 'none') setSilent(true);
  };

  const accept = async () => {
    stopRing.current?.();
    setAccepted(true);
    const script = kind === 'fake' ? FAKE_SCRIPT : CHECK_SCRIPT;
    for (const l of script) {
      if (!active.current) return;
      await speakLine(l);
      await new Promise((r) => setTimeout(r, l.pause));
    }
    if (kind !== 'check' || !active.current || !canListen()) return;
    setListening(true);
    const ok = await listenForAnswer().result;
    setListening(false);
    if (!active.current || ok === null) return;
    await speakLine(ok ? { text: 'Schön. Ich begleite dich weiter.', clip: 'check-weiter', pause: 0 } : { text: 'Okay. Ich helfe dir jetzt, jemanden zu benachrichtigen.', clip: 'check-hilfe', pause: 0 });
    onAnswer?.(ok);
  };

  const decline = () => {
    stopRing.current?.();
    onHangup();
  };

  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');

  return (
    <div className={`call-screen ${accepted ? 'in-call' : 'ringing'}`} role="dialog" aria-modal="true" aria-label={`Anruf von ${caller}`}>
      <div className="call-top">
        <div className="call-status">{accepted ? `${mm}:${ss}` : kind === 'check' ? 'Rückfrage deiner Begleitung' : 'Mobil'}</div>
        <div className="call-name">{caller}</div>
        {!accepted && kind === 'check' && secondsLeft != null && <div className="call-status">noch {secondsLeft} s</div>}
        <div className="call-avatar" aria-hidden>
          {caller.slice(0, 1)}
        </div>
      </div>

      <div className="call-middle">
        {accepted && (
          <div className="subtitle" aria-live="polite">
            {subtitle ?? '…'}
            {silent && <small>Ton nicht verfügbar. Bitte Lautstärke prüfen, die Untertitel laufen weiter.</small>}
          </div>
        )}
        {kind === 'check' && (
          <div className="call-answers">
            <button type="button" className="btn big ok" onClick={() => onAnswer?.(true)}>
              Alles gut
            </button>
            <button type="button" className="btn big danger" onClick={() => onAnswer?.(false)}>
              Nicht gut
            </button>
            {listening && (
              <p className="muted" role="status">
                Ich höre zu … sag „gut“ oder „nicht gut“.
              </p>
            )}
          </div>
        )}
        {kind === 'fake' && accepted && (
          <div className="call-grid" aria-hidden>
            {['stumm', 'Tasten', 'Lautspr.', 'Hinzuf.', 'FaceTime', 'Kontakte'].map((l) => (
              <span key={l}>
                <i />
                {l}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="call-buttons">
        {!accepted ? (
          <>
            {kind === 'fake' && (
              <span className="call-btn-wrap">
                <button type="button" className="call-btn hangup" onClick={decline} aria-label="Ablehnen">
                  <PhoneIcon />
                </button>
                Ablehnen
              </span>
            )}
            <span className="call-btn-wrap">
              <button type="button" className="call-btn accept" onClick={accept} aria-label="Annehmen">
                <PhoneIcon />
              </button>
              Annehmen
            </span>
          </>
        ) : (
          kind === 'fake' && (
            <span className="call-btn-wrap">
              <button type="button" className="call-btn hangup" onClick={decline} aria-label="Auflegen">
                <PhoneIcon />
              </button>
              Auflegen
            </span>
          )
        )}
      </div>
    </div>
  );
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" width="32" height="32" aria-hidden fill="currentColor">
      <path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.6a1 1 0 0 1-.25 1z" />
    </svg>
  );
}
