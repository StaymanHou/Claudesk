#!/usr/bin/env node
// WP4 probe — parse `top -l N -s 1 -stats pid,cpu` output for 3 PIDs and compute
// the (WebContent + GPU) %CPU distribution per sample, plus the main process.
//
// Usage: node probe/parse-top.mjs <top-output.txt> <mainPid> <webcontentPid> <gpuPid> [--warmup N]
//
// `top -l` prints repeating frames; each frame has a process table with "PID  %CPU" rows.
// We group rows by frame (a frame boundary is a line starting with "Processes:" or a
// blank/"PID" header). Simpler: collect all "PID %CPU" rows, then since top emits the 3
// pids once per sample in order, we walk them in triples.

import { readFileSync } from "node:fs";

const [, , file, mainPid, wcPid, gpuPid] = process.argv;
if (!file || !mainPid || !wcPid || !gpuPid) {
  console.error("usage: node parse-top.mjs <file> <mainPid> <wcPid> <gpuPid> [--warmup N]");
  process.exit(1);
}
const warmupIdx = process.argv.indexOf("--warmup");
const warmup = warmupIdx >= 0 ? Number(process.argv[warmupIdx + 1]) : 5;

const text = readFileSync(file, "utf8");
const lines = text.split("\n");

// Collect per-pid CPU readings in order of appearance.
const want = { [mainPid]: "main", [wcPid]: "wc", [gpuPid]: "gpu" };
// Walk frames: each frame contributes one reading per pid. top prints a header
// then the rows. We accumulate readings keyed by pid into parallel arrays,
// assuming top emits each pid once per frame.
const series = { main: [], wc: [], gpu: [] };

for (const line of lines) {
  const m = line.match(/^\s*(\d+)\s+(\d+\.?\d*)\s*$/); // "PID  CPU"
  if (!m) continue;
  const pid = m[1];
  const cpu = parseFloat(m[2]);
  const tag = want[pid];
  if (tag) series[tag].push(cpu);
}

// Align lengths (a pid may appear one extra/fewer time at boundaries); truncate to min.
const n = Math.min(series.main.length, series.wc.length, series.gpu.length);
if (n === 0) {
  console.error("No matching PID rows parsed. First 30 lines:");
  console.error(lines.slice(0, 30).join("\n"));
  process.exit(2);
}
const webview = [];
const main = [];
for (let i = 0; i < n; i++) {
  webview.push(series.wc[i] + series.gpu[i]);
  main.push(series.main[i]);
}
const keptWebview = webview.slice(warmup);
const keptMain = main.slice(warmup);

function stats(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const pct = (p) => s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  return { n: s.length, median: pct(50), p95: pct(95), max: s[s.length - 1], mean };
}

const w = stats(keptWebview);
const m = stats(keptMain);
console.log(`file: ${file}`);
console.log(`samples: ${n} total, ${keptWebview.length} after ${warmup} warm-up discarded`);
console.log(
  `webview (WebContent+GPU) %CPU:  median=${w.median.toFixed(1)}  mean=${w.mean.toFixed(1)}  p95=${w.p95.toFixed(1)}  max=${w.max.toFixed(1)}`,
);
console.log(
  `main (claudesk) %CPU:           median=${m.median.toFixed(1)}  mean=${m.mean.toFixed(1)}  p95=${m.p95.toFixed(1)}  max=${m.max.toFixed(1)}`,
);
