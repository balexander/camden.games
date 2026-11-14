# camden.games

A small site of kids' games at https://camden.games. Each game is a folder of plain files under `site/`, and the home page (`site/index.html`) has one tile for each. One Cloudflare Worker serves the site and gives it a single sign-in: the same name and password works in every game, and each game keeps its own saved data under that account.

There is one game so far, Fact Dash.

## Adding a game

1. Put the game in its own folder under `site/`, for example `site/word-hunt/`.
2. Add a tile for it to `site/index.html`.
3. If it saves data online, add its folder name to `GAMES` in `worker/index.js`. It then reads and writes at `/api/data/<folder name>`, and signs in through `/api/signup`, `/api/login` and `/api/logout` like Fact Dash does.

## The scheduler

`site/shared/srs.js` is the spaced-repetition algorithm for the whole site: it decides which card to ask next and what an answer does to a card. Every game loads it with `<script src="../shared/srs.js"></script>` and uses the global `SRS`. It is the only file that knows how a saved card is laid out, so the algorithm can be replaced by rewriting that one file.

| Function | What it does |
| --- | --- |
| `SRS.review(card, {ok, ms, fastMs, hint}, now)` | Returns the card after an answer. `fastMs` is the time that counts as quick for this card. `hint` is optional: pass true when the player asked for the hint before answering. A `due` field is accepted and ignored. |
| `SRS.pick(cards, deck, session, now, rnd)` | Chooses the next card from a deck. Returns `{fact, due, isNew}`. Deck items need a unique `key`. They can also carry a `family` (any string) shared by related cards. |
| `SRS.view(card)` | Describes a card for display: `{seen, correct, avgMs, last, due, level, strength}`. Level is 0 for not seen, 1 for just missed, 2 and 3 for learning, 4 for strong. Strength runs from 1 to 6. |
| `SRS.mastery(cards, deck)` | Counts a deck: `{strong, learning, total}`. |
| `SRS.clean(saved)` | Checks a card read back from storage. It must accept cards saved by every earlier version. |

`test/srs.test.mjs` has two groups. The "contract" tests describe what games rely on and must pass for any algorithm. The "spans" tests pin down the current algorithm and are replaced along with it.

### The algorithm

Each card has a span: the gap, in hours, that it is expected to survive. A card is due one span after it was last answered.

| Answer | What happens to the card |
| --- | --- |
| Right and quick | The span becomes 2.5 times the gap the card really survived, and never shrinks. Answered on time, a card goes 2, 5, 12.5, 31 and then 60 days, which is the longest. Answered a minute after the last time, it gains nothing. Answered late, the extra days count for half. |
| Right but slow, or right after asking for the hint | The span stays the same and the card comes back in half the time (never sooner than 8 hours). After two slow answers in a row the card is not counted as strong until the next quick one. |
| Wrong | The span drops to a quarter, 3 days at most. The card is asked again in the same round after a few other cards, and goes back to spacing when it is answered right. |
| First time seen | Quick starts at 2 days, slow at 8 hours, wrong at 8 hours after it has been relearned. |

A card is strong when its span is 5 days or more and the last two answers were not both slow. The picker asks due cards first, weakest first. It offers a new card only when fewer than 5 cards are shaky (being relearned, or with a span under 2 days) and fewer than 6 new cards have gone badly in the round. Otherwise it gives extra practice on the weakest cards. A card from the same family as one of the last three asked waits a turn when there is another choice.

### Why this one

- **Spacing and retrieval are the well-supported parts.** Spreading practice out and recalling from memory both improve retention in children and adults (Cepeda et al. 2006; Roediger and Karpicke 2006; Dunlosky et al. 2013). The exact shape of the schedule matters much less: expanding gaps do no better than equal ones when total spacing is matched (Karpicke and Roediger 2007; Karpicke and Bauernschmidt 2011). So the multiplier of 2.5 is a convention from SM-2 and Anki that also matches the old boxes. It is not a fitted value.
- **Speed is the fluency signal.** A slow right answer to a math fact usually means it was counted or worked out. That is why slow answers do not lengthen the span and do bring the card back sooner. Schedulers that read response time as memory strength have been tested with students (van Rijn, van Maanen and van Woudenberg 2009; Sense et al. 2016).
- **One slow or wrong answer is weak evidence for this child.** Children with ADHD have more variable response times and more lapses of attention (Kofler et al. 2013). So one slow answer changes nothing that is displayed, and a miss costs three quarters of the span instead of all of it. The old boxes sent every miss back to the start.
- **A missed card is relearned in the round, once.** Relearning to one correct recall in each later session is what successive relearning recommends, and a stricter first-session target stops mattering after a few sessions (Rawson and Dunlosky 2011; Rawson et al. 2018). A second same-round check was tried in simulation and removed because it gained nothing.
- **Few unknown cards at a time.** Incremental rehearsal, which mixes a few unknown facts into mostly known ones, is one of the better-supported ways to teach multiplication facts to children who struggle with them (Burns 2005).
- **Related facts are kept apart.** Children with weak fact memory are unusually sensitive to interference between similar facts (De Visscher and Noël 2014), and an answer given just after a close relative says little about memory.

Considered and not used:

- **FSRS**, the current Anki scheduler, predicts recall better than SM-2 on a large public benchmark. Its 19 or more weights are fitted to adults rating themselves on four buttons. There is no rating here, and about 30 cards of history is far too little to fit them.
- **Half-life regression** (Settles and Meeder 2016) and **DASH** (Lindsey et al. 2014) also need a large body of reviews to train on.
- **The response-time model** of van Rijn and colleagues keeps every past answer time for every card and is tuned for a single long sitting.
- **Six Leitner boxes**, the previous version, ignored how long a card had really gone unasked and reset a card completely on one miss.

Where the assumptions may not fit: every number above is a starting value chosen by judgement, the research is mostly on older students learning word pairs, and "quick" is measured from the card appearing to a grown-up's tap. If a grown-up keeps data for a few months, the values can be checked against it.

### Saved cards

A card is saved as `{s, t, q, b, d, n, c, ms, l}`: span in hours, 1 while being relearned, slow answers in a row, strength, due time, times seen, times right, average time of right answers, last seen. All are whole numbers and a card is under 90 bytes.

The first version saved Leitner boxes as `{b, d, n, c, ms, l}`. `SRS.clean` converts them: the box becomes the gap it used to wait (8 hours, then 2, 5, 12 and 30 days), box 1 becomes "being relearned", and the due date, counts and average time are kept. Nothing is lost. The old format did not record whether the last answer was slow, so converted cards start with no slow answers.

`b` is still saved, with the same meaning as the old box. A device that has not updated yet therefore reads new cards correctly, and what it saves back converts the same way.

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
| `site/shared/srs.js` | The scheduler (spaced repetition), shared by every game |
| `site/fact-dash/core.js` | Fact Dash's logic with no page access: decks, memory tricks, saved-data checks, CSV |
| `site/fact-dash/words.js` | Built-in vocabulary |
| `site/fact-dash/sw.js`, `site/fact-dash/manifest.webmanifest`, `site/fact-dash/icons/` | Installable-app shell and offline cache |
| `worker/index.js`, `wrangler.jsonc` | Cloudflare Worker: serves `site/`, checks sign-ins and stores each account's data for every game in a Durable Object |
| `serve.mjs` | Local static server for `npm start`, without accounts |
| `build-artifact.mjs` | Builds the single-file Claude artifact copy of Fact Dash |
| `test/app.test.mjs` | Tests for the logic, the word list, the CSV format and the app shell |
| `test/srs.test.mjs` | Tests for the scheduler: the contract games rely on, and the current algorithm |
| `test/api.test.mjs` | Runs the Worker in `wrangler dev` and tests accounts and saving |

## Changing things

- Bump `CACHE` in `site/fact-dash/sw.js` whenever a file in `site/fact-dash/` changes, or installed phones keep the old version.
- Fact Dash's saved data is stored under `factdash.v1`. Keep old saves loading; everything read back passes through `Core.cleanPlayer` and `Core.cleanWords`.
- Word entries are `[word, part of speech, meaning, sentence, cue, picture]`. The cue is shown with the question, so it must not give the meaning away. The tests check this.
