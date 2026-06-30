// Pure "busy CC session" animation logic. Single source of truth, used two ways
// (same pattern as frameAt.js / cursorAt.js):
//   1. In the browser shell — loaded as a CLASSIC <script> (file:// blocks ES
//      module imports in Chromium, the capture path). Assigns globalThis.__busyAt.
//   2. In the Node unit test (busyAt.nodetest.mjs) — imported for side effect.
//
// The problem it solves: a frozen-per-beat CC pane reads as a FINISHED log, not a
// session working RIGHT NOW. busyAt drives the live "Claude is working" signal —
// a cycling spinner glyph, a ticking elapsed-time + token counter, and output
// lines that stream in progressively — all as a pure function of the raw capture
// time `t` (independent of keyframe snapping), so it animates across the frozen
// capture frames exactly like the cursor glide does.
//
// Given a busy spec and t, returns null when t is outside the busy window, else:
//   { glyph, word, elapsed, tokens, revealed }
// where `revealed` is how many of spec.stream lines have appeared so far.
(function (root) {
  // CC's actual spinner glyph cycle + a rotating gerund (generalized, content-
  // neutral — matches the real TUI's "✻ Wrangling… (esc to interrupt)" cadence).
  var GLYPHS = ["✻", "✳", "✶", "✷", "✸", "✹"];
  var GLYPH_PERIOD = 0.12; // seconds per glyph frame (~8 fps spin)
  var WORD_PERIOD = 2.4; // seconds per gerund word

  // busyAt(spec, t):
  //   spec = {
  //     startT,            // when this busy window begins (seconds)
  //     endT,              // when it ends (exclusive); null/undefined = open-ended
  //     words: ['Wrangling','Herding',...],  // rotating gerunds
  //     stream: [{cls,text}, ...],            // lines that progressively appear
  //     streamFrom, streamEach,               // first reveal time + seconds/line
  //     tokensStart, tokensPerSec,            // ticking token counter
  //   }
  function busyAt(spec, t) {
    if (!spec || typeof spec.startT !== "number") return null;
    if (t < spec.startT) return null;
    if (typeof spec.endT === "number" && t >= spec.endT) return null;

    var dt = t - spec.startT;
    var glyph = GLYPHS[Math.floor(dt / GLYPH_PERIOD) % GLYPHS.length];

    var words = spec.words && spec.words.length ? spec.words : ["Working"];
    var word = words[Math.floor(dt / WORD_PERIOD) % words.length];

    var elapsed = Math.floor(dt);

    var tokensStart =
      typeof spec.tokensStart === "number" ? spec.tokensStart : 0;
    var tokensPerSec =
      typeof spec.tokensPerSec === "number" ? spec.tokensPerSec : 0;
    var tokens = Math.round(tokensStart + tokensPerSec * dt);

    var stream = spec.stream || [];
    var revealed = stream.length;
    if (stream.length) {
      var from = typeof spec.streamFrom === "number" ? spec.streamFrom : 0;
      var each =
        typeof spec.streamEach === "number" && spec.streamEach > 0
          ? spec.streamEach
          : 0.4;
      if (t < spec.startT + from) {
        revealed = 0;
      } else {
        revealed = Math.min(
          stream.length,
          Math.floor((t - spec.startT - from) / each) + 1,
        );
      }
    }

    return {
      glyph: glyph,
      word: word,
      elapsed: elapsed,
      tokens: tokens,
      revealed: revealed,
    };
  }

  root.__busyAt = busyAt;
  root.__busyAt.GLYPHS = GLYPHS;
})(typeof globalThis !== "undefined" ? globalThis : window);
