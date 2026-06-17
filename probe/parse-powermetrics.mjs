#!/usr/bin/env node
// WP4 probe — parse a `powermetrics --samplers tasks` capture and compute the
// (WebContent + GPU) %CPU distribution. Research-grounded (WIP §Research Thread 2):
// the webview render cost = com.apple.WebKit.WebContent + com.apple.WebKit.GPU,
// summed per sample; the Tauri main process is tracked separately as overhead.
//
// Usage: node probe/parse-powermetrics.mjs /tmp/wp4-cpu-active.txt [--warmup 3]
//
// powermetrics `tasks` sampler prints, per sample window, a process table with a
// "%CPU" (or "CPU ms/s") column. We sum the per-sample CPU of the WebKit helpers
// and report median / p95 across all samples (after discarding warm-up samples).

import { readFileSync } from "node:fs";

const file = process.argv[2];
if (!file) {
  console.error("usage: node parse-powermetrics.mjs <powermetrics-output.txt> [--warmup N]");
  process.exit(1);
}
const warmupIdx = process.argv.indexOf("--warmup");
const warmup = warmupIdx >= 0 ? Number(process.argv[warmupIdx + 1]) : 3;

const text = readFileSync(file, "utf8");

// powermetrics emits one block per sample, separated by a line of "***".
// Within a block, the tasks table has rows like:
//   Name                  ID     ...  CPU ms/s  ...  %CPU ...
// Column layout varies by macOS version, so we match by process name + grab the
// %CPU-looking number. We sum WebContent + GPU per block.
const PROC_PATTERNS = [
  { key: "WebContent", re: /WebKit\.WebContent|com\.apple\.WebKit\.WebContent/ },
  { key: "GPU", re: /WebKit\.GPU|com\.apple\.WebKit\.GPU/ },
  { key: "Claudesk", re: /Claudesk/ },
];

const blocks = text.split(/^\*{3,}.*$/m);
const samples = []; // { WebContent, GPU, Claudesk }

for (const block of blocks) {
  const lines = block.split("\n");
  const sample = { WebContent: 0, GPU: 0, Claudesk: 0, hit: false };
  for (const line of lines) {
    for (const p of PROC_PATTERNS) {
      if (p.re.test(line)) {
        // grab all floats on the line; %CPU is typically the last or near-last numeric col.
        const nums = line.match(/\d+\.\d+|\d+/g);
        if (nums && nums.length) {
          // heuristic: take the largest plausible %CPU value on the row (0–100+ range);
          // powermetrics %CPU can exceed 100 on multicore. Prefer a column that looks like %CPU.
          const floats = nums.map(Number).filter((n) => n <= 1000);
          const cpu = floats.length ? floats[floats.length - 1] : 0;
          sample[p.key] += cpu;
          sample.hit = true;
        }
      }
    }
  }
  if (sample.hit) samples.push(sample);
}

if (samples.length === 0) {
  console.error("No WebKit/Claudesk process rows found. Check the powermetrics output format and PROC_PATTERNS.");
  console.error("First 40 lines of the file for inspection:");
  console.error(text.split("\n").slice(0, 40).join("\n"));
  process.exit(2);
}

const kept = samples.slice(warmup); // discard warm-up samples
const webviewCpu = kept.map((s) => s.WebContent + s.GPU);
const mainCpu = kept.map((s) => s.Claudesk);

function stats(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const pct = (p) => s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
  return { n: s.length, median: pct(50), p95: pct(95), max: s[s.length - 1] };
}

const w = stats(webviewCpu);
const m = stats(mainCpu);

console.log(`samples: ${samples.length} total, ${kept.length} after ${warmup} warm-up discarded`);
console.log(`webview (WebContent+GPU) %CPU:  median=${w.median.toFixed(1)}  p95=${w.p95.toFixed(1)}  max=${w.max.toFixed(1)}`);
console.log(`main (Claudesk) %CPU:           median=${m.median.toFixed(1)}  p95=${m.p95.toFixed(1)}  max=${m.max.toFixed(1)}`);
console.log("");
console.log("NOTE: confirm the column heuristic against the raw file — powermetrics layout varies by macOS version.");
console.log("If numbers look wrong, inspect the raw table header and adjust PROC_PATTERNS / column pick.");
