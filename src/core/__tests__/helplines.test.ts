import { describe, expect, it } from 'vitest';
import { emergencyFor, emergencyText, helplinesFor, silentCallFor } from '../helplines';

describe('Notrufnummern und Hilfsstellen je Stadt', () => {
  it('Österreich: 133/144/112, Deutschland: 110/112', () => {
    expect(emergencyFor('wien').map((e) => e.number)).toEqual(['133', '144', '112']);
    expect(emergencyFor('linz').map((e) => e.number)).toEqual(['133', '144', '112']);
    expect(emergencyFor('berlin').map((e) => e.number)).toEqual(['110', '112']);
    expect(emergencyText('berlin')).toBe('110 (Polizei) oder 112');
  });

  it('zeigt nur Hilfsstellen des eigenen Landes und der eigenen Stadt', () => {
    const wien = helplinesFor('wien').map((h) => h.name);
    const linz = helplinesFor('linz').map((h) => h.name);
    const berlin = helplinesFor('berlin').map((h) => h.name);
    expect(wien).toContain('24-Stunden Frauennotruf der Stadt Wien');
    expect(linz).not.toContain('24-Stunden Frauennotruf der Stadt Wien');
    expect(linz[0]).toBe('Krisenhilfe OÖ');
    expect(berlin).toContain('Hilfetelefon „Gewalt gegen Frauen“');
    expect(berlin).not.toContain('Telefonseelsorge');
    expect(berlin.some((n) => n.includes('Wien') || n.includes('OÖ'))).toBe(false);
  });

  it('stiller Notruf: DEC112 in Österreich, nora in Deutschland', () => {
    expect(silentCallFor('wien')?.app).toBe('DEC112');
    expect(silentCallFor('berlin')?.app).toBe('nora');
  });
});
