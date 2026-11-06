"""Packs CC0 Poly Haven textures into one diffuse atlas and one normal atlas (3 x 2 slots of 512 px).
   python3 tools/assets/build-textures.py <dir with *_diff.jpg / *_nor_gl.jpg>
Each slot holds a 480 px tile with a 16 px wrapped border so filtering never bleeds between materials.
Slots: 0 stucco, 1 roof tiles, 2 stone, 3 wood, 4 cobblestone, 5 flat."""
import sys, json
from PIL import Image, ImageStat
src = sys.argv[1]
OUT = 'public/assets/textures/'
names = ['white_stucco', 'clay_roof_tiles', 'old_stone_wall', 'wood_planks', 'cobblestone_floor_01', None]
SLOT, CORE, PAD = 512, 480, 16
def tile(img):
    core = img.convert('RGB').resize((CORE, CORE), Image.LANCZOS)
    out = Image.new('RGB', (SLOT, SLOT))
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            out.paste(core, (PAD + dx * CORE, PAD + dy * CORE))
    return out
diff, nrm = Image.new('RGB', (SLOT * 3, SLOT * 2)), Image.new('RGB', (SLOT * 3, SLOT * 2))
lum = []
for i, n in enumerate(names):
    x, y = (i % 3) * SLOT, (i // 3) * SLOT
    if n is None:
        diff.paste(Image.new('RGB', (SLOT, SLOT), (186, 186, 186)), (x, y)); nrm.paste(Image.new('RGB', (SLOT, SLOT), (128, 128, 255)), (x, y)); lum.append(186 / 255); continue
    d = tile(Image.open(f'{src}/{n}_diff.jpg')); diff.paste(d, (x, y))
    nrm.paste(tile(Image.open(f'{src}/{n}_nor_gl.jpg')), (x, y))
    lum.append(round(ImageStat.Stat(d.convert('L')).mean[0] / 255, 4))
diff.save(OUT + 'atlas_diff.jpg', quality=84, optimize=True)
nrm.save(OUT + 'atlas_nrm.jpg', quality=88, optimize=True)
print(json.dumps({'meanLuminance': lum}))
