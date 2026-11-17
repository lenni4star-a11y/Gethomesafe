# Zwei kurze Reels mit gezeichneten Menschen (flach, ohne echte Personen), Goodway-Stil
import math, os, shutil, subprocess, random
from PIL import Image, ImageDraw, ImageFilter
from compose import NIGHT, INK, MUTED, LAV, LIT, font, wordmark, text_block
W, H, FPS, S = 1080, 1920, 30, 2  # S = Überabtastung für weiche Kanten
SKY = (17, 15, 27)
def ease(t):
    t = max(0, min(1, t)); return t * t * (3 - 2 * t)
def mix(c, a, base=NIGHT):
    return tuple(int(base[i] + (c[i] - base[i]) * a) for i in range(3))

def person(d, x, y, h, phase, skin, top, legs, hair, hairstyle='short', phone=False, scale=S):
    """Gehende Figur, Füße bei (x, y), Höhe h; phase = Schrittphase"""
    x, y, h = x * scale, y * scale, h * scale
    hr = h * 0.085; neck = y - h + hr * 2
    hip = y - h * 0.47; sh = y - h * 0.80
    sw = math.sin(phase) * h * 0.13
    lw = h * 0.07
    # Beine
    for s, c in ((sw, tuple(max(0, v - 25) for v in legs)), (-sw, legs)):
        d.line([(x, hip), (x + s * 0.6, y - h * 0.24), (x + s, y)], fill=c, width=int(lw), joint='curve')
        d.ellipse([x + s - lw * 0.8, y - lw * 0.5, x + s + lw * 1.3, y + lw * 0.4], fill=(30, 28, 40))
    # Rumpf
    d.rounded_rectangle([x - h * 0.11, sh - h * 0.02, x + h * 0.11, hip + h * 0.03], radius=h * 0.07, fill=top)
    # Arme
    aw = h * 0.055
    back = (x - sw * 0.7, hip + h * 0.02)
    d.line([(x, sh + h * 0.03), (x - sw * 0.4, (sh + hip) / 2), back], fill=tuple(max(0, v - 20) for v in top), width=int(aw), joint='curve')
    if phone:
        hand = (x + h * 0.13, sh + h * 0.12)
        d.line([(x, sh + h * 0.03), (x + h * 0.06, sh + h * 0.2), hand], fill=top, width=int(aw), joint='curve')
        d.rounded_rectangle([hand[0] - h * 0.02, hand[1] - h * 0.06, hand[0] + h * 0.035, hand[1] + h * 0.01], radius=h * 0.01, fill=(199, 184, 255))
    else:
        d.line([(x, sh + h * 0.03), (x + sw * 0.4, (sh + hip) / 2), (x + sw * 0.7, hip + h * 0.02)], fill=top, width=int(aw), joint='curve')
    # Kopf und Haare
    hy = sh - h * 0.02 - hr * 1.15
    d.ellipse([x - hr, hy - hr, x + hr, hy + hr], fill=skin)
    if hairstyle == 'long':
        d.chord([x - hr * 1.1, hy - hr * 1.15, x + hr * 1.1, hy + hr * 0.9], 180, 360, fill=hair)
        d.rounded_rectangle([x - hr * 1.12, hy - hr * 0.2, x - hr * 0.55, hy + hr * 1.9], radius=hr * 0.4, fill=hair)
    elif hairstyle == 'bun':
        d.chord([x - hr * 1.05, hy - hr * 1.1, x + hr * 1.05, hy + hr * 0.6], 180, 360, fill=hair)
        d.ellipse([x - hr * 0.5, hy - hr * 1.75, x + hr * 0.5, hy - hr * 0.8], fill=hair)
    elif hairstyle == 'cap':
        d.chord([x - hr * 1.05, hy - hr * 1.1, x + hr * 1.05, hy + hr * 0.5], 180, 360, fill=hair)
        d.rectangle([x, hy - hr * 0.25, x + hr * 1.5, hy - hr * 0.05], fill=hair)
    else:
        d.chord([x - hr * 1.05, hy - hr * 1.1, x + hr * 1.05, hy + hr * 0.4], 180, 360, fill=hair)

def lamp(d, x, ground, glow_layer, on=1.0, scale=S):
    X, G = x * scale, ground * scale
    d.line([(X, G), (X, G - 620 * scale)], fill=(48, 44, 66), width=10 * scale)
    d.line([(X, G - 620 * scale), (X + 70 * scale, G - 640 * scale)], fill=(48, 44, 66), width=8 * scale)
    d.ellipse([X + 50 * scale, G - 650 * scale, X + 100 * scale, G - 628 * scale], fill=mix(LIT, on, (60, 55, 70)))
    if on > 0:
        g = ImageDraw.Draw(glow_layer)
        lx = X + 75 * scale
        g.polygon([(lx - 20 * scale, G - 630 * scale), (lx + 20 * scale, G - 630 * scale), (lx + 260 * scale, G), (lx - 260 * scale, G)], fill=(int(70 * on), int(52 * on), int(22 * on)))
        g.ellipse([lx - 70 * scale, G - 690 * scale, lx + 70 * scale, G - 570 * scale], fill=(int(200 * on), int(150 * on), int(70 * on)))

def scene(t, lamps, people, ground=1500, extra=None):
    big = Image.new('RGB', (W * S, H * S), SKY)
    d = ImageDraw.Draw(big)
    # Häuser im Hintergrund mit ein paar hellen Fenstern
    rnd = random.Random(4)
    for i in range(12):
        bx = i * 190 - 40
        bh = rnd.randint(420, 760)
        d.rectangle([bx * S, (ground - 80 - bh) * S, (bx + 180) * S, (ground - 80) * S], fill=(26, 23, 38))
        for wy in range(ground - 60 - bh, ground - 140, 90):
            for wx in range(bx + 25, bx + 160, 55):
                if rnd.random() < 0.18:
                    d.rectangle([wx * S, wy * S, (wx + 26) * S, (wy + 38) * S], fill=(92, 74, 48))
    d.rectangle([0, (ground - 80) * S, W * S, ground * S], fill=(34, 31, 48))  # Gehsteig
    d.rectangle([0, ground * S, W * S, H * S], fill=(22, 20, 32))
    glow = Image.new('RGB', big.size, (0, 0, 0))
    for lx, on in lamps:
        lamp(d, lx, ground - 40, glow, on)
    glow = glow.filter(ImageFilter.GaussianBlur(40))
    big = Image.fromarray(__import__('numpy').clip(__import__('numpy').asarray(big).astype(int) + __import__('numpy').asarray(glow).astype(int), 0, 255).astype('uint8'))
    d = ImageDraw.Draw(big)
    if extra: extra(d)
    for p in people:
        person(d, *p)
    return big.resize((W, H), Image.LANCZOS)

def caption(img, a, first, rest, size=86, y=230):
    d = ImageDraw.Draw(img)
    if first: y = text_block(d, 70, y, first, size, mix(LAV, a, SKY), 'Bold', maxw=940)
    if rest: text_block(d, 70, y, rest, size, mix(INK, a, SKY), 'Bold', maxw=940)

def phone_card(img, a, title, buttons):
    if a <= 0: return
    card = Image.new('RGBA', (760, 360), (0, 0, 0, 0))
    d = ImageDraw.Draw(card)
    d.rounded_rectangle([0, 0, 759, 359], 36, fill=(31, 28, 46, int(240 * a)), outline=(58, 53, 85, int(255 * a)), width=2)
    d.text((48, 44), title, font=font(56, 'Bold'), fill=(244, 241, 255, int(255 * a)))
    x = 48
    for label, accent in buttons:
        w = 300
        d.rounded_rectangle([x, 220, x + w, 310], 24, fill=(199, 184, 255, int(255 * a)) if accent else (58, 53, 85, int(255 * a)))
        d.text((x + w / 2, 265), label, font=font(42, 'Bold'), fill=(21, 19, 31, int(255 * a)) if accent else (244, 241, 255, int(255 * a)), anchor='mm')
        x += w + 40
    img.paste(card, (160, 1560 - int(30 * (1 - a))), card)

def render(name, dur, frame):
    shutil.rmtree('pf', ignore_errors=True); os.makedirs('pf')
    for i in range(int(FPS * dur)):
        frame(i / FPS).save(f'pf/f{i:04d}.png')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-framerate', str(FPS), '-i', 'pf/f%04d.png', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', f'out/{name}.mp4'], check=True)

# ---------- Video 3: „Heimweg, aber entspannt“ – eine Person, Laternen ziehen vorbei, Rückfrage „Alles okay?“
def v3(t):
    speed = 140
    off = (t * speed) % 480
    lamps = [(x - off, 1.0) for x in range(-200, 1500, 480)]
    ph = t * 6.2
    img = scene(t, lamps, [(470, 1500, 430, ph, (226, 178, 140), (92, 60, 140), (40, 40, 60), (30, 22, 20), 'long', t > 5.5)])
    d = ImageDraw.Draw(img)
    wordmark(d, 70, 90, 46)
    seq = [(0.3, 2.6, '2:40 Uhr.', 'Noch 18 Minuten\nbis nach Hause.'), (2.7, 5.2, 'Diesmal', 'ohne Schlüssel in\nder Faust.'), (9.4, 12.0, 'Der helle Weg.', 'Und jemand fragt\nnach.')]
    for a, b, f, r in seq:
        if a <= t <= b: caption(img, min(ease((t - a) / .35), ease((b - t) / .35)), f, r)
    if 5.4 <= t <= 9.2:
        caption(img, min(ease((t - 5.4) / .35), ease((9.2 - t) / .35)), 'Goodway fragt:', None)
        pa = min(ease((t - 5.8) / .4), ease((9.2 - t) / .4))
        phone_card(img, pa, 'Alles okay?', [('Ja, alles gut', t > 7.6), ('Nein', False)])
    if t >= 12.1:
        a = ease((t - 12.1) / .5)
        caption(img, a, None, 'Komm gut heim.', 100)
        ImageDraw.Draw(img).text((70, 370), 'goodway – bald zum Testen', font=font(44, 'Medium'), fill=mix(LAV, a, SKY))
    return img

# ---------- Video 4: „Club aus, Crew trennt sich“ – drei Freund*innen vor dem Club, jede*r bekommt den eigenen Weg
def v4(t):
    walk = ease((t - 4.0) / 6.0)
    ppl = [
        (430 - 380 * walk, 1500, 410, t * 6 if t > 4 else 0, (141, 98, 70), (220, 90, 120), (40, 40, 60), (20, 16, 16), 'bun', False),
        (560, 1500, 440, 0, (236, 196, 160), (60, 140, 120), (30, 34, 54), (200, 160, 90), 'short', t > 7),
        (690 + 380 * walk, 1500, 420, t * 6 if t > 4 else 0, (190, 140, 100), (90, 90, 170), (50, 44, 60), (40, 30, 30), 'cap', False),
    ]
    def door(d):
        d.rectangle([450 * S, 1060 * S, 670 * S, 1420 * S], fill=(12, 10, 18))
        d.rounded_rectangle([430 * S, 980 * S, 690 * S, 1040 * S], 12 * S, fill=(24, 20, 36), outline=(199, 184, 255), width=3 * S)
        d.text((560 * S, 1010 * S), 'CLUB', font=font(40 * S, 'Bold'), fill=(199, 184, 255), anchor='mm')
    lamps = [(80, 1.0), (980, 1.0)]
    img = scene(t, lamps, ppl, extra=door)
    d = ImageDraw.Draw(img)
    wordmark(d, 70, 90, 46)
    seq = [(0.3, 3.0, 'Sonntag, 7 Uhr.', 'Alle wohnen woanders.\nNatürlich.'), (3.1, 6.6, 'Kein Bock mehr auf', '„Schreib, wenn du\nda bist“ und dann\nvergessen.'), (6.8, 10.6, 'Goodway:', 'Jede*r den eigenen\nhellen Weg. Mit\nBegleitung, wenn du\nwillst.')]
    for a, b, f, r in seq:
        if a <= t <= b: caption(img, min(ease((t - a) / .35), ease((b - t) / .35)), f, r, 80)
    if t >= 10.8:
        a = ease((t - 10.8) / .5)
        caption(img, a, None, 'Komm gut heim.', 100)
        ImageDraw.Draw(img).text((70, 370), 'goodway – bald zum Testen in Berlin', font=font(44, 'Medium'), fill=mix(LAV, a, SKY))
    return img

import sys
which = sys.argv[1]
if which == 'test':
    for n, f, ts in (('v3', v3, [1, 7.8]), ('v4', v4, [1, 8])):
        for tt in ts: f(tt).save(f'{n}-{tt}.png')
elif which == 'v3': render('reel-3-alles-okay', 13.5, v3)
else: render('reel-4-crew', 12.8, v4)
print('ok')
