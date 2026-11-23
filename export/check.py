"""deck.html のチェック。
- 見た目（check.js）：はみ出し・画像切れ・小さい文字・PPTX で画像になる部分・色の直書き・下の帯との重なり
- 文の決まりと構成案（qa.py）：ページ番号・参照・表記・言葉（private/rules の slide-qa）・構成案との照合
"""
from __future__ import annotations
from pathlib import Path

from .render import open_deck, script
from . import qa


def run(deck_dir: Path) -> list[dict]:
    with open_deck(deck_dir) as page:
        issues = [dict(i, group="見た目") for i in page.evaluate(script("check.js"))]
        try:
            issues += qa.run(page, deck_dir)
        except ValueError as e:   # rules の slide-qa が読めないなど
            issues.append({"slide": 0, "level": "error", "group": "設定", "msg": str(e), "where": "private/rules/"})
    return issues
