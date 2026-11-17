import numpy as np
from PIL import Image, ImageDraw
from compose import *
zb = np.load('zbase.npy'); zl = np.load('zlit.npy')
FULL = lightmap(zb, zl)
STRIP = FULL.crop((0, 300, 1080, 760))
N = 8
def slide(n, head, accent=None, body=None, foot=None, strip_y=0):
    img = Image.new('RGB', (1080, 1350), NIGHT)
    st = STRIP.crop((0, strip_y, 1080, strip_y + 420))
    img.paste(st, (0, 930), Image.linear_gradient('L').resize((1080, 420)))
    d = ImageDraw.Draw(img)
    wordmark(d, 70, 70, 46)
    d.text((1010, 78), f'{n}/{N}', font=font(32, 'Medium'), fill=MUTED, anchor='ra')
    y = text_block(d, 70, 230, head, 92, INK, 'Bold', maxw=940, gap=1.12)
    if accent:
        y = text_block(d, 70, y + 10, accent, 92, LAV, 'Bold', maxw=940, gap=1.12)
    if body:
        text_block(d, 70, y + 60, body, 42, MUTED, 'Medium', maxw=920, gap=1.38)
    if foot:
        f = font(32, 'Medium')
        d.rounded_rectangle((52, 1236, 88 + d.textlength(foot, font=f), 1290), 12, fill=NIGHT)
        d.text((70, 1243), foot, font=f, fill=LAV)
    img.save(f'out/slider/slide-{n}.png')

# 1: Titel mit großer Lichtkarte
img = Image.new('RGB', (1080, 1350), NIGHT)
img.paste(FULL, (0, 480))
img.paste(Image.new('RGB', (1080, 400), NIGHT), (0, 480), Image.linear_gradient('L').rotate(180).resize((1080, 400)))
img.paste(Image.new('RGB', (1080, 420), NIGHT), (0, 930), Image.linear_gradient('L').resize((1080, 420)))
d = ImageDraw.Draw(img)
wordmark(d, 70, 70, 46)
d.text((1010, 78), f'1/{N}', font=font(32, 'Medium'), fill=MUTED, anchor='ra')
y = text_block(d, 70, 230, 'Was goodway', 120, INK, 'Bold', gap=1.08)
text_block(d, 70, y, 'kann.', 120, LAV, 'Bold', gap=1.08)
d.text((70, 1243), 'Wischen  →', font=font(36, 'Medium'), fill=LAV)
img.save('out/slider/slide-1.png')

slide(2, 'Der helle Weg', accent='nach Hause.', body='Goodway sucht nicht nur den kürzesten Weg, sondern den, der sich gut anfühlt: beleuchtet, belebt, ohne zugesperrte Parks. Grün, gelb, rot zeigt dir jedes Stück.', foot='Laternen-Daten der Städte und OpenStreetMap')
slide(3, 'Öffis. Zu Fuß.', accent='Taxi. Roller.', body='Alles nebeneinander: wie lange es dauert und wie sich der Weg anfühlt. Mit Nachtbus und U-Bahn nach echtem Fahrplan.', strip_y=0)
slide(4, 'Was hat', accent='noch offen?', body='Spätis, Bars, Apotheken, Tankstellen, Taxistände direkt am Weg – und bis wann sie geöffnet haben. Für genau die Uhrzeit, zu der du losgehst.')
slide(5, 'Jemand geht', accent='mit dir.', body='Der Begleitmodus fragt nach, ob alles okay ist. Antwortest du nicht, kommt ein Anruf. Dann bekommen deine Kontakte deinen Standort. Beenden nur mit deiner PIN.')
slide(6, 'SOS.', accent='Immer ein Tipp.', body='Notruf deines Landes, stiller Notruf, Hilfe-Telefone, Fake-Anruf und ein lauter Alarm. Kein Ersatz für den Notruf – aber alles griffbereit.')
slide(7, 'Wie fühlt sich', accent='dein Heimweg an?', body='Bewerte Straßen, Plätze und Haltestellen – mit Tag und Uhrzeit. Deine Daten bleiben auf deinem Handy. Kein Konto, keine Werbung.')
slide(8, 'Schon in', accent='8 Städten.', body='Wien, Linz, Berlin, Zürich, München, Köln, Frankfurt und San Francisco. Bald im App Store – jetzt schon im Browser testen.', foot='goodwayapp.com · Link in der Bio')
