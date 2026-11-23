"""文の決まりと構成案のチェック（check.py から呼ぶ）。

見た目のチェック（check.js）と同じ形 {slide, level, msg, where, group} の一覧を返す。
- level：error（直す）／warn（注意）／info（要確認：文脈を目で見て判断する）
- どの資料にも使うチェック：資料名（＝PDF名）の濁点、ページ番号の並び、p.○○ の参照先、
  全角の英数字、4けた以上の数のカンマ、【】タグの数、構成案との照合
- 言葉のリストなどの中身は private/rules/ の md に書く（```slide-qa の JSON。下の load_config）
"""
from __future__ import annotations
import json
import re
import unicodedata
from pathlib import Path

from server import decks

# 資料の文を1枚ずつ取り出す（ノート・下の帯・ページ番号も）
EXTRACT = """() => [...document.querySelectorAll('section.slide')].map((s) => {
  const notes = s.querySelector('aside.notes');
  const foot = s.querySelector(':scope > .footer');
  const c = s.cloneNode(true);
  c.querySelectorAll('aside.notes, script, style').forEach((x) => x.remove());
  return { text: s.innerText.replace(notes ? notes.innerText : '', ''), raw: c.textContent,
           notes: notes ? notes.textContent : '', foot: foot ? foot.innerText : '' };
})"""

FLAT = re.compile(r"\s+")
FULLWIDTH = re.compile(r"[０-９Ａ-Ｚａ-ｚ]")
TAG = re.compile(r"【[^】]{1,10}】")
REF = re.compile(r"(?<![A-Za-z])[pP]\.\s?(\d{1,3})(?!\d)")
PAGE = re.compile(r"(\d{1,3})\s*/\s*(\d{1,3})")
BIGNUM = re.compile(r"(?<![\d,.\-/vV–:#])(\d{4,})(?![\d年月日\-/–:%])")


def flat(s: str) -> str:
    return FLAT.sub("", s)


def load_config(deck_dir: Path) -> dict:
    """private/rules/ の main.md・{フォルダ名}.md・{フォルダ名}-qa.md から ```slide-qa の JSON を集める。
    リストはつなぎ、そのほかは後のファイルが勝つ。"""
    cfg = {"ng": [], "check": [], "variants": [], "tag_limit": 1}
    rules = decks.PRIVATE / "rules"
    top = decks.rel_of(deck_dir).split("/")[0].lower()
    names = ["main.md", f"{top}.md", f"{top}-qa.md"]
    files = {p.name.lower(): p for p in rules.glob("*.md")} if rules.is_dir() else {}
    for n in names:
        p = files.get(n)
        if not p:
            continue
        for block in re.findall(r"```slide-qa\s*\n(.*?)```", p.read_text(encoding="utf-8"), re.S):
            try:
                d = json.loads(block)
            except json.JSONDecodeError as e:
                raise ValueError(f"{p.name} の slide-qa が JSON として読めない: {e}") from e
            for k, v in d.items():
                if isinstance(v, list) and isinstance(cfg.get(k), list):
                    cfg[k] = cfg[k] + v
                else:
                    cfg[k] = v
    return cfg


def latest_plan(deck_dir: Path) -> Path | None:
    """資料のフォルダの、いちばん新しい 構成案_v{版}.md。"""
    best, ver = None, -1
    for p in deck_dir.glob("構成案_v*.md"):
        m = re.match(r"構成案_v(\d+)", unicodedata.normalize("NFC", p.stem))
        if m and int(m.group(1)) > ver:
            best, ver = p, int(m.group(1))
    return best


def run(page, deck_dir: Path) -> list[dict]:
    slides = page.evaluate(EXTRACT)
    cfg = load_config(deck_dir)
    issues: list[dict] = []

    def add(n, level, group, msg, where=""):
        issues.append({"slide": n, "level": level, "group": group, "msg": msg, "where": where})

    def ctx(text, a, b, pad=10):
        return "「" + text[max(0, a - pad):b + pad].replace("\n", " ").strip() + "」"

    # ---- 資料名（＝書き出す PDF の名前）
    name = deck_dir.name
    if name != unicodedata.normalize("NFC", name):
        add(0, "error", "名前", "資料のフォルダ名の濁点が分かれている（PDF の名前もそうなる）", name)
    if cfg.get("filename") and not re.search(cfg["filename"], unicodedata.normalize("NFC", name)):
        add(0, "info", "名前", f"資料の名前が決まった型（{cfg['filename']}）と違う", name)

    # ---- ページ番号（下の帯の「NN / 総数」）
    nums = {}   # ページ番号 → 何枚目
    seq, totals = [], set()
    for i, s in enumerate(slides, 1):
        m = PAGE.search(s["foot"])
        if m and "付録" not in s["foot"]:   # 付録は「付録A（1/3）」の形なので数えない
            nums[int(m.group(1))] = i
            seq.append(int(m.group(1)))
            totals.add(int(m.group(2)))
    if seq:
        if seq != list(range(seq[0], seq[0] + len(seq))):
            add(0, "error", "ページ番号", f"ページ番号が順に並んでいない：{seq}")
        elif cfg.get("page_start") and seq[0] != cfg["page_start"]:
            add(0, "error", "ページ番号", f"ページ番号が {cfg['page_start']:02d} から始まっていない（{seq[0]:02d} から）")
        if len(totals) > 1:
            add(0, "error", "ページ番号", f"総ページ数の書き方がばらばら：{sorted(totals)}")
        elif seq[-1] != next(iter(totals)):
            add(0, "error", "ページ番号", f"最後のページ番号（{seq[-1]}）と総数（{next(iter(totals))}）が合わない")

    appendix = {i for i, s in enumerate(slides, 1) if "付録" in s["foot"]}
    for i, s in enumerate(slides, 1):
        text, notes = s["text"], s["notes"]
        body = i not in appendix   # 付録（出典の題名・URL）は言葉と表記のチェックから外す

        # ---- p.○○ の参照先（付録は論文のページ「p.1139」などがあるので外す）
        if nums and body:
            for src, label in ((text, ""), (notes, "（ノート）")):
                for m in REF.finditer(src):
                    if int(m.group(1)) not in nums:
                        add(i, "error", "参照", f"p.{int(m.group(1)):02d} というページが無い{label}", ctx(src, m.start(), m.end()))

        # ---- 【】タグ
        tags = TAG.findall(text)
        if len(tags) > cfg.get("tag_limit", 1):
            add(i, "warn", "言葉", f"【】のタグが {len(tags)} 個（1ページ {cfg.get('tag_limit', 1)} 個まで。普通の言葉にできないか）", " ".join(tags))

        if not body:
            continue
        # ---- 全角の英数字・4けた以上の数のカンマ
        for m in FULLWIDTH.finditer(text):
            add(i, "warn", "表記", "全角の英数字がある", ctx(text, m.start(), m.end()))
            break
        for m in BIGNUM.finditer(text):
            around = text[max(0, m.start() - 12):m.end() + 4]
            before = text[max(0, m.start() - 2):m.start()]
            if re.search(r"https?://|DOI|doi|ISBN|arXiv", around) or re.search(r"[A-Za-z]\s?$|[(（]$", before):
                continue
            if re.fullmatch(r"(19|20)\d\d", m.group(1)):
                continue   # 年
            if before.endswith("第") or text[m.end():m.end() + 1] == "号":
                continue   # 特許・文書の番号（第2802002号）
            add(i, "info", "表記", "4けた以上の数にカンマが無い？", ctx(text, m.start(), m.end()))

        # ---- 言葉（使わない言葉・文脈を見る言葉）
        for w in cfg.get("ng", []):
            for src, label in ((text, ""), (notes, "（ノート）")):
                m = re.search(w, src)
                if m:
                    add(i, "error", "言葉", f"使わない言葉「{m.group(0)}」{label}", ctx(src, m.start(), m.end()))
        for w in cfg.get("check", []):
            m = re.search(w, text)
            if m:
                add(i, "info", "言葉", f"「{m.group(0)}」（言い切り・敬語・タグなど、文脈を見る）", ctx(text, m.start(), m.end()))

    # ---- 表記ゆれ（資料全体で、同じ意味の書き方が2つ以上）
    body_text = "".join(s["text"] for i, s in enumerate(slides, 1) if i not in appendix)
    for group in cfg.get("variants", []):
        used = {w: body_text.count(w) for w in group if body_text.count(w)}
        if len(used) > 1:
            add(0, "warn", "表記", "表記ゆれ：" + "・".join(f"{w}（{c}）" for w, c in used.items()), "1つにそろえる（引用・出典の題名は原文のまま）")

    # ---- 構成案との照合（いちばん新しい 構成案_v○.md）
    plan = latest_plan(deck_dir)
    if plan:
        all_text = flat("".join(s["raw"] + s["notes"] for s in slides))
        lines = plan.read_text(encoding="utf-8").splitlines()
        afters = []
        for line in lines:
            m = re.match(r"\s*-\s*(?:修正後|追加)：(.+)", line)
            if not m or not m.group(1).strip():
                continue
            s = m.group(1).strip()
            afters.append(flat(s))
            if flat(s) in all_text or flat(s.replace("／", "")) in all_text:
                continue
            soft = "／" in s or "｜" in s or "（改行）" in s
            add(0, "info" if soft else "warn", "構成案",
                f"{plan.name} の「修正後」が見つからない" + ("（表・図の形なら目で見る）" if soft else ""), s[:80])
        for line in lines:
            m = re.match(r"\s*-\s*(?:修正前|削除)：(.+)", line)
            if not m or not m.group(1).strip():
                continue
            k = flat(m.group(1))
            if k in all_text and not any(k in a for a in afters):
                add(0, "warn", "構成案", f"{plan.name} の「修正前」が残っている", m.group(1).strip()[:80])
    return issues
