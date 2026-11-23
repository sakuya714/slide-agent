"""slide-agent のローカルサーバー（127.0.0.1 だけ）。編集画面・資料の読み書き・書き出し。"""
from __future__ import annotations
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import unicodedata
import uuid
from pathlib import Path
from urllib.parse import quote

from fastapi import Body, FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles

from . import decks

app = FastAPI(title="slide-agent", docs_url=None, redoc_url=None)


@app.middleware("http")
async def no_stale_editor(request: Request, call_next):
    """編集画面の JS・CSS を古いキャッシュのまま使わない（直したあと再読み込みで必ず新しくなる）。"""
    res = await call_next(request)
    if request.url.path.startswith("/editor/"):
        res.headers["Cache-Control"] = "no-cache"
    return res
EDITOR = decks.ROOT / "editor"
_export_lock = threading.Lock()   # Chrome を同時に何個も立ち上げない


def fail(e: Exception, code: int = 400):
    raise HTTPException(code, str(e))


@app.get("/")
def index():
    return FileResponse(EDITOR / "index.html", headers={"Cache-Control": "no-store"})


@app.get("/api/ping")
def ping():
    return {"ok": True, "decks": str(decks.DECKS), "native_save": NATIVE_SAVE}


@app.get("/api/tree")
def tree():
    return decks.tree()


@app.get("/api/deck")
def get_deck(path: str):
    try:
        html, ver = decks.read(path)
    except decks.DeckError as e:
        fail(e, 404)
    return {"path": path, "html": html, "version": ver}


@app.get("/api/stat")
def stat(path: str):
    try:
        return {"version": decks.stat(path)}
    except decks.DeckError as e:
        fail(e, 404)


@app.put("/api/deck")
def put_deck(body: dict = Body(...)):
    try:
        ver = decks.write(body["path"], body["html"], body.get("base"), bool(body.get("force")))
    except FileExistsError as e:
        return JSONResponse({"conflict": True, "version": str(e)}, status_code=409)
    except decks.DeckError as e:
        fail(e)
    return {"version": ver}


@app.post("/api/new")
def new_deck(body: dict = Body(...)):
    try:
        return {"path": decks.new(body["path"])}
    except decks.DeckError as e:
        fail(e)


MEDIA = {"pdf": "application/pdf",
         "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation"}


def _deck_dir(body: dict, kind) -> Path:
    if kind not in MEDIA:
        fail(ValueError("kind は pdf か pptx"))
    try:
        d = decks.safe(body["path"])
        if not (d / decks.DECK_FILE).exists():
            raise decks.DeckError("資料が無い")
    except decks.DeckError as e:
        fail(e)
    return d


def _render(d: Path, kind: str) -> tuple[bytes, dict]:
    """PDF・PPTX を一時フォルダに作って、中身と情報（枚数など）を返す。"""
    try:
        if kind == "pdf":
            from export.pdf import export as run
        else:
            from export.pptx import export as run
        with _export_lock, tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / f"out.{kind}"
            info = run(d, out)
            return out.read_bytes(), info
    except Exception as e:  # 変換の失敗は画面に出す
        fail(RuntimeError(f"書き出しに失敗: {e}"), 500)


# ---- Mac の保存画面で保存先を選び、サーバーが書く ----
# ブラウザの保存画面（showSaveFilePicker）で保存すると、macOS がファイル名の濁点・半濁点を
# 「フ＋゜」のように分けた形（NFD）にする。Windows やメールで名前が崩れて見えることがあるので、
# Mac では保存画面だけ macOS のものを出し、ファイルはサーバーが NFC の名前で書く。
NATIVE_SAVE = sys.platform == "darwin" and shutil.which("osascript") is not None
LAST_DIR = decks.PRIVATE / ".export-dir"   # 前回保存したフォルダ（Git 管理外）
CHOOSE_SCRIPT = """on run argv
  activate
  try
    set f to choose file name with prompt "書き出す場所と名前" default name (item 1 of argv) default location (POSIX file (item 2 of argv))
  on error number -128
    return ""
  end try
  return POSIX path of f
end run"""


def _front_app() -> str | None:
    """いま前にあるアプリ（ふつうはブラウザ）の bundle id。保存画面を閉じたあと、そこに戻すため。"""
    try:
        asn = subprocess.run(["lsappinfo", "front"], capture_output=True, text=True, timeout=3).stdout.strip()
        out = subprocess.run(["lsappinfo", "info", "-only", "bundleid", asn], capture_output=True, text=True, timeout=3).stdout
        return out.split("=", 1)[1].strip().strip('"') if "=" in out else None
    except Exception:
        return None


def choose_save_path(default_name: str, start: Path) -> str:
    """macOS の保存画面を出す。選んだパスを返す。キャンセルなら空文字。"""
    back = _front_app()
    try:
        r = subprocess.run(["osascript", "-e", CHOOSE_SCRIPT, default_name, str(start)], capture_output=True, text=True)
    finally:
        if back:
            subprocess.run(["open", "-b", back], capture_output=True)
    if r.returncode != 0:
        raise RuntimeError(r.stderr.strip() or "保存画面を開けなかった")
    return r.stdout.strip()


def write_nfc(dest: Path, data: bytes) -> Path:
    """dest に data を書く。名前は NFC にそろえる。形だけ違う同じ名前（NFD）のファイルがあれば置き換える。"""
    folder, name = dest.parent, unicodedata.normalize("NFC", dest.name)
    tmp = folder / f".slide-export-{uuid.uuid4().hex}.tmp"
    tmp.write_bytes(data)
    moved = []   # 置き換える前のファイル（失敗したら元に戻す）
    try:
        for n in os.listdir(folder):
            if n != tmp.name and unicodedata.normalize("NFC", n) == name:
                old = folder / f".slide-old-{uuid.uuid4().hex}"
                os.rename(folder / n, old)
                moved.append((old, folder / n))
        os.rename(tmp, folder / name)
    except Exception:
        for old, orig in moved:
            os.rename(old, orig)
        tmp.unlink(missing_ok=True)
        raise
    for old, _ in moved:
        old.unlink(missing_ok=True)
    return folder / name


@app.post("/api/export-save")
def export_save(body: dict = Body(...)):
    """保存先を macOS の保存画面で選び、PDF・PPTX をサーバーが NFC の名前で書く（Mac だけ）。"""
    if not NATIVE_SAVE:
        fail(RuntimeError("この環境では使えない"), 501)
    kind = body.get("kind")
    d = _deck_dir(body, kind)
    start = Path(LAST_DIR.read_text(encoding="utf-8").strip()) if LAST_DIR.exists() else Path.home() / "Downloads"
    if not start.is_dir():
        start = Path.home() / "Downloads"
    try:
        picked = choose_save_path(f"{d.name}.{kind}", start)
    except RuntimeError as e:
        fail(e, 500)
    if not picked:
        return {"canceled": True}
    dest = Path(picked)
    if dest.suffix.lower() != f".{kind}":
        dest = dest.with_name(f"{dest.name}.{kind}")
    data, info = _render(d, kind)
    try:
        out = write_nfc(dest, data)
    except PermissionError:
        fail(RuntimeError(f"{dest.parent} に書けなかった（Mac の許可が無い）。ほかの場所を選ぶか、slide {kind} で書き出して"), 500)
    except OSError as e:
        fail(RuntimeError(f"保存できなかった: {e}"), 500)
    LAST_DIR.write_text(str(out.parent), encoding="utf-8")
    return {"saved": str(out), "name": out.name, "folder": out.parent.name,
            "slides": info["slides"], "raster": info.get("raster", 0)}


@app.post("/api/export")
def export(body: dict = Body(...)):
    """PDF・PPTX を一時フォルダに作って、そのまま返す。保存先は画面（ブラウザ）で選ぶので、サーバー側には残さない。"""
    kind = body.get("kind")
    d = _deck_dir(body, kind)
    data, info = _render(d, kind)
    name = f"{d.name}.{kind}"
    return Response(data, media_type=MEDIA[kind], headers={
        "Content-Disposition": f"attachment; filename*=UTF-8''{quote(name)}",
        "X-Slides": str(info["slides"]),
        "X-Raster": str(info.get("raster", 0)),
    })


@app.post("/api/check")
def check(body: dict = Body(...)):
    from export.check import run
    try:
        with _export_lock:
            return {"issues": run(decks.safe(body["path"]))}
    except decks.DeckError as e:
        fail(e)


@app.post("/api/asset")
async def asset(request: Request, path: str, name: str):
    """画像を資料の assets/ に保存して、deck.html に書く src（assets/xxx.png）を返す。"""
    data = await request.body()
    try:
        return {"src": decks.save_asset(path, name, data)}
    except decks.DeckError as e:
        fail(e)


# 資料のファイル（deck.html・画像）。iframe はここから読む
app.mount("/deck", StaticFiles(directory=str(decks.DECKS), check_dir=False), name="deck")
app.mount("/editor", StaticFiles(directory=str(EDITOR)), name="editor")
