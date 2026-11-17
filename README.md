# slide-kit

AI が HTML で作ったスライドを、ブラウザで直して、**PDF** と **PowerPoint で編集できる PPTX** に書き出すローカルアプリ（Mac）。

```
AI が deck.html を書く → 画面で直す → AI がさらに直す → … → PDF / PPTX
```

- 正本は資料ごとに `deck.html` 1つ。AI も人も同じファイルを直す。編集画面は外からの変更を2秒以内に反映する
- `127.0.0.1` だけで動く。自分の資料は `private/` に入り、Git には入らない（`.gitignore`＋pre-commit フック）
- Claude Code でこのフォルダを開けば、`CLAUDE.md` から作り方を読んで資料を作れる

## 使い方

```bash
slide                          # 編集画面を開く（☰ で資料の一覧）
slide new 営業/〇〇社_提案       # 新しい資料 → private/deck/営業/〇〇社_提案/deck.html
slide open 営業/〇〇社_提案      # その資料を開く
slide check 営業/〇〇社_提案     # はみ出し・画像切れなどを調べる
slide pdf  営業/〇〇社_提案      # → private/final/営業/〇〇社_提案.pdf
slide pptx 営業/〇〇社_提案      # → private/final/営業/〇〇社_提案.pptx
slide stop / slide restart
```

編集画面：クリックで部品を選ぶ／ダブルクリックで文字を直す（Enter で改行、Esc で終わる）／Esc で親の部品へ／⌘Z・⇧⌘Z／⌘D で複製／Delete で削除／スライド一覧はドラッグで並べ替え／PDF・PPTX ボタンは ☰ の一番下。直して1秒後に自動保存（直前の版は `.deck.bak.html`）。

## インストール

```bash
git clone https://github.com/sakuya714/slide-kit.git
cd slide-kit && ./install.sh
```

Mac・Homebrew・Google Chrome が必要（Chrome は PDF・PPTX の書き出しに使う）。AI に資料を作らせるなら Claude Code。

## 構成

```
slide-kit/
├── CLAUDE.md        AI（Claude Code）向けの説明書：作る流れ・deck.html の書き方・private/rules/ の読み方（作り方は全部ここ）
├── docs/
│   └── design.md      設計
├── bin/slide        slide コマンド（~/.local/bin/slide からリンク）
├── server/          ローカルサーバー（FastAPI）・資料の読み書き・CLI
├── editor/          編集画面（素の HTML / CSS / JS。ビルド不要）
├── theme/           資料の見た目（default.css）・テーマ色（vars.css）・ひな形（new.html）
├── export/          Chrome で描画（Playwright）→ PDF／部品を読み取り python-pptx で PPTX に置き直す／チェック
├── hooks/           private/ を commit させないフック
├── install.sh
└── private/         ← 自分だけ（Git 管理外。install.sh が作る）
    ├── deck/          作業中の資料（サイドバーに出る）。{フォルダ}/{資料名}/deck.html・assets/
    ├── final/         完成品（書き出した PDF・PPTX）。deck/ と同じ階層
    └── rules/         自分で育てる AI 向けの指示（例：rules/営業/提案書.md）
```

## PPTX の変換

文字はテキストボックス、背景色・枠線・角丸の箱は図形、画像は画像（トリミングも再現）、発表者ノートはノートになる。SVG・グラデーション・影・回転・表は、その部分だけ画像になる（`slide check` が知らせる）。

## ライセンス

MIT
