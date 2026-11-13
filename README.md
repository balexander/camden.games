# Fact Dash

Quick flash-card rounds for math facts and vocabulary, built for an 8-year-old and the grown-up sitting next to him. He says the answer, the grown-up taps Yes or No, and the app decides which card comes next.

It is a plain static site with no build step and no accounts, plus a small Cloudflare Worker that syncs players between devices.

## What it does

- **Math:** adding and subtracting within 20 (switchable between numbers up to 10, 11 to 20, or all) and multiplying and dividing to 10. Every card shows a number strategy and a dot picture.
- **Words:** 120 built-in vocabulary words in three levels, each with a sound-alike picture or its real word parts, plus a sentence. Grown-ups can add their own word lists.
- **Two round types:** Practice (15 cards, no clock) or a timed Speed round (60 seconds by default).
- **Spaced repetition:** each card sits in one of six boxes. A quick right answer moves it up, and it comes back after 8 hours, then 2, 5, 12 and 30 days. A miss sends it back to box one and it returns within the same round.
- **Players and progress:** any number of players, picked on startup, each with best scores, a score chart and a map of every card.
- **Saved data:** progress is kept on the device after every answer. Grown-ups > Sync across devices keeps it on every device with a family sync code, and Saved data saves everything as one CSV file.

## Run it

```
npm start        # http://127.0.0.1:4318 (Node.js 22 or newer)
npm test
```

Opening `app/index.html` straight from the file system also works.

## Put it on an iPhone

Fact Dash is a home-screen web app, not an App Store app.

1. Host the `app/` folder at an HTTPS address (see below).
2. Open that address in Safari on the phone.
3. Tap Share, then Add to Home Screen.

It then opens full screen from its own icon and works without a connection.

Hosting options:

- **GitHub Pages:** set Settings > Pages > Source to "GitHub Actions", then run the "Deploy Fact Dash" workflow from the Actions tab. Pages on a private repository needs a paid GitHub plan, and the published site is public either way.
- **Any static host:** drag the `app/` folder onto Netlify Drop, Cloudflare Pages or similar.

For the App Store later, the same folder can be wrapped with Capacitor on a Mac with Xcode and an Apple Developer account.

## Play it inside Claude

`npm run artifact` writes `dist/fact-dash.html`, a single-file copy for publishing as a Claude artifact. Published with the `db`, `user` and `downloads` capabilities, that copy also keeps each viewer's players in the artifact's private per-viewer store, so progress survives a cleared browser.

## Files

| Path | What it is |
| --- | --- |
| `app/index.html` | Interface and styles |
| `app/core.js` | Game logic with no page access: decks, memory tricks, scheduling, saved-data checks, CSV |
| `app/words.js` | Built-in vocabulary |
| `app/sw.js`, `app/manifest.webmanifest`, `app/icons/` | Installable-app shell and offline cache |
| `worker/index.js`, `wrangler.jsonc` | Cloudflare Worker: serves `app/` and stores synced players in a Durable Object |
| `serve.mjs` | Local static server for `npm start` |
| `build-artifact.mjs` | Builds the single-file Claude artifact copy |
| `test/app.test.mjs` | Tests for the logic, the word list, the CSV format and the app shell |

## Changing things

- Bump `CACHE` in `app/sw.js` whenever a file in `app/` changes, or installed phones keep the old version.
- Saved data is stored under `factdash.v1`. Keep old saves loading; everything read back passes through `Core.cleanPlayer` and `Core.cleanWords`.
- Word entries are `[word, part of speech, meaning, sentence, cue, picture]`. The cue is shown with the question, so it must not give the meaning away. The tests check this.
