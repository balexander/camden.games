# camden.games

A small site of kids' learning games at https://camden.games. Each game is a folder of plain files under `site/`, with no build step and no packages. One Cloudflare Worker serves the site and stores saved data.

There are two games:

- **Fact Dash** (`site/fact-dash/`): flash-card rounds for math facts and vocabulary, played with a grown-up.
- **Brain Bricks** (`site/brain-bricks/`): a brick breaker. After each level the player answers three questions, and each right answer earns a power-up for the next level.

## How the pieces fit

- **Account:** the name and password a grown-up signs in with, once per device, on the home page.
- **Profile:** one person in that account ("Who is playing?"). The home page asks, and every game opened from it knows the answer.
- **Cards:** each profile has one record of what that person knows, and every game reads and updates it. A fact answered in Brain Bricks moves on in Fact Dash too.
- **Game data:** scores and settings belong to each game and are stored inside the profile.

Everything the games share lives in `site/shared/`:

| File | What it is |
| --- | --- |
| `srs.js` | The scheduler: which card comes next and what an answer does to a card (see below) |
| `core.js`, `words.js` | The question bank (math facts, vocabulary, memory tricks) and the checks every saved profile passes through |
| `profiles.js` | Who is playing: the profiles, saving them in the browser, signing in, and keeping a copy online |
| `site.css` | The look shared by the home page and Brain Bricks |

## Adding a game

1. Put the game in its own folder under `site/`, for example `site/word-hunt/`, and load `../shared/site.css` and the four shared scripts (`srs.js`, `words.js`, `core.js`, `profiles.js`) as `site/brain-bricks/index.html` does.
2. Add a line for it to `GAMES` at the top of the script in `site/index.html`, and its folder name to the path check in `serve.mjs`.
3. Get the player with `Profiles.me()`. If nobody has been picked, send the browser to `../`.
4. Ask questions with `Core.deck` and `SRS.pick`, record answers with `SRS.review`, and never read a card's fields.
5. Keep the game's own data in `profile.games['<folder name>']`, a small plain object, and call `Profiles.save(profile)` after changing anything.

Keep the game's logic in a file with no page access and test it, as `site/brain-bricks/game.js` and `test/bricks.test.mjs` do.

## The scheduler

`site/shared/srs.js` is the spaced-repetition algorithm for the whole site: it decides which card to ask next and what an answer does to a card. Every game loads it and uses the global `SRS`. It is the only file that knows how a saved card is laid out, so the algorithm can be replaced by rewriting that one file.

| Function | What it does |
| --- | --- |
| `SRS.review(card, {ok, ms, fastMs, due}, now)` | Returns the card after an answer. `fastMs` is the time that counts as quick for this card, and `due` is false for extra practice of a card that was not due. |
| `SRS.pick(cards, deck, session, now, rnd)` | Chooses the next card from a deck. Returns `{fact, due, isNew}`. |
| `SRS.view(card)` | Describes a card for display: `{seen, correct, avgMs, last, due, level, strength}`. Level is 0 for not seen, 1 for just missed, 2 and 3 for learning, 4 for strong. |
| `SRS.mastery(cards, deck)` | Counts a deck: `{strong, learning, total}`. |
| `SRS.clean(saved)` | Checks a card read back from storage. It must accept cards saved by every earlier version. |

`test/srs.test.mjs` has two groups. The "contract" tests describe what games rely on and must pass for any algorithm. The others pin down the current algorithm (Leitner boxes) and are replaced along with it.

## Fact Dash

Quick flash-card rounds for math facts and vocabulary, built for an 8-year-old and the grown-up sitting next to him. He says the answer, the grown-up taps Yes or No, and the app decides which card comes next.

### What it does

- **Math:** adding and subtracting within 20 (switchable between numbers up to 10, 11 to 20, or all) and multiplying and dividing to 10. Every card shows a number strategy and a dot picture.
- **Words:** 120 built-in vocabulary words in three levels, each with a sound-alike picture or its real word parts, plus a sentence. Grown-ups can add their own word lists.
- **Two round types:** Practice (15 cards, no clock) or a timed Speed round (60 seconds by default).
- **Spaced repetition:** each card sits in one of six boxes. A quick right answer moves it up, and it comes back after 8 hours, then 2, 5, 12 and 30 days. A miss sends it back to box one and it returns within the same round.
- **Players and progress:** any number of players, picked on startup, each with best scores, a score chart and a map of every card.
- **Saved data:** progress is kept on the device after every answer. Sign in with a name and password (the site's home page, Fact Dash's first screen, or Grown-ups > Online account) and it is also kept online, so any device signed in to the same account shows the same players. Saved data saves everything as one CSV file.

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
| `site/shared/` | What every game shares: scheduler, question bank, profiles, styles (see "How the pieces fit") |
| `site/brain-bricks/game.js` | Brain Bricks' logic with no page access: levels, ball and paddle, power-ups |
| `site/brain-bricks/index.html` | Brain Bricks' screens: the field, the questions between levels, the rewards |
| `site/fact-dash/sw.js`, `site/fact-dash/manifest.webmanifest`, `site/fact-dash/icons/` | Installable-app shell and offline cache |
| `worker/index.js`, `wrangler.jsonc` | Cloudflare Worker: serves `site/`, checks sign-ins and stores each account's profiles in a Durable Object |
| `serve.mjs` | Local static server for `npm start`, without accounts |
| `build-artifact.mjs` | Builds the single-file Claude artifact copy of Fact Dash |
| `test/app.test.mjs` | Tests for the logic, the word list, the CSV format and the app shell |
| `test/srs.test.mjs` | Tests for the scheduler: the contract games rely on, and the current algorithm |
| `test/bricks.test.mjs` | Tests for Brain Bricks' logic |
| `test/api.test.mjs` | Runs the Worker in `wrangler dev` and tests accounts and saving |

## Changing things

- Bump `CACHE` in `site/fact-dash/sw.js` whenever a file in `site/fact-dash/` changes, or installed phones keep the old version.
- Profiles are stored in the browser under `factdash.v1` (the name dates from when Fact Dash was the whole site) and online in the `profiles` store. Keep old saves loading; everything read back passes through `Core.cleanPlayer` and `Core.cleanWords`.
- Word entries are `[word, part of speech, meaning, sentence, cue, picture]`. The cue is shown with the question, so it must not give the meaning away. The tests check this.
