# Bausteine für Instagram-Bilder im Goodway-Stil (dunkel, eine Akzentfarbe, keine Emojis)
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

NIGHT = (21, 19, 31)
INK = (244, 241, 255)
MUTED = (179, 172, 208)
LAV = (199, 184, 255)
LIT = (255, 200, 97)
MINT = (94, 224, 176)
FD = '/usr/share/fonts/opentype/inter/'
def font(size, w='Bold'):
    try:
        return ImageFont.truetype(f'{FD}InterDisplay-{w}.otf', size)
    except OSError:
        return ImageFont.truetype(f'{FD}Inter-{w}.otf', size)

def lightmap(base, lit, reveal=None, glow=True):
    """base/lit: uint8-Arrays (H, W); reveal: optionale Maske 0..1 für die Lichtschicht"""
    b = base.astype(np.float32) / 255
    l = lit.astype(np.float32) / 255
    if reveal is not None:
        l = l * reveal
    img = np.zeros(base.shape + (3,), np.float32) + np.array(NIGHT, np.float32)
    img += b[..., None] * (np.array((70, 62, 104), np.float32) - np.array(NIGHT)) * 0.9
    lit_dim = l[..., None] * (np.array((120, 95, 60), np.float32))
    img = np.maximum(img, np.array(NIGHT) + lit_dim)
    if glow:
        li = Image.fromarray((l * 255).astype(np.uint8))
        g1 = np.asarray(li.filter(ImageFilter.GaussianBlur(3))).astype(np.float32) / 255
        g2 = np.asarray(li.filter(ImageFilter.GaussianBlur(12))).astype(np.float32) / 255
        img += (g1 * 1.1)[..., None] * np.array(LIT, np.float32) * 0.45 + (g2 * 1.4)[..., None] * np.array((255, 170, 70), np.float32) * 0.22
    img += l[..., None] * np.array((255, 230, 180), np.float32) * 0.35
    return Image.fromarray(np.clip(img, 0, 255).astype(np.uint8))

def wordmark(d, x, y, size=44):
    f = font(size, 'Bold')
    d.text((x, y), 'goodway', font=f, fill=INK)
    w = d.textlength('goodway', font=f)
    d.text((x + w, y), '.', font=f, fill=LAV)

def text_block(d, x, y, text, size, fill=INK, w='Bold', maxw=980, gap=1.18):
    f = font(size, w)
    lines = []
    for para in text.split('\n'):
        cur = ''
        for word in para.split(' '):
            t = (cur + ' ' + word).strip()
            if d.textlength(t, font=f) > maxw and cur:
                lines.append(cur); cur = word
            else:
                cur = t
        lines.append(cur)
    for i, ln in enumerate(lines):
        d.text((x, y + i * size * gap), ln, font=f, fill=fill)
    return y + len(lines) * size * gap

# Lichtkarten Berlin (Graustufen-PNG im Ordner ../maps): base = Wegenetz, lit = beleuchtete Wege
import os as _os, json as _json
MAPS = _os.path.join(_os.path.dirname(_os.path.abspath(__file__)), '..', 'maps')
def load_map(name):
    """name: base_reel, lit_reel (1040x1000, ganz Berlin), zbase, zlit (1080x1080, Kreuzberg/Neukölln), base_post, lit_post"""
    return np.asarray(Image.open(_os.path.join(MAPS, name + '.png')))
META = _json.load(open(_os.path.join(MAPS, 'meta.json')))
