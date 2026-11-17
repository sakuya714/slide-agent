# slide-kit

AI が HTML で作ったスライドを、ブラウザで直して、**PDF** と **PowerPoint で編集できる PPTX** に書き出すローカルアプリ（Mac）。

```
AI が deck.html を書く → 画面で直す → AI がさらに直す → … → PDF / PPTX
```

- 正本は資料ごとに `deck.html` 1つ。AI も人も同じファイルを直す。編集画面は外からの変更を2秒以内に反映する
- `127.0.0.1` だけで動く。資料（`slide/`）は Git に入らない（`.gitignore`＋pre-commit フック）

## 使い方

```bash
slide                          # 編集画面を開く（☰ で資料の一覧）
slide new 営業/〇〇社_提案       # 新しい資料
slide check 営業/〇〇社_提案     # はみ出し・画像切れなどを調べる
slide pdf  営業/〇〇社_提案      # → slide/final/営業/〇〇社_提案.pdf
slide pptx 営業/〇〇社_提案      # → slide/final/営業/〇〇社_提案.pptx
slide stop / slide restart
```

編集画面：クリックで部品を選ぶ／ダブルクリックで文字を直す（Enter で改行、Esc で終わる）／Esc で親の部品へ／⌘Z・⇧⌘Z／⌘D で複製／Delete で削除／スライド一覧はドラッグで並べ替え／PDF・PPTX ボタンは ☰ の一番下。直して1秒後に自動保存（直前の版は `.deck.bak.html`）。

## インストール

```bash
git clone https://github.com/sakuya714/slide-kit.git
cd slide-kit && ./install.sh
```

Homebrew と Google Chrome が必要。

## 構成

| パス | 中身 |
|---|---|
| `bin/slide` | コマンド（`~/.local/bin/slide` からリンク） |
| `server/` | ローカルサーバー（FastAPI）・資料の読み書き・CLI |
| `editor/` | 編集画面（素の HTML / CSS / JS。ビルド不要） |
| `theme/` | 資料の見た目（`default.css`）・テーマ色（`vars.css`）・ひな形（`new.html`） |
| `export/` | 書き出しとチェック。Chrome で描画（Playwright）→ PDF／`extract.js` で部品を読み取り python-pptx で PPTX に置き直す |
| `docs/` | `FORMAT.md`（deck.html の書き方）・`design.md`（設計） |
| `slide/` | ユーザーのもの全部（Git 管理外）。`slide/deck/`＝資料の本体（サイドバーに出る）、`slide/final/`＝書き出した PDF・PPTX。どちらも中は資料ごとのフォルダ |

## PPTX の変換

文字はテキストボックス、背景色・枠線・角丸の箱は図形、画像は画像（トリミングも再現）、発表者ノートはノートになる。SVG・グラデーション・影・回転・表は、その部分だけ画像になる（`slide check` が知らせる）。

## ライセンス

MIT
