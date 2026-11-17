# slide-kit（Claude Code 向け）

このリポジトリは、HTML でスライドを作って、ブラウザで直して、PDF・PowerPoint で編集できる PPTX に書き出すローカルアプリ。資料は `private/`（Git 管理外）に入っている。

AI 向けの情報は全部このファイル。人向けの説明（使い方・画面・フォルダ構成・仕組み）は `README.md` にある。

## 資料を作る・直すとき

1. 下の「deck.html の書き方」に従う（全員共通）
2. `private/rules/` を見て、作る資料に関係するルールを全部読む（下の「private/rules/」）
3. 新しく作るときは `slide new {フォルダ}/{資料名}` → `private/deck/{フォルダ}/{資料名}/deck.html` の `<body>` を書く。画像は同じフォルダの `assets/`
4. `slide check {フォルダ}/{資料名}` を通す。**エラー（✖）が0になるまで直す**
5. `slide open {フォルダ}/{資料名}` で開く。書き出しは `slide pdf` / `slide pptx`（`private/final/` に出る）

**既存の資料を直す前に、必ずその場で deck.html を読み直す。** ユーザーが編集画面で直していることがある。

## private/rules/

ユーザーが自分で育てる、Claude Code 向けの指示（Markdown）。

| 置き方 | いつ読む |
|---|---|
| `private/rules/共通.md` など、直下のファイル | すべての資料で読む |
| `private/rules/{フォルダ}/…`（例：`private/rules/営業/提案書.md`） | `private/deck/{フォルダ}/…` の資料を作る・直すときに読む |

- 見た目・構成・言葉づかいは rules を優先する。ただし「deck.html の書き方」の「4. 守ること」（はみ出し禁止・テーマ色だけを使う 等）は破らない
- ユーザーに「この資料はこう作って」「次からこうして」と言われたら、確認したうえで、該当する rules のファイルに書き足す（無ければ作る）

## deck.html の書き方（全員共通）

### 1. ファイルの形

```html
<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<title>資料名</title>
<style data-kit="theme">…テーマ（触らない）…</style>
<style data-kit="vars">:root{ --ink:…; --accent:…; … }</style>
</head>
<body>

<section class="slide">…</section>

<section class="slide">…</section>

</body>
</html>
```

- `<style data-kit="theme">` は触らない（全資料共通の部品の見た目）
- 色を変えたいときは `<style data-kit="vars">` の値を変える（資料全体が変わる）
- 外部の CSS・JS・Web フォントは読み込まない（PDF・PPTX がずれる。オフラインで開けなくなる）
- 画像は `assets/` に置いて `src="assets/xxx.jpg"` で参照する。PNG・JPEG を使う（WebP は PPTX で PNG に変換される。SVG は PPTX で画像になる）

### 2. スライドの形

```html
<section class="slide" data-bg="dark" data-align="center">
  …部品…
  <aside class="notes">ここで話すこと（PDF には出ない。PPTX ではノートになる）</aside>
</section>
```

| 属性 | 意味 |
|---|---|
| `data-bg="dark"` | 暗い地（`--dark` の背景に明るい文字） |
| `data-align="center"` | 中身を縦の中央に寄せる（表紙・まとめ向け） |

大きさは 1280×720 固定。余白は上下 72px・左右 88px。中身は上から縦に並ぶ（`gap: 20px`）。

### 3. 使える部品（テーマのクラス）

| 書き方 | 見た目 |
|---|---|
| `<p class="eyebrow">` | 見出しの上の小さいラベル（アクセント色・字間広め） |
| `<h1>` | 表紙の大見出し（60px・明朝） |
| `<h2>` | スライドの見出し（40px・明朝） |
| `<h3>` | カードなどの小見出し（24px） |
| `<p>` / `<p class="lead">` | 本文（20px）／大きめの導入文（24px） |
| `<em>` / `<strong>` | アクセント色で強調／太字 |
| `<p class="muted">` / `class="small"` | 薄い文字／小さい文字（15px） |
| `<span class="tag">` | 小さい丸タグ |
| `<p class="bar">` | 左にアクセントの縦線がある文 |
| `<ul>` / `<ol>` | 箇条書き（記号はアクセント色） |
| `<div class="grid cols-2〜4">` | 2〜4列に並べる |
| `<div class="row">` | 横に並べる |
| `<div class="split">` | 左右2段（左に文、右に画像など） |
| `<div class="card">` | 角丸の箱（中に h3・p） |
| `<div class="stat"><span class="num">966</span><span class="label">説明</span></div>` | 大きい数字＋説明 |
| `<img class="photo">` | 角丸で枠いっぱいの写真 |
| `<img class="bg">` ＋ `<div class="shade"></div>` | スライド全面の背景写真＋暗幕（暗い地と一緒に） |
| `<div class="spacer"></div>` | 残りの高さを埋める（下に寄せたいものの前に） |
| `<div class="footer"><span>左</span><span>右</span></div>` | 下の帯（資料名・ページ番号） |

### 4. 守ること（チェックで止まるもの・注意が出るもの）

| ルール | 理由 |
|---|---|
| 文字をスライドの外にはみ出させない（✖） | PDF・PPTX で切れる。多いときは文字を減らすか、スライドを分ける |
| 画像は実在するファイルを指す（✖） | |
| 文字は 14px 以上（△） | 投影・印刷で読めない |
| 色は `var(--accent)` などテーマ色で書く。`style="color:#c00"` のような直書きをしない（△） | テーマ色の一括変更が効かなくなる |
| グラデーション・影・回転・SVG・表・角丸の写真は、PPTX でその部分が画像になる（△） | PowerPoint で文字を直せなくなる。直せる必要がある文字には使わない |
| 1スライド＝1メッセージ。文は短く | 営業資料・発表資料として読まれるため |

`style` 属性は「大きさの微調整（`font-size`・`margin-top`・`height` など）」だけに使う。並べ方はクラスで書く。

## アプリのコードを直すとき

- 構成と仕組みは `README.md` の「フォルダ構成」「仕組み」。直したら README も同じ commit で合わせる（人向けの説明は README だけ）
- 画面は素の JavaScript（`editor/app.js`）。ビルドしない・ライブラリを足さない
- 編集画面が資料に付ける目印（`data-kit-cur`・`data-kit-sel`・`data-kit-hover`・`contenteditable`・`<style data-kit="edit">`・`<base data-kit="base">`）は、保存時に `clean()` で必ず外す。新しく目印を足したら `KIT_ATTRS` か `clean()` にも足す
- テーマ（`theme/default.css`）を変えたら、このファイルの「3. 使える部品」も直す。既存の資料には自動で反映されない（資料ごとにテーマを埋め込んでいるため）
- 確かめ方：`slide restart` → `slide check` と `slide pdf` / `slide pptx` を見本の資料で通す。画面はブラウザで実際に操作して確かめる

## リポジトリで守ること

- `private/` の中身（資料・ルール・名前・顧客名）を、コード・README・commit メッセージに書かない。このリポジトリは公開されている
- `private/` は `.gitignore` と pre-commit フック（`hooks/`）で Git に入らない。push の前に `git status` で確かめる
