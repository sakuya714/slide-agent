"""slide コマンドの本体（起動・停止は slide シェルスクリプト側）。"""
from __future__ import annotations
import argparse, sys, time

from . import decks


def cmd_export(kind: str, target: str, dest: str | None) -> int:
    d = decks.resolve_deck(target)
    out = decks.export_path(d, kind, dest)
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
    count = {k: sum(1 for i in issues if i["level"] == k) for k in ("error", "warn", "info")}
    order = {"error": 0, "warn": 1, "info": 2}
    for i in sorted(issues, key=lambda x: (order[x["level"]], x["slide"])):
        mark = {"error": "✖", "warn": "△", "info": "○"}[i["level"]]
        where = f"{i['slide']}枚目" if i["slide"] else "全体"
        print(f"{mark} {where}［{i.get('group', '見た目')}］{i['msg']}  {i['where']}")
    print(f"{'✖' if count['error'] else '✔'} チェック：エラー {count['error']}・注意 {count['warn']}・要確認 {count['info']}（{decks.rel_of(d)}）")
    if count["info"]:
        print("  ○ 要確認は、文脈を見て判断する（直さなくてよいこともある）")
    return 1 if count["error"] else 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="slide", description="slide-agent")
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("serve"); s.add_argument("--port", type=int, default=8770)
    for k in ("pdf", "pptx", "check"):
        sp = sub.add_parser(k)
        sp.add_argument("deck", help="資料（private/deck/ からのパス 例：営業/〇〇社_提案）")
        if k != "check":
            sp.add_argument("-o", "--out", help="保存先のフォルダかファイル（省略すると ~/Downloads）")
    sub.add_parser("new").add_argument("path", help="例：営業/〇〇社_提案")
    a = ap.parse_args(argv)
    try:
        if a.cmd == "serve":
            import uvicorn
            uvicorn.run("server.app:app", host="127.0.0.1", port=a.port, log_level="warning")
            return 0
        if a.cmd in ("pdf", "pptx"):
            return cmd_export(a.cmd, a.deck, a.out)
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
