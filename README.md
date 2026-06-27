# Cellar — Wine, Sake & Liquor Journal (PWA)

A local-first iPhone-friendly Progressive Web App for tracking your wine, sake, and liquor collection. All data lives on the device. No accounts, no servers.

## Features

### Wine styles

Wine has a second optional style field below the top-level type. Red, White, Rosé, Sparkling, Dessert, Fortified, Orange, and Other can be broken down into styles such as Pinot Noir, Cabernet Sauvignon, Nebbiolo / Barolo, Chardonnay, Chablis, Sauvignon Blanc, Champagne, Cava, and Prosecco. Rankings in Wine use the more specific style when present. Liquor includes Port as a type.

### Bottle pictures

Each bottle entry can include one local picture from the iPhone camera roll, camera, or screenshot. The app resizes the image in-browser to a small WebP/JPEG data image before saving it with the entry in local storage. Pictures are included in JSON backup/import. Excel export marks whether a picture exists, but does not embed the image file.


- Three sections: **Wine**, **Sake**, **Liquor**, each with its own type categories.
- Add bottles with name, type, tasting notes, price + price year, year bought, year drank.
- Rating from 0–5 with up to two decimals (e.g. `4.75`).
- Mark a bottle as **In cellar** (untasted) — it's tracked but doesn't get a rating.
- Auto-ranking within each category by type, sorted by rating.
- Filter by type / status, search by name or note.
- A small "Notes" link in the top bar opens a free-form scratchpad (places to buy from, recommendations, gift ideas). Saved automatically; included in JSON backup and Excel export.
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

After you push new code to GitHub, the easiest way to refresh the installed app on your phone is the built-in updater:

1. Open the app.
2. Tap the gear icon → **Updates** → **Update from GitHub**.
3. Confirm. The app unregisters its service worker, clears its cache, and reloads with a cache-buster — fetching all assets fresh from GitHub Pages.

Your bottles, ratings, notes, and tasting history live in `localStorage`, which the updater never touches. Only the app shell (HTML / JS / CSS / icons / xlsx library) is refreshed.

The app also auto-checks for updates each time you open it. If a new version is detected, a small "New version available" toast appears in the corner; tap **Update from GitHub** to apply it.

If you'd rather skip the in-app updater, you can also long-press the app on iPhone → **Remove App** → re-add from Safari. Your data will be lost that way unless you exported a backup first.

When deploying a new version, also bump the cache name in `sw.js` (e.g. `cellar-v2` → `cellar-v3`) so users who never tap the update button still pick up the change automatically on next launch.

## Notes

- The Excel export uses [SheetJS](https://github.com/SheetJS/sheetjs) loaded from a CDN. It is cached on first online launch so subsequent offline launches still let you export.
- All your data is in your browser; clearing site data on Safari erases your collection. Export a backup periodically.

## Version 2.0 recovery

Version 2.0 rewrites the app controller and preserves the existing `cellar.bottles.v1`, `cellar.notes.v1`, and related local-storage keys. After deploying all files, open the GitHub Pages URL once in Safari with `?fix=2.0.0` appended. This bypasses the broken older service-worker cache without deleting local data. Do not remove the Home Screen app or clear website data before exporting a JSON backup.


## Version 2.0.1 photo reliability fix

Bottle pictures are now converted to compact local JPEG thumbnails before saving. This is more reliable on iPhone Safari/PWA than saving large camera images or WebP data in local storage. Existing entries and existing photos are preserved.

After deploying, open your app once with `?fix=2.0.1` at the end of the GitHub Pages URL, then use **Update from GitHub** if needed.


## Version 2.0.2 URI-too-long photo fix

Bottle photo data is no longer stored in a hidden form field. This prevents iPhone Safari from accidentally trying to submit a large image through the page URL, which caused the `URI too long` error. Photos are still stored locally with each bottle after Save.

After deploying, open your app once with `?fix=2.0.2` at the end of the GitHub Pages URL.
