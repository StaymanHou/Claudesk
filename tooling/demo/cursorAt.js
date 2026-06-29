// Pure cursor-interpolation logic. Single source of truth, used two ways (same
// pattern as frameAt.js):
//   1. In the browser shell — loaded as a CLASSIC <script> (ES module imports are
//      CORS-blocked from file:// in Chromium, the capture path). Assigns
//      globalThis.__cursorAt.
//   2. In the Node unit test (cursorAt.nodetest.mjs) — imported for side effect,
//      read off globalThis.
//
// Unlike frameAt (which SNAPS to the last keyframe <= t so the panes change
// discretely), the cursor GLIDES: given a sorted list of waypoints
// [{t, x, y, click?}], cursorAt(waypoints, t) linearly interpolates x/y between
// the bracketing waypoints so the pointer travels smoothly across frozen capture
// frames. Returns {x, y, click} — `click` is the click-progress (0..1) ramped in
// a short window around any waypoint flagged click:true, used to drive the ripple
// + press state. Before the first / after the last waypoint it clamps to the end.
(function (root) {
  // how long (seconds) the click ripple/press lasts after a click waypoint's t.
  var CLICK_DECAY = 0.32;

  function cursorAt(waypoints, t) {
    if (!waypoints || waypoints.length === 0) return null;
    // clamp below first
    if (t <= waypoints[0].t) {
      return { x: waypoints[0].x, y: waypoints[0].y, click: clickEnergy(waypoints, t) };
    }
    // clamp above last
    var last = waypoints[waypoints.length - 1];
    if (t >= last.t) {
      return { x: last.x, y: last.y, click: clickEnergy(waypoints, t) };
    }
    // find bracketing pair a (t<=t) .. b (t>t)
    var a = waypoints[0];
    var b = waypoints[1];
    for (var i = 1; i < waypoints.length; i++) {
      if (waypoints[i].t > t) {
        a = waypoints[i - 1];
        b = waypoints[i];
        break;
      }
    }
    var span = b.t - a.t;
    var f = span > 0 ? (t - a.t) / span : 0;
    // easeInOutQuad for a natural, non-linear glide.
    var e = f < 0.5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2;
    return {
      x: a.x + (b.x - a.x) * e,
      y: a.y + (b.y - a.y) * e,
      click: clickEnergy(waypoints, t),
    };
  }

  // Click energy: 1.0 at a click waypoint's t, decaying linearly to 0 over
  // CLICK_DECAY seconds after it. 0 if no click waypoint is within the window.
  function clickEnergy(waypoints, t) {
    var energy = 0;
    for (var i = 0; i < waypoints.length; i++) {
      var w = waypoints[i];
      if (w.click && t >= w.t && t < w.t + CLICK_DECAY) {
        var e = 1 - (t - w.t) / CLICK_DECAY;
        if (e > energy) energy = e;
      }
    }
    return energy;
  }

  root.__cursorAt = cursorAt;
  root.__cursorAt.CLICK_DECAY = CLICK_DECAY;
})(typeof globalThis !== "undefined" ? globalThis : window);
