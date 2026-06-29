// PNG frame sequence -> looping GIF (+ optional WebP) via ffmpeg, using the WP1
// probe's proven two-pass palette recipe (palettegen stats_mode=diff ->
// paletteuse dither=bayer:bayer_scale=3, lanczos downscale). Bakes -loop 0 so
// GitHub autoplays + loops the committed GIF inline. Asserts the output is under
// a byte budget (git history keeps binaries forever) and exits non-zero if over.
//
// Usage:
//   node render.mjs --frames frames/ --out out.gif \
//     [--fps 15] [--width 800] [--max-bytes 3145728] [--webp]
//
// Requires ffmpeg on PATH (host has 7.1.1).
import { spawnSync } from "node:child_process";
import { existsSync, statSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs, num } from "./args.mjs";

const a = parseArgs();
const FRAMES = a.frames || "frames";
const OUT = a.out || "out.gif";
const FPS = num(a.fps, 15);
const WIDTH = num(a.width, 800);
const MAX_BYTES = num(a["max-bytes"], 3 * 1024 * 1024); // ~3MB default
const WANT_WEBP = !!a.webp;

if (!existsSync(FRAMES)) {
  console.error(`render.mjs: frames dir not found: ${FRAMES}`);
  process.exit(2);
}

function ffmpeg(args) {
  const r = spawnSync("ffmpeg", args, { stdio: ["ignore", "ignore", "inherit"] });
  if (r.error) {
    console.error("render.mjs: failed to spawn ffmpeg — is it on PATH?", r.error.message);
    process.exit(2);
  }
  if (r.status !== 0) {
    console.error(`render.mjs: ffmpeg exited ${r.status}`);
    process.exit(1);
  }
}

const input = join(FRAMES, "f_%04d.png");
const scale = `scale=${WIDTH}:-1:flags=lanczos`;

// Pass 1: build an optimized palette from the whole sequence (diff mode tracks
// only changing regions — ideal for the mostly-static UI chrome).
const tmp = mkdtempSync(join(tmpdir(), "demo-pal-"));
const palette = join(tmp, "palette.png");
try {
  ffmpeg([
    "-y",
    "-framerate", String(FPS),
    "-i", input,
    "-vf", `${scale},palettegen=stats_mode=diff`,
    palette,
  ]);

  // Pass 2: apply the palette with bayer dithering (best for flat UI art —
  // avoids the "swarming"/shimmer naive single-pass GIF produces). -loop 0 loops.
  ffmpeg([
    "-y",
    "-framerate", String(FPS),
    "-i", input,
    "-i", palette,
    "-lavfi", `${scale}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3`,
    "-loop", "0",
    OUT,
  ]);

  if (WANT_WEBP) {
    const webpOut = OUT.replace(/\.gif$/i, "") + ".webp";
    ffmpeg([
      "-y",
      "-framerate", String(FPS),
      "-i", input,
      "-vf", scale,
      "-loop", "0",
      "-c:v", "libwebp_anim",
      "-lossless", "0",
      "-q:v", "70",
      webpOut,
    ]);
    reportSize(webpOut);
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

const ok = reportSize(OUT);
if (!ok) {
  console.error(
    `render.mjs: ${OUT} exceeds budget (${MAX_BYTES} bytes). ` +
      `Reduce --width, --fps, or duration.`,
  );
  process.exit(1);
}

function reportSize(path) {
  if (!existsSync(path)) {
    console.error(`render.mjs: expected output not produced: ${path}`);
    process.exit(1);
  }
  const bytes = statSync(path).size;
  const kb = (bytes / 1024).toFixed(1);
  const within = bytes <= MAX_BYTES;
  console.log(`  ${path}: ${kb} KB ${within ? "(under budget)" : "(OVER BUDGET)"}`);
  return within;
}
