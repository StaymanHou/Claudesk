#!/usr/bin/env node
// WP4 probe — synthetic asciicast-v2 generator.
//
// Emits a representative-but-pathological terminal stream for the thumbnail
// probe: bursty cadence (tight write-bursts then idle gaps, like CC's LLM
// token streaming + tool output), 256-color text, periodic full-screen
// redraws, a spinner animation, and box-drawing. Used as a secondary fixture
// for two narrow cases (see WIP §Research, Thread 3):
//   (a) CI / contributors without Claude Code auth, and
//   (b) a deliberately pathological worst-case to bracket the renderer ceiling.
// The headline pass/fail is decided on a REAL recording (probe/fixtures/cc-session.cast).
//
// Output: asciicast-v2 (NOT v3) so it matches the validated replay parser
// (absolute `time`, code "o", raw data string). Write to probe/fixtures/synthetic.cast:
//   node probe/gen-synthetic-cast.mjs > probe/fixtures/synthetic.cast

const COLS = 120;
const ROWS = 40;
const DURATION_S = 60; // one loop is 60s of synthetic activity

const ESC = "\x1b";
const events = []; // [timeAbs, "o", data]
let t = 0;

function push(data) {
  events.push([Number(t.toFixed(4)), "o", data]);
}

// advance virtual clock
function wait(seconds) {
  t += seconds;
}

const COLORS = [39, 208, 213, 82, 196, 51, 226, 141]; // 256-color fg codes
function color(n) {
  return `${ESC}[38;5;${n}m`;
}
const RESET = `${ESC}[0m`;
function clearScreen() {
  return `${ESC}[2J${ESC}[H`;
}
function moveTo(row, col) {
  return `${ESC}[${row};${col}H`;
}

// A representative "tool output" box using box-drawing chars.
function drawBox(title) {
  const w = 60;
  const top = `${color(51)}┌${"─".repeat(w)}┐${RESET}\r\n`;
  const mid = `${color(51)}│${RESET} ${title.padEnd(w - 1)}${color(51)}│${RESET}\r\n`;
  const bot = `${color(51)}└${"─".repeat(w)}┘${RESET}\r\n`;
  return top + mid + bot;
}

const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

function randInt(max) {
  // deterministic-ish LCG so output is stable across runs (Math.random banned in workflows,
  // but this is a standalone Node script run by hand — still keep it deterministic for diffable fixtures)
  randInt._s = (randInt._s * 1103515245 + 12345) & 0x7fffffff;
  return randInt._s % max;
}
randInt._s = 1234567;

// ── Generate the stream ────────────────────────────────────────────────────
push(clearScreen());
push(
  `${color(213)}● Synthetic CC-like session (WP4 probe fixture)${RESET}\r\n\r\n`,
);

let line = 0;
while (t < DURATION_S) {
  const mode = randInt(10);

  if (mode < 5) {
    // BURST: streaming colored "tokens" — many tiny writes packed tight (LLM streaming)
    const tokens = 8 + randInt(40);
    for (let i = 0; i < tokens; i++) {
      const c = COLORS[randInt(COLORS.length)];
      const word = "lorem ipsum dolor sit amet ".slice(0, 3 + randInt(12));
      push(`${color(c)}${word}${RESET}`);
      wait(0.004 + randInt(8) / 1000); // 4–12ms between tokens — a tight burst
    }
    push("\r\n");
    line++;
    wait(0.3 + randInt(15) / 10); // idle gap 0.3–1.8s ("thinking")
  } else if (mode < 7) {
    // TOOL OUTPUT: a box + a few lines of fixed text, emitted as one chunk-ish burst
    push("\r\n" + drawBox(`tool: read_file (call ${line})`));
    for (let i = 0; i < 6 + randInt(10); i++) {
      push(
        `${color(82)}  ${i.toString().padStart(3)}${RESET}  some source line content here\r\n`,
      );
      wait(0.002);
    }
    line++;
    wait(0.2 + randInt(10) / 10);
  } else if (mode < 9) {
    // SPINNER: animate in place — cursor-return redraws (cheap but frequent)
    const frames = 20 + randInt(30);
    for (let i = 0; i < frames; i++) {
      push(`\r${color(226)}${SPINNER[i % SPINNER.length]}${RESET} working…`);
      wait(0.08); // ~12.5fps spinner
    }
    push("\r" + " ".repeat(20) + "\r");
    wait(0.1);
  } else {
    // FULL-SCREEN REDRAW: the pathological case — clear + repaint the whole grid
    push(clearScreen());
    for (let r = 1; r <= ROWS; r++) {
      const c = COLORS[r % COLORS.length];
      push(
        moveTo(r, 1) +
          `${color(c)}${`row ${r} `.repeat(Math.ceil(COLS / 8)).slice(0, COLS)}${RESET}`,
      );
      wait(0.0015);
    }
    wait(0.4 + randInt(10) / 10);
  }
}

// ── Emit asciicast-v2 ────────────────────────────────────────────────────────
const header = {
  version: 2,
  width: COLS,
  height: ROWS,
  timestamp: 0,
  title: "WP4 synthetic probe fixture",
  env: { TERM: "xterm-256color" },
};
const out = [JSON.stringify(header)];
for (const e of events) out.push(JSON.stringify(e));
process.stdout.write(out.join("\n") + "\n");
process.stderr.write(
  `generated ${events.length} events over ${DURATION_S}s → asciicast-v2\n`,
);
