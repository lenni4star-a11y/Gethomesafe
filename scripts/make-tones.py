import numpy as np, wave, sys
out = sys.argv[1]
SR = 44100
def save(name, x):
    x = x / np.max(np.abs(x)) * 0.97
    with wave.open(f"{out}/{name}.wav", "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((x * 32767).astype(np.int16).tobytes())

def note(freq, dur, decay=6.0):
    t = np.arange(int(SR * dur)) / SR
    env = np.exp(-decay * t) * np.minimum(1, t * 400)
    # Marimba-/Telefon-artiger Klang mit Obertönen
    s = np.sin(2*np.pi*freq*t) + 0.5*np.sin(2*np.pi*2*freq*t) + 0.25*np.sin(2*np.pi*3.01*freq*t) + 0.15*np.sin(2*np.pi*4.2*freq*t)
    return s * env

# Klingelton: zweimal eine fröhliche Figur, dann Pause (gut als Handy-Klingeln erkennbar)
fig = [(1318.5, .14), (1567.98, .14), (1975.5, .14), (1567.98, .14), (1318.5, .14), (1975.5, .32)]
part = np.concatenate([note(f, d, 7) for f, d in fig])
ring = np.concatenate([part, np.zeros(int(SR*.12)), part, np.zeros(int(SR*.9))])
save("ringtone", np.tanh(ring * 1.6))

# Sirene: auf- und abschwellender Ton (Wail), sehr laut, Rechteck-artig weich gemacht
dur = 4.0
t = np.arange(int(SR*dur)) / SR
f = 750 + 650 * (0.5 - 0.5*np.cos(2*np.pi*t/dur))
phase = 2*np.pi*np.cumsum(f)/SR
siren = np.tanh(3*np.sin(phase)) + 0.3*np.sin(2*phase)
save("siren", siren)

# Testton: kurzes Klingeln
save("testton", np.tanh(part * 1.6))
