// Pure "active work backdrop" animation logic. Single source of truth, used two
// ways (same pattern as frameAt.js / cursorAt.js / busyAt.js):
//   1. In the browser shell — loaded as a CLASSIC <script> (file:// blocks ES
//      module imports in Chromium, the capture path). Assigns globalThis.__backdropAt.
//   2. In the Node unit test (backdropAt.nodetest.mjs) — imported for side effect.
//
// The problem it solves: a static Slack backdrop reads as a screenshot, not a
// chat the operator is actively working in. backdropAt drives the live feel as a
// pure function of the raw capture time `t` (independent of keyframe snapping),
// so it animates across the frozen capture frames exactly like busyAt/cursorAt:
//   - messages REVEAL progressively (each has an `at` time; shown once t >= at)
//   - the operator's OWN draft TYPES OUT character-by-character in the input box,
//     then "sends" (clears + appears as a revealed message), optionally repeating.
//
// Given a backdrop spec and t, returns:
//   { messages: [{author, text}], input: <string-shown-in-input-or-''>, sending: bool }
(function (root) {
  var TYPE_CPS = 22; // characters/sec typed in the input box (~natural typing)

  // backdropAt(spec, t):
  //   spec = {
  //     messages: [{ at, author, text }, ...],   // revealed once t >= at
  //     typing: [                                  // sequential typed drafts in the input
  //       { startT, text, sendAt },                //   types `text` from startT; at sendAt
  //       ...                                      //   it's "sent" (becomes a message if a
  //     ],                                         //   matching `messages` entry has that text)
  //   }
  function backdropAt(spec, t) {
    if (!spec) return { messages: [], input: "", sending: false };

    // reactions: a {at, msgIndex, emoji} becomes "added" once t >= at. We expose
    // it per-message so renderBackdrop can draw a reaction chip (outline before,
    // filled after) on the targeted message — the operator reacting in Slack.
    var reactions = spec.reactions || [];

    var messages = [];
    (spec.messages || []).forEach(function (m, origIdx) {
      if (typeof m.at === "number" && t < m.at) return; // not revealed yet
      var out = { author: m.author, text: m.text };
      // a reaction targeting this message (by its index in the full list) draws
      // a chip: outline before `at`, filled after — the operator reacting.
      for (var r = 0; r < reactions.length; r++) {
        if (reactions[r].msgIndex === origIdx) {
          out.reaction = { emoji: reactions[r].emoji, added: t >= reactions[r].at };
        }
      }
      messages.push(out);
    });

    // The input box: find the active typing draft (startT <= t < sendAt). Type it
    // out char-by-char; null between drafts.
    var input = "";
    var sending = false;
    var drafts = spec.typing || [];
    for (var i = 0; i < drafts.length; i++) {
      var d = drafts[i];
      if (typeof d.startT !== "number") continue;
      var send = typeof d.sendAt === "number" ? d.sendAt : Infinity;
      if (t >= d.startT && t < send) {
        var chars = Math.floor((t - d.startT) * TYPE_CPS);
        input = (d.text || "").slice(0, chars);
        // "sending" flash in the last ~0.15s before sendAt once fully typed.
        if (input.length >= (d.text || "").length && send - t < 0.15) sending = true;
        break;
      }
    }

    return { messages: messages, input: input, sending: sending };
  }

  root.__backdropAt = backdropAt;
  root.__backdropAt.TYPE_CPS = TYPE_CPS;
})(typeof globalThis !== "undefined" ? globalThis : window);
