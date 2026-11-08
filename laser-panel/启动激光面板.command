#!/bin/zsh
cd -- "${0:A:h}" || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! command -v node >/dev/null; then
  print -u2 '请先安装 Node.js 18 或以上版本。'
  exit 1
fi
exec node server.mjs --open
