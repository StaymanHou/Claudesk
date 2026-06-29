// Timeline-driven renderer for the demo shell. capture.mjs calls window.__render(t)
// at each frozen frame time; this maps t -> the active keyframe of window.TIMELINE
// and paints filmstrip tiles, center stage, PiP panel, and region.
//
// TIMELINE shape (set by timeline.smoke.js or a WP3/WP4 scenario):
//   window.TIMELINE = {
//     region: 'filmstrip' | 'pip',     // which view to show
//     backdrop: ['line', ...],          // faux "other app" text (pip region only)
//     keyframes: [
//       { t: 0, tiles: [{name, status}], active: 0,
//         stage: { lines: [{cls, text}], changes: [{cls, text}] },
//         pip:   [{name, status, meta}] },
//       ...                              // each applies from its t until the next
//     ],
//   }
// status is one of: 'running' | 'idle' | 'awaiting' | 'unknown' (the app's vocab).
//
// Classic <script> (NOT a module — file:// blocks ES module imports in Chromium).
// The pure frameAt() helper is loaded as globalThis.__frameAt by frameAt.js,
// which shell.html includes BEFORE this file. (frameAt.js is the single source of
// truth, unit-tested in frameAt.nodetest.mjs — no fork.)

(function () {
  const frameAt = globalThis.__frameAt;
  const T = window.TIMELINE;
  if (!T) {
    console.error("shell.js: window.TIMELINE not set — load a timeline before shell.js");
    return;
  }

  document.body.dataset.region = T.region || "filmstrip";

  const strip = document.getElementById("strip");
  const term = document.getElementById("term");
  const changesBody = document.getElementById("changes-body");
  const pip = document.getElementById("pip");
  const bdLines = document.getElementById("bd-lines");

  // Static backdrop text (pip region).
  if (bdLines && Array.isArray(T.backdrop)) {
    bdLines.innerHTML = T.backdrop.map((l) => `<div>${l}</div>`).join("");
  }
  // PiP panel placement (pip region) — corner-pinned like the real NSPanel.
  if (pip && T.pipPos) {
    Object.assign(pip.style, T.pipPos); // e.g. { right:'24px', bottom:'24px' }
  } else if (pip) {
    pip.style.right = "24px";
    pip.style.bottom = "24px";
  }

  function dot(status) {
    const s = status || "unknown";
    return `<span class="status-dot status-dot-${s}"></span>`;
  }

  function renderFilmstrip(k) {
    if (!strip) return;
    strip.innerHTML = (k.tiles || [])
      .map((tile, i) => {
        const active = i === k.active ? " active" : "";
        const body = tile.body ? `<div class="tile-body">${tile.body}</div>` : "";
        return (
          `<div class="tile${active}" data-i="${i}">` +
          `<div class="tile-head">${dot(tile.status)}${tile.name}</div>` +
          body +
          `</div>`
        );
      })
      .join("");
  }

  function renderStage(k) {
    if (term && k.stage) {
      term.innerHTML = (k.stage.lines || [])
        .map((l) => `<div class="${l.cls || ""}">${l.text}</div>`)
        .join("");
    }
    if (changesBody && k.stage) {
      changesBody.innerHTML = (k.stage.changes || [])
        .map((c) => `<div class="${c.cls || ""}">${c.text}</div>`)
        .join("");
    }
  }

  function renderPip(k) {
    if (!pip) return;
    pip.innerHTML = (k.pip || [])
      .map(
        (row) =>
          `<div class="pip-row">${dot(row.status)}` +
          `<span class="name">${row.name}</span>` +
          `<span class="meta">${row.meta || ""}</span></div>`,
      )
      .join("");
  }

  window.__render = function (t) {
    const k = frameAt(T.keyframes, t);
    if (!k) return;
    if ((T.region || "filmstrip") === "pip") {
      renderPip(k);
    } else {
      renderFilmstrip(k);
      renderStage(k);
    }
  };

  // Initial paint at t=0 so opening the file standalone shows something.
  window.__render(0);
})();
