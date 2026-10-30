// Notfallkontakte und vorbereitete Nachrichten (SMS / WhatsApp / Anruf).

import type { LngLat } from './types';

export interface Contact {
  id: string;
  name: string;
  phone: string;
}

/** Telefonnummer in internationale Form bringen (österreichische Nummern ohne Vorwahl → +43) */
export function normalizePhone(raw: string): string {
  let p = raw.replace(/[^\d+]/g, '');
  if (p.startsWith('00')) p = '+' + p.slice(2);
  else if (p.startsWith('0')) p = '+43' + p.slice(1);
  else if (p && !p.startsWith('+')) p = '+' + p;
  return p;
}

export const telLink = (phone: string) => `tel:${normalizePhone(phone)}`;

export const smsLink = (phone: string, body: string) => `sms:${normalizePhone(phone)}?&body=${encodeURIComponent(body)}`;

export const whatsappLink = (phone: string, body: string) => `https://wa.me/${normalizePhone(phone).replace('+', '')}?text=${encodeURIComponent(body)}`;

export const mapLink = ([lon, lat]: LngLat) => `https://www.openstreetmap.org/?mlat=${lat.toFixed(5)}&mlon=${lon.toFixed(5)}#map=18/${lat.toFixed(5)}/${lon.toFixed(5)}`;

export type MessageKind = 'help' | 'arrived' | 'location';

export function buildMessage(kind: MessageKind, pos: { coords: LngLat; time: number } | null): string {
  const where = pos
    ? `Mein letzter Standort (${new Date(pos.time).toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' })} Uhr): ${mapLink(pos.coords)}`
    : 'Mein Standort ist gerade nicht verfügbar.';
  switch (kind) {
    case 'help':
      return `Ich bin auf dem Heimweg und brauche vielleicht Hilfe. Bitte ruf mich an. ${where}`;
    case 'location':
      return `Ich bin gerade unterwegs. ${where}`;
    case 'arrived':
      return 'Ich bin gut angekommen. Danke fürs Mitdenken!';
  }
}
