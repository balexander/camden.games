# camden.games

A site of kids' learning games: Fact Dash (flash-card rounds for math facts and vocabulary) and Brain Bricks (a brick breaker with questions between levels). Read README.md first.

## Scope
- A static site in site/ with no build step: site/index.html is the home page (it asks who is playing and lists the games), each game is a folder beside it (site/fact-dash/, site/brain-bricks/), and site/shared/ holds what they share. The only server-side code is the Worker in worker/index.js (with wrangler.jsonc): it serves site/, checks name-and-password sign-ins for the whole site, and stores each account's profiles in a SQLite Durable Object (one per account), as documents named "profiles/<id>". Keep the games free of packages and keep the Worker small.
- The Worker's name in wrangler.jsonc stays fact-dash. The saved data belongs to the Worker of that name, so renaming it would start an empty database.
- An account (the sign-in) holds profiles (the people who play). site/shared/profiles.js owns them: the copy in the browser, the sign-in, and the copy online. A profile's cards are shared by every game. A game's own data goes in profile.games[<its folder name>]; Fact Dash predates that and keeps its fields at the top level of the profile.
- site/shared/core.js and words.js are the question bank and the saved-data checks, used by every game. Core.cleanPlayer must keep passing other games' data through untouched.
- Brain Bricks: the questions are there to be answered, not to block play. Right answers earn power-ups; a wrong answer shows the trick and the game goes on. Keep its logic in site/brain-bricks/game.js with tests in test/bricks.test.mjs.
- site/shared/srs.js is the scheduler (spaced repetition) for every game, and the only code that knows what is inside a saved card. Games keep the cards it returns and call SRS.view for anything they show; they never read a card's fields. Keep the five functions and the contract tests in test/srs.test.mjs working when the algorithm changes, and keep SRS.clean loading cards saved by earlier versions.
- The rest of this file is mostly about Fact Dash and the saved data.
- The audience is an 8-year-old with ADHD and weak number sense, playing with a grown-up who marks spoken answers Yes or No. Keep screens simple, text short and sessions brief.
- Memory tricks follow the evidence discussed with the owner: number strategies anchored on 5s and 10s for math, silly pictures only for the six stubborn times facts, and sound-alike (keyword) or word-part cues for vocabulary.

## Working practices
- site/shared/core.js holds the logic that does not touch the page; test/app.test.mjs loads it with site/shared/srs.js and site/shared/words.js. Put new logic there and test it.
- Saved data lives in localStorage under factdash.v1, in the site's account store (signed-in name in localStorage under factdash.account; the sign-in itself is an HttpOnly cookie), in the Claude artifact's private per-viewer store, and in CSV files. The site client reuses the artifact's per-player merge, so the newest copy of a player wins. Keep old saves loading. Everything read back goes through Core.cleanPlayer and Core.cleanWords, and every value written into HTML is escaped.
- Bump CACHE in site/fact-dash/sw.js whenever a file in site/fact-dash/ or site/shared/ changes. site/sw.js is different: it only removes the offline copy from when Fact Dash was the whole site, so leave it alone.
- site/fact-dash/index.html must keep its page, head and body comment markers; build-artifact.mjs uses them.
- The password is stretched in the browser (Core.passKey) so the Worker stays inside the free plan's CPU limit. Do not move that work to the Worker, and never send or store the password itself.
- Run npm test after changing logic, the word list, the app shell or the Worker. test/api.test.mjs runs the Worker in wrangler dev, which is Cloudflare's local runtime and not the deployed service. Check interface changes in a browser at phone width, in light and dark.
- Report exactly what was tested. A stand-in for the Claude account store is not a test of the real one.

## Commands
- npm start: serves the site without accounts at http://127.0.0.1:4318 (Node.js >=22).
- npx wrangler deploy: publishes to Cloudflare (camden.games).
- npm test: Node test runner.
- npm run dev: wrangler dev on http://127.0.0.1:4319, which runs the Worker and accounts locally.
- npm run artifact: writes dist/fact-dash.html for publishing as a Claude artifact with capabilities db, user and downloads.
