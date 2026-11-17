"""deck.html のチェック（はみ出し・画像切れ・小さい文字・PPTX で画像になる部分・色の直書き）。"""
from __future__ import annotations
from pathlib import Path

from .render import open_deck, script


def run(deck_dir: Path) -> list[dict]:
    with open_deck(deck_dir) as page:
        return page.evaluate(script("check.js"))
