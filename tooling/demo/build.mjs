// One-command demo build: capture frames from a shell HTML, then render to a
// looping GIF. Thin orchestrator over capture.mjs + render.mjs so a demo is a
// single invocation. WP3 (filmstrip) and WP4 (PiP) each call this with their own
// shell + scenario timeline + output path.
//
// Usage:
//   node build.mjs --html shell.html --out out/smoke.gif \
//     [--width 1000] [--height 600] [--fps 15] [--duration 5.4] \
//     [--render-width 800] [--max-bytes 3145728] [--webp]
//
// --width/--height/--fps/--duration drive capture; --render-width sets the GIF
// downscale width (defaults to capture --width if omitted); other flags pass to
// render.
import { spawnSync } from "node:child_process";
import { mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { parseArgs, num } from "./args.mjs";

const a = parseArgs();
if (!a.html || !a.out) {
  console.error(
    "build.mjs: --html <shell.html> and --out <path.gif> are required",
  );
  process.exit(2);
}

const captureWidth = num(a.width, 1000);
const renderWidth = num(a["render-width"], captureWidth);

const framesDir = mkdtempSync(join(tmpdir(), "demo-frames-"));

function run(script, args) {
  const r = spawnSync("node", [join(import.meta.dirname, script), ...args], {
    stdio: "inherit",
  });
  if (r.status !== 0) {
    rmSync(framesDir, { recursive: true, force: true });
    process.exit(r.status ?? 1);
  }
}

try {
  // 1. Capture
  const capArgs = [
    "--html",
    a.html,
    "--out",
    framesDir,
    "--width",
    String(captureWidth),
  ];
  if (a.height) capArgs.push("--height", String(a.height));
  if (a.fps) capArgs.push("--fps", String(a.fps));
  if (a.duration) capArgs.push("--duration", String(a.duration));
  if (a.timeline) capArgs.push("--timeline", String(a.timeline));
  run("capture.mjs", capArgs);

  // 2. Render
  const outDir = dirname(a.out);
  if (outDir && !existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const renArgs = [
    "--frames",
    framesDir,
    "--out",
    a.out,
    "--width",
    String(renderWidth),
  ];
  if (a.fps) renArgs.push("--fps", String(a.fps));
  if (a["max-bytes"]) renArgs.push("--max-bytes", String(a["max-bytes"]));
  if (a.webp) renArgs.push("--webp");
  run("render.mjs", renArgs);

  console.log(`\nbuilt ${a.out}`);
} finally {
  rmSync(framesDir, { recursive: true, force: true });
}
