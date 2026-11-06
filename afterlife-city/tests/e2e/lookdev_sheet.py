"""Side-by-side sheet: reference board crop (left) | current render (right), one row per composition."""
import sys
from PIL import Image, ImageDraw
ref_path, out = sys.argv[1], sys.argv[2]
ref = Image.open(ref_path).convert('RGB')
sx, sy = ref.width / 1672, ref.height / 941
# crop boxes of the reference board panels (in 1672x941 coordinates)
boxes = {
    'aerial': (0, 0, 1182, 387), 'oldtown': (1186, 0, 1672, 387), 'harbor': (0, 390, 568, 636), 'residential': (571, 390, 1120, 636),
    'station': (1123, 390, 1672, 636), 'seaside': (0, 639, 568, 882), 'night': (571, 639, 1120, 882), 'details': (1123, 639, 1672, 882),
}
W, H = 480, 270
sheet = Image.new('RGB', (W * 2, H * len(boxes)), (14, 13, 11))
d = ImageDraw.Draw(sheet)
for i, (k, b) in enumerate(boxes.items()):
    crop = ref.crop((int(b[0] * sx), int(b[1] * sy), int(b[2] * sx), int(b[3] * sy))).resize((W, H))
    sheet.paste(crop, (0, i * H))
    try:
        sheet.paste(Image.open(f'{out}{k}.png').convert('RGB').resize((W, H)), (W, i * H))
    except FileNotFoundError:
        pass
    d.rectangle([0, i * H, 150, i * H + 18], fill=(14, 13, 11)); d.text((6, i * H + 3), 'REFERENCE  ' + k, fill=(236, 228, 212))
    d.rectangle([W, i * H, W + 120, i * H + 18], fill=(14, 13, 11)); d.text((W + 6, i * H + 3), 'CURRENT  ' + k, fill=(236, 228, 212))
sheet.save(f'{out}compare.png')
print('sheet:', f'{out}compare.png')
