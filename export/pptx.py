"""deck.html → PowerPoint で編集できる PPTX。
extract.js で読み取った部品を、テキストボックス・図形・画像として置き直す。変換できない部分だけ画像にする。"""
from __future__ import annotations
import io
from pathlib import Path
from urllib.parse import unquote, urlparse

from lxml import etree
from PIL import Image
from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, MSO_AUTO_SIZE, PP_ALIGN
from pptx.oxml.ns import qn
from pptx.util import Emu, Pt

from .render import open_deck, script

PX = 9525                       # 1px = 9525 EMU（1280px = 16:9 の幅 13.333in）
SLACK = 0.04                    # PowerPoint の方が改行が早いことがあるので、文字の箱を少し広げる
ALIGN = {"left": PP_ALIGN.LEFT, "center": PP_ALIGN.CENTER, "right": PP_ALIGN.RIGHT, "justify": PP_ALIGN.JUSTIFY}


def emu(v: float) -> Emu:
    return Emu(int(round(v * PX)))


def rgb(c: dict) -> RGBColor:
    return RGBColor(int(c["r"]), int(c["g"]), int(c["b"]))


def set_alpha(parent, a: float):
    """parent 配下の最初の srgbClr に透明度を付ける。"""
    if a >= 0.999:
        return
    clr = parent.find(".//" + qn("a:srgbClr"))
    if clr is not None:
        etree.SubElement(clr, qn("a:alpha")).set("val", str(int(a * 100000)))


def strip_style(shape):
    """python-pptx の図形に付くテーマの既定スタイル（影など）を外す。"""
    st = shape._element.find(qn("p:style"))
    if st is not None:
        shape._element.remove(st)


def add_shape(sl, it):
    kind = MSO_SHAPE.OVAL if it.get("ellipse") else (MSO_SHAPE.ROUNDED_RECTANGLE if it.get("radius", 0) > 0.5 else MSO_SHAPE.RECTANGLE)
    sh = sl.shapes.add_shape(kind, emu(it["x"]), emu(it["y"]), emu(it["w"]), emu(it["h"]))
    strip_style(sh)
    if kind == MSO_SHAPE.ROUNDED_RECTANGLE:
        sh.adjustments[0] = min(0.5, it["radius"] / max(1, min(it["w"], it["h"])))
    if it.get("fill"):
        sh.fill.solid()
        sh.fill.fore_color.rgb = rgb(it["fill"])
        set_alpha(sh._element.spPr, it["fill"]["a"])
    else:
        sh.fill.background()
    ln = it.get("line")
    if ln:
        sh.line.color.rgb = rgb(ln["c"])
        sh.line.width = emu(ln["w"])
        set_alpha(sh._element.spPr.find(qn("a:ln")), ln["c"]["a"])
    else:
        sh.line.fill.background()


def add_text(sl, it):
    x, w = it["x"], it["w"]
    if not it["singleLine"]:
        extra = w * SLACK
        x = x - extra / 2 if it["align"] == "center" else (x - extra if it["align"] == "right" else x)
        w = w + extra
    tb = sl.shapes.add_textbox(emu(x), emu(it["y"]), emu(w), emu(it["h"]))
    tf = tb.text_frame
    tf.word_wrap = not it["singleLine"]
    tf.auto_size = MSO_AUTO_SIZE.NONE
    pad = it["pad"]
    tf.margin_top, tf.margin_right, tf.margin_bottom, tf.margin_left = (emu(pad["t"]), emu(pad["r"]), emu(pad["b"]), emu(pad["l"]))
    tf.vertical_anchor = MSO_ANCHOR.MIDDLE if it["valign"] == "middle" else MSO_ANCHOR.TOP
    first = True
    for para in it["paras"]:
        p = tf.paragraphs[0] if first else tf.add_paragraph()
        first = False
        p.alignment = ALIGN.get(it["align"], PP_ALIGN.LEFT)
        p.line_spacing = Pt(it["lineHeight"] * 0.75)
        b = it.get("bullet")
        if b:
            pPr = p._p.get_or_add_pPr()
            pPr.set("marL", str(int(b["indent"] * PX)))
            pPr.set("indent", str(int(-b["indent"] * PX)))
            if b.get("color"):
                bc = etree.SubElement(pPr, qn("a:buClr"))
                etree.SubElement(bc, qn("a:srgbClr")).set("val", "%02X%02X%02X" % tuple(int(b["color"][k]) for k in "rgb"))
            if b["kind"] == "num":
                an = etree.SubElement(pPr, qn("a:buAutoNum"))
                an.set("type", "arabicPeriod")
                an.set("startAt", str(b["n"]))
            else:
                etree.SubElement(pPr, qn("a:buFont")).set("typeface", "Arial")
                etree.SubElement(pPr, qn("a:buChar")).set("char", "•")
            b = None
        for run in para:
            if not run["text"]:
                continue
            r = p.add_run()
            r.text = run["text"]
            f = r.font
            f.size = Pt(run["size"] * 0.75)
            f.bold = run["bold"]
            f.italic = run["italic"]
            if run["underline"]:
                f.underline = True
            if run.get("color"):
                f.color.rgb = rgb(run["color"])
            rPr = r._r.get_or_add_rPr()
            if run.get("color"):
                set_alpha(rPr, run["color"]["a"])
            if run["strike"]:
                rPr.set("strike", "sngStrike")
            if run["spacing"]:
                rPr.set("spc", str(int(run["spacing"] * 0.75 * 100)))
            for tag in ("a:latin", "a:ea", "a:cs"):
                etree.SubElement(rPr, qn(tag)).set("typeface", run["font"])


def image_file(src: str, deck_dir: Path) -> io.BytesIO | Path | None:
    u = urlparse(src)
    if u.scheme != "file":
        return None
    path = Path(unquote(u.path))
    if not path.exists():
        return None
    if path.suffix.lower() == ".webp":
        buf = io.BytesIO()
        Image.open(path).save(buf, "PNG")
        buf.seek(0)
        return buf
    return str(path)


def add_image(sl, it, deck_dir: Path):
    src = image_file(it["src"], deck_dir)
    if src is None:
        return False
    nw, nh = it["nw"], it["nh"]
    if not nw:
        with Image.open(src) as im:
            nw, nh = im.size
        if isinstance(src, io.BytesIO):
            src.seek(0)
    x, y, w, h = it["x"], it["y"], it["w"], it["h"]
    fit = it.get("fit") or "fill"
    if fit == "contain" or (fit == "scale-down" and (nw > w or nh > h)):
        s = min(w / nw, h / nh)
        dw, dh = nw * s, nh * s
        pic = sl.shapes.add_picture(src, emu(x + (w - dw) / 2), emu(y + (h - dh) / 2), emu(dw), emu(dh))
    else:
        pic = sl.shapes.add_picture(src, emu(x), emu(y), emu(w), emu(h))
        if fit == "cover":
            s = max(w / nw, h / nh)
            cw, ch = (nw * s - w) / (nw * s), (nh * s - h) / (nh * s)
            pic.crop_left = pic.crop_right = cw / 2
            pic.crop_top = pic.crop_bottom = ch / 2
    return True


def export(deck_dir: Path, out: Path) -> dict:
    """PPTX を書き出す。戻り値：{"slides": 枚数, "raster": 画像になった部品の数}"""
    prs = Presentation()
    prs.slide_width, prs.slide_height = emu(1280), emu(720)
    blank = prs.slide_layouts[6]
    n_raster = 0
    with open_deck(deck_dir, scale=2) as page:
        slides = page.evaluate(script("extract.js"))
        for s in slides:
            sl = prs.slides.add_slide(blank)
            if s["bg"]:
                sl.background.fill.solid()
                sl.background.fill.fore_color.rgb = rgb(s["bg"])
            for it in sorted(s["items"], key=lambda i: (i["z"], i["order"])):
                t = it["type"]
                if t == "shape":
                    add_shape(sl, it)
                elif t == "text":
                    add_text(sl, it)
                elif t == "image":
                    if not add_image(sl, it, deck_dir):
                        n_raster += 1
                elif t == "raster":
                    n_raster += 1
                    attr = "data-kit-raster-bg" if it["mode"] == "bg" else "data-kit-raster"
                    sel = f'[{attr}="{it["id"]}"]'
                    if it["mode"] == "bg":
                        page.eval_on_selector(sel, "e => e.setAttribute('data-kit-hide', '')")
                    clip = {"x": it["x"], "y": s["top"] + it["y"], "width": it["w"], "height": it["h"]}
                    png = page.screenshot(clip=clip, full_page=True, omit_background=True)
                    if it["mode"] == "bg":
                        page.eval_on_selector(sel, "e => e.removeAttribute('data-kit-hide')")
                    sl.shapes.add_picture(io.BytesIO(png), emu(it["x"]), emu(it["y"]), emu(it["w"]), emu(it["h"]))
            if s["notes"]:
                sl.notes_slide.notes_text_frame.text = s["notes"]
    out.parent.mkdir(parents=True, exist_ok=True)
    prs.save(out)
    return {"slides": len(slides), "raster": n_raster}
