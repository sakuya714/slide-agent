# slide-kit（Claude Code 向け）

このリポジトリは、HTML でスライドを作って、ブラウザで直して、PDF・PowerPoint で編集できる PPTX に書き出すローカルアプリ。資料は `private/`（Git 管理外）に入っている。

## 資料を作る・直すとき

1. `docs/FORMAT.md` を読む（全員共通の書き方：deck.html の形・使える部品・守ること）
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

- 見た目・構成・言葉づかいは rules を優先する。ただし FORMAT.md の「守ること」（はみ出し禁止・テーマ色だけを使う 等）は破らない
- ユーザーに「この資料はこう作って」「次からこうして」と言われたら、確認したうえで、該当する rules のファイルに書き足す（無ければ作る）

## 守ること

- `private/` の中身（資料・ルール・名前・顧客名）を、コード・docs・README・commit メッセージに書かない。このリポジトリは公開されている
- `private/` は `.gitignore` と pre-commit フック（`hooks/`）で Git に入らない。push の前に `git status` で確かめる
- アプリのコードを直したら、`README.md` の構成表と `docs/design.md` も合わせて直す
