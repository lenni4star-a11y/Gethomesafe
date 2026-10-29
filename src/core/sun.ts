// Sonnenstand (vereinfachte NOAA-Formel), um zu wissen, ob es dunkel ist.

const rad = Math.PI / 180;

export function sunAltitude(date: Date, lat: number, lon: number): number {
  const jd = date.getTime() / 86400000 + 2440587.5;
  const n = jd - 2451545.0;
  const L = (280.46 + 0.9856474 * n) % 360;
  const g = ((357.528 + 0.9856003 * n) % 360) * rad;
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad;
  const epsilon = (23.439 - 0.0000004 * n) * rad;
  const decl = Math.asin(Math.sin(epsilon) * Math.sin(lambda));
  const ra = Math.atan2(Math.cos(epsilon) * Math.sin(lambda), Math.cos(lambda));
  const gmst = (18.697374558 + 24.06570982441908 * n) % 24;
  const lst = (gmst * 15 + lon) * rad;
  const ha = lst - ra;
  const alt = Math.asin(Math.sin(lat * rad) * Math.sin(decl) + Math.cos(lat * rad) * Math.cos(decl) * Math.cos(ha));
  return alt / rad;
}

/** Dunkel = Sonne mehr als 3° unter dem Horizont (nach Sonnenuntergang/Dämmerung) */
export function isDark(date: Date, lat = 48.2, lon = 16.37): boolean {
  return sunAltitude(date, lat, lon) < -3;
}
