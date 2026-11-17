"""slide コマンドの本体（起動・停止は slide シェルスクリプト側）。"""
from __future__ import annotations
import argparse, sys, time

from . import decks


def cmd_export(kind: str, target: str) -> int:
    d = decks.resolve_deck(target)
    out = decks.output_path(d, kind)
    t = time.time()
    if kind == "pdf":
        from export.pdf import export
    else:
        from export.pptx import export
    info = export(d, out)
    extra = f"・画像になった部分 {info['raster']}" if info.get("raster") else ""
    print(f"✔ {kind.upper()}（{info['slides']}枚{extra}・{time.time() - t:.1f}秒）: {out}")
    return 0


def cmd_check(target: str) -> int:
    from export.check import run
    d = decks.resolve_deck(target)
    issues = run(d)
    errors = [i for i in issues if i["level"] == "error"]
    for i in issues:
        mark = "✖" if i["level"] == "error" else "△"
        print(f"{mark} {i['slide']}枚目 {i['where']}  {i['msg']}")
    print(f"{'✖' if errors else '✔'} チェック：エラー {len(errors)}・注意 {len(issues) - len(errors)}（{decks.rel_of(d)}）")
    return 1 if errors else 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="slide", description="slide-kit")
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("serve"); s.add_argument("--port", type=int, default=8770)
    for k in ("pdf", "pptx", "check"):
        sub.add_parser(k).add_argument("deck", help="資料（private/deck/ からのパス 例：営業/〇〇社_提案）")
    sub.add_parser("new").add_argument("path", help="例：営業/〇〇社_提案")
    a = ap.parse_args(argv)
    try:
        if a.cmd == "serve":
            import uvicorn
            uvicorn.run("server.app:app", host="127.0.0.1", port=a.port, log_level="warning")
            return 0
        if a.cmd in ("pdf", "pptx"):
            return cmd_export(a.cmd, a.deck)
        if a.cmd == "check":
            return cmd_check(a.deck)
        if a.cmd == "new":
            rel = decks.new(a.path)
            print(f"✔ 作成: {decks.DECKS / rel / decks.DECK_FILE}")
            return 0
    except decks.DeckError as e:
        print(f"✖ {e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
