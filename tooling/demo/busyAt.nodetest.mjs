// Unit tests for the pure busy-session animation helper. Run with:
//   node --test busyAt.nodetest.mjs
// Named `.nodetest.mjs` so the app's vitest glob doesn't discover it.
//
// busyAt.js is a classic script that assigns globalThis.__busyAt. Import for the
// side effect, then read it back.
import { test } from "node:test";
import assert from "node:assert/strict";
import "./busyAt.js";

const busyAt = globalThis.__busyAt;

const SPEC = {
  startT: 1.0,
  endT: 5.0,
  words: ["Wrangling", "Herding"],
  stream: [
    { cls: "dim", text: "line A" },
    { cls: "dim", text: "line B" },
    { cls: "dim", text: "line C" },
  ],
  streamFrom: 0.5,
  streamEach: 1.0,
  tokensStart: 1000,
  tokensPerSec: 500,
};

test("busyAt.js loaded and exposed __busyAt", () => {
  assert.equal(typeof busyAt, "function");
});

test("busyAt: returns null outside the busy window", () => {
  assert.equal(busyAt(SPEC, 0.5), null, "before startT");
  assert.equal(busyAt(SPEC, 5.0), null, "at endT (exclusive)");
  assert.equal(busyAt(SPEC, 9), null, "after endT");
  assert.equal(busyAt(null, 2), null, "no spec");
});

test("busyAt: spinner glyph cycles over time", () => {
  const g0 = busyAt(SPEC, 1.0).glyph;
  const g1 = busyAt(SPEC, 1.0 + 0.12 * 3).glyph; // 3 glyph-periods later
  assert.ok(busyAt.GLYPHS.includes(g0), "glyph is from the cycle");
  assert.notEqual(g0, g1, "glyph advances as t advances");
});

test("busyAt: gerund word rotates", () => {
  assert.equal(busyAt(SPEC, 1.0).word, "Wrangling"); // dt=0 → word[0]
  assert.equal(busyAt(SPEC, 1.0 + 2.4).word, "Herding"); // dt=2.4 → word[1]
});

test("busyAt: elapsed counts whole seconds from startT", () => {
  assert.equal(busyAt(SPEC, 1.0).elapsed, 0);
  assert.equal(busyAt(SPEC, 1.0 + 2.7).elapsed, 2);
});

test("busyAt: tokens tick up from tokensStart", () => {
  assert.equal(busyAt(SPEC, 1.0).tokens, 1000);
  assert.equal(busyAt(SPEC, 1.0 + 2.0).tokens, 2000); // 1000 + 500*2
});

test("busyAt: stream lines reveal progressively", () => {
  assert.equal(busyAt(SPEC, 1.0).revealed, 0, "before streamFrom: nothing revealed");
  assert.equal(busyAt(SPEC, 1.0 + 0.5).revealed, 1, "at streamFrom: first line");
  assert.equal(busyAt(SPEC, 1.0 + 1.5).revealed, 2, "one streamEach later: two lines");
  assert.equal(busyAt(SPEC, 1.0 + 2.5).revealed, 3, "all three revealed");
});

test("busyAt: revealed never exceeds the stream length", () => {
  assert.equal(busyAt(SPEC, 1.0 + 3.9).revealed, 3, "clamps at stream.length even late in window");
});

test("busyAt: open-ended window (no endT) stays active", () => {
  const open = { ...SPEC, endT: undefined };
  assert.ok(busyAt(open, 100) !== null, "open-ended busy window has no end");
});
