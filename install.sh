#!/bin/zsh
# slide-agent のセットアップ（Mac 用。Google Chrome が必要）
set -e
cd "${0:A:h}"
command -v brew >/dev/null || { echo "Homebrew を先に入れて: https://brew.sh"; exit 1; }
command -v uv >/dev/null || brew install uv
[[ -d "/Applications/Google Chrome.app" ]] || { echo "Google Chrome を入れて（PDF・PPTX の書き出しに使う）"; exit 1; }
uv sync                                     # .venv に FastAPI・Playwright・python-pptx を入れる
git config core.hooksPath hooks             # private/（資料）を commit させない
mkdir -p private/deck private/final private/rules ~/.local/bin
ln -sfn "$PWD/bin/slide" ~/.local/bin/slide
[[ ":$PATH:" == *":$HOME/.local/bin:"* ]] || echo '⚠ ~/.local/bin が PATH に無い。~/.zshrc に export PATH="$HOME/.local/bin:$PATH" を足して'
echo "✔ インストール完了。slide で開く"
