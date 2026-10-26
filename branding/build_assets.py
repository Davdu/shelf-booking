#!/usr/bin/env python3
"""
Regenerates every brAIn lab image used by the web app from brAInLab-logo2024.svg.

Usage (from the repo root):
    pip install cairosvg pillow
    python3 branding/build_assets.py

Writes straight into apps/webapp/public. Splash screens keep the canvas sizes of
the files already there, so run it on a checkout that has them.
"""
import os, sys, io, glob, base64
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SVGPATH = os.path.join(HERE, "brAInLab-logo2024.svg")
PUBLIC = os.path.join(ROOT, "apps", "webapp", "public")
PUB = os.path.join(PUBLIC, "static")
OUT = PUB
COVER = os.path.join(HERE, "itu-atrium-cover.jpg")
_ns = {"sys": sys}
exec(open(os.path.join(HERE, "_render.py")).read(), _ns)
_ns["SVG"] = SVGPATH
render, layer_labels = _ns["render"], _ns["layer_labels"]
from PIL import Image, ImageDraw
RED = (0xBC, 0x00, 0x20, 255)
VB = (-3000, -3000, 16000, 9000)
os.makedirs(OUT, exist_ok=True)

def layer(ls, w):
    im, _ = render(ls, w, viewbox=VB)
    return im.crop(im.getbbox())

# 1. White brain icon (transparent), very high res
brain = layer({'brainteclogo'}, 16000)
# 2. Wide panel with "brAIn lab" (extrawide), high res
wide = layer({'extrawide'}, 9000)
W, H = wide.size
# find where the text starts: first column (from left, skipping rounded corner) with white pixels
px = wide.load(); text_x = None
for x in range(int(H*0.2), W):
    if any(px[x, y][0] > 200 and px[x, y][1] > 200 and px[x, y][3] > 200 for y in range(int(H*0.15), int(H*0.85), 3)):
        text_x = x; break
bh = int(H * 0.74); b = brain.copy(); b = b.resize((int(b.width * bh / b.height), bh), Image.LANCZOS)
bx = (text_x - b.width) // 2 + int(H*0.03); by = (H - bh) // 2
wide.alpha_composite(b, (max(bx, int(H*0.12)), by))
print('wide', wide.size, 'text starts at', text_x, 'brain at', bx)

def save_png(im, path, size=None):
    if size: im = im.resize(size, Image.LANCZOS)
    full = os.path.join(OUT, path); os.makedirs(os.path.dirname(full), exist_ok=True)
    im.save(full, optimize=True); return im

def fit_h(im, h): return im.resize((round(im.width * h / im.height), h), Image.LANCZOS)

# Full logo (sidebar/mobile header/emails/qr pages): 128 px tall (displayed at 32 px; 4x for retina)
full_logo = fit_h(wide, 128)
save_png(full_logo, 'images/logo-full-color(x2).png')
save_png(fit_h(wide, 160), 'images/shelf-logo-white-text.png')

def symbol(size, radius_ratio=0.18, icon_ratio=0.74, full_bleed=False):
    s = size * 4
    im = Image.new('RGBA', (s, s), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    if full_bleed: d.rectangle([0, 0, s, s], fill=RED)
    else: d.rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * radius_ratio), fill=RED)
    ih = int(s * icon_ratio); ic = brain.resize((int(brain.width * ih / brain.height), ih), Image.LANCZOS)
    im.alpha_composite(ic, ((s - ic.width) // 2, (s - ih) // 2))
    return im.resize((size, size), Image.LANCZOS)

save_png(symbol(256), 'images/shelf-symbol.png')
save_png(symbol(1024), 'images/shelf-symbol-desktop.png')
save_png(symbol(180, full_bleed=True).convert('RGB'), 'images/apple-touch-icon.png')
# Favicon: multi-size ICO
fav = symbol(256)
for p in ['favicon.ico', 'images/shelf-symbol-desktop.ico']:
    fav.save(os.path.join(OUT, p), sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
fav.save(os.path.join(PUBLIC, 'favicon.ico'), sizes=[(16, 16), (32, 32), (48, 48)])
# PWA / app icon 512: the official square logo (brain + brAIn lab + ITU), full panel
square = layer({'panel-colour', 'fonts-ITU', 'fonts-brainlab', 'brainteclogo'}, 12000)
save_png(square, 'images/shelf-logo-x512.png', (512, 512))
save_png(symbol(512), 'splash_screens/icon.png')

# Splash screens: same canvas sizes as originals, brand red background, white brain centered
orig = sorted(glob.glob(os.path.join(PUB, 'splash_screens', '*.png')))
for p in orig:
    name = os.path.basename(p)
    if name == 'icon.png': continue
    w, h = Image.open(p).size
    # brain icon is 30% of the shorter side (deterministic, so re-running is stable)
    target_h = int(min(w, h) * 0.30)
    im = Image.new('RGB', (w, h), RED[:3])
    ic = brain.resize((int(brain.width * target_h / brain.height), target_h), Image.LANCZOS)
    im.paste(ic, ((w - ic.width) // 2, (h - target_h) // 2), ic)
    save_png(im, f'splash_screens/{name}')
print('splash screens', len(orig) - 1)

# Login cover: ITU atrium -> webp
c = Image.open(COVER).convert('RGB')
c.save(os.path.join(OUT, 'images/auth-cover.webp'), 'WEBP', quality=82, method=6)
print('cover', c.size)

# Unused Shelf wordmark SVG -> brand wide logo embedded
buf = io.BytesIO(); fit_h(wide, 200).save(buf, 'PNG')
w2 = fit_h(wide, 200).width
svg = f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="{w2}" height="200" viewBox="0 0 {w2} 200"><image width="{w2}" height="200" xlink:href="data:image/png;base64,{base64.b64encode(buf.getvalue()).decode()}"/></svg>'
open(os.path.join(OUT, 'images/shelf-typography.svg'), 'w').write(svg)
# Masters for the user's own use
print('done')
