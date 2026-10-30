import { useState } from 'react';
import type { Contact } from '../../core/contacts';
import { secondsLeft, secondsUntilCheck, type EscortEvent } from '../../core/escort';
import type { EscortSession, LastPosition } from '../useEscort';
import type { VoiceMode } from '../signals';
import { CallScreen } from './CallScreen';
import { ContactActions, EmergencyButtons, SilentCallHint } from './EmergencyMenu';
import { PinDialog } from './PinDialog';

interface Props {
  session: EscortSession;
  now: number;
  lastPos: LastPosition | null;
  geoError: string | null;
  contacts: Contact[];
  dispatch: (e: EscortEvent) => void;
  checkPin: (pin: string) => Promise<boolean>;
  /** nach erfolgreicher PIN: Begleitung beenden */
  onEnd: (arrived: boolean) => void;
  onTalkCall: () => void;
  voiceMode: VoiceMode;
  awayFor: number | null;
  onClearAway: () => void;
}

/** Laufende Begleitung mit Eskalationsstufen */
export function EscortView({ session, now, lastPos, geoError, contacts, dispatch, checkPin, onEnd, onTalkCall, voiceMode, awayFor, onClearAway }: Props) {
  const [pinFor, setPinFor] = useState<'arrive' | 'cancel' | 'cancelAlarm' | null>(null);
  const { state } = session;
  const chosen = contacts.filter((c) => session.contactIds.includes(c.id));
  const until = secondsUntilCheck(state, now);
  const left = secondsLeft(state, now);
  const posAge = lastPos ? Math.round((now - lastPos.time) / 1000) : null;

  const pinDialog = pinFor && (
    <PinDialog
      title={pinFor === 'arrive' ? 'Angekommen?' : pinFor === 'cancel' ? 'Begleitung beenden' : 'Fehlalarm abbrechen'}
      text={pinFor === 'cancelAlarm' ? 'Gib deine PIN ein, um den Alarm abzubrechen. Die Begleitung läuft dann weiter.' : 'Gib deine PIN ein, um die Begleitung zu beenden.'}
      check={checkPin}
      onClose={() => setPinFor(null)}
      onSuccess={() => {
        const f = pinFor;
        setPinFor(null);
        if (f === 'cancelAlarm') dispatch({ type: 'cancelAlarm', now: Date.now() });
        else onEnd(f === 'arrive');
      }}
    />
  );

  if (state.phase === 'call')
    return (
      <CallScreen
        key={state.callAttempt}
        kind="check"
        voiceMode={voiceMode}
        caller="Gethomesafe Begleitung"
        secondsLeft={left}
        onAnswer={(ok) => dispatch({ type: 'answer', ok, now: Date.now() })}
        onHangup={() => {}}
      />
    );

  if (state.phase === 'contact' || state.phase === 'emergency')
    return (
      <div className="escort-alarm flash" role="alertdialog" aria-modal="true" aria-label="Alarm">
        {state.phase === 'contact' ? (
          <>
            <h2>{state.reason === 'not_ok' ? 'Lass uns Hilfe holen' : 'Du hast nicht geantwortet'}</h2>
            {chosen.length > 0 ? (
              <>
                <p>Benachrichtige jetzt deine Kontakte. Die Nachricht mit deinem Standort ist schon vorbereitet.</p>
                {chosen.map((c) => (
                  <ContactActions key={c.id} contact={c} kind="help" lastPosition={lastPos} />
                ))}
              </>
            ) : (
              <p>Du hast keine Notfallkontakte ausgewählt.</p>
            )}
            <p className="demo-note">
              Demo-Hinweis: Im Prototyp werden Nachrichten nicht automatisch verschickt. SMS oder WhatsApp öffnet sich, du musst selbst auf Senden tippen.
            </p>
            <button type="button" className="btn danger big" onClick={() => dispatch({ type: 'emergency', now: Date.now() })}>
              Weiter zum Notruf
            </button>
          </>
        ) : (
          <>
            <h2>Notruf</h2>
            <EmergencyButtons />
            <p className="fineprint">Die App ruft nie selbst die Polizei. Du entscheidest.</p>
            <SilentCallHint />
            {chosen.map((c) => (
              <ContactActions key={c.id} contact={c} kind="help" lastPosition={lastPos} />
            ))}
          </>
        )}
        <button type="button" className="btn" onClick={() => setPinFor('cancelAlarm')}>
          Fehlalarm abbrechen (PIN)
        </button>
        {pinDialog}
      </div>
    );

  return (
    <section className="escort-panel" aria-label="Begleitung">
      <div className="escort-head">
        <span className="live-dot" aria-hidden /> Begleitung aktiv · {session.destination}
      </div>

      {state.settings.mode === 'interval' ? (
        <button type="button" className="ok-button" onClick={() => dispatch({ type: 'ok', now: Date.now() })}>
          <b>Alles okay</b>
          <span>{until !== null ? `nächste Frage in ${until} s` : ''}</span>
        </button>
      ) : (
        <button
          type="button"
          className={`hold-button ${state.holding ? 'holding' : ''}`}
          onPointerDown={(e) => {
            (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
            dispatch({ type: 'hold', down: true, now: Date.now() });
          }}
          onPointerUp={() => dispatch({ type: 'hold', down: false, now: Date.now() })}
          onPointerCancel={() => dispatch({ type: 'hold', down: false, now: Date.now() })}
          onContextMenu={(e) => e.preventDefault()}
        >
          <b>{state.holding ? 'Ich bin da' : 'Gedrückt halten'}</b>
          <span>{state.holding ? 'Loslassen startet eine Rückfrage' : until !== null ? `Bitte halten · Rückfrage in ${until} s` : ''}</span>
        </button>
      )}

      <div className="escort-actions">
        <button type="button" className="btn primary" onClick={() => setPinFor('arrive')}>
          Ich bin angekommen
        </button>
        <button type="button" className="btn" onClick={onTalkCall}>
          📞 Anruf zum Reden
        </button>
        <button type="button" className="btn danger" onClick={() => dispatch({ type: 'help', now: Date.now() })}>
          Ich brauche Hilfe
        </button>
      </div>

      {awayFor !== null && (
        <div className="notice">
          Die App war {awayFor >= 120 ? `${Math.round(awayFor / 60)} Minuten` : `${awayFor} Sekunden`} im Hintergrund oder gesperrt. In dieser Zeit war die Begleitung pausiert.{' '}
          <button type="button" className="link-btn" onClick={onClearAway}>
            Verstanden
          </button>
        </div>
      )}
      <p className="fineprint">
        {geoError ?? (posAge !== null ? `Standort aktualisiert vor ${posAge} s (nur letzte Position gespeichert).` : 'Standort wird gesucht …')} Bildschirm anlassen: Bei gesperrtem Bildschirm pausiert die Begleitung.
      </p>
      <button type="button" className="link-btn" onClick={() => setPinFor('cancel')}>
        Begleitung abbrechen (PIN)
      </button>

      {state.phase === 'prompt' && (
        <div className="prompt flash" role="alertdialog" aria-modal="true" aria-label="Alles okay?">
          <h2>Alles okay?</h2>
          <p>Noch {left ?? 0} Sekunden, dann ruft dich deine Begleitung an.</p>
          <button type="button" className="btn ok big" onClick={() => dispatch({ type: 'ok', now: Date.now() })}>
            Ja, alles okay
          </button>
          <button type="button" className="btn danger big" onClick={() => dispatch({ type: 'help', now: Date.now() })}>
            Nein, ich brauche Hilfe
          </button>
        </div>
      )}
      {pinDialog}
    </section>
  );
}
