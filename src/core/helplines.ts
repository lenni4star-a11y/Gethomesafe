// Notrufnummern und Hilfsstellen in Wien – zentral gepflegt.
// Nur Nummern, die auf offiziellen Seiten geprüft wurden (Stand: Oktober 2026). Bitte regelmäßig prüfen.

export interface Helpline {
  name: string;
  number: string;
  /** Wählbare Form für tel:-Links */
  dial: string;
  /** rund um die Uhr erreichbar? */
  allDay: boolean;
  hours: string;
  /** ein Satz: wofür die Stelle da ist */
  description: string;
  source: string;
}

export const EMERGENCY = [
  { label: 'Polizei', number: '133' },
  { label: 'Rettung', number: '144' },
  { label: 'Euronotruf', number: '112' },
] as const;

export const HELPLINES: Helpline[] = [
  {
    name: '24-Stunden Frauennotruf der Stadt Wien',
    number: '01 71 71 9',
    dial: '+43171719',
    allDay: true,
    hours: 'rund um die Uhr, auch an Sonn- und Feiertagen',
    description: 'Für Frauen und Mädchen ab 14, die Gewalt erlebt haben. Kostenlos, vertraulich, auf Wunsch anonym.',
    source: 'https://www.wien.gv.at/menschen/frauen/beratung/frauennotruf/',
  },
  {
    name: 'Frauenhelpline gegen Gewalt',
    number: '0800 222 555',
    dial: '0800222555',
    allDay: true,
    hours: 'rund um die Uhr, kostenlos',
    description: 'Österreichweit, anonym und mehrsprachig. Auch für Menschen aus dem Umfeld.',
    source: 'https://www.oesterreich.gv.at/de/themen/notfaelle_unfaelle_und_kriminalitaet/hilfe-bei-gewalt/2/Seite.290501/frauenhelpline',
  },
  {
    name: 'Telefonseelsorge',
    number: '142',
    dial: '142',
    allDay: true,
    hours: 'rund um die Uhr, kostenlos',
    description: 'Wenn du jemanden zum Reden brauchst, egal worum es geht.',
    source: 'https://www.oesterreich.gv.at/de/themen/notfaelle_unfaelle_und_kriminalitaet/notrufnummern',
  },
  {
    name: 'Opfer-Notruf',
    number: '0800 112 112',
    dial: '0800112112',
    allDay: true,
    hours: 'rund um die Uhr, kostenlos',
    description: 'Für alle, die eine Straftat erlebt haben. Betrieben vom Weißen Ring im Auftrag des Justizministeriums.',
    source: 'https://www.opfer-notruf.at',
  },
  {
    name: 'COURAGE – Beratung für LGBTIQ*-Personen',
    number: '01 585 69 66',
    dial: '+4315856966',
    allDay: false,
    hours: 'nicht rund um die Uhr, Zeiten auf der Website',
    description: 'Beratung bei Diskriminierung und Gewalt gegen LGBTIQ*-Personen, kostenlos und anonym.',
    source: 'https://www.courage-beratung.at/kontakt/',
  },
  {
    name: 'Sozialpsychiatrischer Notdienst (PSD Wien)',
    number: '01 31330',
    dial: '+43131330',
    allDay: true,
    hours: 'rund um die Uhr',
    description: 'Bei akuten psychischen Krisen.',
    source: 'https://psd-wien.at',
  },
  {
    name: 'Rat auf Draht',
    number: '147',
    dial: '147',
    allDay: true,
    hours: 'rund um die Uhr, kostenlos',
    description: 'Für Kinder und Jugendliche.',
    source: 'https://www.oesterreich.gv.at/de/themen/notfaelle_unfaelle_und_kriminalitaet/notrufnummern',
  },
  {
    name: 'Polizei-Notruf per SMS',
    number: '0800 133 133',
    dial: '0800133133',
    allDay: true,
    hours: 'SMS oder Fax',
    description: 'Für gehörlose und hörbeeinträchtigte Menschen.',
    source: 'https://www.oesterreich.gv.at/de/themen/notfaelle_unfaelle_und_kriminalitaet/notrufnummern',
  },
];

export const SILENT_CALL = {
  app: 'DEC112',
  text: 'Mit der offiziellen Notruf-App DEC112 kannst du einen stillen Notruf an die Polizei senden, wenn Sprechen oder Schreiben gefährlich ist. Die App vorher installieren und einrichten.',
  info: 'https://www.oesterreich.gv.at/de/themen/notfaelle_unfaelle_und_kriminalitaet/notrufnummern',
  ios: 'https://apps.apple.com/at/app/dec112-2-0/id1494002697',
  android: 'https://play.google.com/store/search?q=DEC112&c=apps',
};
