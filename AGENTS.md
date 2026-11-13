# Fact Dash

A kids' practice app for math facts and vocabulary. Read README.md first.

## Scope
- A static site in app/ with no build step. The only server-side code is the sync Worker in worker/index.js (with wrangler.jsonc): it serves app/ and stores each family's players, keyed by a sync code, in a SQLite Durable Object. Keep the app itself free of packages and keep the Worker small.
- The audience is an 8-year-old with ADHD and weak number sense, playing with a grown-up who marks spoken answers Yes or No. Keep screens simple, text short and sessions brief.
- Memory tricks follow the evidence discussed with the owner: number strategies anchored on 5s and 10s for math, silly pictures only for the six stubborn times facts, and sound-alike (keyword) or word-part cues for vocabulary.

## Working practices
- app/core.js holds all logic that does not touch the page; test/app.test.mjs loads it with app/words.js. Put new logic there and test it.
- Saved data lives in localStorage under factdash.v1, in the family sync store (code in localStorage under factdash.sync), in the Claude artifact's private per-viewer store, and in CSV files. The sync client reuses the artifact's per-player merge, so the newest copy of a player wins. Keep old saves loading. Everything read back goes through Core.cleanPlayer and Core.cleanWords, and every value written into HTML is escaped.
- Bump CACHE in app/sw.js whenever a file in app/ changes.
- app/index.html must keep its page, head and body comment markers; build-artifact.mjs uses them.
- Run npm test after changing logic, the word list or the app shell. Check interface changes in a browser at phone width, in light and dark.
- Report exactly what was tested. A stand-in for the Claude account store is not a test of the real one.

## Commands
- npm start: serves http://127.0.0.1:4318 (Node.js >=22).
- npm test: Node test runner.
- npm run dev: wrangler dev on http://127.0.0.1:4319, which runs the Worker and sync locally.
- npm run artifact: writes dist/fact-dash.html for publishing as a Claude artifact with capabilities db, user and downloads.
