# deck.html の書き方（秘書向け）

slide-kit の資料は `slide/deck/{フォルダ}/{資料名}/deck.html` の1ファイル（画像は同じフォルダの `assets/`）。書き出しは `slide/final/{フォルダ}/{資料名}.pdf|.pptx`。秘書はこの決まりで書く。ユーザーは編集画面（`slide`）で同じファイルを直す。

## 1. 作り方の流れ

1. `slide new {フォルダ}/{資料名}` でひな形を作る（テーマが埋め込まれた deck.html と `assets/` ができる）
2. `<body>` の中の `<section class="slide">` を書き換える・足す
3. `slide check {フォルダ}/{資料名}` を通す。**エラー（✖）が0になるまで直す**。注意（△）は理由があれば残してよい
4. ユーザーに「`slide` で開いて」と伝える。PDF・PPTX が必要なら `slide pdf` / `slide pptx` で書き出す（`slide/final/` に出る）

既存の資料を直すときも、同じ deck.html を直接書き換えてよい。編集画面が開いていれば2秒以内に反映される。

## 2. ファイルの形

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

## 3. スライド

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

## 4. 部品（テーマのクラス）

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

## 5. 守ること（チェックで止まるもの・注意が出るもの）

| ルール | 理由 |
|---|---|
| 文字をスライドの外にはみ出させない（✖） | PDF・PPTX で切れる。多いときは文字を減らすか、スライドを分ける |
| 画像は実在するファイルを指す（✖） | |
| 文字は 14px 以上（△） | 投影・印刷で読めない |
| 色は `var(--accent)` などテーマ色で書く。`style="color:#c00"` のような直書きをしない（△） | テーマ色の一括変更が効かなくなる |
| グラデーション・影・回転・SVG・表は、PPTX でその部分が画像になる（△） | PowerPoint で文字を直せなくなる。直せる必要がある文字には使わない |
| 1スライド＝1メッセージ。文は短く | 営業資料・発表資料として読まれるため |

`style` 属性は「大きさの微調整（`font-size`・`margin-top`・`height` など）」だけに使う。並べ方はクラスで書く。

## 6. PPTX になるとき

| HTML | PowerPoint |
|---|---|
| 文字（見出し・段落・箇条書き） | テキストボックス（1文字単位で色・太さ・大きさを再現） |
| 背景色・枠線・角丸のある箱、`.bar` の縦線 | 図形 |
| 画像（`img`・背景画像） | 画像（`object-fit: cover` のトリミングも再現） |
| SVG・グラデーション・影・回転・表・角丸の写真 | その部分だけ画像 |
| `<aside class="notes">` | ノート |

フォントは PPTX では `--pptx-font-sans`（游ゴシック）・`--pptx-font-serif`（游明朝）に置き換わる。PowerPoint は日本語の改行位置が Chrome と少し違うので、文字の箱は少し広げてある。
