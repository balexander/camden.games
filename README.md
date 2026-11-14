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

Each reference below was looked up on 2026-11-14. For most, only the abstract or a summary by other authors was open to read, so the wording here stays close to what those say. The full list with links is at the end of this section.

- **Spacing and retrieval are the well-supported parts.** A review of 317 experiments found that spreading practice out improves later recall, and a review of ten study techniques rated practice testing and distributed practice the two most useful, across ages and abilities [1, 2, 3]. Most of that research is on verbal material. For math facts there is one direct study: third graders who split four minutes of daily addition practice into two or four short sittings gained fluency faster than those who did it in one [4].
- **The exact shape of the schedule matters much less.** With total spacing held equal, expanding gaps did no better than equal gaps for long-term retention [5, 6]. So the multiplier of 2.5 is a convention: it is the starting ease in SM-2 and Anki [7], and it matches the old boxes. It is not a fitted value.
- **Speed is the fluency signal.** A slow right answer to a math fact usually means it was counted or worked out, so slow answers do not lengthen the span and do bring the card back sooner. That rule is a judgement. The nearest research is a scheduler that compares each response time with the time its memory model predicted. It beat other schedules for 15-year-olds learning French words, and was later studied with university students [8, 9]. It has not been tested on young children or math facts.
- **One slow answer is weak evidence for this child.** Across 319 studies, children and adolescents with ADHD had clearly more variable response times than others (effect size 0.76) [10]. So one slow answer changes nothing that is displayed. Keeping a quarter of the span after a miss, where the old boxes kept nothing, is a judgement and has no study behind it.
- **A missed card is relearned in the round, once.** Successive relearning means practising until right, then relearning to one correct recall in later, spaced sessions. Its authors recommended three correct recalls in the first session [11]. This scheduler asks for one. A later study found the benefit of three over one was no longer significant after three relearning sessions [12], and rounds here are only 15 cards. A second same-round check was tried in simulation and removed because it gained nothing.
- **Few unknown cards at a time.** Incremental rehearsal mixes a few unknown facts into mostly known ones. The evidence is small: it raised multiplication fluency for three third graders with a math learning disability, and was later replicated [13]. A review of 17 single-child studies of math fact programmes found the largest effects for drill and practice with modelling [14].
- **Related facts are kept apart.** Arithmetic facts share many features, and children with low arithmetic fluency are unusually sensitive to that interference in memory [15]. Keeping relatives a turn apart is an inference from that finding. The study did not test it.

Considered and not used:

- **FSRS**, the current Anki scheduler. On a public benchmark of about 727 million reviews from 10,000 Anki users, it predicts recall better than half-life regression and the other published models [16]. FSRS-6 has 21 weights and FSRS-7 has 34, fitted to users who rate themselves on four buttons. There is no rating here, and about 30 cards of history is far too little to fit them.
- **Half-life regression** [17] was trained on about 13 million Duolingo practice records, and **DASH** [18] on a whole class of students. Both need far more data than one child produces.
- **The response-time model** above [8, 9] works from every past answer to every card, and was tested within single study sessions.
- **Six Leitner boxes**, the previous version, ignored how long a card had really gone unasked and reset a card completely on one miss.

Where the assumptions may not fit: every number above is a starting value chosen by judgement, the research is mostly on teenagers and adults learning words, and "quick" is measured from the card appearing to a grown-up's tap. If a grown-up keeps data for a few months, the values can be checked against it.

References:

1. Cepeda, Pashler, Vul, Wixted and Rohrer (2006). [Distributed practice in verbal recall tasks: a review and quantitative synthesis](https://escholarship.org/uc/item/3rr6q10c). Psychological Bulletin 132(3), 354-380.
2. Roediger and Karpicke (2006). [Test-enhanced learning: taking memory tests improves long-term retention](https://profiles.wustl.edu/en/publications/test-enhanced-learning-taking-memory-tests-improves-long-term-ret/). Psychological Science 17(3), 249-255.
3. Dunlosky, Rawson, Marsh, Nathan and Willingham (2013). [Improving students' learning with effective learning techniques](https://www.psychologicalscience.org/news/releases/which-study-strategies-make-the-grade.html). Psychological Science in the Public Interest 14(1), 4-58.
4. Schutte, Duhon, Solomon, Poncy, Moore and Story (2015). [A comparative analysis of massed vs. distributed practice on basic math fact fluency growth rates](https://shareok.org/handle/11244/330744). Journal of School Psychology 53(2). A later review notes the delay before the final test differed between the groups.
5. Karpicke and Roediger (2007). [Expanding retrieval practice promotes short-term retention, but equally spaced retrieval enhances long-term retention](https://profiles.wustl.edu/en/publications/expanding-retrieval-practice-promotes-short-term-retention-but-eq/). Journal of Experimental Psychology: Learning, Memory, and Cognition 33(4), 704-719.
6. Karpicke and Bauernschmidt (2011). [Spaced retrieval: absolute spacing enhances learning regardless of relative spacing](https://pcllab.github.io/downloads/2011/2011_Karpicke_Bauernschmidt_JEPLMC.pdf). Journal of Experimental Psychology: Learning, Memory, and Cognition 37(5), 1250-1257.
7. Anki manual. [What spaced repetition algorithm does Anki use?](https://docs.ankiweb.net/faqs/what-spaced-repetition-algorithm)
8. van Rijn, van Maanen and van Woudenberg (2009). [Passing the test: improving learning gains by balancing spacing and testing effects](https://www.ai.rug.nl/~leendert/pubs/VanRijn-ICCM2009.pdf). Proceedings of the 9th International Conference on Cognitive Modeling.
9. Sense, Behrens, Meijer and van Rijn (2016). [An individual's rate of forgetting is stable over time but differs across materials](https://pubmed.ncbi.nlm.nih.gov/26748838/). Topics in Cognitive Science 8(1), 305-321. The response-time rule is described in the [2015 conference version](https://iccm-conference.neocities.org/2015/proceedings/papers/0034/paper0034.pdf).
10. Kofler, Rapport, Sarver, Raiker, Orban, Friedman and Kolomeyer (2013). [Reaction time variability in ADHD: a meta-analytic review of 319 studies](https://stars.library.ucf.edu/scopus2010/6052). Clinical Psychology Review 33(6), 795-811.
11. Rawson and Dunlosky (2011). [Optimizing schedules of retrieval practice for durable and efficient learning: how much is enough?](https://archive.memory-key.com/node/2463) Journal of Experimental Psychology: General. Read through a summary.
12. Rawson, Vaughn, Walsh and Dunlosky (2018). Investigating and explaining the effects of successive relearning on long-term retention. Journal of Experimental Psychology: Applied 24(1), 57-71. Read through [a later review that reports the result](https://link.springer.com/article/10.1007/s10648-023-09809-2).
13. Burns (2005). Using incremental rehearsal to increase fluency of single-digit multiplication facts with children identified as learning disabled in mathematics computation. Education and Treatment of Children 28, 237-249. Read through [the replication by Codding, Archer and Connell (2010)](https://experts.umn.edu/en/publications/a-systematic-replication-and-extension-of-using-incremental-rehea/).
14. Codding, Burns and Lukito (2011). [Meta-analysis of mathematic basic-fact fluency interventions: a component analysis](https://www.bohrium.com/paper-details/meta-analysis-of-mathematic-basic-fact-fluency-interventions-a-component-analysis/811676593792483330-5194). Learning Disabilities Research and Practice 26(1), 36-47.
15. De Visscher and Noël (2014). [Arithmetic facts storage deficit: the hypersensitivity-to-interference in memory hypothesis](https://research.dial.uclouvain.be/entities/publication/068acb07-ba2e-4db9-90ee-71d3f33ed1ea). Developmental Science. DOI 10.1111/desc.12135.
16. open-spaced-repetition. [SRS benchmark](https://github.com/open-spaced-repetition/srs-benchmark). Log loss without same-day reviews: FSRS-6 0.346, DASH 0.368, half-life regression 0.469.
17. Settles and Meeder (2016). [A trainable spaced repetition model for language learning](https://github.com/duolingo/halflife-regression). Proceedings of ACL, 1848-1858.
18. Lindsey, Shroyer, Pashler and Mozer (2014). [Improving students' long-term knowledge retention through personalized review](https://home.cs.colorado.edu/~mozer/Research/Selected%20Publications/reprints/LindseyShroyerPashlerMozer2014Published.pdf). Psychological Science 25, 639-647.

### Saved cards

A card is saved as `{s, t, q, b, d, n, c, ms, l}`: span in hours, 1 while being relearned, slow answers in a row, strength, due time, times seen, times right, average time of right answers, last seen. All are whole numbers and a card is under 90 bytes.

The first version saved Leitner boxes as `{b, d, n, c, ms, l}`. `SRS.clean` converts them: the box becomes the gap it used to wait (8 hours, then 2, 5, 12 and 30 days), box 1 becomes "being relearned", and the due date, counts and average time are kept. Nothing is lost. The old format did not record whether the last answer was slow, so converted cards start with no slow answers.

`b` is still saved, with the same meaning as the old box. A device that has not updated yet therefore reads new cards correctly, and what it saves back converts the same way.

## Fact Dash

Quick flash-card rounds for math facts and vocabulary, built for an 8-year-old and the grown-up sitting next to him. He says the answer, the grown-up taps Yes or No, and the app decides which card comes next.

### What it does

- **Math:** adding and subtracting within 20 (switchable between numbers up to 10, 11 to 20, or all) and multiplying and dividing to 10. Every card shows a number strategy and a dot picture.
- **Words:** 120 built-in vocabulary words in three levels, each with a sound-alike picture or its real word parts, plus a sentence. Grown-ups can add their own word lists.
- **Two round types:** Practice (15 cards, no clock) or a timed Speed round (60 seconds by default).
- **Spaced repetition:** each card has a gap it is expected to survive. A quick right answer stretches the gap (2, 5, 12 and 31 days, up to 60), a slow one brings the card back sooner, and a miss shortens the gap and brings the card back within the same round. See "The scheduler" above.
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
