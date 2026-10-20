# Koruna – nové logo, ikony a loading obrazovka

Tato složka obsahuje hotové assety. Úkol: zapojit je do aplikace Koruna.

## Soubory

| Soubor | Účel |
| --- | --- |
| `favicon.svg`, `favicon-32.png`, `favicon-16.png` | ikona v záložce prohlížeče |
| `apple-touch-icon.png` (180×180, bez zaoblení – iOS si zaoblí sám) | ikona na ploše iPhonu (Safari → Přidat na plochu) |
| `icon-512.png`, `icon-1024.png` | PWA / manifest, obecné použití |
| `site.webmanifest` | web app manifest |
| `koruna-mark.svg` | samotná značka, `fill="currentColor"` – barví se přes CSS |
| `head-snippet.html` | tagy do `<head>` |
| `loading.html` | samostatná animovaná loading stránka pro cold start Azure kontejnerů a DB |

## Co udělat

1. Zkopírovat ikony, `favicon.svg` a `site.webmanifest` do veřejné/static složky frontendu (tak, aby byly dostupné z kořene `/`).
2. Vložit obsah `head-snippet.html` do hlavního HTML / layoutu (odstranit staré favicon tagy).
3. Nahradit současné logo v navigaci (modrý čtverec s „K“) značkou z `koruna-mark.svg`:
   - ideálně jako komponentu (inline SVG), velikost a barvu řídit přes CSS,
   - v navigaci: bílá značka na modrém gradientu `linear-gradient(160deg, #4F86F7, #1F4FC4)`, rádius ≈ 22,5 % velikosti.
4. Loading obrazovka (`loading.html`):
   - musí běžet z hostingu, který nespí (Azure Static Web Apps / Blob static website / CDN), ne ze stejného kontejneru, který se probouzí,
   - v `<script>` nastavit `HEALTH_APP`, `HEALTH_DB` a `TARGET`,
   - na backendu vytvořit dva health endpointy:
     - `HEALTH_APP` – odpoví 200 hned, jak běží kontejner (bez dotazu do DB),
     - `HEALTH_DB` – odpoví 200, až když projde jednoduchý dotaz do DB (např. `SELECT 1`),
   - backend musí povolit CORS z domény loading stránky, pokud běží na jiné doméně,
   - alternativa: převést loading na komponentu SPA, která se zobrazí, dokud health check neprojde.

## Design tokeny

| Token | Hodnota |
| --- | --- |
| Koruna Blue | `#2F6BEA` |
| Sky | `#6FA2FF` |
| Deep | `#1B3A8F` |
| Ink | `#121A2B` |
| Ink soft | `#5B6880` |
| Mist | `#8C9DB8` |
| Surface | `#F3F5F9` |
| Positive | `#2E9E6B` |
| Font wordmarku | Plus Jakarta Sans 700, letter-spacing −0,02em |
