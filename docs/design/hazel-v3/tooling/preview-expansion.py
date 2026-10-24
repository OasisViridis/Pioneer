"""Inspection sheet only; accepted source PNGs are never modified."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import json

kit = Path(__file__).resolve().parents[1]
items = json.loads((kit / 'expansion/prompts.json').read_text(encoding='utf-8'))['items']
sheet = Image.new('RGB', (1260, 650), '#F6F5F1')
d = ImageDraw.Draw(sheet)
font = ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf', 16)
small = ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf', 13)
for k, item in enumerate(items):
    x, y = 24 + (k % 3) * 416, 24 + (k // 3) * 310
    d.rounded_rectangle((x, y, x+392, y+284), radius=12, fill='#FDFCFA', outline='#D9D7D2')
    d.text((x+16, y+12), item['file'], fill='#2C3547', font=font)
    im = Image.open(kit / 'assets' / item['file']).convert('RGBA')
    for size, bx, by in [(160, x+20, y+60), (88 if k<3 else 48, x+216, y+66), (64 if k<3 else 48, x+216, y+180)]:
        thumb = im.resize((size, size), Image.Resampling.LANCZOS)
        sheet.paste(thumb, (bx, by), thumb)
        d.text((bx, by+size+5), f'{size}px', fill='#64696F', font=small)
sheet.save(kit / 'qa/expansion-small-size.png')
