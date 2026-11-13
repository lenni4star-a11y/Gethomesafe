// Notrufnummern und Hilfsstellen in Österreich, dazu regionale Stellen für Wien und Linz/Oberösterreich – zentral gepflegt.
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
  /** nur in dieser Stadt anzeigen ('wien', 'linz', 'berlin'); ohne Angabe im ganzen Land */
  region?: string;
  /** Land: 'at' (Standard), 'de', 'ch' */
  country?: string;
}

/** Land der Stadt (für Notrufnummern und landesweite Hilfsstellen) */
export const COUNTRY_OF: Record<string, string> = { wien: 'at', linz: 'at', berlin: 'de', zuerich: 'ch', frankfurt: 'de', koeln: 'de', muenchen: 'de' };

/** Notrufnummern je Land. 112 geht in ganz Europa. */
export const EMERGENCY_BY_COUNTRY: Record<string, { label: string; number: string }[]> = {
  at: [
    { label: 'Polizei', number: '133' },
    { label: 'Rettung', number: '144' },
    { label: 'Euronotruf', number: '112' },
  ],
  de: [
    { label: 'Polizei', number: '110' },
    { label: 'Rettung, Feuerwehr', number: '112' },
  ],
  ch: [
    { label: 'Polizei', number: '117' },
    { label: 'Sanität', number: '144' },
    { label: 'Euronotruf', number: '112' },
  ],
};
export const emergencyFor = (city: string) => EMERGENCY_BY_COUNTRY[COUNTRY_OF[city] ?? 'at'] ?? EMERGENCY_BY_COUNTRY.at;
/** für ältere Stellen im Code: Österreich */
export const EMERGENCY = EMERGENCY_BY_COUNTRY.at;

/** Kurzform für Hinweise: „133 (Polizei), 144 (Rettung) oder 112“ bzw. „110 (Polizei) oder 112“ */
export function emergencyText(city: string): string {
  const e = emergencyFor(city);
  const parts = e.filter((x) => x.number !== '112').map((x) => `${x.number} (${x.label})`);
  return `${parts.join(', ')} oder 112`;
}

export const HELPLINES: Helpline[] = [
  {
    name: '24-Stunden Frauennotruf der Stadt Wien',
    number: '01 71 71 9',
    dial: '+43171719',
    allDay: true,
    hours: 'rund um die Uhr, auch an Sonn- und Feiertagen',
    description: 'Für Frauen und Mädchen ab 14, die Gewalt erlebt haben. Kostenlos, vertraulich, auf Wunsch anonym.',
    source: 'https://www.wien.gv.at/menschen/frauen/beratung/frauennotruf/',
    region: 'wien',
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
    region: 'wien',
  },
  {
    name: 'Sozialpsychiatrischer Notdienst (PSD Wien)',
    number: '01 31330',
    dial: '+43131330',
    allDay: true,
    hours: 'rund um die Uhr',
    description: 'Bei akuten psychischen Krisen.',
    source: 'https://psd-wien.at',
    region: 'wien',
  },
  {
    name: 'Krisenhilfe OÖ',
    number: '0732 2177',
    dial: '+437322177',
    allDay: true,
    hours: 'rund um die Uhr, kostenlos',
    description: 'Bei akuten psychischen Krisen in Oberösterreich, auch nach belastenden Erlebnissen.',
    source: 'https://www.land-oberoesterreich.gv.at/39189.htm',
    region: 'linz',
  },
  {
    name: 'Gewaltschutzzentrum Oberösterreich',
    number: '0732 60 77 60',
    dial: '+43732607760',
    allDay: false,
    hours: 'nicht rund um die Uhr',
    description: 'Beratung und Unterstützung nach Gewalt, kostenlos und vertraulich.',
    source: 'https://www.land-oberoesterreich.gv.at/25855.htm',
    region: 'linz',
  },
  {
    name: 'Autonomes Frauenzentrum Linz',
    number: '0732 60 22 00',
    dial: '+43732602200',
    allDay: false,
    hours: 'nicht rund um die Uhr',
    description: 'Beratung für Frauen und Mädchen, die Gewalt erlebt haben.',
    source: 'https://www.land-oberoesterreich.gv.at/25855.htm',
    region: 'linz',
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

// Deutschland / Berlin (geprüft im November 2026 auf offiziellen Seiten)
HELPLINES.push(
  {
    name: 'Hilfetelefon „Gewalt gegen Frauen“',
    number: '116 016',
    dial: '116016',
    allDay: true,
    hours: 'rund um die Uhr, kostenlos',
    description: 'Bundesweit, anonym, in vielen Sprachen. Auch für Menschen aus dem Umfeld.',
    source: 'https://www.hilfetelefon.de',
    country: 'de',
  },
  {
    name: 'Berliner Krisendienst',
    number: '030 390 63 00',
    dial: '+49303906300',
    allDay: true,
    hours: 'rund um die Uhr',
    description: 'Bei akuten seelischen Krisen in Berlin, anonym und kostenlos.',
    source: 'https://www.berlin.de/zentrale-anlaufstelle/zentrale-anlaufstelle/artikel.1536916.php',
    country: 'de',
    region: 'berlin',
  },
  {
    name: 'TelefonSeelsorge',
    number: '0800 111 0 111',
    dial: '08001110111',
    allDay: true,
    hours: 'rund um die Uhr, kostenlos (auch 0800 111 0 222)',
    description: 'Wenn du jemanden zum Reden brauchst, egal worum es geht.',
    source: 'https://familienportal.de/familienportal/lebenslagen/krise-und-konflikt/krisetelefone-anlaufstellen/krisentelefone-und-anlaufstellen-in-notlagen-124544',
    country: 'de',
  },
  {
    name: 'Opferhilfe Berlin',
    number: '030 395 28 67',
    dial: '+49303952867',
    allDay: false,
    hours: 'nicht rund um die Uhr, Beratung nach Termin',
    description: 'Für Menschen, die eine Straftat erlebt haben, und ihre Angehörigen. Auf Wunsch anonym.',
    source: 'https://www.berlin.de/zentrale-anlaufstelle/zentrale-anlaufstelle/artikel.1536916.php',
    country: 'de',
    region: 'berlin',
  },
  {
    name: 'Nummer gegen Kummer',
    number: '116 111',
    dial: '116111',
    allDay: false,
    hours: 'nicht rund um die Uhr',
    description: 'Für Kinder und Jugendliche.',
    source: 'https://familienportal.de/familienportal/lebenslagen/krise-und-konflikt/krisetelefone-anlaufstellen/krisentelefone-und-anlaufstellen-in-notlagen-124544',
    country: 'de',
  },
);

// Schweiz (geprüft im November 2026 beim Bundesamt für Gesundheit)
HELPLINES.push(
  {
    name: 'Die Dargebotene Hand',
    number: '143',
    dial: '143',
    allDay: true,
    hours: 'rund um die Uhr',
    description: 'Wenn du jemanden zum Reden brauchst, auch per Chat auf 143.ch.',
    source: 'https://www.bag.admin.ch/de/hilfsangebote-zur-psychischen-gesundheit',
    country: 'ch',
  },
  {
    name: 'Opferhilfe Schweiz',
    number: '142',
    dial: '142',
    allDay: false,
    hours: 'Zeiten auf der Website',
    description: 'Für Menschen, die Gewalt oder einen Übergriff erlebt haben. Kostenlos, vertraulich, anonym.',
    source: 'https://www.bag.admin.ch/de/hilfsangebote-zur-psychischen-gesundheit',
    country: 'ch',
  },
  {
    name: 'Pro Juventute',
    number: '147',
    dial: '147',
    allDay: true,
    hours: 'rund um die Uhr',
    description: 'Für Kinder und Jugendliche.',
    source: 'https://www.bag.admin.ch/de/hilfsangebote-zur-psychischen-gesundheit',
    country: 'ch',
  },
);

/** Hilfsstellen für eine Stadt: landesweite plus regionale, regionale zuerst */
export const helplinesFor = (city: string) => {
  const country = COUNTRY_OF[city] ?? 'at';
  return HELPLINES.filter((h) => (h.country ?? 'at') === country && (!h.region || h.region === city)).sort((a, b) => Number(!a.region) - Number(!b.region));
};

/** Stiller Notruf je Land: Österreich DEC112, Deutschland nora */
export const SILENT_CALL_BY_COUNTRY: Record<string, { app: string; text: string; info: string; infoLabel: string; ios: string; android: string }> = {
  at: {
    app: 'DEC112',
    text: 'Mit der offiziellen Notruf-App DEC112 kannst du einen stillen Notruf an die Polizei senden, wenn Sprechen oder Schreiben gefährlich ist. Die App vorher installieren und einrichten.',
    info: 'https://www.oesterreich.gv.at/de/themen/notfaelle_unfaelle_und_kriminalitaet/notrufnummern',
    infoLabel: 'Info von oesterreich.gv.at',
    ios: 'https://apps.apple.com/at/app/dec112-2-0/id1494002697',
    android: 'https://play.google.com/store/search?q=DEC112&c=apps',
  },
  de: {
    app: 'nora',
    text: 'Mit nora, der offiziellen Notruf-App der Bundesländer, kannst du Polizei, Feuerwehr und Rettung ohne Sprechen alarmieren. Die App vorher installieren und einrichten.',
    info: 'https://www.berlin.de/polizei/service/so-erreichen-sie-uns/notruf/',
    infoLabel: 'Info der Polizei Berlin',
    ios: 'https://apps.apple.com/de/search?term=nora%20notruf',
    android: 'https://play.google.com/store/search?q=nora%20notruf&c=apps',
  },
};
export const silentCallFor = (city: string) => SILENT_CALL_BY_COUNTRY[COUNTRY_OF[city] ?? 'at'] ?? null;

export const SILENT_CALL = {
  app: 'DEC112',
  text: 'Mit der offiziellen Notruf-App DEC112 kannst du einen stillen Notruf an die Polizei senden, wenn Sprechen oder Schreiben gefährlich ist. Die App vorher installieren und einrichten.',
  info: 'https://www.oesterreich.gv.at/de/themen/notfaelle_unfaelle_und_kriminalitaet/notrufnummern',
  ios: 'https://apps.apple.com/at/app/dec112-2-0/id1494002697',
  android: 'https://play.google.com/store/search?q=DEC112&c=apps',
};
