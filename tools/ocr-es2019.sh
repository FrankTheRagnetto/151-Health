#!/usr/bin/env bash
# Il cuore del lettore del peso (tesseract-core, ES2022) tradotto per WebView 69 / Chrome 69.
# Da rifare dopo ogni aggiornamento di tesseract-core: sovrascrive www/ocr/core/*.js sul posto.
set -euo pipefail
E="${ESBUILD:-$HOME/Projects/151-entertainment/node_modules/.bin/esbuild}"
cd "$(dirname "$0")/../www/ocr/core"
for f in tesseract-core-lstm.wasm.js tesseract-core-simd-lstm.wasm.js; do
  "$E" "$f" --target=chrome69 --supported:class-field=false --outfile="$f.tmp.$$" --log-level=warning
  mv "$f.tmp.$$" "$f"
done
echo "ocr/core tradotto per Chrome 69"
