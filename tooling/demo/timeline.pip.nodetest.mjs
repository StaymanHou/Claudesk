// Structural-validity tests for the WP4 PiP scenario timeline (round-3 shape:
// vertical active-mirror PiP + active backdrop, then a ⌘+Tab REGION SWITCH to
// the real Claudesk window — filmstrip + center stage — where the answer
// happens). Run with: node --test timeline.pip.nodetest.mjs
// Named `.nodetest.mjs` so the app's vitest default glob doesn't discover it.
//
// Asserts the CONTRACT shell.js + frameAt rely on plus the round-3 narrative
// INVARIANTS: an opening PIP phase (2 live workspace mirrors over an active
// backdrop), a ping (a mirror flips running → awaiting), a ⌘+Tab keycap, a
// region SWITCH to 'filmstrip' (the faithful "the real Claudesk window comes
// forward" UX — not a PiP focus ring), and on that center stage an
// AskUserQuestion that gets answered (option selected) then resumes running.
// Structural, NOT a verbatim re-encoding of copy. The value-conveyance JUDGMENT
// is the operator-only verify-human gate.
//
// timeline.pip.js is a classic script (an IIFE) assigning window.TIMELINE.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const window = {};
eval(readFileSync(new URL("./timeline.pip.js", import.meta.url), "utf8"));
const T = window.TIMELINE;

const STATUS_VOCAB = new Set(["running", "idle", "awaiting", "unknown"]);
const regionOf = (k) => k.region || T.region || "filmstrip";
const pipBeats = () => T.keyframes.filter((k) => regionOf(k) === "pip");
const filmBeats = () => T.keyframes.filter((k) => regionOf(k) === "filmstrip");

test("pip timeline: opens in the pip region", () => {
  assert.equal(regionOf(T.keyframes[0]), "pip", "first keyframe must be the pip composition");
});

test("pip timeline: has a corner pipPos (the always-on-top panel is pinned)", () => {
  assert.ok(T.pipPos && typeof T.pipPos === "object", "expected a pipPos object");
  assert.ok(Object.keys(T.pipPos).length >= 1, "pipPos must pin at least one edge");
});

test("pip backdrop: is ACTIVE — progressive messages + a typing draft that sends", () => {
  assert.ok(T.backdropLive && typeof T.backdropLive === "object", "expected backdropLive");
  const msgs = T.backdropLive.messages;
  assert.ok(Array.isArray(msgs) && msgs.length >= 2, "expected >=2 backdrop messages");
  assert.ok(msgs.some((m) => typeof m.at === "number" && m.at > 0), "expected a message that pops in over time");
  const d = (T.backdropLive.typing || []).find((x) => typeof x.sendAt === "number");
  assert.ok(d, "expected a typing draft with a sendAt");
  const landed = msgs.find((m) => m.text === d.text);
  assert.ok(landed && landed.at >= d.sendAt - 0.01, "the sent draft must land as a message at/after sendAt");
});

test("pip timeline: keyframes ascending in t starting at 0", () => {
  assert.ok(Array.isArray(T.keyframes) && T.keyframes.length >= 4);
  assert.equal(T.keyframes[0].t, 0, "first keyframe must start at t=0");
  for (let i = 1; i < T.keyframes.length; i++) {
    assert.ok(T.keyframes[i].t > T.keyframes[i - 1].t, `keyframe ${i} t must be > previous`);
  }
});

test("pip phase: exactly 2 workspace mirror cells (round-2: not 4)", () => {
  const beats = pipBeats();
  assert.ok(beats.length >= 2, "expected >=2 pip-region beats");
  for (const [i, k] of beats.entries()) {
    assert.ok(Array.isArray(k.pip) && k.pip.length === 2, `pip beat ${i}: expected exactly 2 rows`);
    for (const row of k.pip) {
      assert.equal(typeof row.name, "string", `pip beat ${i}: row.name string`);
      assert.ok(STATUS_VOCAB.has(row.status), `pip beat ${i}: bad status "${row.status}"`);
      assert.ok(row.mirror && Array.isArray(row.mirror.lines) && row.mirror.lines.length > 0,
        `pip beat ${i}: row "${row.name}" must be a mirror with lines`);
    }
  }
});

test("pip phase: a mirror carries a live busy spec with a code diff (CC working)", () => {
  const hasDiff = pipBeats().some((k) =>
    k.pip.some((r) => r.mirror && r.mirror.busy && (r.mirror.busy.stream || []).some((l) => l.cls === "diff-add" || l.cls === "diff-del")),
  );
  assert.ok(hasDiff, "expected a mirror busy stream with diff-add/del lines");
});

test("pip phase: a mirror flips to AWAITING (the ping — CC needs you now)", () => {
  const hasAwaiting = pipBeats().some((k) => k.pip.some((r) => r.status === "awaiting"));
  assert.ok(hasAwaiting, "at least one pip beat must show a mirror in 'awaiting'");
});

test("⌘+Tab: a keycap shows the switch gesture", () => {
  assert.ok(Array.isArray(T.keycaps) && T.keycaps.length >= 1, "expected a keycap event");
  const cmdTab = T.keycaps.find((e) => (e.keys || []).includes("⌘") && (e.keys || []).some((k) => k === "⇥" || k.toLowerCase?.() === "tab"));
  assert.ok(cmdTab, "expected a ⌘+⇥ (Cmd+Tab) keycap");
  assert.ok(cmdTab.to > cmdTab.from, "keycap window must have to > from");
});

test("FIDELITY: the loop SWITCHES region pip → filmstrip (the real Claudesk window, not a PiP focus ring)", () => {
  const regions = T.keyframes.map(regionOf);
  const firstFilm = regions.indexOf("filmstrip");
  assert.ok(firstFilm > 0, "expected a later keyframe to switch to the filmstrip (real-window) composition");
  // the switch must happen after the ping (pip-awaiting) — you ⌘+Tab in RESPONSE to the ping
  const pingT = pipBeats().find((k) => k.pip.some((r) => r.status === "awaiting"))?.t;
  assert.ok(typeof pingT === "number" && T.keyframes[firstFilm].t > pingT, "the region switch must come after the ping");
});

test("FIDELITY: on the filmstrip stage, tax-cruncher is promoted (active) showing an AskUserQuestion", () => {
  const beats = filmBeats();
  assert.ok(beats.length >= 2, "expected >=2 filmstrip-region beats (answer + resume)");
  for (const [i, k] of beats.entries()) {
    assert.ok(Array.isArray(k.tiles) && k.tiles.length >= 1, `film beat ${i}: needs tiles`);
    assert.ok(Number.isInteger(k.active) && k.active >= 0 && k.active < k.tiles.length, `film beat ${i}: active in range`);
    assert.ok(k.stage && Array.isArray(k.stage.lines) && k.stage.lines.length > 0, `film beat ${i}: center stage lines`);
  }
  const askqBeat = beats.find((k) => (k.stage.lines || []).some((l) => (l.cls || "").startsWith("askq-question")));
  assert.ok(askqBeat, "a filmstrip beat must render the AskUserQuestion on center stage");
  const opts = askqBeat.stage.lines.filter((l) => (l.cls || "").startsWith("askq-opt"));
  assert.ok(opts.length >= 2, "AskUserQuestion must show >=2 options");
});

test("FIDELITY: the answer happens (an option becomes selected) and CC then resumes running", () => {
  const beats = filmBeats();
  const selected = beats.some((k) => (k.stage.lines || []).some((l) => (l.cls || "").includes("askq-opt") && (l.cls || "").includes("sel")));
  assert.ok(selected, "a filmstrip beat must show a selected AskUserQuestion option (the answer)");
  const resumes = beats.some((k) => k.stage.busy && typeof k.stage.busy.startT === "number");
  assert.ok(resumes, "after answering, the center-stage CC session must resume (a busy spec)");
  // and the promoted tile returns to running
  const tileRuns = beats.some((k) => k.tiles[k.active] && k.tiles[k.active].status === "running");
  assert.ok(tileRuns, "the promoted tile must return to 'running' after the answer");
});

test("mouse: the cursor works in Slack (a reaction click), NOT to switch/answer", () => {
  assert.ok(Array.isArray(T.cursor) && T.cursor.length >= 2, "expected a cursor track");
  const clicks = T.cursor.filter((w) => w.click === true);
  assert.ok(clicks.length >= 1, "expected a click (the operator reacting in Slack)");
  // every click must be in the SLACK backdrop region (top-left), never on the
  // PiP (bottom-right corner) and never during the ⌘+Tab/answer beats — the
  // switch + answer are keyboard, the mouse is busywork in the other app.
  for (const c of clicks) {
    assert.ok(c.x < 700 && c.y < 300, `cursor click (${c.x},${c.y}) must be in the Slack area, not the PiP/stage`);
    assert.ok(c.t < 4.0, `cursor click at t=${c.t} must happen during the monitoring beats, before the ping/switch`);
  }
});

test("mouse: a 👍 reaction is added on a backdrop message (the Slack busywork)", () => {
  const rx = T.backdropLive.reactions;
  assert.ok(Array.isArray(rx) && rx.length >= 1, "expected a reaction in backdropLive");
  for (const r of rx) {
    assert.equal(typeof r.at, "number", "reaction needs an `at`");
    assert.equal(typeof r.msgIndex, "number", "reaction needs a target msgIndex");
    assert.ok(typeof r.emoji === "string" && r.emoji.length > 0, "reaction needs an emoji");
    assert.ok(r.msgIndex >= 0 && r.msgIndex < T.backdropLive.messages.length, "msgIndex in range");
  }
  // the reaction's `at` should line up with a cursor click (cursor clicks → react)
  const clickTs = T.cursor.filter((w) => w.click).map((w) => w.t);
  assert.ok(rx.some((r) => clickTs.some((ct) => Math.abs(ct - r.at) < 0.4)), "a reaction should coincide with a cursor click");
});

test("keyboard: BOTH a ⌘+⇥ switch AND a 1+⏎ answer keycap are shown", () => {
  const keys = T.keycaps || [];
  const cmdTab = keys.find((e) => (e.keys || []).includes("⌘"));
  const answer = keys.find((e) => (e.keys || []).includes("1") && (e.keys || []).some((k) => k === "⏎"));
  assert.ok(cmdTab, "expected the ⌘+⇥ switch keycap");
  assert.ok(answer, "expected the 1+⏎ answer keycap (answering in the real workspace)");
  // the answer keycap must fire during/after the region switch (it's answered in Claudesk)
  const firstFilm = T.keyframes.find((k) => (k.region || T.region) === "filmstrip");
  assert.ok(answer.from >= firstFilm.t - 0.5, "the 1+⏎ answer must come at/after the Claudesk-window switch");
});
