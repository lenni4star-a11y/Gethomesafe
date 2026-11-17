# „Bald da“-Material vor dem Launch: 3 Posts (4:5), 1 Story (9:16), 1 Teaser-Video (9:16)
import os, shutil, subprocess, numpy as np
from PIL import Image, ImageDraw, ImageFilter
from compose import NIGHT, INK, MUTED, LAV, LIT, font, wordmark, text_block
def glow(img, cx, cy, r, color, k):
    g = Image.new('RGB', img.size, (0, 0, 0)); ImageDraw.Draw(g).ellipse([cx - r, cy - r, cx + r, cy + r], fill=tuple(int(c * k) for c in color))
    g = g.filter(ImageFilter.GaussianBlur(r * 0.6))
    return Image.fromarray(np.clip(np.asarray(img).astype(int) + np.asarray(g).astype(int), 0, 255).astype('uint8'))
def lamp(img, cx, top, h, on=1.0, cone=True):
    """Straßenlaterne mit Lichtkegel; on 0..1"""
    W, H = img.size
    if on > 0 and cone:
        c = Image.new('RGB', img.size, (0, 0, 0)); d = ImageDraw.Draw(c)
        d.polygon([(cx - 40, top + 60), (cx + 40, top + 60), (cx + 420, top + h), (cx - 420, top + h)], fill=tuple(int(v * 0.22 * on) for v in LIT))
        img = Image.fromarray(np.clip(np.asarray(img).astype(int) + np.asarray(c.filter(ImageFilter.GaussianBlur(60))).astype(int), 0, 255).astype('uint8'))
        img = glow(img, cx, top + 40, 150, LIT, 0.55 * on)
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([cx - 9, top + 50, cx + 9, top + h], radius=9, fill=(52, 48, 72))
    d.rounded_rectangle([cx - 70, top, cx + 70, top + 60], radius=30, fill=(52, 48, 72))
    col = tuple(int(60 + (v - 60) * on) for v in (255, 226, 168))
    d.rounded_rectangle([cx - 52, top + 40, cx + 52, top + 62], radius=11, fill=col)
    return img
def footer(d, W, H, url=True):
    if url: d.text((W // 2, H - 110), 'goodwayapp.com', font=font(40, 'Medium'), fill=LAV, anchor='mm')

W, H = 1080, 1350
# Post 1: „Bald.“
p = Image.new('RGB', (W, H), NIGHT); p = lamp(p, 540, 330, 760)
d = ImageDraw.Draw(p); wordmark(d, 70, 80, 46)
d.text((540, 180), 'Bald.', font=font(150, 'Bold'), fill=INK, anchor='mm')
d.text((540, 1150), 'Komm gut heim.', font=font(64, 'Bold'), fill=INK, anchor='mm')
footer(d, W, H); p.save('teaser/post-a-bald.png')

# Post 2: Aussage
p = Image.new('RGB', (W, H), NIGHT); p = glow(p, 900, 1180, 260, LAV, 0.35); d = ImageDraw.Draw(p); wordmark(d, 70, 80, 46)
y = text_block(d, 70, 300, 'Der kürzeste Weg', 96, INK, 'Bold', maxw=940)
y = text_block(d, 70, y, 'ist nachts nicht\nimmer der beste.', 96, LAV, 'Bold', maxw=940)
text_block(d, 70, y + 60, 'Goodway zeigt dir den, der sich gut anfühlt: hell, belebt, mit Öffis oder Taxi im Vergleich.', 44, (210, 204, 235), 'Medium', maxw=900)
d.text((70, H - 200), 'Bald im App Store.', font=font(54, 'Bold'), fill=INK)
d.text((70, H - 130), 'Jetzt schon testen: goodwayapp.com', font=font(40, 'Medium'), fill=LAV)
p.save('teaser/post-b-kuerzester-weg.png')

# Post 3: Was kommt (Liste)
p = Image.new('RGB', (W, H), NIGHT); d = ImageDraw.Draw(p); wordmark(d, 70, 80, 46)
d.text((70, 210), 'Was kommt', font=font(100, 'Bold'), fill=INK)
items = [('Der helle Weg', 'jede Laterne der Stadt auf der Karte'), ('Öffis, zu Fuß, Taxi', 'mit Nachtbus und Nacht-U-Bahn'), ('Begleitung', 'die App fragt nach, ob alles okay ist'), ('SOS mit einem Tipp', 'Notruf, stiller Notruf, Hilfetelefon'), ('Keine Accounts', 'deine Daten bleiben auf dem Handy')]
y = 400
for t, s in items:
    d.ellipse([70, y + 18, 98, y + 46], fill=LAV)
    d.text((130, y), t, font=font(56, 'Bold'), fill=INK); d.text((130, y + 70), s, font=font(38, 'Medium'), fill=MUTED); y += 160
d.text((70, H - 130), 'Bald da · goodwayapp.com', font=font(42, 'Medium'), fill=LAV)
p.save('teaser/post-c-was-kommt.png')

# Story: Frage-Sticker-Vorlage
SW, SH = 1080, 1920
s = Image.new('RGB', (SW, SH), NIGHT); s = lamp(s, 540, 420, 900)
d = ImageDraw.Draw(s); wordmark(d, 70, 120, 50)
d.text((540, 260), 'Bald da.', font=font(130, 'Bold'), fill=INK, anchor='mm')
d.text((540, 1420), 'Wie kommst du nachts heim?', font=font(62, 'Bold'), fill=INK, anchor='mm')
d.rounded_rectangle([140, 1490, 940, 1680], radius=36, outline=(90, 84, 120), width=4)
d.text((540, 1585), '[hier Umfrage- oder Frage-Sticker]', font=font(34, 'Medium'), fill=MUTED, anchor='mm')
d.text((540, 1800), 'goodwayapp.com', font=font(44, 'Medium'), fill=LAV, anchor='mm')
s.save('teaser/story-frage.png')

# Video: Laterne flackert an, Licht breitet sich aus, Text erscheint
FPS, DUR = 30, 9
shutil.rmtree('tf', ignore_errors=True); os.makedirs('tf')
flick = [0, 0, 0.6, 0, 0, 0.9, 0.2, 1]
for i in range(FPS * DUR):
    t = i / FPS
    if t < 1.2: on = 0
    elif t < 2.0: on = flick[min(int((t - 1.2) / 0.1), len(flick) - 1)]
    else: on = 1
    fr = Image.new('RGB', (SW, SH), NIGHT); fr = lamp(fr, 540, 520, 900, on)
    d = ImageDraw.Draw(fr)
    def fade(a, b=99): return max(0, min(1, (t - a) / 0.5)) * max(0, min(1, (b - t) / 0.5))
    def col(c, a): return tuple(int(NIGHT[k] + (c[k] - NIGHT[k]) * a) for k in range(3))
    a1 = fade(0.2, 2.2)
    if a1 > 0: d.text((540, 300), 'Nachts heim?', font=font(110, 'Bold'), fill=col(INK, a1), anchor='mm')
    a2 = fade(2.6)
    if a2 > 0: d.text((540, 300), 'goodway.', font=font(150, 'Bold'), fill=col(INK, a2), anchor='mm')
    a3 = fade(3.6)
    if a3 > 0: d.text((540, 1560), 'Der helle Weg nach Hause.', font=font(60, 'Bold'), fill=col(INK, a3), anchor='mm')
    a4 = fade(5.0)
    if a4 > 0: d.text((540, 1660), 'Bald im App Store.', font=font(60, 'Bold'), fill=col(LAV, a4), anchor='mm')
    a5 = fade(6.2)
    if a5 > 0: d.text((540, 1800), 'Jetzt testen: goodwayapp.com', font=font(44, 'Medium'), fill=col(MUTED, a5), anchor='mm')
    fr.save(f'tf/f{i:04d}.png')
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-framerate', str(FPS), '-i', 'tf/f%04d.png', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', 'teaser/teaser-video-laterne.mp4'], check=True)
print('ok')
