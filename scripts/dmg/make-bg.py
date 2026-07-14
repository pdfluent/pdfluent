#!/usr/bin/env python3
"""Render the PDFluent DMG background (660x400 window) at 1x and 2x.

Writes bg.png + bg@2x.png next to this script (release-macos.sh reads
scripts/dmg/bg.png). Voice: confident + a little cheeky, never corporate.
"""
import cairosvg, os

W, H = 660, 400
APP_X, APPS_X, ICON_Y = 165, 495, 188   # icon centres (must match create-dmg --icon positions)
F = "-apple-system, Helvetica Neue, Arial, sans-serif"

SVG = f'''<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="1" stop-color="#eef2f7"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="0%" r="75%">
      <stop offset="0" stop-color="#3b82f6" stop-opacity="0.10"/>
      <stop offset="1" stop-color="#3b82f6" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="arrow" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#60a5fa"/>
      <stop offset="1" stop-color="#2563eb"/>
    </linearGradient>
    <filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#1e293b" flood-opacity="0.18"/>
    </filter>
  </defs>

  <rect width="{W}" height="{H}" fill="url(#bg)"/>
  <rect width="{W}" height="{H}" fill="url(#glow)"/>

  <!-- brand kicker -->
  <g transform="translate({W/2}, 50)" text-anchor="middle" font-family="{F}">
    <text y="0" font-size="12" letter-spacing="3" fill="#94a3b8" font-weight="600">P D F L U E N T</text>
  </g>

  <!-- headline + the one instruction that matters -->
  <g transform="translate({W/2}, 92)" text-anchor="middle" font-family="{F}">
    <text y="0" font-size="27" fill="#0f172a" font-weight="700">Own your PDFs again.</text>
    <text y="28" font-size="14" fill="#64748b" font-weight="500">Drag PDFluent onto the Applications folder to install.</text>
  </g>

  <!-- playful nudge + arrow between the app icon ({APP_X}) and Applications ({APPS_X}) at y={ICON_Y} -->
  <text x="335" y="{ICON_Y-22}" text-anchor="middle" font-family="{F}" font-size="11" font-weight="700"
        fill="#2563eb" letter-spacing="0.5">drag me</text>
  <g filter="url(#soft)">
    <line x1="236" y1="{ICON_Y}" x2="394" y2="{ICON_Y}" stroke="url(#arrow)" stroke-width="11" stroke-linecap="round"/>
    <path d="M 388 {ICON_Y-19} L 432 {ICON_Y} L 388 {ICON_Y+19} Z" fill="#2563eb"/>
  </g>

  <!-- value-prop footer -->
  <text x="{W/2}" y="372" text-anchor="middle" font-family="{F}" font-size="11.5" fill="#94a3b8" letter-spacing="0.3">
    No account  ·  No subscription  ·  Free for personal use
  </text>
</svg>'''

OUT = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(OUT, 'bg.svg'), 'w') as f:
    f.write(SVG)
cairosvg.svg2png(bytestring=SVG.encode(), write_to=os.path.join(OUT, 'bg.png'), output_width=W, output_height=H)
cairosvg.svg2png(bytestring=SVG.encode(), write_to=os.path.join(OUT, 'bg@2x.png'), output_width=W*2, output_height=H*2)
print("wrote bg.png (660x400) + bg@2x.png (1320x800) to", OUT)
