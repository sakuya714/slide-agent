"""slide-agent のローカルサーバー（127.0.0.1 だけ）。編集画面・資料の読み書き・書き出し。"""
from __future__ import annotations
import tempfile
import threading
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
    return {"ok": True, "decks": str(decks.DECKS)}


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


@app.post("/api/export")
def export(body: dict = Body(...)):
    """PDF・PPTX を一時フォルダに作って、そのまま返す。保存先は画面（ブラウザ）で選ぶので、サーバー側には残さない。"""
    kind = body.get("kind")
    if kind not in MEDIA:
        fail(ValueError("kind は pdf か pptx"))
    try:
        d = decks.safe(body["path"])
        if not (d / decks.DECK_FILE).exists():
            raise decks.DeckError("資料が無い")
        if kind == "pdf":
            from export.pdf import export as run
        else:
            from export.pptx import export as run
        with _export_lock, tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / f"out.{kind}"
            info = run(d, out)
            data = out.read_bytes()
    except decks.DeckError as e:
        fail(e)
    except Exception as e:  # 変換の失敗は画面に出す
        fail(RuntimeError(f"書き出しに失敗: {e}"), 500)
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
