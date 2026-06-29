// Deterministic seek-per-frame screenshot capture (generalized from the WP1
// probe's tmp/m8-probe/capture.mjs). Drives the shell's window.__render(t) at a
// frozen `t`, freezes every CSS/WAAPI animation to that t, and screenshots —
// frame-accurate, headless, no wall-clock timing involved.
//
// Usage:
//   node capture.mjs --html <abs-or-rel-path.html> --out frames/ \
//     [--width 1000] [--height 600] [--fps 15] [--duration 5.4]
//
// CRITICAL: the Playwright context is launched with reducedMotion:'no-preference'
// so the real App.css animations (wrapped in @media prefers-reduced-motion:
// no-preference) actually fire — Chromium defaults to 'reduce', which would
// render the dots static and silently defeat the whole demo.
import { chromium } from "playwright";
import { mkdirSync, rmSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs, num } from "./args.mjs";

const a = parseArgs();
const HTML = a.html;
const OUT = a.out || "frames";
const WIDTH = num(a.width, 1000);
const HEIGHT = num(a.height, 600);
const FPS = num(a.fps, 15);
const DUR = num(a.duration, 5.4); // seconds
const TIMELINE = a.timeline; // optional: a JS file that assigns window.TIMELINE

if (!HTML) {
  console.error("capture.mjs: --html <path> is required");
  process.exit(2);
}

const total = Math.round(FPS * DUR);
const htmlUrl = pathToFileURL(resolve(HTML)).href;

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: WIDTH, height: HEIGHT },
  deviceScaleFactor: 2, // 2× for crisp text at README width
  reducedMotion: "no-preference", // see CRITICAL note above
});

const errors = [];
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
page.on("pageerror", (e) => errors.push(String(e)));

// Inject the scenario timeline BEFORE the shell's own scripts run, so the shell
// (and its fallback timeline.smoke.js, which only sets window.TIMELINE if unset)
// picks up this scenario. WP3/WP4 each pass their own --timeline against shell.html.
if (TIMELINE) {
  const src = readFileSync(resolve(TIMELINE), "utf8");
  await page.addInitScript({ content: src });
}

await page.goto(htmlUrl);

for (let f = 0; f < total; f++) {
  const t = f / FPS;
  await page.evaluate((t) => {
    // Drive scenario logic at frozen t (shell defines window.__render).
    if (typeof window.__render === "function") window.__render(t);
    // Freeze every CSS/WAAPI animation to exactly this t.
    const ms = t * 1000;
    for (const an of document.getAnimations()) {
      an.pause();
      an.currentTime = ms;
    }
  }, t);
  await page.screenshot({
    path: `${OUT}/f_${String(f).padStart(4, "0")}.png`,
  });
}

await browser.close();

if (errors.length) {
  console.error(`capture.mjs: ${errors.length} console/page error(s) during render:`);
  for (const e of errors) console.error("  " + e);
  process.exit(1);
}

console.log(`captured ${total} frames (${WIDTH}x${HEIGHT}@${FPS}fps, ${DUR}s) -> ${OUT}`);
