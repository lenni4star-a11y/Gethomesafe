// Schlichte Linien-Symbole im Stil der Marke (statt Emojis).
// Sie übernehmen die Textfarbe (currentColor) und sind für Screenreader ausgeblendet:
// Den Namen liefert immer der Knopf selbst (aria-label oder sichtbarer Text).

import type { ReactNode } from 'react';
import { svgIcon } from '../placeIcons';

type Name = 'settings' | 'star' | 'home' | 'search' | 'camera' | 'company';

const paths: Record<Name, ReactNode> = {
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1" />
    </>
  ),
  star: <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />,
  home: (
    <>
      <path d="M4 11 12 4l8 7" />
      <path d="M6 10v10h12V10" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </>
  ),
  camera: (
    <>
      <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
      <circle cx="12" cy="13" r="3.5" />
    </>
  ),
  company: (
    <>
      <circle cx="9" cy="8" r="3" />
      <circle cx="16" cy="9" r="2.5" />
      <path d="M3.5 19c.8-3.3 3-5 5.5-5s4.7 1.7 5.5 5M14.5 14.2c2.6-.5 4.9.9 5.8 3.8" />
    </>
  ),
};

export function Icon({ name, size = 20 }: { name: Name; size?: number }) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths[name]}
    </svg>
  );
}

/** Symbol aus placeIcons (für Orte, Haltestellen, Alarm) als React-Element */
export function SvgIcon({ name, size = 16 }: { name: string; size?: number }) {
  return <span className="svg-icon" aria-hidden="true" dangerouslySetInnerHTML={{ __html: svgIcon(name, size) }} />;
}

/** Wortmarke: „goodway“ mit dem Punkt als Licht der Straßenlaterne */
export function Wordmark() {
  return (
    <span className="brand" aria-label="Goodway">
      goodway<span className="brand-dot">.</span>
    </span>
  );
}

/** Schrift auf hellen Linienfarben (z. B. Berliner U4 gelb) dunkel, sonst weiß */
export function textOn(hex: string): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return '#fff';
  const [r, g, b] = m.slice(1).map((v) => parseInt(v, 16));
  return 0.299 * r + 0.587 * g + 0.114 * b > 165 ? '#15131f' : '#fff';
}

/** Linien-Schild wie bei den Wiener Linien: U-Bahn eckig, Bim/Bus abgerundet, in der Linienfarbe */
export function LineBadge({ line, mode, color }: { line: string; mode: number; color: string }) {
  return (
    <span className={`line-badge${mode === 1 ? ' ubahn' : ''}`} style={{ background: color, color: textOn(color) }}>
      {line}
    </span>
  );
}
