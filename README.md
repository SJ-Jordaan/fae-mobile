# fae stack

A tiny one-tap stacker game. Tap to drop a moving block onto the tower below — the part that overlaps stays, the rest falls off. Miss completely and it's game over. Land three perfects in a row and the block grows back.

It's a static web app (no build step) so it runs anywhere with an HTTP server, and it installs to your phone's home screen as a PWA.

## Play locally

```sh
python3 -m http.server 8000
```

Then open `http://localhost:8000` in your browser.

To play on your phone, host the directory somewhere reachable from your phone (your laptop on the same Wi-Fi works: visit `http://<your-laptop-ip>:8000`). For "add to home screen" to work as a real installable app, the page must be served over `https://` or `http://localhost`. The easiest deploy is GitHub Pages (just point Pages at this branch).

## Controls

- Tap (or click, or press space/enter) to drop the moving block.
- Tap again on the title or game-over screen to (re)start.

## Files

- `index.html`, `styles.css`, `game.js` — the game
- `manifest.webmanifest`, `service-worker.js` — PWA shell (installable, plays offline after first load)
- `icons/` — app icons

## Spec Kit

The repo was bootstrapped with [GitHub Spec Kit](https://github.com/github/spec-kit). The `.specify/` and `.claude/skills/` directories contain templates and the `/speckit-*` slash commands if future work warrants the spec-driven workflow. They aren't used by the game itself.
