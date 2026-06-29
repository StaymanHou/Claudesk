// Structural-validity tests for the WP3 filmstrip scenario timeline. Run with:
//   node --test timeline.filmstrip.nodetest.mjs
// Named `.nodetest.mjs` so the app's vitest default glob doesn't discover it —
// this package is isolated from the app test infra.
//
// These assert the CONTRACT shell.js + frameAt rely on (region, ascending `t`,
// well-formed tiles, in-range active, status vocab) plus the narrative
// INVARIANTS that make this a *filmstrip* demo (an awaiting beat exists, and the
// active tile changes — the promote beat). They are structural, NOT a verbatim
// re-encoding of authored copy, so they survive content tuning while still
// failing on a broken/malformed timeline. The value-conveyance JUDGMENT is the
// separate operator-only Phase 2 verify-human gate, not codifiable here.
//
// timeline.filmstrip.js is a classic script using the `window.TIMELINE ||`
// fallback form; we provide a window shim, import for the side effect, read back.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Load the classic-script timeline into a window shim (no ESM import — it's not
// a module). eval in a scope where `window` resolves to our shim.
const window = {};
eval(readFileSync(new URL("./timeline.filmstrip.js", import.meta.url), "utf8"));
const T = window.TIMELINE;

const STATUS_VOCAB = new Set(["running", "idle", "awaiting", "unknown"]);

test("filmstrip timeline: is the filmstrip region", () => {
  assert.equal(T.region, "filmstrip");
});

test("filmstrip timeline: has keyframes with ascending t", () => {
  assert.ok(Array.isArray(T.keyframes) && T.keyframes.length >= 2);
  for (let i = 1; i < T.keyframes.length; i++) {
    assert.ok(
      T.keyframes[i].t > T.keyframes[i - 1].t,
      `keyframe ${i} t=${T.keyframes[i].t} must be > previous ${T.keyframes[i - 1].t}`,
    );
  }
  assert.equal(T.keyframes[0].t, 0, "first keyframe must start at t=0 so t=0 paints");
});

test("filmstrip timeline: every keyframe is well-formed (4 tiles, valid status, active in range)", () => {
  for (const [i, k] of T.keyframes.entries()) {
    assert.ok(Array.isArray(k.tiles) && k.tiles.length === 4, `kf ${i}: expected 4 tiles`);
    for (const tile of k.tiles) {
      assert.equal(typeof tile.name, "string", `kf ${i}: tile.name must be string`);
      assert.ok(tile.name.length > 0, `kf ${i}: tile.name must be non-empty`);
      assert.ok(STATUS_VOCAB.has(tile.status), `kf ${i}: bad status "${tile.status}"`);
    }
    assert.ok(
      Number.isInteger(k.active) && k.active >= 0 && k.active < k.tiles.length,
      `kf ${i}: active=${k.active} out of range`,
    );
    // center-stage content present so the stage isn't blank.
    assert.ok(Array.isArray(k.stage?.lines) && k.stage.lines.length > 0, `kf ${i}: stage.lines`);
    assert.ok(Array.isArray(k.stage?.changes), `kf ${i}: stage.changes`);
  }
});

test("filmstrip timeline: tile identity is stable across keyframes (same projects, reordering not allowed)", () => {
  const names0 = T.keyframes[0].tiles.map((t) => t.name);
  for (const [i, k] of T.keyframes.entries()) {
    assert.deepEqual(
      k.tiles.map((t) => t.name),
      names0,
      `kf ${i}: tile set/order drifted — the filmstrip must show the same N projects`,
    );
  }
});

test("filmstrip narrative: an AWAITING beat exists (the 'one glance, which needs you' signal)", () => {
  const hasAwaiting = T.keyframes.some((k) => k.tiles.some((t) => t.status === "awaiting"));
  assert.ok(hasAwaiting, "at least one keyframe must show a tile in 'awaiting'");
});

test("filmstrip narrative: the active tile changes (the 'one click jumps there' promote beat)", () => {
  const actives = new Set(T.keyframes.map((k) => k.active));
  assert.ok(actives.size >= 2, "active index must change across the scenario (a promote beat)");
});

test("filmstrip narrative: the tile that goes awaiting is later promoted to active", () => {
  // find a tile index that is 'awaiting' in some keyframe...
  let awaitingIdx = -1;
  for (const k of T.keyframes) {
    const idx = k.tiles.findIndex((t) => t.status === "awaiting");
    if (idx !== -1) { awaitingIdx = idx; break; }
  }
  assert.notEqual(awaitingIdx, -1, "expected an awaiting tile");
  const laterPromoted = T.keyframes.some((k) => k.active === awaitingIdx);
  assert.ok(laterPromoted, `the awaiting tile (index ${awaitingIdx}) must become active in some keyframe`);
});

// ---- input-affordance tracks (cursor glide + keycaps) — guard the new fields
// shell.js consumes; a malformed track silently kills the affordance. ----

const VIEWPORT_W = 1000;
const VIEWPORT_H = 600;

test("filmstrip cursor: waypoints ascending in t and within viewport bounds", () => {
  assert.ok(Array.isArray(T.cursor) && T.cursor.length >= 2, "expected a cursor waypoint track");
  for (let i = 0; i < T.cursor.length; i++) {
    const w = T.cursor[i];
    assert.equal(typeof w.t, "number", `cursor wp ${i}: t must be number`);
    assert.ok(w.x >= 0 && w.x <= VIEWPORT_W, `cursor wp ${i}: x=${w.x} out of viewport`);
    assert.ok(w.y >= 0 && w.y <= VIEWPORT_H, `cursor wp ${i}: y=${w.y} out of viewport`);
    if (i > 0) {
      assert.ok(w.t > T.cursor[i - 1].t, `cursor wp ${i}: t must be strictly ascending`);
    }
  }
});

test("filmstrip cursor: has at least one click waypoint (the switch gesture is shown)", () => {
  assert.ok(T.cursor.some((w) => w.click === true), "expected a click:true waypoint (the tile-click)");
});

test("filmstrip keycaps: well-formed window + keys (the keyboard approve is shown)", () => {
  assert.ok(Array.isArray(T.keycaps) && T.keycaps.length >= 1, "expected at least one keycap event");
  for (const [i, e] of T.keycaps.entries()) {
    assert.ok(e.to > e.from, `keycap ${i}: window must have to > from`);
    assert.ok(e.x >= 0 && e.x <= VIEWPORT_W && e.y >= 0 && e.y <= VIEWPORT_H, `keycap ${i}: out of viewport`);
    assert.ok(Array.isArray(e.keys) && e.keys.length > 0, `keycap ${i}: keys must be a non-empty array`);
    for (const k of e.keys) assert.ok(typeof k === "string" && k.length > 0, `keycap ${i}: each key non-empty string`);
  }
});
