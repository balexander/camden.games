# camden.games

A small site of kids' games at https://camden.games. Each game is a folder of plain files under `site/`, and the home page (`site/index.html`) has one tile for each. One Cloudflare Worker serves the site and gives it a single sign-in: the same name and password works in every game, and each game keeps its own saved data under that account.

There is one game so far, Fact Dash.

## Adding a game

1. Put the game in its own folder under `site/`, for example `site/word-hunt/`.
2. Add a tile for it to `site/index.html`.
3. If it saves data online, add its folder name to `GAMES` in `worker/index.js`. It then reads and writes at `/api/data/<folder name>`, and signs in through `/api/signup`, `/api/login` and `/api/logout` like Fact Dash does.

## Fact Dash

Quick flash-card rounds for math facts and vocabulary, built for an 8-year-old and the grown-up sitting next to him. He says the answer, the grown-up taps Yes or No, and the app decides which card comes next.

It is plain files with no build step. The site's Worker keeps each family's players online under a name and password.

### What it does

- **Math:** adding and subtracting within 20 (switchable between numbers up to 10, 11 to 20, or all) and multiplying and dividing to 10. Every card shows a number strategy and a dot picture.
- **Words:** 120 built-in vocabulary words in three levels, each with a sound-alike picture or its real word parts, plus a sentence. Grown-ups can add their own word lists.
- **Two round types:** Practice (15 cards, no clock) or a timed Speed round (60 seconds by default).
- **Spaced repetition:** each card sits in one of six boxes. A quick right answer moves it up, and it comes back after 8 hours, then 2, 5, 12 and 30 days. A miss sends it back to box one and it returns within the same round.
- **Players and progress:** any number of players, picked on startup, each with best scores, a score chart and a map of every card.
- **Saved data:** progress is kept on the device after every answer. Sign in with a name and password (first screen, or Grown-ups > Online account) and it is also kept online, so any device signed in to the same account shows the same players. Saved data saves everything as one CSV file.

## Run it

```
npm start        # http://127.0.0.1:4318 (Node.js 22 or newer)
npm run dev      # http://127.0.0.1:4319 with the Worker, so signing in works locally
npm test
```

`npm start` serves the site without accounts. Opening `site/fact-dash/index.html` straight from the file system also works.

## Online accounts

`npx wrangler deploy` puts the site and its Worker on Cloudflare. The database is a SQLite Durable Object declared in `wrangler.jsonc`, and it fits the free plan. The Worker is still named `fact-dash` in Cloudflare, because every account's saved data belongs to the Worker of that name; do not rename it in `wrangler.jsonc`. The camden.games domain is attached to it in the Cloudflare dashboard.

- Anyone who opens the site can create an account. To stop new accounts once yours exists, add a variable named `SIGNUP` with the value `closed` to the Worker.
- The browser stretches the password into a key and sends only that. The Worker stores a hash of the key and a hash of each device's sign-in cookie, never the password.
- A device stays signed in for 400 days after it was last used. Ten wrong passwords in a row block new sign-ins to that account for 15 minutes.
- There is no password reset. If the password is lost, a device that is still signed in keeps working, and a CSV file saved from it can be loaded into a new account.

### Put it on an iPhone

Fact Dash is a home-screen web app, not an App Store app.

1. Open https://camden.games/fact-dash/ in Safari on the phone.
2. Tap Share, then Add to Home Screen.

It then opens full screen from its own icon and works without a connection.

For the App Store later, the same folder can be wrapped with Capacitor on a Mac with Xcode and an Apple Developer account.

### Play it inside Claude

`npm run artifact` writes `dist/fact-dash.html`, a single-file copy for publishing as a Claude artifact. Published with the `db`, `user` and `downloads` capabilities, that copy also keeps each viewer's players in the artifact's private per-viewer store, so progress survives a cleared browser.

## Files

| Path | What it is |
| --- | --- |
| `site/index.html` | The site's home page, with a tile for each game |
| `site/sw.js` | Clears the offline copy left on devices from when Fact Dash was the whole site |
| `site/fact-dash/index.html` | Fact Dash's interface and styles |
| `site/fact-dash/core.js` | Game logic with no page access: decks, memory tricks, scheduling, saved-data checks, CSV |
| `site/fact-dash/words.js` | Built-in vocabulary |
| `site/fact-dash/sw.js`, `site/fact-dash/manifest.webmanifest`, `site/fact-dash/icons/` | Installable-app shell and offline cache |
| `worker/index.js`, `wrangler.jsonc` | Cloudflare Worker: serves `site/`, checks sign-ins and stores each account's data for every game in a Durable Object |
| `serve.mjs` | Local static server for `npm start`, without accounts |
| `build-artifact.mjs` | Builds the single-file Claude artifact copy of Fact Dash |
| `test/app.test.mjs` | Tests for the logic, the word list, the CSV format and the app shell |
| `test/api.test.mjs` | Runs the Worker in `wrangler dev` and tests accounts and saving |

## Changing things

- Bump `CACHE` in `site/fact-dash/sw.js` whenever a file in `site/fact-dash/` changes, or installed phones keep the old version.
- Fact Dash's saved data is stored under `factdash.v1`. Keep old saves loading; everything read back passes through `Core.cleanPlayer` and `Core.cleanWords`.
- Word entries are `[word, part of speech, meaning, sentence, cue, picture]`. The cue is shown with the question, so it must not give the meaning away. The tests check this.
