# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Purpose

Tools for building `glyphs.json`, a font that copies the 4-character light sign on top of the Time and Temperature building in Portland, ME. Each character is drawn on a 5-wide by 9-tall grid of lights. Other projects will use `glyphs.json` later, so its format is the contract.

## Running

```
python server.py [port]   # default 8000; Python stdlib only, no dependencies
```

- `http://localhost:8000/index.html`: the glyph editor. Click or drag to toggle lights, then press Submit to save every glyph.
- `http://localhost:8000/display.html`: the sign simulator. It switches between two words of up to 4 characters each (defaults: `CALL` / `JOE`).

The pages use `fetch`, so they don't work from `file://`; you need the server. There's no build step, linter or test suite.

## Architecture

- `server.py` serves the directory as static files and handles one endpoint, `POST /api/glyphs`. It checks that every glyph is 9 rows of 5 values, each 0 or 1, then rewrites the whole `glyphs.json`. Its `dump()` writes each matrix row on its own line so diffs stay readable. Don't swap it for `json.dump(indent=...)`.
- `common.js` holds the code both pages share: `CHARSET` (the characters the editor offers), `loadGlyphs()` (fills in a blank glyph for any `CHARSET` character missing from the file) and the panel rendering (`buildPanel` / `paintPanel`). To add a character, add it to `CHARSET`. It appears blank until someone draws it.
- `glyphs.json` format: `{"width": 5, "height": 9, "glyphs": {"<char>": [[row0 x5], ... 9 rows]}}`. Rows run top to bottom and values run left to right, with 1 for on. The keys include a space and `°` (U+00B0).
- `display.html` cycles through slides: the two words, the time in Portland (12-hour, `America/New_York`) and the temperature. Between panels 2 and 3 sits a `.colon` element with just two lights, which are lit only on the time slide. The temperature comes from Open-Meteo (no API key) and refreshes every 10 minutes. If that fetch fails, the temperature slide is skipped.
- The display page reloads `glyphs.json` whenever its tab becomes visible, so edits saved in the editor tab show up there.
