// Unit tests for the shared flag parser. Run with Node's built-in runner:
//   node --test args.nodetest.mjs
//
// Named `.nodetest.mjs` (NOT `.test.mjs`/`.spec.mjs`) on purpose: the app's
// vitest uses its default `**/*.{test,spec}.*` glob, which would otherwise
// discover this file and try to run it under the wrong runner. This package is
// deliberately isolated from the app's test infra (M8 dev-only tooling), so its
// tests run under `node --test`, not vitest.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseArgs, num } from "./args.mjs";

test("parseArgs: --key value pairs", () => {
  const r = parseArgs(["--html", "shell.html", "--width", "1000"]);
  assert.equal(r.html, "shell.html");
  assert.equal(r.width, "1000");
});

test("parseArgs: bare boolean flag (no value)", () => {
  const r = parseArgs(["--webp"]);
  assert.equal(r.webp, true);
});

test("parseArgs: boolean flag followed by another flag stays boolean", () => {
  // --webp must NOT swallow --out as its value.
  const r = parseArgs(["--webp", "--out", "x.gif"]);
  assert.equal(r.webp, true);
  assert.equal(r.out, "x.gif");
});

test("parseArgs: trailing boolean flag at end of argv", () => {
  const r = parseArgs(["--out", "x.gif", "--webp"]);
  assert.equal(r.out, "x.gif");
  assert.equal(r.webp, true);
});

test("parseArgs: ignores non-flag positional tokens", () => {
  const r = parseArgs(["bogus", "--fps", "15"]);
  assert.equal(r.fps, "15");
  assert.equal(r.bogus, undefined);
});

test("parseArgs: empty argv yields empty object", () => {
  assert.deepEqual(parseArgs([]), {});
});

test("num: returns default when undefined", () => {
  assert.equal(num(undefined, 15), 15);
});

test("num: coerces a string value to a number", () => {
  assert.equal(num("800", 1000), 800);
  assert.equal(typeof num("800", 1000), "number");
});

test("num: a provided value overrides the default (including 0)", () => {
  assert.equal(num("0", 15), 0);
});
