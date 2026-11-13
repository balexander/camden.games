# Fact Dash

A kids' practice app for math facts and vocabulary. Read README.md first.

## Scope
- A static site in app/ with no build step, no packages, no API calls and no server-side code. Keep it that way unless asked.
- The audience is an 8-year-old with ADHD and weak number sense, playing with a grown-up who marks spoken answers Yes or No. Keep screens simple, text short and sessions brief.
- Memory tricks follow the evidence discussed with the owner: number strategies anchored on 5s and 10s for math, silly pictures only for the six stubborn times facts, and sound-alike (keyword) or word-part cues for vocabulary.

## Working practices
- app/core.js holds all logic that does not touch the page; test/app.test.mjs loads it with app/words.js. Put new logic there and test it.
- Saved data lives in localStorage under factdash.v1, in the Claude artifact's private per-viewer store, and in CSV files. Keep old saves loading. Everything read back goes through Core.cleanPlayer and Core.cleanWords, and every value written into HTML is escaped.
- Bump CACHE in app/sw.js whenever a file in app/ changes.
- app/index.html must keep its page, head and body comment markers; build-artifact.mjs uses them.
- Run npm test after changing logic, the word list or the app shell. Check interface changes in a browser at phone width, in light and dark.
- Report exactly what was tested. A stand-in for the Claude account store is not a test of the real one.

## Commands
- npm start: serves http://127.0.0.1:4318 (Node.js >=22).
- npm test: Node test runner.
- npm run artifact: writes dist/fact-dash.html for publishing as a Claude artifact with capabilities db, user and downloads.
