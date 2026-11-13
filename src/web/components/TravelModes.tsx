// Verkehrsmittel wie in Karten-Apps: Öffis, zu Fuß, Fahrdienst (Taxi, Uber, Bolt), E-Roller.
// Dazu die Anzeige „Gefühl unterwegs“: statt einer Note von 1–10 fünf Stufen von Grün bis Rot,
// weil es eine Schätzung aus offenen Daten ist und kein Messwert.

import { distance } from '../../core/geo';
import type { LngLat } from '../../core/types';
import { formatDistance, formatDuration } from '../format';

export type TravelMode = 'transit' | 'walk' | 'ride' | 'scooter';

const FEEL = [
  { min: 9, level: 5, label: 'sehr angenehm', color: '#5ee0b0' },
  { min: 7, level: 4, label: 'angenehm', color: '#a8e06e' },
  { min: 5, level: 3, label: 'gemischt', color: '#ffd166' },
  { min: 3, level: 2, label: 'eher unangenehm', color: '#ff9a5c' },
  { min: 0, level: 1, label: 'unangenehm', color: '#ff5c7a' },
];

/** Interner Wert 1–10 → fünf Stufen mit Wort und Farbe */
export function feelOf(score: number) {
  return FEEL.find((f) => score >= f.min) ?? FEEL[FEEL.length - 1];
}

/** Fünf kleine Balken in der Farbe der Stufe, dazu das Wort */
export function FeelMeter({ score, compact = false }: { score: number; compact?: boolean }) {
  const f = feelOf(score);
  return (
    <span className={`feel${compact ? ' compact' : ''}`} role="img" aria-label={`Geschätztes Gefühl unterwegs: ${f.label} (${f.level} von 5)`}>
      <span className="feel-bars" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((i) => (
          <span key={i} style={{ background: i <= f.level ? f.color : undefined }} />
        ))}
      </span>
      {!compact && <span className="feel-label">{f.label}</span>}
    </span>
  );
}

/** Luftlinie mal Umwegfaktor, für grobe Schätzungen ohne Straßen-Routing */
function roughMeters(from: LngLat, to: LngLat, detour: number) {
  return distance(from, to) * detour;
}
export const rideMinutes = (from: LngLat, to: LngLat) => Math.round((roughMeters(from, to, 1.35) / 1000 / 22) * 60) + 1;
export const scooterMinutes = (from: LngLat, to: LngLat) => Math.round((roughMeters(from, to, 1.3) / 1000 / 15) * 60) + 1;

/** Taxi-Zentralen je Stadt (Nummern von offiziellen Tourismus-Seiten, Stand Nov. 2026) */
const TAXI: Record<string, { name: string; number: string; dial: string }[]> = {
  wien: [
    { name: 'Taxi 40100', number: '01 40 100', dial: '+43140100' },
    { name: 'Taxi 31300', number: '01 31 300', dial: '+43131300' },
  ],
  berlin: [
    { name: 'Taxi Berlin', number: '030 20 20 20', dial: '+4930202020' },
    { name: 'Würfelfunk', number: '030 21 01 01', dial: '+4930210101' },
  ],
};
const TAXI_SOURCE: Record<string, string> = {
  wien: 'https://wien.info/en/travel-info/arrival-departure/airport-to-center/taxi-360908',
  berlin: 'https://www.visitberlin.de/en/taxis-berlin',
};

interface PanelProps {
  city: string;
  from: LngLat;
  to: LngLat;
  toLabel: string;
  dark: boolean;
  /** Ziel ist das eigene Zuhause: dann nie an Fahrdienste weitergeben */
  toHome?: boolean;
}

/** Fahrdienst: Zeit grob geschätzt, Taxi anrufen, Uber/Bolt/FreeNow öffnen */
export function RidePanel({ city, from, to, toLabel, dark, toHome = false }: PanelProps) {
  const min = rideMinutes(from, to);
  const uber = new URL('https://m.uber.com/ul/');
  uber.searchParams.set('action', 'setPickup');
  uber.searchParams.set('pickup', 'my_location');
  if (!toHome) {
    uber.searchParams.set('dropoff[latitude]', String(to[1]));
    uber.searchParams.set('dropoff[longitude]', String(to[0]));
    uber.searchParams.set('dropoff[nickname]', toLabel);
  }
  const taxis = TAXI[city] ?? [];
  const us = city === 'sanfrancisco';
  // Lyft: universeller Link mit Ziel (nie mit Zuhause)
  const lyft = new URL('https://lyft.com/ride');
  lyft.searchParams.set('id', 'lyft');
  if (!toHome) {
    lyft.searchParams.set('destination[latitude]', String(to[1]));
    lyft.searchParams.set('destination[longitude]', String(to[0]));
  }
  return (
    <div className="mode-panel">
      <p className="mode-estimate">
        <b>ca. {formatDuration(min * 60)}</b> Fahrt · {formatDistance(roughMeters(from, to, 1.35))} <span className="muted">(grob geschätzt, ohne Wartezeit)</span>
      </p>
      <div className="ride-buttons">
        <a className="btn" href={uber.toString()} target="_blank" rel="noreferrer">
          Uber öffnen <small>{toHome ? 'Zuhause in der App eingeben' : 'Ziel wird übergeben'}</small>
        </a>
        {us ? (
          <a className="btn" href={lyft.toString()} target="_blank" rel="noreferrer">
            Lyft öffnen <small>{toHome ? 'Zuhause in der App eingeben' : 'Ziel wird übergeben'}</small>
          </a>
        ) : (
          <>
            <a className="btn" href="https://bolt.eu/" target="_blank" rel="noreferrer">
              Bolt öffnen <small>Ziel in der App eingeben</small>
            </a>
            <a className="btn" href="https://www.free-now.com/" target="_blank" rel="noreferrer">
              FreeNow öffnen <small>Taxi per App</small>
            </a>
          </>
        )}
        {taxis.map((t) => (
          <a key={t.dial} className="btn" href={`tel:${t.dial}`}>
            Taxi rufen: {t.name} <small>{t.number}</small>
          </a>
        ))}
      </div>
      <ul className="tips">
        <li>Kennzeichen und Name mit der App vergleichen, bevor du einsteigst.</li>
        <li>Fahrt mit jemandem teilen: In der Begleitung kannst du einen Live-Standort-Link schicken.</li>
        {dark && <li>Nachts hinten sitzen und dein Ziel nicht laut nennen, wenn du dich unwohl fühlst.</li>}
      </ul>
      <p className="fineprint">
        {toHome ? 'Dein Zuhause geben wir an keinen Fahrdienst weiter.' : `${us ? 'Uber und Lyft bekommen' : 'Uber bekommt'} dein Ziel erst, wenn du auf „öffnen“ tippst.`} Preise zeigt die jeweilige App.
        {TAXI_SOURCE[city] && (
          <>
            {' '}
            <a href={TAXI_SOURCE[city]} target="_blank" rel="noreferrer">
              Quelle Taxi-Nummern
            </a>
          </>
        )}
      </p>
    </div>
  );
}

/** E-Roller: nur grobe Zeit, ehrliche Hinweise (kein eigenes Radwegenetz im Prototyp) */
export function ScooterPanel({ from, to, dark }: PanelProps) {
  const min = scooterMinutes(from, to);
  return (
    <div className="mode-panel">
      <p className="mode-estimate">
        <b>ca. {formatDuration(min * 60)}</b> mit dem E-Roller <span className="muted">(grob geschätzt)</span>
      </p>
      <div className="ride-buttons">
        <a className="btn" href="https://www.li.me/" target="_blank" rel="noreferrer">
          Lime öffnen
        </a>
        <a className="btn" href="https://www.voi.com/" target="_blank" rel="noreferrer">
          Voi öffnen
        </a>
        <a className="btn" href="https://bolt.eu/" target="_blank" rel="noreferrer">
          Bolt öffnen
        </a>
      </div>
      <ul className="tips">
        <li>
          <b>Nach Alkohol nicht fahren.</b> Für E-Roller gelten Promillegrenzen wie im Straßenverkehr, und Stürze passieren nachts besonders oft.
        </li>
        {dark && <li>Nachts sind Öffis oder ein Taxi meist die sicherere Wahl.</li>}
        <li>Eine Roller-Route über Radwege gibt es in der App noch nicht. Die Zeit ist nur eine Schätzung.</li>
      </ul>
    </div>
  );
}
