# Claudesk demo-build harness (`tooling/demo/`)

**Dev-only.** This package renders Claudesk's demo GIFs (M8) — the filmstrip and
PiP value-prop animations for the README + GitHub release pages. It is **not**
part of the shipped Tauri bundle and its dependencies are isolated from the app's
`pnpm-lock.yaml` (it's a self-contained npm package, not a pnpm workspace member).

It works by recreating the real status-dot UI in a standalone HTML shell fed a
**mock status timeline**, screenshotting it frame-by-frame with Playwright
(deterministic seek, not wall-clock), and stitching the PNGs into a looping GIF
with ffmpeg. The dot **colors and keyframes are sourced from `src/App.css`**
(single source of truth — see Phase 2 / the CSS-sync step), so the demo dots stay
pixel-identical to the app.

## One-time setup

```bash
cd tooling/demo
npm install
npx playwright install chromium   # downloads the headless Chromium build once
```

Requires **ffmpeg** on `PATH` (host dev box has 7.1.1) and **Node** ≥ 20.

## Build commands

A demo is one command — capture frames + render the GIF:

```bash
node build.mjs --html shell.html --out out/smoke.gif \
  --width 1000 --height 600 --fps 15 --duration 5.4 \
  --render-width 800 --webp
```

Or run the two stages independently:

```bash
# 1. Capture: seek-per-frame screenshots into a frames dir
node capture.mjs --html shell.html --out frames/ \
  --width 1000 --height 600 --fps 15 --duration 5.4

# 2. Render: PNG frames -> looping GIF (+ optional --webp), assert under budget
node render.mjs --frames frames/ --out out.gif --fps 15 --width 800 --webp
```

### Flags

| Script | Flag | Default | Meaning |
|--------|------|---------|---------|
| capture | `--html` | (required) | shell HTML to render |
| capture | `--out` | `frames` | output dir for PNG frames |
| capture | `--width`/`--height` | `1000`/`600` | viewport (captured at `deviceScaleFactor:2`) |
| capture | `--fps` | `15` | frames per second |
| capture | `--duration` | `5.4` | seconds of timeline to capture |
| render | `--frames` | `frames` | input frame dir |
| render | `--out` | `out.gif` | output GIF path |
| render | `--width` | `800` | GIF downscale width (lanczos) |
| render | `--max-bytes` | `3145728` | size budget; render **fails** if exceeded |
| render | `--webp` | off | also emit an animated WebP alongside the GIF |
| build | `--render-width` | = capture `--width` | GIF width (capture stays at `--width`) |

## How the shell drives the animation

The shell defines a global `window.__render(t)` that, given a frozen time `t`
(seconds), sets dot classes / active tile / stage content per its mock timeline.
`capture.mjs` calls `__render(t)` then pauses every CSS/WAAPI animation and sets
its `currentTime` to `t` — so each frame is fully deterministic (no flaky timing).
The Playwright context forces `reducedMotion: 'no-preference'` so the real
`@media (prefers-reduced-motion: no-preference)` dot animations actually fire.

## What's committed vs ignored

The scripts (`*.mjs`), the shell HTML/CSS, and this README are tracked.
`node_modules/`, scratch `frames/`, and rendered `*.gif`/`*.webp`/`*.png` are
gitignored — the **final** demo GIFs are committed elsewhere (WP5, e.g.
`docs/demo/`), not here.
