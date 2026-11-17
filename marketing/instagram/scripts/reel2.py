# Reel 2: „Kein Bock mehr auf …“ – müde, ehrlich, ein bisschen witzig; danach breitet sich das Licht über Berlin aus
import pickle, subprocess, os, shutil
import numpy as np
from PIL import Image, ImageDraw
from compose import *
base = np.load('base_reel.npy'); lit = np.load('lit_reel.npy'); meta = pickle.load(open('meta_reel.pkl', 'rb'))
H, W = base.shape
ox = (13.4416 - meta['cx']) * meta['k'] * meta['scale'] + W / 2
oy = (meta['cy'] - 52.5009) * meta['scale'] + H / 2
yy, xx = np.mgrid[0:H, 0:W]
dist = np.hypot(xx - ox, yy - oy); dmax = dist.max()
FPS, DUR, MAPY = 30, 19, 600
shutil.rmtree('frames2', ignore_errors=True); os.makedirs('frames2')
def ease(t):
    t = max(0, min(1, t)); return t * t * (3 - 2 * t)
def mix(color, a):
    return tuple(int(NIGHT[i] + (color[i] - NIGHT[i]) * a) for i in range(3))
# (von, bis, erste Zeile in Lila, Rest, Größe)
SEQ = [
    (0.3, 2.5, '6:12 Uhr.', 'Füße tot.\nAkku 4 %.', 100),
    (2.6, 4.9, 'Kein Bock mehr auf', 'Schlüssel zwischen\nden Fingern.', 84),
    (5.0, 7.3, 'Kein Bock mehr auf', 'Typen, die dir\nhinterherlaufen.', 84),
    (7.4, 9.6, 'Kein Bock mehr auf', 'Umdrehen.\nAlle zehn Sekunden.', 84),
    (9.8, 13.0, 'Goodway kennt', '210.000 Laternen\nin Berlin. Und den\nhellen Weg heim.', 76),
    (13.2, 15.8, 'Nachtbus, U-Bahn,', 'Taxi oder zu Fuß.\nUnd jemand fragt,\nob alles okay ist.', 76),
]
for i in range(FPS * DUR):
    t = i / FPS
    img = Image.new('RGB', (1080, 1920), NIGHT)
    pulse = 30 + 12 * np.sin(t * 3)
    r = ease((t - 9.6) / 4.5) * dmax * 1.05 + pulse * ease(t / 1.5)
    mapim = lightmap(base, lit, np.clip((r - dist) / 60, 0, 1))
    dim = 0.55 + 0.45 * ease((t - 9.4) / 1.0)  # vor dem Licht: Karte gedimmt
    mapim = Image.blend(Image.new('RGB', mapim.size, NIGHT), mapim, ease(t / 1.2) * dim)
    img.paste(mapim, (20, MAPY))
    d = ImageDraw.Draw(img)
    wordmark(d, 70, 90, 46)
    for a, b, first, rest, size in SEQ:
        if a <= t <= b:
            al = min(ease((t - a) / 0.35), ease((b - t) / 0.35))
            y = text_block(d, 70, 210, first, size, mix(LAV, al), 'Bold', maxw=940)
            text_block(d, 70, y, rest, size, mix(INK, al), 'Bold', maxw=940)
    if t >= 16.0:
        al = ease((t - 16.0) / 0.5)
        text_block(d, 70, 230, 'Komm gut heim.', 100, mix(INK, al), 'Bold', maxw=940)
        d.text((70, 370), 'goodway – bald zum Testen in Berlin', font=font(44, 'Medium'), fill=mix(LAV, al))
    d.text((1010, 1860), 'Daten: Geoportal Berlin, OpenStreetMap', font=font(22, 'Regular'), fill=MUTED, anchor='ra')
    img.save(f'frames2/f{i:04d}.png')
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-framerate', str(FPS), '-i', 'frames2/f%04d.png', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', 'out/reel-2-kein-bock.mp4'], check=True)
print('video ok')
