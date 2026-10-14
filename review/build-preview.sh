#!/usr/bin/env bash
# Sestaví náhled s verzemi do složky $1 (výchozí _site). Spouští se z kořene repa (workflow i lokálně).
# Verze = anotované tagy preview-v*. Overlay a rozcestník se berou z main (REVIEW_JS / COMPARE_HTML přepíšou, pro lokální test).
set -euo pipefail
OUT="${1:-_site}"
MAIN_REF="${MAIN_REF:-origin/main}"
rm -rf "$OUT"; mkdir -p "$OUT/review"

if [ -n "${REVIEW_JS:-}" ]; then cp "$REVIEW_JS" "$OUT/review/review.js"; else git show "$MAIN_REF:review/review.js" > "$OUT/review/review.js"; fi
if [ -n "${COMPARE_HTML:-}" ]; then cp "$COMPARE_HTML" "$OUT/index.html"; else git show "$MAIN_REF:review/compare.html" > "$OUT/index.html"; fi

TAGS=$(git tag -l 'preview-v*' --sort=version:refname)
[ -n "$TAGS" ] || { echo "Žádný tag preview-v*" >&2; exit 1; }
: > "$OUT/versions.tsv"
for tag in $TAGS; do
  id="${tag#preview-}"
  mkdir -p "$OUT/$id"
  git archive "$tag" | tar -x -C "$OUT/$id" --exclude='.github' --exclude='review' --exclude='_reference-webflow'
  for f in "$OUT/$id"/*.html; do
    perl -pi -e 's#</body>#<script src="../review/review.js" data-version="'"$id"'" defer></script></body>#; s#<head>#<head><meta name="robots" content="noindex">#' "$f"
  done
  printf '%s\t%s\t%s\t%s\n' "$id" "$(git tag -l --format='%(contents:subject)' "$tag")" \
    "$(git tag -l --format='%(creatordate:short)' "$tag")" "$(git rev-parse --short "$tag^{commit}")" >> "$OUT/versions.tsv"
  latest="$id"
done

python3 - "$OUT" "$latest" <<'PY'
import json, os, sys
out, latest = sys.argv[1:]
rows = [l.rstrip('\n').split('\t') for l in open(f'{out}/versions.tsv')]
json.dump([dict(zip(('id', 'label', 'date', 'commit'), r)) for r in rows], open(f'{out}/versions.json', 'w'), ensure_ascii=False, indent=1)
pages = sorted(f for f in os.listdir(f'{out}/{latest}') if f.endswith('.html'))
pages.sort(key=lambda p: p != 'index.html')
json.dump(pages, open(f'{out}/pages.json', 'w'))
# Staré odkazy na kořenové podstránky -> nejnovější verze (index.html je rozcestník, 404.html zůstává GitHub 404)
for p in pages:
    if p in ('index.html', '404.html'): continue
    t = f'{latest}/{p}'
    open(f'{out}/{p}', 'w').write(f'<!doctype html><html lang="cs"><head><meta charset="utf-8"><meta name="robots" content="noindex">'
        f'<meta http-equiv="refresh" content="0; url={t}"><title>Přesměrování</title>'
        f'<script>location.replace("{t}"+location.search+location.hash)</script></head>'
        f'<body><p><a href="{t}">Pokračovat na {t}</a></p></body></html>')
PY
rm "$OUT/versions.tsv"
