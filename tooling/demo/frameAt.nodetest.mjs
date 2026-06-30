// Unit tests for the pure keyframe-selection helper. Run with:
//   node --test frameAt.nodetest.mjs
// Named `.nodetest.mjs` (not `.test.`/`.spec.`) so the app's vitest default glob
// doesn't discover it — this package is isolated from the app test infra.
//
// frameAt.js is a classic script (for file:// browser compat) that assigns
// globalThis.__frameAt. We import it for that side effect, then read it back.
import { test } from "node:test";
import assert from "node:assert/strict";
import "./frameAt.js";

const frameAt = globalThis.__frameAt;

const KF = [
  { t: 0, n: "a" },
  { t: 1.4, n: "b" },
  { t: 2.6, n: "c" },
];

test("frameAt.js loaded and exposed __frameAt", () => {
  assert.equal(typeof frameAt, "function");
});

test("frameAt: before/at the first keyframe returns the first", () => {
  assert.equal(frameAt(KF, 0).n, "a");
  assert.equal(frameAt(KF, -1).n, "a"); // clamp below
  assert.equal(frameAt(KF, 0.5).n, "a");
});

test("frameAt: exactly at a keyframe boundary picks that keyframe", () => {
  assert.equal(frameAt(KF, 1.4).n, "b");
  assert.equal(frameAt(KF, 2.6).n, "c");
});

test("frameAt: between keyframes picks the earlier (last with t<=time)", () => {
  assert.equal(frameAt(KF, 1.0).n, "a");
  assert.equal(frameAt(KF, 2.0).n, "b");
});

test("frameAt: past the last keyframe holds the last", () => {
  assert.equal(frameAt(KF, 99).n, "c");
});

test("frameAt: empty / missing keyframes returns undefined (no throw)", () => {
  assert.equal(frameAt([], 1), undefined);
  assert.equal(frameAt(undefined, 1), undefined);
});

test("frameAt: single-keyframe timeline always returns it", () => {
  const one = [{ t: 0, n: "only" }];
  assert.equal(frameAt(one, 0).n, "only");
  assert.equal(frameAt(one, 100).n, "only");
});
