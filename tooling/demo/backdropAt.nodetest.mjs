// Unit tests for the pure backdropAt() helper (active Slack backdrop logic).
// Run with: node --test backdropAt.nodetest.mjs
// backdropAt.js is a classic script assigning globalThis.__backdropAt; import
// for the side effect, read off globalThis.
import { test } from "node:test";
import assert from "node:assert/strict";
import "./backdropAt.js";

const backdropAt = globalThis.__backdropAt;

test("backdropAt: null spec is safe (empty state)", () => {
  const r = backdropAt(null, 1);
  assert.deepEqual(r, { messages: [], input: "", sending: false });
});

test("backdropAt: messages reveal progressively by `at`", () => {
  const spec = {
    messages: [
      { at: 0, author: "a", text: "first" },
      { at: 2, author: "b", text: "second" },
    ],
  };
  assert.equal(backdropAt(spec, 0).messages.length, 1, "only the at=0 message at t=0");
  assert.equal(backdropAt(spec, 1.9).messages.length, 1, "still 1 just before t=2");
  assert.equal(backdropAt(spec, 2).messages.length, 2, "both at t=2");
  assert.deepEqual(backdropAt(spec, 2).messages[1], { author: "b", text: "second" });
});

test("backdropAt: a message with no `at` always shows", () => {
  const spec = { messages: [{ author: "a", text: "always" }] };
  assert.equal(backdropAt(spec, 0).messages.length, 1);
});

test("backdropAt: input types out char-by-char between startT and sendAt", () => {
  const spec = { typing: [{ startT: 0, text: "hello", sendAt: 10 }] };
  assert.equal(backdropAt(spec, 0).input, "", "nothing typed at startT");
  // TYPE_CPS chars/sec; after 1s ~22 chars but text is only 5 → fully typed
  assert.equal(backdropAt(spec, 1).input, "hello", "fully typed within 1s");
  // partial: at a fraction of a char-time, fewer chars
  const cps = backdropAt.TYPE_CPS;
  const tPartial = 2 / cps; // ~2 chars
  assert.equal(backdropAt(spec, tPartial).input, "he", "2 chars at ~2/cps");
});

test("backdropAt: input is empty before startT and after sendAt", () => {
  const spec = { typing: [{ startT: 1, text: "hi", sendAt: 3 }] };
  assert.equal(backdropAt(spec, 0.5).input, "", "empty before startT");
  assert.equal(backdropAt(spec, 3.5).input, "", "empty after sendAt (sent)");
});

test("backdropAt: 'sending' flashes in the last 0.15s once fully typed", () => {
  const spec = { typing: [{ startT: 0, text: "x", sendAt: 5 }] };
  assert.equal(backdropAt(spec, 2).sending, false, "not sending mid-window");
  assert.equal(backdropAt(spec, 4.95).sending, true, "sending in the final 0.15s");
});

test("backdropAt: a reaction attaches to its target message, added once t >= at", () => {
  const spec = {
    messages: [
      { author: "a", text: "first" },
      { author: "b", text: "second" },
    ],
    reactions: [{ at: 2, msgIndex: 1, emoji: "👍" }],
  };
  const before = backdropAt(spec, 1).messages;
  assert.equal(before[0].reaction, undefined, "msg 0 has no reaction");
  assert.deepEqual(before[1].reaction, { emoji: "👍", added: false }, "msg 1 reaction present but not added before `at`");
  const after = backdropAt(spec, 2).messages;
  assert.equal(after[1].reaction.added, true, "reaction added once t >= at");
});

test("backdropAt: reaction msgIndex is the ORIGINAL index (stable as earlier msgs reveal)", () => {
  // msg 2 ('c') is gated to at=5; the reaction targets index 2 and must still
  // land on 'c' once it appears, regardless of how many are currently shown.
  const spec = {
    messages: [
      { author: "a", text: "x" },
      { author: "b", text: "y" },
      { at: 5, author: "c", text: "z" },
    ],
    reactions: [{ at: 5, msgIndex: 2, emoji: "🎉" }],
  };
  assert.equal(backdropAt(spec, 1).messages.length, 2, "msg 2 not shown yet");
  const shown = backdropAt(spec, 5).messages;
  assert.equal(shown.length, 3);
  assert.equal(shown[2].reaction.emoji, "🎉", "reaction landed on the original index-2 message");
});
