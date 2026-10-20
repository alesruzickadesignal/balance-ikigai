# Komentovací mód (review overlay)

Grafik komentuje přímo na náhledu webu; komentáře jdou do Cloudflare Workeru (KV), odkud je čte Claude.

## Jak to funguje
- `review/review.js` – overlay (Shadow DOM, bez knihoven). Tlačítko „Komentovat“ vpravo dole nebo **Alt+C**; klik na prvek, text, Cmd/Ctrl+Enter uloží, Esc zruší. Při prvním komentáři se zeptá na jméno.
- `review/worker/` – Worker `balance-ikigai-review` (`wrangler deploy`), API `GET/POST /comments`, `PATCH /comments/:id`, `DELETE /comments/:id` (jen s `Authorization: Bearer <ADMIN_TOKEN>`).
- `.github/workflows/pages.yml` + `review/build-preview.sh` – při push na `main` (nebo ručně) sestaví `_site/` z tagů `preview-v*`: každá verze do `vN/` (bez `review/`, `.github`, `_reference-webflow`), do každého `*.html` vloží `<script src="../review/review.js" data-version="vN" defer>` a `noindex`; `review.js` a rozcestník `review/compare.html` (→ `_site/porovnani.html`) bere z `main`. Do kořene `_site/` dá nejnovější verzi bez overlaye (jen `noindex`) – to je odkaz pro klienta. Nasadí na GitHub Pages.
- Skript není odkazovaný v žádném HTML v repu, takže `main` je čistý.

## Verze náhledu
URL `https://alesruzickadesignal.github.io/balance-ikigai/` je nejnovější verze bez komentování (pro klienta). Rozcestník s porovnáním vedle sebe je na `…/porovnani.html`, jednotlivé verze s komentováním na `…/v1/`, `…/v2/`…

Přidat v3:
```
git add -A && git commit -m "…"
git tag -a preview-v3 -m "popis verze"      # popis se ukáže v rozcestníku
git push origin main preview-v3
```
Prostředí `github-pages` povoluje deploy jen z `main`, proto tag sám workflow nespouští. Spustí ho push na `main`; když už je `main` pushnutý: `gh workflow run pages.yml --ref main`.

Klíč komentářů: `vN/soubor.html` (např. `v2/index.html`). Výjimka `v1` – klíč bez prefixu (`index.html`), aby zůstaly komentáře z doby před verzováním.

## Produkce
Produkční deploy z `main` nic z review nenačítá, protože žádné HTML na `review/review.js` neodkazuje. Složka `review/` smí zůstat (je jen nepoužitý soubor), ale čistší je ji při deployi vynechat (`review/` a `.github/` nekopírovat).

## Čtení komentářů
```
curl -s https://balance-ikigai-review.alesruzicka.workers.dev/comments | jq
curl -s "https://balance-ikigai-review.alesruzicka.workers.dev/comments?page=index.html" | jq      # v1
curl -s "https://balance-ikigai-review.alesruzicka.workers.dev/comments?page=v2/index.html" | jq   # v2
```
`GET /comments` (výpis klíčů v KV) může být až ~60 s za čerstvým zápisem.

## Označit hotové
V overlayi u špendlíku „Hotovo“ / „Znovu otevřít“, nebo:
```
curl -X PATCH https://balance-ikigai-review.alesruzicka.workers.dev/comments/<id> -d '{"status":"done"}'
```
Smazání (admin token je v `~/.config/balance-ikigai-review/admin-token`, není v repu):
```
curl -X DELETE -H "Authorization: Bearer $(cat ~/.config/balance-ikigai-review/admin-token)" .../comments/<id>
```
