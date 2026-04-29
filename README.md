# fae

An elemental tunnel runner. A polygon flies forward through a stone corridor; walls approach with shape-cut holes anchored to one of four edges. Slide your polygon to the matching edge and cycle to the matching shape — fire (triangle), earth (square), air (pentagon), water (circle) — to slam through. Miss either side or shape and you crash. Speed ramps over time, and every ten walls a Boost Run mini-game pauses the obstacles to shower you with elemental pickups for bonus score.

The whole game ships in three files. Code-native art (Canvas polygons, no raster sprites) and procedural Web Audio (no recorded samples).

Inspired by — but not derived from — Color Switch, Ketchapp's Fit, Helix Jump, and toddler shape-sorter toys. The novel piece is the two-axis decision per obstacle: slide *and* morph against the same oncoming wall.

## Controls

- **Desktop** — arrow keys or WASD to slide; space to cycle shape.
- **Mobile** — swipe to slide; tap to cycle shape.

## Play locally

```sh
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Files

- `index.html`, `styles.css`, `game.js` — the game
- `manifest.webmanifest`, `service-worker.js` — PWA shell (installable, plays offline after first load)
- `icons/` — app icons
- `.github/workflows/pages.yml` — auto-deploys `master` to GitHub Pages
