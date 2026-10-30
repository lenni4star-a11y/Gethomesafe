// Ton, Sprache, Vibration und Bildschirm im Browser.
//
// Wichtig für Handys:
// - Töne laufen über HTML-Audio-Elemente (Medienwiedergabe), nicht über die Web Audio API.
//   So werden sie auf dem iPhone vom Lautlos-Schalter möglichst nicht stummgeschaltet.
// - Browser erlauben Ton erst nach einem Tipp. `unlockAudio()` muss deshalb einmal direkt in einem
//   Tipp aufgerufen werden (z. B. „Begleitung starten“). Danach dürfen die Elemente später von selbst abspielen.
// - Sprachausgabe: deutsche Gerätestimme (de-AT, sonst de-DE), sonst vorab aufgenommene Dateien.

const BASE = `${import.meta.env.BASE_URL}audio/`;

export type Sound = 'ringtone' | 'siren' | 'testton';
export type VoiceClip =
  | 'check-hallo'
  | 'check-okay'
  | 'check-gefuehl'
  | 'check-weiter'
  | 'check-hilfe'
  | 'fake-1'
  | 'fake-2'
  | 'fake-3'
  | 'fake-4'
  | 'fake-5'
  | 'fake-6';

// Je ein festes Element pro Ton und eines für Sprache: einmal freigeschaltet, bleibt es freigeschaltet.
const players = new Map<string, HTMLAudioElement>();

function player(key: string, src?: string): HTMLAudioElement {
  let el = players.get(key);
  if (!el) {
    el = new Audio();
    el.preload = 'auto';
    el.setAttribute('playsinline', '');
    if (src) el.src = src;
    players.set(key, el);
  }
  return el;
}

const soundPlayer = (s: Sound) => player(s, `${BASE}${s}.mp3`);
const voicePlayer = () => player('voice', `${BASE}check-hallo.mp3`);

let unlocked = false;
// Elemente, die gerade stumm „angespielt“ werden, um sie freizuschalten
const priming = new Set<HTMLAudioElement>();

/** Ein echtes Abspielen hat Vorrang vor dem stummen Freischalten */
function takeOver(el: HTMLAudioElement) {
  priming.delete(el);
  el.muted = false;
}
export const isAudioUnlocked = () => unlocked;

/** Muss direkt in einem Tipp aufgerufen werden. Schaltet Töne und Sprache für später frei. */
export function unlockAudio(): void {
  // iPhone (Safari 16.4+): als Medienwiedergabe kennzeichnen, damit der Lautlos-Schalter nicht greift
  try {
    const nav = navigator as Navigator & { audioSession?: { type: string } };
    if (nav.audioSession) nav.audioSession.type = 'playback';
  } catch {
    /* nicht unterstützt */
  }
  for (const el of [soundPlayer('ringtone'), soundPlayer('siren'), soundPlayer('testton'), voicePlayer()]) {
    if (!el.paused) continue;
    el.muted = true;
    priming.add(el);
    el.play()
      ?.then(() => {
        if (!priming.has(el)) return; // inzwischen echt abgespielt
        priming.delete(el);
        el.pause();
        el.currentTime = 0;
        el.muted = false;
      })
      .catch(() => {
        priming.delete(el);
        el.muted = false;
      });
  }
  // Sprachausgabe freischalten (leiser, leerer Satz) und Stimmen laden
  if (canSpeak()) {
    try {
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      speechSynthesis.speak(u);
    } catch {
      /* egal */
    }
    void loadVoices();
  }
  unlocked = true;
}

/** Ton in Schleife abspielen, bis die zurückgegebene Funktion aufgerufen wird */
export function loop(sound: Sound): () => void {
  const el = soundPlayer(sound);
  takeOver(el);
  el.loop = true;
  el.volume = 1;
  el.currentTime = 0;
  void el.play().catch(() => {});
  return () => {
    el.pause();
    el.currentTime = 0;
    el.loop = false;
  };
}

export function playOnce(sound: Sound): Promise<void> {
  const el = soundPlayer(sound);
  takeOver(el);
  el.loop = false;
  el.volume = 1;
  el.currentTime = 0;
  return new Promise((resolve) => {
    el.onended = () => resolve();
    el.play().catch(() => resolve());
  });
}

// ---------------------------------------------------------------- Vibration

export const canVibrate = () => typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

/** true, wenn der Browser die Vibration angenommen hat (Android). Auf dem iPhone gibt es keine Vibration für Web-Apps. */
export function vibrate(pattern: number | number[] = [400, 200, 400]): boolean {
  try {
    return canVibrate() ? navigator.vibrate(pattern) : false;
  } catch {
    return false;
  }
}

/** Klingeln mit Vibration in Schleife */
export function ring(): () => void {
  const stopSound = loop('ringtone');
  vibrate([800, 400, 800, 400, 800]);
  const id = window.setInterval(() => vibrate([800, 400, 800, 400, 800]), 3200);
  return () => {
    stopSound();
    clearInterval(id);
    vibrate(0);
  };
}

/** Kurzer Alarm für die Rückfrage: Ton + Vibration */
export function alertOnce(): void {
  void playOnce('testton');
  vibrate([500, 200, 500, 200, 500]);
}

// ---------------------------------------------------------------- Sprache

export const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;

let voicesPromise: Promise<SpeechSynthesisVoice[]> | null = null;

/** Stimmen werden in vielen Browsern erst nach und nach geladen: kurz warten */
export function loadVoices(timeout = 2000): Promise<SpeechSynthesisVoice[]> {
  if (!canSpeak()) return Promise.resolve([]);
  voicesPromise ??= new Promise((resolve) => {
    const now = speechSynthesis.getVoices();
    if (now.length) return resolve(now);
    const done = () => resolve(speechSynthesis.getVoices());
    speechSynthesis.addEventListener?.('voiceschanged', done, { once: true });
    setTimeout(done, timeout);
  });
  return voicesPromise.then((v) => {
    if (!v.length) voicesPromise = null; // später nochmal versuchen
    return v;
  });
}

export async function germanVoice(): Promise<SpeechSynthesisVoice | null> {
  const voices = await loadVoices();
  const de = voices.filter((v) => v.lang?.toLowerCase().replace('_', '-').startsWith('de'));
  return (
    de.find((v) => v.lang.toLowerCase().includes('at')) ??
    de.find((v) => /de-de/i.test(v.lang.replace('_', '-')) && v.localService) ??
    de.find((v) => /de-de/i.test(v.lang.replace('_', '-'))) ??
    de[0] ??
    null
  );
}

// Chrome räumt laufende Sätze sonst manchmal weg, bevor sie fertig sind
const keep: SpeechSynthesisUtterance[] = [];

function speakTts(text: string, voice: SpeechSynthesisVoice): Promise<boolean> {
  return new Promise((resolve) => {
    let started = false;
    let finished = false;
    const u = new SpeechSynthesisUtterance(text);
    u.voice = voice;
    u.lang = voice.lang;
    u.rate = 0.95;
    u.volume = 1;
    keep.push(u);
    const finish = (ok: boolean) => {
      if (finished) return;
      finished = true;
      keep.splice(keep.indexOf(u), 1);
      resolve(ok);
    };
    u.onstart = () => (started = true);
    u.onend = () => finish(true);
    u.onerror = () => finish(started);
    speechSynthesis.cancel();
    speechSynthesis.resume();
    speechSynthesis.speak(u);
    // Startet die Stimme nicht, auf die Aufnahme ausweichen
    setTimeout(() => {
      if (!started) {
        speechSynthesis.cancel();
        finish(false);
      }
    }, 1800);
    // Sicherheitsnetz, falls „onend“ nie kommt
    setTimeout(() => finish(true), 2500 + text.length * 110);
  });
}

function playClip(clip: VoiceClip): Promise<boolean> {
  const el = voicePlayer();
  takeOver(el);
  return new Promise((resolve) => {
    el.onended = () => resolve(true);
    el.onerror = () => resolve(false);
    el.src = `${BASE}${clip}.mp3`;
    el.volume = 1;
    el.play().catch(() => resolve(false));
  });
}

export type VoiceMode = 'auto' | 'device' | 'recording';

/**
 * Satz sprechen. Mit Gerätestimme, wenn eine deutsche vorhanden ist und startet; sonst Aufnahme.
 * Ergebnis: wie gesprochen wurde ('device', 'recording') oder 'none', wenn gar nichts ging.
 */
export async function say(text: string, clip: VoiceClip, mode: VoiceMode = 'auto'): Promise<'device' | 'recording' | 'none'> {
  if (mode !== 'recording' && canSpeak()) {
    const voice = await germanVoice();
    if (voice && (await speakTts(text, voice))) return 'device';
    if (mode === 'device') return 'none';
  }
  return (await playClip(clip)) ? 'recording' : 'none';
}

export function stopSpeaking(): void {
  if (canSpeak()) speechSynthesis.cancel();
  const v = players.get('voice');
  if (v) {
    v.pause();
    v.onended?.(new Event('ended'));
  }
}

// ---------------------------------------------------------------- Spracherkennung (optional)

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
      const text = Array.from(e.results)
        .map((r) => r[0].transcript)
        .join(' ')
        .toLowerCase();
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

// ---------------------------------------------------------------- Bildschirm

type Lock = { release(): Promise<void> };

/** Bildschirm wach halten (Wake Lock). Gibt eine Funktion zum Freigeben zurück. */
export async function keepScreenOn(): Promise<() => void> {
  try {
    const nav = navigator as Navigator & { wakeLock?: { request(t: 'screen'): Promise<Lock> } };
    const lock = await nav.wakeLock?.request('screen');
    return () => void lock?.release();
  } catch {
    return () => {};
  }
}

export const canKeepScreenOn = () => typeof navigator !== 'undefined' && 'wakeLock' in navigator;

export const isIOS = () =>
  typeof navigator !== 'undefined' && (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

/** Einfacher PIN-Hash, damit die PIN nicht im Klartext gespeichert wird */
export async function hashPin(pin: string): Promise<string> {
  const data = new TextEncoder().encode('gethomesafe:' + pin);
  if (crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
  }
  return btoa(String.fromCharCode(...data));
}
