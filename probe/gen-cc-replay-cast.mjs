#!/usr/bin/env node
// WP4 probe — reconstruct an asciicast-v2 fixture from a REAL Claude Code transcript.
//
// CC transcripts (~/.claude/projects/<proj>/<uuid>.jsonl) store STRUCTURED message
// content + real timestamps, but NOT the rendered terminal bytes (no ANSI — the TUI
// renderer generates those at display time and never persists them). So this script
// reconstructs a faithful-enough render stream:
//   - REAL content (assistant prose, tool names, tool-result output) — not lorem ipsum
//   - REAL cadence (transcript timestamps → inter-event deltas), with long idle gaps
//     clamped so a looped replay stays dense enough to stress the renderer
//   - SYNTHESIZED ANSI choreography matching what CC actually paints: colored prose
//     streamed in chunks, a colored tool-call header + spinner, boxed/indented tool
//     output, periodic clears.
//
// Fidelity tier: medium-high (right on the two things that drive render cost most —
// real content volume + real pacing). The only guessed layer is the exact escape-
// sequence choreography, which a live `asciinema rec` would capture exactly.
//
// Usage:
//   node probe/gen-cc-replay-cast.mjs <transcript.jsonl> > public/probe-fixtures/cc-replay.cast
//
// Output: asciicast-v2 (matches the validated replay parser).

import { readFileSync } from "node:fs";

const src = process.argv[2];
if (!src) {
  console.error("usage: node gen-cc-replay-cast.mjs <transcript.jsonl> > out.cast");
  process.exit(1);
}

const COLS = 120;
const ROWS = 40;
const MAX_GAP_S = 1.2; // clamp transcript idle gaps to this (keep replay dense)
const MIN_GAP_S = 0.05;

const ESC = "\x1b";
const RESET = `${ESC}[0m`;
const c = (n) => `${ESC}[38;5;${n}m`;
const DIM = `${ESC}[2m`;
const BOLD = `${ESC}[1m`;
const CLEAR = `${ESC}[2J${ESC}[H`;
const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

// ── Parse transcript into ordered (timestamp, kind, payload) records ─────────
const lines = readFileSync(src, "utf8").split("\n").filter(Boolean);
const records = [];
for (const line of lines) {
  let o;
  try {
    o = JSON.parse(line);
  } catch {
    continue;
  }
  const ts = o.timestamp ? Date.parse(o.timestamp) : null;
  const msg = o.message;
  if (o.type === "assistant" && msg && Array.isArray(msg.content)) {
    for (const b of msg.content) {
      if (b.type === "text" && b.text) records.push({ ts, kind: "text", text: b.text });
      else if (b.type === "tool_use") records.push({ ts, kind: "tool_use", name: b.name || "tool", input: b.input });
    }
  } else if (msg && Array.isArray(msg.content)) {
    for (const b of msg.content) {
      if (b.type === "tool_result") {
        const t = typeof b.content === "string" ? b.content : JSON.stringify(b.content);
        records.push({ ts, kind: "tool_result", text: t });
      }
    }
  } else if (o.type === "user" && typeof msg?.content === "string") {
    records.push({ ts, kind: "user", text: msg.content });
  }
}

if (records.length === 0) {
  console.error("no usable records parsed from transcript");
  process.exit(2);
}

// ── Emit asciicast-v2 events with reconstructed ANSI + clamped real cadence ──
const events = []; // [tAbs, "o", data]
let t = 0;
const push = (data) => events.push([Number(t.toFixed(4)), "o", data]);
const wait = (s) => {
  t += Math.max(MIN_GAP_S, Math.min(MAX_GAP_S, s));
};

// truncate very long tool output to a screenful-ish chunk (a TUI wouldn't paint 20KB at once)
const clip = (s, n = 1600) => (s.length > n ? s.slice(0, n) + `\n${DIM}… (+${s.length - n} more chars)${RESET}` : s);
// strip any stray ESC from transcript content; we add our own ANSI deliberately.
// eslint-disable-next-line no-control-regex -- matching the ESC control char is the intent here
const sanitize = (s) => s.replace(/\x1b/g, "");

push(CLEAR);
push(`${c(213)}${BOLD}● Claude Code session (WP4 probe fixture — reconstructed from transcript)${RESET}\r\n\r\n`);

let prevTs = records[0].ts;
let lineCount = 0;

for (const r of records) {
  // real inter-event delta (clamped)
  if (r.ts && prevTs) wait((r.ts - prevTs) / 1000);
  prevTs = r.ts || prevTs;

  if (r.kind === "user") {
    push(`\r\n${c(45)}${BOLD}❯${RESET} ${c(252)}${sanitize(r.text).slice(0, COLS - 4)}${RESET}\r\n`);
    wait(0.15);
  } else if (r.kind === "text") {
    // assistant prose streamed in word-ish chunks (token streaming feel)
    const words = sanitize(r.text).split(/(\s+)/);
    let buf = "";
    for (let i = 0; i < words.length; i++) {
      buf += words[i];
      if (buf.length > 14 || i === words.length - 1) {
        push(`${c(252)}${buf.replace(/\n/g, "\r\n")}${RESET}`);
        buf = "";
        wait(0.012); // tight intra-stream cadence — the burst
      }
    }
    push("\r\n");
    lineCount++;
  } else if (r.kind === "tool_use") {
    // colored tool-call header + a short spinner animation (CC shows a working spinner)
    push(`\r\n${c(220)}⏺${RESET} ${c(51)}${r.name}${RESET}${DIM}(${objPreview(r.input)})${RESET}\r\n`);
    const frames = 8 + (lineCount % 12);
    for (let i = 0; i < frames; i++) {
      push(`\r${c(226)}${SPINNER[i % SPINNER.length]}${RESET} ${DIM}running…${RESET}`);
      wait(0.08);
    }
    push(`\r${" ".repeat(20)}\r`);
    lineCount++;
  } else if (r.kind === "tool_result") {
    // boxed/indented tool output (box-drawing + line content — heavy redraw region)
    const body = clip(sanitize(r.text));
    const w = COLS - 4;
    push(`${c(240)}┌${"─".repeat(w)}┐${RESET}\r\n`);
    const outLines = body.split("\n");
    for (const ln of outLines) {
      push(`${c(240)}│${RESET} ${c(108)}${ln.slice(0, w - 2)}${RESET}\r\n`);
      wait(0.003); // fast output dump
    }
    push(`${c(240)}└${"─".repeat(w)}┘${RESET}\r\n`);
    lineCount++;
  }

  // occasional full-screen redraw to keep scrollback bounded (CC clears on some ops)
  if (lineCount > 0 && lineCount % 40 === 0) {
    push(CLEAR);
    wait(0.1);
  }
}

function objPreview(input) {
  if (!input || typeof input !== "object") return "";
  const k = Object.keys(input);
  if (!k.length) return "";
  const first = k[0];
  const v = String(input[first]).slice(0, 40);
  return `${first}: ${v}${k.length > 1 ? ", …" : ""}`;
}

const header = {
  version: 2,
  width: COLS,
  height: ROWS,
  timestamp: 0,
  title: "WP4 cc-replay fixture (reconstructed from real CC transcript)",
  env: { TERM: "xterm-256color" },
};
const out = [JSON.stringify(header)];
for (const e of events) out.push(JSON.stringify(e));
process.stdout.write(out.join("\n") + "\n");
process.stderr.write(
  `reconstructed ${events.length} events from ${records.length} transcript records → ${t.toFixed(1)}s loop (asciicast-v2)\n`,
);
