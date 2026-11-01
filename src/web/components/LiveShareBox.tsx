import { useState } from 'react';
import { smsLink, whatsappLink, type Contact } from '../../core/contacts';
import { formatAge, liveMessage } from '../../core/liveShare';
import { LIVE_AVAILABLE, type useLiveShare } from '../liveShare';

type Live = ReturnType<typeof useLiveShare>;

/** In der Begleitung: Live-Standort-Link erstellen und selbst an Kontakte schicken */
export function LiveShareBox({ live, contacts, now }: { live: Live; contacts: Contact[]; now: number }) {
  const [copied, setCopied] = useState(false);
  if (!LIVE_AVAILABLE)
    return (
      <div className="live-box">
        <h3>🔗 Live-Standort-Link</h3>
        <p className="fineprint">Noch nicht eingerichtet: Der Server (Supabase) ist in dieser Version noch nicht verbunden.</p>
      </div>
    );

  if (!live.link)
    return (
      <div className="live-box">
        <h3>🔗 Live-Standort-Link</h3>
        <p className="fineprint">Deine Kontakte sehen deinen aktuellen Standort, bis du die Begleitung beendest. Verschlüsselt, ohne Ziel und ohne Zuhause.</p>
        <button type="button" className="btn" onClick={() => void live.start()} disabled={live.status === 'starting'}>
          {live.status === 'starting' ? 'Link wird erstellt …' : 'Link erstellen'}
        </button>
        {live.status === 'error' && <p className="message">Der Link konnte nicht erstellt werden. Bitte prüf deine Internetverbindung und versuch es noch einmal.</p>}
      </div>
    );

  const msg = liveMessage(live.link);
  const share = async () => {
    if (navigator.share) {
      await navigator.share({ text: msg }).catch(() => {});
      return;
    }
    await navigator.clipboard?.writeText(live.link!).catch(() => {});
    setCopied(true);
  };
  return (
    <div className="live-box on">
      <h3>
        <span className="live-dot" aria-hidden /> Live-Standort wird geteilt
      </h3>
      <p className="fineprint">
        {live.status === 'error'
          ? 'Senden hat gerade nicht geklappt (keine Verbindung?). Wir versuchen es beim nächsten Standort wieder.'
          : live.lastSent
            ? `Zuletzt gesendet: ${formatAge(now - live.lastSent)}.`
            : 'Warte auf deinen Standort …'}{' '}
        Endet automatisch, wenn du die Begleitung beendest.
      </p>
      {contacts.map((c) => (
        <div key={c.id} className="contact-actions">
          <span className="contact-name">{c.name}</span>
          <a className="btn small" href={smsLink(c.phone, msg)}>
            SMS
          </a>
          <a className="btn small" href={whatsappLink(c.phone, msg)} target="_blank" rel="noreferrer">
            WhatsApp
          </a>
        </div>
      ))}
      <div className="tp-row">
        <button type="button" className="btn small" onClick={share}>
          {copied ? 'Link kopiert ✓' : 'Link teilen …'}
        </button>
        <button type="button" className="btn small" onClick={() => void live.stop()}>
          Teilen beenden
        </button>
      </div>
      <p className="fineprint">Nachrichten verschickst du selbst. Wer den Link hat, sieht deinen Standort – schick ihn nur an Menschen, denen du vertraust.</p>
    </div>
  );
}
