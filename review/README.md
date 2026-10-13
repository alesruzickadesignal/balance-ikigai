# Komentovací mód (review overlay)

Grafik komentuje přímo na náhledu webu; komentáře jdou do Cloudflare Workeru (KV), odkud je čte Claude.

## Jak to funguje
- `review/review.js` – overlay (Shadow DOM, bez knihoven). Tlačítko „Komentovat“ vpravo dole nebo **Alt+C**; klik na prvek, text, Cmd/Ctrl+Enter uloží, Esc zruší. Při prvním komentáři se zeptá na jméno.
- `review/worker/` – Worker `balance-ikigai-review` (`wrangler deploy`), API `GET/POST /comments`, `PATCH /comments/:id`, `DELETE /comments/:id` (jen s `Authorization: Bearer <ADMIN_TOKEN>`).
- `.github/workflows/pages.yml` – při push na `main` zkopíruje web do `_site/` (bez `review/worker`, `.github`, `_reference-webflow`), do každého `*.html` vloží `<script src="review/review.js" defer>` a `noindex` a nasadí na GitHub Pages (náhled).
- Skript není odkazovaný v žádném HTML v repu, takže `main` je čistý.

## Produkce
Produkční deploy z `main` nic z review nenačítá, protože žádné HTML na `review/review.js` neodkazuje. Složka `review/` smí zůstat (je jen nepoužitý soubor), ale čistší je ji při deployi vynechat (`review/` a `.github/` nekopírovat).

## Čtení komentářů
```
curl -s https://balance-ikigai-review.alesruzicka.workers.dev/comments | jq
curl -s "https://balance-ikigai-review.alesruzicka.workers.dev/comments?page=index.html" | jq
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
