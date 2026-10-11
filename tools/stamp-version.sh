#!/bin/sh
# Stamp a fresh release version onto the asset URLs in index.html so every page load
# fetches a matching set of files instead of a stale cached copy. Run before each commit.
set -e
cd "$(dirname "$0")/.."
v=$(date +%Y%m%d%H%M%S)
sed -i '' -E "s/(href=\"style\.css)(\?v=[0-9]+)?\"/\1?v=$v\"/; s/(src=\"app\.js)(\?v=[0-9]+)?\"/\1?v=$v\"/; s/(src=\"cloud\.js)(\?v=[0-9]+)?\"/\1?v=$v\"/" index.html
echo "stamped $v"
