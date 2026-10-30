// Vibration, Töne und Sprachausgabe im Browser.

let audio: AudioContext | null = null;

function ctx(): AudioContext | null {
  try {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') void audio.resume();
    return audio;
  } catch {
    return null;
  }
}

/** Muss einmal durch eine Nutzer-Geste aufgerufen werden, damit Töne später erlaubt sind */
export function unlockAudio(): void {
  ctx();
}

export function vibrate(pattern: number[] = [400, 200, 400]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* nicht unterstützt */
  }
}

export function beep(times = 3): void {
  const c = ctx();
  if (!c) return;
  for (let i = 0; i < times; i++) {
    const o = c.createOscillator();
    const g = c.createGain();
    o.frequency.value = 880;
    o.connect(g);
    g.connect(c.destination);
    const t = c.currentTime + i * 0.45;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.4, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.start(t);
    o.stop(t + 0.32);
  }
}

/** Klingelton, bis die zurückgegebene Funktion aufgerufen wird */
export function ring(): () => void {
  const c = ctx();
  let stopped = false;
  const play = () => {
    if (stopped || !c) return;
    for (const [f, dt] of [
      [660, 0],
      [880, 0.18],
      [660, 0.6],
      [880, 0.78],
    ] as const) {
      const o = c.createOscillator();
      const g = c.createGain();
      o.frequency.value = f;
      o.connect(g);
      g.connect(c.destination);
      const t = c.currentTime + dt;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      o.start(t);
      o.stop(t + 0.17);
    }
    vibrate([600, 300, 600]);
  };
  play();
  const id = window.setInterval(play, 2200);
  return () => {
    stopped = true;
    clearInterval(id);
    vibrate([0]);
  };
}

export const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

export function speak(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (!canSpeak()) return resolve();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'de-AT';
    const voice = speechSynthesis.getVoices().find((v) => v.lang.startsWith('de'));
    if (voice) u.voice = voice;
    u.rate = 0.95;
    u.onend = () => resolve();
    u.onerror = () => resolve();
    speechSynthesis.speak(u);
  });
}

export function stopSpeaking(): void {
  if (canSpeak()) speechSynthesis.cancel();
}

type Recognition = {
  lang: string;
  interimResults: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
};

export function canListen(): boolean {
  const w = window as unknown as Record<string, unknown>;
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
}

/** Hört kurz zu und erkennt „gut“ oder „nicht gut“. Ergebnis null = nichts erkannt. */
export function listenForAnswer(): { result: Promise<boolean | null>; stop: () => void } {
  const w = window as unknown as Record<string, new () => Recognition>;
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
  if (!Ctor) return { result: Promise.resolve(null), stop: () => {} };
  const rec = new Ctor();
  rec.lang = 'de-AT';
  rec.interimResults = false;
  let done = false;
  const result = new Promise<boolean | null>((resolve) => {
    rec.onresult = (e) => {
      const text = Array.from(e.results).map((r) => r[0].transcript).join(' ').toLowerCase();
      done = true;
      if (/nicht gut|schlecht|hilfe|nein|angst|nicht okay|nicht ok/.test(text)) resolve(false);
      else if (/gut|okay|ok|passt|alles klar|ja/.test(text)) resolve(true);
      else resolve(null);
    };
    rec.onend = () => !done && resolve(null);
    rec.onerror = () => resolve(null);
  });
  try {
    rec.start();
  } catch {
    return { result: Promise.resolve(null), stop: () => {} };
  }
  return { result, stop: () => rec.stop() };
}

/** Bildschirm während der Begleitung anlassen (wo unterstützt) */
export async function keepScreenOn(): Promise<() => void> {
  try {
    const nav = navigator as Navigator & { wakeLock?: { request(t: 'screen'): Promise<{ release(): Promise<void> }> } };
    const lock = await nav.wakeLock?.request('screen');
    return () => void lock?.release();
  } catch {
    return () => {};
  }
}

/** Einfacher PIN-Hash, damit die PIN nicht im Klartext gespeichert wird */
export async function hashPin(pin: string): Promise<string> {
  const data = new TextEncoder().encode('gethomesafe:' + pin);
  if (crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
  }
  return btoa(String.fromCharCode(...data));
}
