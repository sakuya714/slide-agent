"""slide-agent のローカルサーバー（127.0.0.1 だけ）。編集画面・資料の読み書き・書き出し。"""
from __future__ import annotations
import subprocess
import threading
from pathlib import Path

from fastapi import Body, FastAPI, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from . import decks

app = FastAPI(title="slide-agent", docs_url=None, redoc_url=None)
EDITOR = decks.ROOT / "editor"
_export_lock = threading.Lock()   # Chrome を同時に何個も立ち上げない


def fail(e: Exception, code: int = 400):
    raise HTTPException(code, str(e))


@app.get("/")
def index():
    return FileResponse(EDITOR / "index.html", headers={"Cache-Control": "no-store"})


@app.get("/api/ping")
def ping():
    return {"ok": True, "decks": str(decks.DECKS), "output": str(decks.OUTPUT)}


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


@app.post("/api/export")
def export(body: dict = Body(...)):
    kind = body.get("kind")
    if kind not in ("pdf", "pptx"):
        fail(ValueError("kind は pdf か pptx"))
    try:
        d = decks.safe(body["path"])
        out = decks.output_path(d, kind)
        with _export_lock:
            if kind == "pdf":
                from export.pdf import export as run
            else:
                from export.pptx import export as run
            info = run(d, out)
    except decks.DeckError as e:
        fail(e)
    except Exception as e:  # 変換の失敗は画面に出す
        fail(RuntimeError(f"書き出しに失敗: {e}"), 500)
    return {"out": str(out), "rel": str(out.relative_to(decks.PRIVATE)), **info}


@app.post("/api/check")
def check(body: dict = Body(...)):
    from export.check import run
    try:
        with _export_lock:
            return {"issues": run(decks.safe(body["path"]))}
    except decks.DeckError as e:
        fail(e)


@app.post("/api/reveal")
def reveal(body: dict = Body(...)):
    """Finder で書き出したファイルを見せる（書き出し先の中だけ）。"""
    p = Path(body["out"]).resolve()
    if decks.OUTPUT not in p.parents or not p.exists():
        fail(ValueError("書き出し先の外"))
    subprocess.run(["open", "-R", str(p)], check=False)
    return {"ok": True}


# 資料のファイル（deck.html・画像）。iframe はここから読む
app.mount("/deck", StaticFiles(directory=str(decks.DECKS), check_dir=False), name="deck")
app.mount("/editor", StaticFiles(directory=str(EDITOR)), name="editor")
