"""Draw the pages of the "Welcome to SnapMark" note (assets/welcome-1..4.png, 1920x2560, grayscale).

SnapMark fits them to the device's page size when it makes the note. The screenshots come from
docs/screenshots (real Manta screens). Re-run after changing the text:
    devtest/.venv/bin/python scripts/make-welcome.py
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
SHOTS = ROOT.parent / "docs" / "screenshots"
FONTS = Path("/System/Library/Fonts/Supplemental")

W, H = 1920, 2560
LEFT, RIGHT = 200, 1800  # clear of NOTE's toolbar on the left
INK, DIM, PAPER = 0, 90, 255


def font(name: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONTS / name), size)


# Georgia has no arrows: these characters are drawn in Arial Unicode at the same size.
ARROWS = set("→↩")


def fallback(f: ImageFont.FreeTypeFont) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONTS / "Arial Unicode.ttf"), f.size)


def runs(text: str) -> list[tuple[str, bool]]:
    """The text in runs of (characters, is an arrow)."""
    out: list[tuple[str, bool]] = []
    for ch in text:
        arrow = ch in ARROWS
        if out and out[-1][1] == arrow:
            out[-1] = (out[-1][0] + ch, arrow)
        else:
            out.append((ch, arrow))
    return out


def length(d: ImageDraw.ImageDraw, text: str, f: ImageFont.FreeTypeFont) -> float:
    return sum(d.textlength(t, font=fallback(f) if a else f) for t, a in runs(text))


def draw(d: ImageDraw.ImageDraw, xy: tuple[float, float], text: str, f: ImageFont.FreeTypeFont, fill: int) -> None:
    x, y = xy
    baseline = y + f.getmetrics()[0]  # every run on Georgia's baseline
    for t, a in runs(text):
        g = fallback(f) if a else f
        d.text((x, baseline), t, font=g, fill=fill, anchor="ls")
        x += d.textlength(t, font=g)


TITLE = font("Georgia Bold.ttf", 84)
LEAD = font("Georgia Italic.ttf", 46)
HEAD = font("Georgia Bold.ttf", 52)
BODY = font("Georgia.ttf", 42)
SMALL = font("Georgia.ttf", 34)


def wrap(d: ImageDraw.ImageDraw, text: str, f: ImageFont.FreeTypeFont, width: int) -> list[str]:
    lines, line = [], ""
    for word in text.split():
        trial = f"{line} {word}".strip()
        if length(d, trial, f) <= width:
            line = trial
        else:
            lines.append(line)
            line = word
    if line:
        lines.append(line)
    return lines


def para(d: ImageDraw.ImageDraw, x: int, y: int, text: str, f: ImageFont.FreeTypeFont, width: int, fill: int = INK, gap: float = 1.35) -> int:
    """Draws wrapped text; returns the y below it."""
    step = int(f.size * gap)
    for line in wrap(d, text, f, width):
        draw(d, (x, y), line, f, fill)
        y += step
    return y


def page(title: str, lead: str | None = None) -> tuple[Image.Image, ImageDraw.ImageDraw, int]:
    im = Image.new("L", (W, H), PAPER)
    d = ImageDraw.Draw(im)
    d.text((LEFT, 150), title, font=TITLE, fill=INK)
    y = 270
    if lead:
        y = para(d, LEFT, y, lead, LEAD, RIGHT - LEFT, DIM) + 20
    d.line([(LEFT, y), (RIGHT, y)], fill=INK, width=3)
    return im, d, y + 60


def shot(name: str, width: int, crop: tuple[int, int, int, int] | None = None) -> Image.Image:
    im = Image.open(SHOTS / name).convert("L")
    if crop:
        im = im.crop(crop)
    im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    return ImageOps.expand(im, border=3, fill=INK)


def footer(d: ImageDraw.ImageDraw, n: int, text: str) -> None:
    d.line([(LEFT, H - 230), (RIGHT, H - 230)], fill=INK, width=2)
    d.text((LEFT, H - 200), f"{n} / 4", font=SMALL, fill=DIM)
    draw(d, (LEFT + 140, H - 200), text, SMALL, DIM)


def bullets(d: ImageDraw.ImageDraw, x: int, y: int, items: list[tuple[str, str]], width: int) -> int:
    for head, body in items:
        d.text((x, y), head, font=HEAD, fill=INK)
        y = para(d, x, y + 70, body, BODY, width) + 36
    return y


def page1() -> Image.Image:
    im, d, y = page("Welcome to SnapMark", "Turn anything on your screen into a note you can write on, with your handwriting kept as real ink.")
    y = bullets(
        d,
        LEFT,
        y,
        [
            ("1. In a PDF or EPUB", "Toolbar → plugins (the puzzle piece): Snap page, Snap region, Notes for this page."),
            ("2. Anywhere: the floating button", "A small round button over every app: Kindle, the browser, a PDF, this note. Tap it and box what you want. It's off at first: turn it on in SnapMark's settings."),
            ("3. In Notes", "Toolbar → plugins: Paste queued snaps, Undo last snap, Annotate or Insert a screenshot, Export page as PNG."),
        ],
        RIGHT - LEFT,
    )
    menu = shot("full-plugin-menu.png", 760, (0, 960, 1100, 2040))
    im.paste(menu, (LEFT, y + 20))
    d.text((LEFT + 800, y + 40), "In a PDF: the plugins", font=BODY, fill=DIM)
    d.text((LEFT + 800, y + 100), "menu with SnapMark's", font=BODY, fill=DIM)
    d.text((LEFT + 800, y + 160), "buttons.", font=BODY, fill=DIM)
    footer(d, 1, "Next: boxing the part you want")
    return im


def page2() -> Image.Image:
    im, d, y = page("Box the part you want", "After Snap region or a tap on the floating button, you see the screen as it was.")
    pic = shot("full-select-region.png", 700)
    im.paste(pic, (LEFT, y))
    bullets(
        d,
        LEFT + 760,
        y,
        [
            ("Drag, or tap", "Drag a box with the pen, or tap one corner and then the opposite one."),
            ("Snap region", "Just that part becomes a note to write on, or goes into the note you're working in (Settings → Where snaps go)."),
            ("Queue", "Keep it for later and keep reading. In Notes: Paste queued snaps."),
            ("Whole page", "The full page instead."),
        ],
        RIGHT - LEFT - 760,
    )
    footer(d, 2, "Next: what comes along")
    return im


def page3() -> Image.Image:
    im, d, y = page("Your ink comes along", "From a PDF or EPUB, the snap keeps what you wrote on the page.")
    pic = shot("full-region-note.png", 700)
    im.paste(pic, (LEFT, y))
    bullets(
        d,
        LEFT + 760,
        y,
        [
            ("Real ink", "Your handwriting stays strokes you can erase or move; marker highlights become clean underlines."),
            ("A link back", "↩ Book, p. N opens the book on that page again."),
            ("Find it later", "Search → Keyword (book and page) or Text (any word in it)."),
            ("More room", "Notes for this page: one note per page to write in, opened again next time."),
            ("Changed your mind?", "Undo last snap takes the last paste back."),
        ],
        RIGHT - LEFT - 760,
    )
    footer(d, 3, "Next: try it")
    return im


def page4() -> Image.Image:
    im, d, y = page("Try it here", "Snap the quote below with the floating button.")
    y = bullets(
        d,
        LEFT,
        y,
        [
            ("1. Tap the floating button", "No button? Settings → Apps → Plugins → SnapMark → Settings → Floating capture button: On."),
            ("2. Box the quote, tap Snap region", "Drag around it, or tap two corners."),
            ("3. Write on the note it makes", "Underline, circle, add a thought."),
        ],
        RIGHT - LEFT,
    )
    y += 20
    d.rectangle([LEFT, y, RIGHT, y + 420], outline=INK, width=3)
    quote = (
        "“I went to the woods because I wished to live deliberately, to front only the essential facts of life, "
        "and see if I could not learn what it had to teach, and not, when I came to die, discover that I had not lived.”"
    )
    qy = para(d, LEFT + 50, y + 50, quote, font("Georgia Italic.ttf", 50), RIGHT - LEFT - 100)
    d.text((RIGHT - 520, qy + 10), "Henry David Thoreau, Walden", font=SMALL, fill=DIM)
    y += 500
    d.text((LEFT, y), "Your notes:", font=HEAD, fill=INK)
    for ly in range(y + 130, H - 300, 110):
        d.line([(LEFT, ly), (RIGHT, ly)], fill=200, width=2)
    footer(d, 4, "Settings → Apps → Plugins → SnapMark · Guide and FAQ: snapmark.ink")
    return im


def main() -> None:
    for i, make in enumerate((page1, page2, page3, page4), start=1):
        out = ASSETS / f"welcome-{i}.png"
        make().save(out, optimize=True)
        print(f"wrote {out.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
