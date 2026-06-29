// Pure keyframe-selection logic. Single source of truth, used two ways:
//   1. In the browser shell — loaded as a CLASSIC <script> (NOT a module: ES
//      module imports are CORS-blocked from file:// origins in Chromium, which
//      is the capture path). It assigns globalThis.__frameAt.
//   2. In the Node unit test — imported for its side effect, then __frameAt is
//      read off globalThis (frameAt.nodetest.mjs).
//
// Given a timeline's keyframes (each with a `.t` start time, sorted ascending)
// and a time `t`, returns the keyframe in effect at t — the last keyframe whose
// `.t <= t`. Before the first keyframe's t (or for an empty list) returns the
// first keyframe (or undefined), so t=0 always paints something.
(function (root) {
  function frameAt(keyframes, t) {
    if (!keyframes || keyframes.length === 0) return undefined;
    let cur = keyframes[0];
    for (const k of keyframes) {
      if (k.t <= t) cur = k;
      else break;
    }
    return cur;
  }
  root.__frameAt = frameAt;
})(typeof globalThis !== "undefined" ? globalThis : window);
