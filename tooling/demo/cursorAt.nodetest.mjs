// Unit tests for the pure cursor-interpolation helper. Run with:
//   node --test cursorAt.nodetest.mjs
// Named `.nodetest.mjs` so the app's vitest glob doesn't discover it.
//
// cursorAt.js is a classic script that assigns globalThis.__cursorAt. Import for
// the side effect, then read it back.
import { test } from "node:test";
import assert from "node:assert/strict";
import "./cursorAt.js";

const cursorAt = globalThis.__cursorAt;

const WP = [
  { t: 0, x: 100, y: 100 },
  { t: 1, x: 300, y: 100, click: true },
  { t: 2, x: 300, y: 300 },
];

test("cursorAt.js loaded and exposed __cursorAt", () => {
  assert.equal(typeof cursorAt, "function");
});

test("cursorAt: empty/missing waypoints returns null", () => {
  assert.equal(cursorAt([], 1), null);
  assert.equal(cursorAt(undefined, 1), null);
});

test("cursorAt: clamps below the first waypoint", () => {
  const c = cursorAt(WP, -5);
  assert.equal(c.x, 100);
  assert.equal(c.y, 100);
});

test("cursorAt: clamps above the last waypoint", () => {
  const c = cursorAt(WP, 99);
  assert.equal(c.x, 300);
  assert.equal(c.y, 300);
});

test("cursorAt: exactly at a waypoint returns that point", () => {
  const c = cursorAt(WP, 1);
  assert.equal(Math.round(c.x), 300);
  assert.equal(Math.round(c.y), 100);
});

test("cursorAt: interpolates between waypoints (midpoint is between endpoints)", () => {
  const c = cursorAt(WP, 0.5);
  assert.ok(c.x > 100 && c.x < 300, `x=${c.x} should be strictly between 100 and 300`);
  assert.equal(c.y, 100);
});

test("cursorAt: click energy is ~1 at a click waypoint and decays to 0", () => {
  const atClick = cursorAt(WP, 1.0).click;
  assert.ok(atClick > 0.9, `click energy at t=1 should be ~1, got ${atClick}`);
  const afterDecay = cursorAt(WP, 1.0 + cursorAt.CLICK_DECAY + 0.01).click;
  assert.equal(afterDecay, 0);
  const noClick = cursorAt(WP, 0.2).click;
  assert.equal(noClick, 0, "no click energy away from any click waypoint");
});

test("cursorAt: click energy decays monotonically within the window", () => {
  const e1 = cursorAt(WP, 1.05).click;
  const e2 = cursorAt(WP, 1.2).click;
  assert.ok(e1 > e2, `energy should decay: ${e1} (t=1.05) > ${e2} (t=1.2)`);
});
