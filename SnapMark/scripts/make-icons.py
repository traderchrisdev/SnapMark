"""Draw SnapMark's toolbar icons (48x48, black outline on transparent, like the system icons).

Drawn at 4x and downsampled for clean anti-aliasing. Re-run after changing a shape:
    python3 scripts/make-icons.py
"""

import math
from pathlib import Path

from PIL import Image, ImageDraw

SCALE = 4
SIZE = 48 * SCALE
STROKE = 14  # ~3.5 px at 48
INK = (0, 0, 0, 255)
CLEAR = (0, 0, 0, 0)
ASSETS = Path(__file__).resolve().parent.parent / "assets"


def pen(draw: ImageDraw.ImageDraw, tip: tuple[float, float], tail: tuple[float, float], width: float = 30) -> None:
    """A pen from tail down to tip: a body with a pointed nib, cut out of whatever is behind it."""
    (tx, ty), (bx, by) = tip, tail
    length = math.hypot(bx - tx, by - ty)
    ux, uy = (bx - tx) / length, (by - ty) / length  # tip -> tail
    nx, ny = -uy, ux  # normal
    nib = 34  # nib length
    half = width / 2
    shoulder = (tx + ux * nib, ty + uy * nib)
    body = [
        (shoulder[0] + nx * half, shoulder[1] + ny * half),
        (bx + nx * half, by + ny * half),
        (bx - nx * half, by - ny * half),
        (shoulder[0] - nx * half, shoulder[1] - ny * half),
    ]
    nib_poly = [body[0], (tx, ty), body[3]]
    # Clear a margin around the pen so it reads on top of the shape behind it.
    margin = STROKE * 1.2
    draw.polygon(body, fill=CLEAR, outline=CLEAR, width=int(margin * 2))
    draw.line(body + [body[0]], fill=CLEAR, width=int(margin * 2), joint="curve")
    draw.line([body[0], (tx, ty), body[3]], fill=CLEAR, width=int(margin * 2), joint="curve")
    draw.polygon(body + [body[0]], fill=CLEAR)
    draw.polygon(nib_poly, fill=CLEAR)
    # Outline the pen.
    draw.line(body + [body[0]], fill=INK, width=STROKE, joint="curve")
    draw.line([body[0], (tx, ty), body[3]], fill=INK, width=STROKE, joint="curve")
    # Ferrule line where the nib meets the body.
    draw.line([body[0], body[3]], fill=INK, width=STROKE)


def snap_page() -> Image.Image:
    im = Image.new("RGBA", (SIZE, SIZE), CLEAR)
    d = ImageDraw.Draw(im)
    left, top, right, bottom, fold = 26, 14, 132, 176, 30
    page = [(left, top), (right - fold, top), (right, top + fold), (right, bottom), (left, bottom), (left, top)]
    d.line(page, fill=INK, width=STROKE, joint="curve")
    d.line([(right - fold, top), (right - fold, top + fold), (right, top + fold)], fill=INK, width=STROKE, joint="curve")
    for y in (76, 106, 136):
        d.line([(left + 24, y), (right - 26, y)], fill=INK, width=10)
    pen(d, tip=(112, 150), tail=(178, 70))
    return im


def snap_region() -> Image.Image:
    """A page with crop marks around part of it: snap just this part."""
    im = Image.new("RGBA", (SIZE, SIZE), CLEAR)
    d = ImageDraw.Draw(im)
    left, top, right, bottom, fold = 18, 10, 138, 150, 28
    page = [(left, top), (right - fold, top), (right, top + fold), (right, bottom), (left, bottom), (left, top)]
    d.line(page, fill=INK, width=10, joint="curve")
    d.line([(right - fold, top), (right - fold, top + fold), (right, top + fold)], fill=INK, width=10, joint="curve")
    for y in (48, 76, 104):
        d.line([(left + 20, y), (right - 20, y)], fill=INK, width=8)
    # The selected part: crop marks around the page's lower right, the inside cleared and its lines bolder.
    a, b, arm = 62, 182, 34
    d.rectangle([a, a, b, b], fill=CLEAR)
    for y in (104, 132):
        d.line([(a + 16, y), (b - 26, y)], fill=INK, width=12)
    for (x, y, dx, dy) in ((a, a, 1, 1), (b, a, -1, 1), (a, b, 1, -1), (b, b, -1, -1)):
        d.line([(x, y + dy * arm), (x, y), (x + dx * arm, y)], fill=INK, width=STROKE, joint="curve")
    return im


def annotate_screenshot() -> Image.Image:
    im = Image.new("RGBA", (SIZE, SIZE), CLEAR)
    d = ImageDraw.Draw(im)
    a, b, arm = 18, SIZE - 18, 44
    for (x, y, dx, dy) in ((a, a, 1, 1), (b, a, -1, 1), (a, b, 1, -1), (b, b, -1, -1)):
        d.line([(x, y + dy * arm), (x, y), (x + dx * arm, y)], fill=INK, width=STROKE, joint="curve")
    pen(d, tip=(66, 128), tail=(132, 58))
    return im


def export_png() -> Image.Image:
    im = Image.new("RGBA", (SIZE, SIZE), CLEAR)
    d = ImageDraw.Draw(im)
    left, top, right, bottom, fold = 22, 14, 128, 176, 30
    page = [(left, top), (right - fold, top), (right, top + fold), (right, bottom), (left, bottom), (left, top)]
    d.line(page, fill=INK, width=STROKE, joint="curve")
    d.line([(right - fold, top), (right - fold, top + fold), (right, top + fold)], fill=INK, width=STROKE, joint="curve")
    # Arrow leaving the page to the right, with a gap cut into the page edge.
    y, x0, x1, head = 110, 70, 178, 30
    d.rectangle([right - STROKE, y - 26, right + STROKE, y + 26], fill=CLEAR)
    d.line([(x0, y), (x1, y)], fill=INK, width=STROKE)
    d.line([(x1 - head, y - head), (x1, y), (x1 - head, y + head)], fill=INK, width=STROKE, joint="curve")
    return im


def insert_screenshot() -> Image.Image:
    """A picture (frame, mountains, sun) with a plus: put an image onto this page."""
    im = Image.new("RGBA", (SIZE, SIZE), CLEAR)
    d = ImageDraw.Draw(im)
    left, top, right, bottom = 14, 40, 150, 160
    d.rounded_rectangle([left, top, right, bottom], radius=12, outline=INK, width=STROKE)
    d.line([(left + 14, bottom - 22), (62, 98), (92, 128), (112, 108), (right - 14, bottom - 22)], fill=INK, width=STROKE, joint="curve")
    d.ellipse([104, 60, 128, 84], outline=INK, width=10)
    # Plus badge, cut out of the frame corner.
    cx, cy, r = 152, 154, 30
    d.ellipse([cx - r - 10, cy - r - 10, cx + r + 10, cy + r + 10], fill=CLEAR)
    d.line([(cx - r + 6, cy), (cx + r - 6, cy)], fill=INK, width=STROKE)
    d.line([(cx, cy - r + 6), (cx, cy + r - 6)], fill=INK, width=STROKE)
    return im


def save(im: Image.Image, name: str) -> None:
    out = im.resize((48, 48), Image.LANCZOS)
    out.save(ASSETS / name, optimize=True)
    print(f"wrote assets/{name}")


if __name__ == "__main__":
    save(snap_page(), "icon-snap-page.png")
    save(snap_region(), "icon-snap-region.png")
    save(annotate_screenshot(), "icon-annotate-screenshot.png")
    save(export_png(), "icon-export-png.png")
    save(insert_screenshot(), "icon-insert-screenshot.png")
    save(snap_page(), "icon.png")  # plugin icon in Settings -> Apps -> Plugins
