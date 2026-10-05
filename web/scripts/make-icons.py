from PIL import Image, ImageDraw, ImageFont
from PIL.Image import Resampling
import os

BASE = os.path.join(os.path.dirname(__file__), '..', 'public')
ICONS = os.path.join(BASE, 'icons')
SHOTS = os.path.join(BASE, 'screenshots')
os.makedirs(SHOTS, exist_ok=True)

BG = (11, 18, 32, 255)
CARD = (22, 35, 60, 255)
ACCENT = (47, 124, 246, 255)
WHITE = (255, 255, 255, 255)

def draw_mark(draw, s):
    # rounded bg
    draw.rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * 0.19), fill=BG)
    # container box
    x0, y0 = int(s * 0.23), int(s * 0.29)
    x1, y1 = int(s * 0.77), int(s * 0.71)
    draw.rounded_rectangle([x0, y0, x1, y1], radius=int(s * 0.05), fill=CARD, outline=ACCENT, width=max(2, s // 26))
    # windshield
    draw.polygon([(s * 0.45, s * 0.41), (s * 0.55, s * 0.41), (s * 0.51, s * 0.46), (s * 0.49, s * 0.46)], fill=ACCENT)
    # wheels
    for cx in (0.38, 0.62):
        c = int(s * cx), int(s * 0.62)
        r = int(s * 0.05)
        draw.ellipse([c[0] - r, c[1] - r, c[0] + r, c[1] + r], outline=WHITE, width=max(2, s // 36))

def icon(path, size, maskable=False):
    s = size * 2 if maskable else size
    img = Image.new('RGBA', (s, s), BG)
    d = ImageDraw.Draw(img)
    if maskable:
        pad = s // 5
        # keep mark inside safe zone
        sub = Image.new('RGBA', (s - 2 * pad, s - 2 * pad), (0, 0, 0, 0))
        ds = ImageDraw.Draw(sub)
        # fake smaller canvas by scaling coords: draw on full then crop? simpler: draw directly centered
        d.rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * 0.19), fill=BG)
        m = s - 2 * pad
        x0, y0 = pad + int(m * 0.23), pad + int(m * 0.29)
        x1, y1 = pad + int(m * 0.77), pad + int(m * 0.71)
        d.rounded_rectangle([x0, y0, x1, y1], radius=int(m * 0.05), fill=CARD, outline=ACCENT, width=max(2, m // 26))
    else:
        draw_mark(d, s)
    if s != size and not maskable:
        pass
    img = img.resize((size, size), Resampling.LANCZOS) if img.size[0] != size else img
    img.save(path)
    print('wrote', path)

def shot(path, w, h, title, subtitle):
    img = Image.new('RGB', (w, h), (11, 18, 32))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([w * 0.08, h * 0.12, w * 0.92, h * 0.30], radius=28, fill=(22, 35, 60))
    d.rounded_rectangle([w * 0.08, h * 0.33, w * 0.92, h * 0.51], radius=28, fill=(22, 35, 60))
    d.rounded_rectangle([w * 0.08, h * 0.54, w * 0.92, h * 0.72], radius=28, fill=(22, 35, 60))
    d.text((w * 0.12, h * 0.15), title, fill=(255, 255, 255))
    d.text((w * 0.12, h * 0.19), subtitle, fill=(148, 163, 184))
    d.text((w * 0.12, h * 0.36), 'EC-1042  •  In Transit', fill=(255, 255, 255))
    d.text((w * 0.12, h * 0.57), 'Balance  $1,200.00', fill=(252, 211, 77))
    img.save(path)
    print('wrote', path)

icon(os.path.join(ICONS, 'icon-192.png'), 192)
icon(os.path.join(ICONS, 'icon-512.png'), 512)
icon(os.path.join(ICONS, 'maskable-512.png'), 512, maskable=True)
icon(os.path.join(ICONS, 'apple-touch-icon.png'), 180)
shot(os.path.join(SHOTS, 'mobile.png'), 390, 844, 'My imports', 'Track every step')
shot(os.path.join(SHOTS, 'desktop.png'), 1280, 800, 'Vehicle Import Portal', 'Cases  •  Finance  •  Documents')
