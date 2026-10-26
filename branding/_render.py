import sys, re, io
import xml.etree.ElementTree as ET
import cairosvg
from PIL import Image
SVG = None  # set by build_assets.py
ET.register_namespace('', 'http://www.w3.org/2000/svg')
for p, u in [('inkscape','http://www.inkscape.org/namespaces/inkscape'),('sodipodi','http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd'),('svg','http://www.w3.org/2000/svg')]:
    ET.register_namespace(p, u)
IL = '{http://www.inkscape.org/namespaces/inkscape}label'
GM = '{http://www.inkscape.org/namespaces/inkscape}groupmode'

def set_display(style, show):
    style = re.sub(r'display:[a-z]+;?', '', style or '').strip(';')
    return (('display:inline' if show else 'display:none') + (';' + style if style else ''))

def render(layers, out_w, viewbox=None, bg=None):
    tree = ET.parse(SVG); root = tree.getroot()
    for g in root:
        if g.get(GM) == 'layer':
            g.set('style', set_display(g.get('style'), g.get(IL) in layers))
            # unhide hidden children inside chosen layers
            if g.get(IL) in layers:
                for ch in g.iter():
                    if ch is not g and 'display:none' in (ch.get('style') or ''):
                        ch.set('style', set_display(ch.get('style'), True))
    if viewbox:
        root.set('viewBox', ' '.join(str(v) for v in viewbox))
        root.set('width', str(viewbox[2])); root.set('height', str(viewbox[3]))
    data = ET.tostring(root)
    png = cairosvg.svg2png(bytestring=data, output_width=out_w, background_color=bg)
    return Image.open(io.BytesIO(png)).convert('RGBA'), data

def layer_labels():
    root = ET.parse(SVG).getroot()
    return [g.get(IL) for g in root if g.get(GM) == 'layer']
