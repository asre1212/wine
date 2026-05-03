# Cellar — Wine, Sake & Liquor Journal (PWA)

A local-first iPhone-friendly Progressive Web App for tracking your wine, sake, and liquor collection. All data lives on the device. No accounts, no servers.

## Features

- Three sections: **Wine**, **Sake**, **Liquor**, each with its own type categories.
- Add bottles with name, type, tasting notes, price + price year, year bought, year drank.
- Rating from 0–5 with up to two decimals (e.g. `4.75`).
- Mark a bottle as **In cellar** (untasted) — it's tracked but doesn't get a rating.
- Auto-ranking within each category by type, sorted by rating.
- Filter by type / status, search by name or note.
- **Backup**: export/import full collection as JSON (use this when moving phones).
- **Excel export**: `.xlsx` workbook, one sheet per category.
- Works offline once installed.

## Use it on iPhone

1. Open the GitHub Pages URL in **Safari** (must be Safari, not Chrome).
2. Tap the **Share** icon → **Add to Home Screen**.
3. Launch from the home-screen icon. It now runs full-screen and offline.

Data is stored in the browser's `localStorage` for that origin. To move to a new phone:
- On old phone → Settings (gear icon) → **Export JSON**, AirDrop / email the file to the new phone.
- On new phone → install the PWA → Settings → **Import JSON**.

## Deploy to GitHub Pages

1. Create a new GitHub repo (e.g. `cellar`).
2. Copy the contents of this folder (`cellar-pwa/`) into the repo root and push:
   ```sh
   git init
   git add .
   git commit -m "Initial cellar PWA"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<your-repo>.git
   git push -u origin main
   ```
3. In the repo on GitHub: **Settings → Pages**.
   - Source: **Deploy from a branch**
   - Branch: `main` / `/ (root)` → Save.
4. After ~1 minute the site is live at `https://<your-username>.github.io/<your-repo>/`.
5. Open that URL in Safari on iPhone and **Add to Home Screen**.

## Files

| file | purpose |
| --- | --- |
| `index.html` | App shell |
| `app.js` | All app logic |
| `style.css` | Styling |
| `manifest.webmanifest` | PWA manifest |
| `sw.js` | Service worker (offline cache) |
| `icons/` | App icons (SVG + PNG sizes) |
| `.nojekyll` | Tells GitHub Pages to serve files as-is |

## Updating

When you edit any file and push, the service worker may serve a cached version on next open. Either:
- bump the cache name in `sw.js` (`cellar-v1` → `cellar-v2`), or
- on iPhone: long-press the app → **Remove App** → re-add from Safari.

## Notes

- The Excel export uses [SheetJS](https://github.com/SheetJS/sheetjs) loaded from a CDN. It is cached on first online launch so subsequent offline launches still let you export.
- All your data is in your browser; clearing site data on Safari erases your collection. Export a backup periodically.
