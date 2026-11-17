"""deck.html → PDF（画面と同じ見た目。フォントも埋め込まれる）。"""
from __future__ import annotations
from pathlib import Path

from .render import open_deck


def export(deck_dir: Path, out: Path) -> dict:
    with open_deck(deck_dir) as page:
        n = page.evaluate("document.querySelectorAll('section.slide').length")
        out.parent.mkdir(parents=True, exist_ok=True)
        page.pdf(path=str(out), width="1280px", height="720px", print_background=True,
                 prefer_css_page_size=True, margin={"top": "0", "right": "0", "bottom": "0", "left": "0"})
    return {"slides": n}
