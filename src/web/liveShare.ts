// Live-Standort-Link über Supabase (Frankfurt). Siehe supabase/live.sql und src/core/liveShare.ts.
// Verschlüsselung im Browser (AES-GCM); der Schlüssel steht nur im Link nach dem # und wird nie gesendet.

import { useCallback, useEffect, useRef, useState } from 'react';
import { isTooOld, LIVE_RULES, makePayload, parsePayload, shouldSend, type LivePayload } from '../core/liveShare';
import type { LngLat } from '../core/types';
import { load, remove, save } from './storage';
import type { LastPosition } from './useEscort';

const URL_ = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '');
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Ist der Server eingerichtet? (Adresse und öffentlicher Schlüssel beim Veröffentlichen hinterlegt) */
export const LIVE_AVAILABLE = Boolean(URL_ && KEY);

export interface LiveShare {
  id: string;
  /** geheimer Schreib-Schlüssel (nur auf diesem Gerät) */
  token: string;
  /** Verschlüsselungs-Schlüssel (steht im Link) */
  key: string;
  createdAt: number;
}

const STORE_KEY = 'escort.liveShare';

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
const random = (n: number) => b64url(crypto.getRandomValues(new Uint8Array(n)));

async function aesKey(key: string, use: KeyUsage) {
  return crypto.subtle.importKey('raw', fromB64url(key), 'AES-GCM', false, [use]);
}

export async function encrypt(key: string, text: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(key, 'encrypt'), new TextEncoder().encode(text)));
  const out = new Uint8Array(iv.length + data.length);
  out.set(iv);
  out.set(data, iv.length);
  return b64url(out);
}

export async function decrypt(key: string, payload: string): Promise<string> {
  const raw = fromB64url(payload);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.slice(0, 12) }, await aesKey(key, 'decrypt'), raw.slice(12));
  return new TextDecoder().decode(plain);
}

async function rpc<T>(fn: string, body: Record<string, unknown>): Promise<T> {
  if (!URL_ || !KEY) throw new Error('nicht eingerichtet');
  const res = await fetch(`${URL_}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    // alte „anon“-Schlüssel sind JWTs und gehören auch in Authorization; neue „publishable“-Schlüssel nur in apikey
    headers: { apikey: KEY, ...(KEY.startsWith('eyJ') ? { Authorization: `Bearer ${KEY}` } : {}), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Server: ${res.status}`);
  return res.json() as Promise<T>;
}

export function linkFor(share: LiveShare): string {
  return `${location.origin}${location.pathname}?live=${share.id}#${share.key}`;
}

async function put(share: LiveShare, p: LivePayload): Promise<boolean> {
  return rpc<boolean>('live_put', { p_id: share.id, p_token: share.token, p_payload: await encrypt(share.key, JSON.stringify(p)), p_minutes: LIVE_RULES.expiryMinutes });
}

/** Für die Ansicht der Kontakte: aktuellen Standort holen und entschlüsseln. null = Link beendet/abgelaufen */
export async function fetchLive(id: string, key: string): Promise<{ payload: LivePayload | null; updatedAt: number } | null> {
  const rows = await rpc<{ payload: string; updated_at: string }[]>('live_get', { p_id: id });
  if (!rows.length) return null;
  let text: string;
  try {
    text = await decrypt(key, rows[0].payload);
  } catch {
    throw new Error('key');
  }
  // „{}“ = Link erstellt, aber noch kein Standort
  if (text === '{}') return { payload: null, updatedAt: new Date(rows[0].updated_at).getTime() };
  const payload = parsePayload(text);
  if (!payload) throw new Error('Daten nicht lesbar');
  return { payload, updatedAt: new Date(rows[0].updated_at).getTime() };
}

export type LiveStatus = 'off' | 'starting' | 'on' | 'error';

/** Während der Begleitung: Link erstellen, Positionen senden, beim Ende löschen */
export function useLiveShare(lastPos: LastPosition | null, escortActive: boolean) {
  const [share, setShare] = useState<LiveShare | null>(null);
  const [status, setStatus] = useState<LiveStatus>('off');
  const [lastSent, setLastSent] = useState<number | null>(null);
  const last = useRef<{ coords: LngLat; sentAt: number } | null>(null);
  const shareRef = useRef<LiveShare | null>(null);
  shareRef.current = share;

  // nach Neuladen während einer laufenden Begleitung weitermachen
  useEffect(() => {
    if (!escortActive || shareRef.current) return;
    load<LiveShare | null>(STORE_KEY, null).then((s) => {
      if (s && !shareRef.current) {
        setShare(s);
        setStatus('on');
      }
    });
  }, [escortActive]);

  const stop = useCallback(async () => {
    const s = shareRef.current;
    setShare(null);
    setStatus('off');
    setLastSent(null);
    last.current = null;
    await remove(STORE_KEY);
    if (s) await rpc('live_end', { p_id: s.id, p_token: s.token }).catch(() => {});
  }, []);

  const send = useCallback(async (s: LiveShare, pos: LastPosition, force = false) => {
    const now = Date.now();
    if (isTooOld(s.createdAt, now)) return void stop();
    if (!force && !shouldSend(last.current, pos.coords, now)) return;
    last.current = { coords: pos.coords, sentAt: now };
    try {
      const ok = await put(s, makePayload(pos.coords, pos.time, pos.accuracy));
      if (!ok) throw new Error('abgelehnt');
      setLastSent(now);
      setStatus('on');
    } catch {
      setStatus('error');
      last.current = null; // beim nächsten Standort erneut versuchen
    }
  }, [stop]);

  const start = useCallback(async (): Promise<LiveShare | null> => {
    if (shareRef.current) return shareRef.current;
    const s: LiveShare = { id: random(18), token: random(24), key: random(16), createdAt: Date.now() };
    setStatus('starting');
    try {
      // erster Eintrag, auch wenn noch kein Standort da ist (Ansicht zeigt dann „Standort wird gesucht“)
      if (lastPos) await send(s, lastPos, true);
      else if (!(await rpc<boolean>('live_put', { p_id: s.id, p_token: s.token, p_payload: await encrypt(s.key, '{}'), p_minutes: LIVE_RULES.expiryMinutes }))) throw new Error('abgelehnt');
      await save(STORE_KEY, s);
      setShare(s);
      setStatus('on');
      return s;
    } catch {
      setStatus('error');
      return null;
    }
  }, [lastPos, send]);

  // neue Position → senden (gedrosselt); zusätzlich alle 5 s prüfen, damit auch beim Stillstehen
  // regelmäßig ein Lebenszeichen kommt und eine zu frühe Bewegung nachgeholt wird
  const posRef = useRef(lastPos);
  posRef.current = lastPos;
  useEffect(() => {
    if (share && lastPos) void send(share, lastPos);
  }, [share, lastPos, send]);
  useEffect(() => {
    if (!share) return;
    const t = window.setInterval(() => posRef.current && void send(share, posRef.current), 5000);
    return () => window.clearInterval(t);
  }, [share, send]);

  return { share, status, lastSent, start, stop, link: share ? linkFor(share) : null };
}
