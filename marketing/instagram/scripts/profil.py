# Profilbilder für Instagram (1080 x 1080, kreis-sicher), Goodway-Stil
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from compose import NIGHT, INK, LAV, font
S = 3; N = 1080 * S
def glow(img, cx, cy, r, color, strength):
    g = Image.new('RGB', img.size, (0, 0, 0)); d = ImageDraw.Draw(g)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=tuple(int(c * strength) for c in color))
    g = g.filter(ImageFilter.GaussianBlur(r * 0.55))
    a = np.clip(np.asarray(img).astype(int) + np.asarray(g).astype(int), 0, 255).astype('uint8')
    return Image.fromarray(a)
def finish(img, name):
    img = img.resize((1080, 1080), Image.LANCZOS); img.save(f'profil/{name}.png')
    # Vorschau im Kreis, wie Instagram es zeigt
    m = Image.new('L', (1080, 1080), 0); ImageDraw.Draw(m).ellipse([0, 0, 1079, 1079], fill=255)
    p = Image.new('RGB', (1080, 1080), (255, 255, 255)); p.paste(img, (0, 0), m); return p

# A: Laterne wie das App-Symbol, mit warmem Lichtschein
a = Image.new('RGB', (N, N), NIGHT)
a = glow(a, N // 2, int(N * 0.40), int(N * 0.30), LAV, 0.35)
d = ImageDraw.Draw(a); r = int(N * 0.17); cx, cy = N // 2, int(N * 0.40)
d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=LAV)
w = int(N * 0.05); top = int(N * 0.63); bot = int(N * 0.78)
d.rounded_rectangle([cx - w // 2, top, cx + w // 2, bot], radius=w // 2, fill=INK)
pa = finish(a, 'goodway-profil-laterne')

# B: Monogramm „g.“ mit leuchtendem Punkt auf der Grundlinie (wie in der Wortmarke)
b = Image.new('RGB', (N, N), NIGHT); d = ImageDraw.Draw(b)
f = font(int(N * 0.62), 'Bold')
bb = d.textbbox((0, 0), 'g', font=f, anchor='ls')  # relativ zur Grundlinie
gw = bb[2] - bb[0]; dot = int(N * 0.07); gap = int(N * 0.025)
total = gw + gap + dot * 2
x0 = (N - total) // 2 - bb[0]
base = N // 2 - (bb[1] + bb[3]) // 2  # Glyphe (x-Höhe bis Unterlänge) vertikal mittig
d.text((x0, base), 'g', font=f, fill=INK, anchor='ls')
dx = x0 + bb[2] + gap + dot; dy = base - dot
b = glow(b, dx, dy, dot * 3, LAV, 0.45); d = ImageDraw.Draw(b)
d.ellipse([dx - dot, dy - dot, dx + dot, dy + dot], fill=LAV)
pb = finish(b, 'goodway-profil-g')

# C: Wortmarke „goodway.“
c = Image.new('RGB', (N, N), NIGHT); d = ImageDraw.Draw(c)
f = font(int(N * 0.17), 'Bold'); t = 'goodway'
bb = d.textbbox((0, 0), t, font=f); tw = bb[2] - bb[0]; dot = int(N * 0.022)
total = tw + int(N * 0.012) + dot * 2; x0 = (N - total) // 2 - bb[0]; y0 = N // 2 - (bb[1] + bb[3]) // 2
d.text((x0, y0), t, font=f, fill=INK)
bx = x0 + bb[2] + int(N * 0.012) + dot; by = y0 + bb[3] - dot - int(N * 0.004)
c = glow(c, bx, by, dot * 4, LAV, 0.5); d = ImageDraw.Draw(c)
d.ellipse([bx - dot, by - dot, bx + dot, by + dot], fill=LAV)
pc = finish(c, 'goodway-profil-wortmarke')

prev = Image.new('RGB', (3 * 360 + 80, 400), (255, 255, 255))
for i, p in enumerate([pa, pb, pc]): prev.paste(p.resize((360, 360), Image.LANCZOS), (20 + i * 380, 20))
prev.save('profil/vorschau.png'); print('ok')
