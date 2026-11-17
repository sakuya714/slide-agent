"""deck.html を Mac の Google Chrome で描画して、PDF・PPTX・チェックに使う。"""
from __future__ import annotations
from contextlib import contextmanager
from pathlib import Path

from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent

# 書き出し用：スライドを隙間なく縦に並べる（スライド i は y = i*720）
EXPORT_CSS = """
html, body { margin:0 !important; padding:0 !important; gap:0 !important; background:none !important; display:block !important; }
.slide { box-shadow:none !important; margin:0 !important; }
"""
HIDE_CSS = """
[data-kit-hide] * { visibility: hidden !important; }
[data-kit-hide] { color: transparent !important; border-color: transparent !important; }
"""


@contextmanager
def open_deck(deck_dir: Path, scale: float = 1):
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome")
        try:
            page = browser.new_page(viewport={"width": 1280, "height": 720}, device_scale_factor=scale)
            page.goto((Path(deck_dir).resolve() / "deck.html").as_uri(), wait_until="load")
            page.add_style_tag(content=EXPORT_CSS + HIDE_CSS)
            page.evaluate("""async () => {
                await document.fonts.ready;
                await Promise.all([...document.images].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; })));
            }""")
            yield page
        finally:
            browser.close()


def script(name: str) -> str:
    return (HERE / name).read_text(encoding="utf-8")
