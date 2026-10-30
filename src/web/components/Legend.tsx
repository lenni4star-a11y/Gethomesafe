import { CLASS_COLORS } from './MapView';

/** Kleine Legende der Farbstufen auf der Karte */
export function Legend({ dark }: { dark: boolean }) {
  const items = [
    { cls: 'good', label: dark ? 'hell & gut' : 'gut' },
    { cls: 'medium', label: dark ? 'teils / keine Daten' : 'mäßig' },
    { cls: 'bad', label: dark ? 'dunkel / schlecht' : 'schlecht' },
  ] as const;
  return (
    <div className="map-legend" aria-label="Legende der Routenfarben">
      {items.map((i) => (
        <span key={i.cls}>
          <i className={`swatch swatch-${i.cls}`} style={{ background: CLASS_COLORS[i.cls] }} aria-hidden />
          {i.label}
        </span>
      ))}
    </div>
  );
}
