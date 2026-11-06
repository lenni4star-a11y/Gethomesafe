import { useRef, useState } from 'react';
import type { Contact } from '../../core/contacts';
import { secondsLeft, secondsUntilCheck, type EscortEvent } from '../../core/escort';
import type { EscortSession, LastPosition } from '../useEscort';
import { formatDistance, formatDuration } from '../format';
import type { VoiceMode } from '../signals';
import { CallScreen } from './CallScreen';
import { ContactActions, EmergencyButtons, SilentCallHint } from './EmergencyMenu';
import { PinDialog } from './PinDialog';
import { LiveShareBox } from './LiveShareBox';
import type { useLiveShare } from '../liveShare';

interface Props {
  session: EscortSession;
  now: number;
  lastPos: LastPosition | null;
  geoError: string | null;
  contacts: Contact[];
  dispatch: (e: EscortEvent) => void;
  /** 'real' = echte PIN, 'decoy' = Täuschungs-PIN, null = falsch */
  checkPin: (pin: string) => Promise<'real' | 'decoy' | null>;
  /** nach erfolgreicher PIN: Begleitung beenden */
  /** nach richtiger PIN: Begleitung beenden. decoy = Täuschungs-PIN (sieht normal aus, stiller Alarm) */
  onEnd: (arrived: boolean, decoy: boolean) => void;
  /** bewusst anderen Weg gehen: Route ab hier neu berechnen */
  onReroute: () => void;
  /** Täuschungs-PIN beim Fehlalarm-Abbruch */
  onDecoy: () => void;
  onTalkCall: () => void;
  voiceMode: VoiceMode;
  awayFor: number | null;
  onClearAway: () => void;
  /** eingeklappt: nur Status, Restweg und Bestätigen */
  compact: boolean;
  onToggleCompact: () => void;
  remaining: { meters: number; seconds: number; offRoute: boolean } | null;
  live: ReturnType<typeof useLiveShare>;
}

/** Laufende Begleitung mit Eskalationsstufen */
export function EscortView({ session, now, lastPos, geoError, contacts, dispatch, checkPin, onEnd, onReroute, onDecoy, onTalkCall, voiceMode, awayFor, onClearAway, compact, onToggleCompact, remaining, live }: Props) {
  const pinKind = useRef<'real' | 'decoy' | null>(null);
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
      check={async (p) => {
        pinKind.current = await checkPin(p);
        return pinKind.current !== null;
      }}
      onClose={() => setPinFor(null)}
      onSuccess={() => {
        const f = pinFor;
        const decoy = pinKind.current === 'decoy';
        setPinFor(null);
        if (f === 'cancelAlarm') {
          dispatch({ type: 'cancelAlarm', now: Date.now() });
          if (decoy) onDecoy();
        } else onEnd(f === 'arrive', decoy);
      }}
    />
  );

  if (state.phase === 'call')
    return (
      <CallScreen
        key={state.callAttempt}
        kind="check"
        voiceMode={voiceMode}
        caller="Goodway Begleitung"
        secondsLeft={left}
        onAnswer={(ok) => dispatch({ type: 'answer', ok, now: Date.now() })}
        onAccept={() => dispatch({ type: 'callAccepted', now: Date.now() })}
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
                  <ContactActions key={c.id} contact={c} kind="help" lastPosition={lastPos} liveLink={live.link} />
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
              <ContactActions key={c.id} contact={c} kind="help" lastPosition={lastPos} liveLink={live.link} />
            ))}
          </>
        )}
        <button type="button" className="btn" onClick={() => setPinFor('cancelAlarm')}>
          Fehlalarm abbrechen (PIN)
        </button>
        {pinDialog}
      </div>
    );

  const holdHandlers = {
    onPointerDown: (e: React.PointerEvent) => {
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      dispatch({ type: 'hold', down: true, now: Date.now() });
    },
    onPointerUp: () => dispatch({ type: 'hold', down: false, now: Date.now() }),
    onPointerCancel: () => dispatch({ type: 'hold', down: false, now: Date.now() }),
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  };

  const minutes = Math.round((now - state.startedAt) / 60000);
  const summary = (
    <span className="escort-summary">
      <span className="live-dot" aria-hidden /> {session.destination} · seit {minutes} min{live.link ? ' · 🔗 Live-Link aktiv' : ''}
      {remaining && (
        <>
          {' '}
          · noch {formatDistance(remaining.meters)} (ca. {formatDuration(remaining.seconds)}){remaining.offRoute ? ' · abseits der Route' : ''}
        </>
      )}
    </span>
  );

  const stillMin = state.settings.stillMinutes ?? 3;
  const prompt = state.phase === 'prompt' && (
    <div className="prompt flash" role="alertdialog" aria-modal="true" aria-label="Alles okay?">
      <h2>Alles okay?</h2>
      {state.promptReason === 'offroute' && <p className="prompt-reason">Du bist von der geplanten Route abgekommen.</p>}
      {state.promptReason === 'still' && <p className="prompt-reason">Du bist seit etwa {stillMin} Minuten an derselben Stelle.</p>}
      <p>Noch {left ?? 0} Sekunden, dann ruft dich deine Begleitung an.</p>
      <button type="button" className="btn ok big" onClick={() => dispatch({ type: 'ok', now: Date.now() })}>
        Ja, alles okay
      </button>
      {state.promptReason === 'offroute' && session.destCoords && (
        <button
          type="button"
          className="btn big"
          onClick={() => {
            dispatch({ type: 'ok', now: Date.now() });
            onReroute();
          }}
        >
          Ja, ich gehe bewusst anders – neuen Weg berechnen
        </button>
      )}
      <button type="button" className="btn danger big" onClick={() => dispatch({ type: 'help', now: Date.now() })}>
        Nein, ich brauche Hilfe
      </button>
    </div>
  );

  const arrival = state.askArrival && state.phase === 'active' && !pinFor && (
    <div className="prompt arrival" role="alertdialog" aria-modal="true" aria-label="Bist du angekommen?">
      <h2>Bist du angekommen?</h2>
      <p>Du bist ganz in der Nähe deines Ziels. Zum Beenden brauchst du deine PIN.</p>
      <button type="button" className="btn ok big" onClick={() => setPinFor('arrive')}>
        Ja, angekommen (PIN)
      </button>
      <button type="button" className="btn big" onClick={() => dispatch({ type: 'notArrived', now: Date.now() })}>
        Noch nicht
      </button>
    </div>
  );

  if (compact)
    return (
      <section className="escort-panel compact" aria-label="Begleitung">
        <button type="button" className="sheet-grabber" onClick={onToggleCompact} aria-label="Begleitung aufklappen">
          <span />
        </button>
        <button type="button" className="escort-compact-head" onClick={onToggleCompact}>
          {summary}
        </button>
        {state.settings.mode === 'interval' ? (
          <button type="button" className="btn ok compact-ok" onClick={() => dispatch({ type: 'ok', now: Date.now() })}>
            Alles okay {until !== null ? `· ${until} s` : ''}
          </button>
        ) : (
          <button type="button" className={`btn compact-hold ${state.holding ? 'holding' : ''}`} {...holdHandlers}>
            {state.holding ? 'Ich bin da – halten' : `Gedrückt halten${until !== null ? ` · ${until} s` : ''}`}
          </button>
        )}
        {prompt}
        {arrival}
        {pinDialog}
      </section>
    );

  return (
    <section className="escort-panel" aria-label="Begleitung">
      <button type="button" className="sheet-grabber" onClick={onToggleCompact} aria-label="Begleitung einklappen">
        <span />
      </button>
      <div className="escort-head">{summary}</div>

      {state.settings.mode === 'interval' ? (
        <button type="button" className="ok-button" onClick={() => dispatch({ type: 'ok', now: Date.now() })}>
          <b>Alles okay</b>
          <span>{until !== null ? `nächste Frage in ${until} s` : ''}</span>
        </button>
      ) : (
        <button
          type="button"
          className={`hold-button ${state.holding ? 'holding' : ''}`}
          {...holdHandlers}
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

      <LiveShareBox live={live} contacts={chosen} now={now} />

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

      {prompt}
      {arrival}
      {pinDialog}
    </section>
  );
}
