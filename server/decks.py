"""資料（private/deck/ 配下）の読み書き。パスは必ず private/deck/ の中に閉じる。"""
from __future__ import annotations
import os, re, shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent          # slide-agent/
PRIVATE = Path(os.environ.get("SLIDE_AGENT_PRIVATE", ROOT / "private")).resolve()   # ユーザーのもの全部（Git 管理外）
DECKS = PRIVATE / "deck"                                 # 資料の本体（ホームに出るのはここ）
OUTPUT = PRIVATE / "final"                               # 完成品：書き出した PDF・PPTX（中は資料ごと）
THEME = ROOT / "theme"
DECK_FILE = "deck.html"
BAK_FILE = ".deck.bak.html"


class DeckError(Exception):
    pass


def safe(rel: str) -> Path:
    """private/deck/ からの相対パス → 絶対パス。外に出るものは拒否。"""
    rel = (rel or "").strip().strip("/")
    p = (DECKS / rel).resolve()
    if p != DECKS and DECKS not in p.parents:
        raise DeckError(f"private/deck/ の外は開けない: {rel}")
    return p


def resolve_deck(arg: str) -> Path:
    """CLI 用：資料フォルダ・deck.html の絶対パス、または private/deck/ からの相対パス → 資料フォルダ。"""
    p = Path(arg).expanduser()
    if not p.is_absolute():
        p = (Path.cwd() / p) if (Path.cwd() / p).exists() else DECKS / arg
    p = p.resolve()
    if p.is_file():
        p = p.parent
    if not (p / DECK_FILE).exists():
        raise DeckError(f"資料が見つからない（{DECK_FILE} が無い）: {arg}")
    return p


def rel_of(deck_dir: Path) -> str:
    try:
        return str(deck_dir.resolve().relative_to(DECKS))
    except ValueError:
        return deck_dir.name


def tree() -> list[dict]:
    """ホーム用の階層。deck.html を持つフォルダ＝資料、それ以外＝フォルダ。"""
    def walk(d: Path) -> list[dict]:
        items = []
        for c in sorted(d.iterdir(), key=lambda x: x.name):
            if not c.is_dir() or c.name.startswith(".") or c.name == "assets":
                continue
            rel = str(c.relative_to(DECKS))
            if (c / DECK_FILE).exists():
                items.append({"type": "deck", "name": c.name, "path": rel,
                              "mtime": (c / DECK_FILE).stat().st_mtime})
            else:
                items.append({"type": "folder", "name": c.name, "path": rel, "children": walk(c)})
        # フォルダが先、資料が後
        return sorted(items, key=lambda x: (x["type"] != "folder", x["name"]))
    DECKS.mkdir(parents=True, exist_ok=True)
    return walk(DECKS)


def stat(rel: str) -> str:
    f = safe(rel) / DECK_FILE
    if not f.exists():
        raise DeckError("資料が無い")
    return str(f.stat().st_mtime_ns)


def read(rel: str) -> tuple[str, str]:
    f = safe(rel) / DECK_FILE
    if not f.exists():
        raise DeckError("資料が無い")
    return f.read_text(encoding="utf-8"), str(f.stat().st_mtime_ns)


def write(rel: str, html: str, base: str | None, force: bool = False) -> str:
    """保存。base（読んだときの版）と今のファイルが違えば衝突として拒否。直前の版を .deck.bak.html に残す。"""
    d = safe(rel)
    f = d / DECK_FILE
    if not f.exists():
        raise DeckError("資料が無い")
    cur = str(f.stat().st_mtime_ns)
    if base and cur != base and not force:
        raise FileExistsError(cur)
    shutil.copy2(f, d / BAK_FILE)
    tmp = d / ".deck.tmp.html"
    tmp.write_text(html, encoding="utf-8")
    os.replace(tmp, f)
    return str(f.stat().st_mtime_ns)


NAME_RE = re.compile(r'^[^/\\:*?"<>|.][^/\\:*?"<>|]*$')


def new(rel: str) -> str:
    """新しい資料を作る。rel = "フォルダ/資料名"。"""
    parts = [x for x in (rel or "").strip().strip("/").split("/") if x]
    if not parts or not all(NAME_RE.match(x) for x in parts):
        raise DeckError("名前に使えない文字がある")
    d = safe("/".join(parts))
    if d.exists():
        raise DeckError("同じ名前のものがもうある")
    d.mkdir(parents=True)
    (d / "assets").mkdir()
    tpl = (THEME / "new.html").read_text(encoding="utf-8")
    html = (tpl.replace("{{THEME}}", (THEME / "default.css").read_text(encoding="utf-8").strip())
               .replace("{{VARS}}", (THEME / "vars.css").read_text(encoding="utf-8").strip())
               .replace("{{TITLE}}", parts[-1]))
    (d / DECK_FILE).write_text(html, encoding="utf-8")
    return "/".join(parts)


IMAGE_EXT = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"}
MAX_ASSET = 30 * 1024 * 1024
BAD_NAME = re.compile(r"[^\w\-.]+")


def save_asset(rel: str, name: str, data: bytes) -> str:
    """画像を {資料}/assets/ に保存。同じ名前があれば -2, -3 … を付ける。返り値は deck.html に書く src。"""
    d = safe(rel)
    if not (d / DECK_FILE).exists():
        raise DeckError("資料が無い")
    if not data or len(data) > MAX_ASSET:
        raise DeckError("画像が空か、大きすぎる（30MB まで）")
    stem, ext = os.path.splitext(Path(name or "image.png").name)
    ext = ext.lower()
    if ext not in IMAGE_EXT:
        raise DeckError("画像は PNG・JPEG・GIF・WebP・SVG だけ")
    stem = BAD_NAME.sub("_", stem).strip("._") or "image"
    assets = d / "assets"
    assets.mkdir(exist_ok=True)
    out, i = assets / f"{stem}{ext}", 2
    while out.exists():
        out, i = assets / f"{stem}-{i}{ext}", i + 1
    out.write_bytes(data)
    return f"assets/{out.name}"


def output_path(deck_dir: Path, ext: str) -> Path:
    """書き出し先：private/final/ の中に、資料と同じ階層で。"""
    rel = Path(rel_of(deck_dir))
    out = OUTPUT / rel.parent / f"{rel.name}.{ext}"
    out.parent.mkdir(parents=True, exist_ok=True)
    return out
