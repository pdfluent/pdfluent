#!/usr/bin/env python3
"""Render WiX MSI installer images: banner (493x58) + dialog (493x312) → BMP."""
import cairosvg, io, os
from PIL import Image

FONT='-apple-system, Helvetica Neue, Arial, sans-serif'

BANNER = f'''<svg xmlns="http://www.w3.org/2000/svg" width="493" height="58">
  <rect width="493" height="58" fill="#ffffff"/>
  <rect x="0" y="57" width="493" height="1" fill="#e5e7eb"/>
  <g transform="translate(409,9)" font-family="{FONT}">
    <text x="0" y="28" text-anchor="end" font-size="15" font-weight="700" fill="#0f172a">PDFluent</text>
  </g>
  <g transform="translate(443,9)">
    <rect width="40" height="40" rx="10" fill="#0b0b0d"/>
    <text x="20" y="29" text-anchor="middle" font-size="25" font-weight="700" fill="#ffffff" font-family="{FONT}">P</text>
  </g>
</svg>'''

DIALOG = f'''<svg xmlns="http://www.w3.org/2000/svg" width="493" height="312">
  <defs>
    <linearGradient id="panel" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0b1220"/><stop offset="1" stop-color="#1e293b"/>
    </linearGradient>
    <radialGradient id="g" cx="50%" cy="32%" r="60%">
      <stop offset="0" stop-color="#3b82f6" stop-opacity="0.25"/><stop offset="1" stop-color="#3b82f6" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="493" height="312" fill="#ffffff"/>
  <rect width="175" height="312" fill="url(#panel)"/>
  <rect width="175" height="312" fill="url(#g)"/>
  <g transform="translate(87.5,104)">
    <rect x="-34" y="-34" width="68" height="68" rx="17" fill="#ffffff"/>
    <text x="0" y="15" text-anchor="middle" font-size="44" font-weight="700" fill="#0b0b0d" font-family="{FONT}">P</text>
  </g>
  <text x="87.5" y="180" text-anchor="middle" fill="#ffffff" font-size="21" font-weight="700" font-family="{FONT}">PDFluent</text>
  <text x="87.5" y="203" text-anchor="middle" fill="#94a3b8" font-size="11.5" font-family="{FONT}">No subscription. Ever.</text>
  <text x="87.5" y="296" text-anchor="middle" fill="#64748b" font-size="10" font-family="{FONT}">pdfluent.com</text>
</svg>'''

def to_bmp(svg, w, h, out):
    png = cairosvg.svg2png(bytestring=svg.encode(), output_width=w, output_height=h)
    Image.open(io.BytesIO(png)).convert('RGB').save(out, 'BMP')

# Write the BMPs next to this script — tauri.conf.json references wix/*.bmp.
OUT = os.path.dirname(os.path.abspath(__file__))
to_bmp(BANNER, 493, 58, os.path.join(OUT, 'banner.bmp'))
to_bmp(DIALOG, 493, 312, os.path.join(OUT, 'dialog.bmp'))
# PNG previews (in /tmp) to eyeball without opening BMPs
os.makedirs('/tmp/wix', exist_ok=True)
for svg, w, h, name in [(BANNER, 493, 58, 'banner.png'), (DIALOG, 493, 312, 'dialog.png')]:
    open(f'/tmp/wix/{name}', 'wb').write(cairosvg.svg2png(bytestring=svg.encode(), output_width=w, output_height=h))
print("wrote banner.bmp (493x58) + dialog.bmp (493x312) to", OUT, "(+ PNG previews in /tmp/wix)")
