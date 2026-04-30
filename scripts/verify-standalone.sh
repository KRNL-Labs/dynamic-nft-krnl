#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

fail() {
  echo "standalone verification failed: $1" >&2
  exit 1
}

if [ -f .gitmodules ]; then
  fail ".gitmodules is present"
fi

SEARCH_EXCLUDES=(
  --glob '!node_modules/**'
  --glob '!dist/**'
  --glob '!build/**'
  --glob '!.next/**'
  --glob '!coverage/**'
  --glob '!.git/**'
  --glob '!scripts/verify-standalone.sh'
)

rg "${SEARCH_EXCLUDES[@]}" -n '/Users/' . && fail "absolute /Users path found"
rg "${SEARCH_EXCLUDES[@]}" -n '../krnl-nft($|[^A-Za-z0-9_-])' . && fail "../krnl-nft reference found"
rg "${SEARCH_EXCLUDES[@]}" -n '../krnl-nft-ui' . && fail "../krnl-nft-ui reference found"
rg "${SEARCH_EXCLUDES[@]}" -n '../krnl-nft-contracts' . && fail "../krnl-nft-contracts reference found"
rg "${SEARCH_EXCLUDES[@]}" -n '../krnl-nft-workflows' . && fail "../krnl-nft-workflows reference found"
rg "${SEARCH_EXCLUDES[@]}" -n 'file:\.\./' . && fail "file:../ dependency found"
rg "${SEARCH_EXCLUDES[@]}" -n 'WORKFLOW_TEMPLATES_DIR=/Users' . && fail "external workflow template dir found"

if find . -path ./.git -prune -o -type l -print | while read -r link; do
  target="$(readlink "$link")"
  case "$target" in
    /*)
      case "$target" in "$ROOT"/*) ;; *) echo "$link -> $target";; esac
      ;;
    *) ;;
  esac
done | rg .; then
  fail "symlink points outside repo"
fi

if rg "${SEARCH_EXCLUDES[@]}" -n 'context:\s*(/|\.\./)' docker-compose.yml apps packages 2>/dev/null; then
  fail "Docker context outside repo found"
fi

echo "Standalone verification passed."
