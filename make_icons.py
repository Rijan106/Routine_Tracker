"""Draws the app icons (check mark on a blue rounded square) with Pillow.
Run once while building. The finished PNG files are in this folder, so you never need to run this."""
from PIL import Image, ImageDraw

BLUE = (27, 79, 156, 255)
INK = (22, 32, 42, 255)
WHITE = (255, 255, 255, 255)


def draw(size, maskable=False):
    scale = 4
    s = size * scale
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if maskable:
        d.rectangle([0, 0, s, s], fill=BLUE)          # full bleed, the phone crops the shape
        inner = 0.62                                    # symbol stays inside the safe zone (about 80 percent)
    else:
        d.rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * 0.22), fill=BLUE)
        inner = 0.70
    # white ring and check mark
    cx = cy = s / 2
    r = s * inner / 2
    w = int(s * 0.055)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=WHITE, width=w)
    pts = [(cx - r * 0.50, cy + r * 0.02), (cx - r * 0.12, cy + r * 0.42), (cx + r * 0.52, cy - r * 0.34)]
    d.line(pts, fill=WHITE, width=int(s * 0.075), joint="curve")
    for p in (pts[0], pts[2]):
        rr = s * 0.075 / 2
        d.ellipse([p[0] - rr, p[1] - rr, p[0] + rr, p[1] + rr], fill=WHITE)
    return img.resize((size, size), Image.LANCZOS)


draw(192).save("icon-192.png")
draw(512).save("icon-512.png")
draw(512, maskable=True).save("icon-maskable-512.png")
# Apple touch icon: iOS adds its own rounded corners, so it must be a full square with no transparency
a = draw(180, maskable=True).convert("RGB")
a.save("apple-touch-icon.png")
print("icons written")
