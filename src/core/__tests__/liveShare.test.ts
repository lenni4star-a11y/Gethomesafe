import { describe, expect, it } from 'vitest';
import { formatAge, isTooOld, LIVE_RULES, liveMessage, makePayload, parsePayload, shouldSend } from '../liveShare';

describe('Live-Standort-Link', () => {
  it('Daten enthalten nur Position, Genauigkeit und Zeit', () => {
    const p = makePayload([16.3712345, 48.2012345], 1000, 12.7);
    expect(p).toEqual({ v: 1, c: [16.37123, 48.20123], t: 1000, a: 13 });
    expect(parsePayload(JSON.stringify(p))).toEqual(p);
  });

  it('kaputte oder fremde Daten werden nicht angezeigt', () => {
    expect(parsePayload('kein json')).toBeNull();
    expect(parsePayload(JSON.stringify({ v: 2, c: [1, 2], t: 1 }))).toBeNull();
    expect(parsePayload(JSON.stringify({ v: 1, c: [500, 2], t: 1 }))).toBeNull();
  });

  it('sendet nicht zu oft, aber regelmäßig und bei Bewegung', () => {
    const last = { coords: [16.37, 48.2] as [number, number], sentAt: 0 };
    expect(shouldSend(null, last.coords, 0)).toBe(true);
    expect(shouldSend(last, [16.38, 48.2], 5_000)).toBe(false); // zu früh, auch bei Bewegung
    expect(shouldSend(last, [16.37, 48.2], 20_000)).toBe(false); // keine Bewegung
    expect(shouldSend(last, [16.3704, 48.2], 20_000)).toBe(true); // ca. 30 m bewegt
    expect(shouldSend(last, [16.37, 48.2], LIVE_RULES.maxIntervalSec * 1000)).toBe(true);
  });

  it('endet nach höchstens vier Stunden', () => {
    expect(isTooOld(0, 3 * 3600_000)).toBe(false);
    expect(isTooOld(0, 5 * 3600_000)).toBe(true);
  });

  it('Zeitangabe und Nachricht', () => {
    expect(formatAge(10_000)).toBe('gerade eben');
    expect(formatAge(180_000)).toBe('vor 3 min');
    expect(liveMessage('https://x/?live=a#k')).toContain('https://x/?live=a#k');
  });
});
