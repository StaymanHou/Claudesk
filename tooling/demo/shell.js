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

  const cursorAt = globalThis.__cursorAt;
  const busyAt = globalThis.__busyAt;
  const strip = document.getElementById("strip");
  const term = document.getElementById("term");
  const changesBody = document.getElementById("changes-body");
  const pip = document.getElementById("pip");
  const bdLines = document.getElementById("bd-lines");
  const cursorEl = document.getElementById("cursor");
  const rippleEl = document.getElementById("cursor-ripple");
  const ripple2El = document.getElementById("cursor-ripple2");
  const flashEl = document.getElementById("cursor-flash");
  const keycapEl = document.getElementById("keycap");

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

  function fmtTokens(n) {
    return n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, "") + "k" : String(n);
  }

  function renderStage(k, t) {
    if (term && k.stage) {
      // Static authored lines for this beat...
      let html = (k.stage.lines || [])
        .map((l) => `<div class="${l.cls || ""}">${l.text}</div>`)
        .join("");
      // ...then the LIVE busy layer (progressively-revealed stream lines + a
      // working spinner line), driven by busyAt against the raw t so it animates
      // across the frozen capture frames — the "Claude is working RIGHT NOW" read.
      if (busyAt && k.stage.busy) {
        const b = busyAt(k.stage.busy, t);
        if (b) {
          const stream = (k.stage.busy.stream || []).slice(0, b.revealed);
          html += stream.map((l) => `<div class="${l.cls || ""}">${l.text}</div>`).join("");
          // working line, real-TUI shape: "✻ Wrangling… (12s · ↓ 1.5k tokens) (esc to interrupt)"
          html +=
            `<div class="busy"><span class="busy-glyph">${b.glyph}</span> ${b.word}… ` +
            `<span class="busy-meta">(${b.elapsed}s · ↓ ${fmtTokens(b.tokens)} tokens · esc to interrupt)</span></div>`;
        }
      }
      term.innerHTML = html;
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

  // Cursor: glides continuously (interpolated) against the raw t — independent of
  // the keyframe snapping the panes use. Driven by T.cursor (a waypoint list).
  function renderCursor(t) {
    if (!cursorEl) return;
    if (!cursorAt || !Array.isArray(T.cursor) || T.cursor.length === 0) {
      cursorEl.hidden = true;
      return;
    }
    const c = cursorAt(T.cursor, t);
    if (!c) {
      cursorEl.hidden = true;
      return;
    }
    cursorEl.hidden = false;
    cursorEl.style.left = c.x + "px";
    cursorEl.style.top = c.y + "px";
    // press state + ripple/flash are driven by the frame-deterministic click
    // energy (1.0 at click, decaying to 0). A strong, legible click pop: an inner
    // ring + a larger trailing ring + a solid radial flash, all keyed off energy.
    if (c.click > 0) {
      cursorEl.classList.add("pressing");
      if (rippleEl) {
        // inner ring expands 0.3 -> 1.6 as energy 1 -> 0; bright at click.
        rippleEl.style.transform = "scale(" + (1.6 - c.click * 1.3) + ")";
        rippleEl.style.opacity = String(c.click);
      }
      if (ripple2El) {
        // outer ring expands further + trails (lower opacity, wider scale).
        ripple2El.style.transform = "scale(" + (2.0 - c.click * 1.4) + ")";
        ripple2El.style.opacity = String(c.click * 0.6);
      }
      if (flashEl) {
        // solid radial flash: strongest at the instant of click, quick fade.
        flashEl.style.transform = "scale(" + (0.4 + (1 - c.click) * 0.8) + ")";
        flashEl.style.opacity = String(c.click * c.click); // quadratic → snappier fade
      }
    } else {
      cursorEl.classList.remove("pressing");
      if (rippleEl) rippleEl.style.opacity = "0";
      if (ripple2El) ripple2El.style.opacity = "0";
      if (flashEl) flashEl.style.opacity = "0";
    }
  }

  // Keycap: shows the key(s) the user pressed during a [from,to] window. Driven by
  // T.keycaps (a list of {from, to, x, y, keys:[...]}).
  function renderKeycap(t) {
    if (!keycapEl) return;
    const ev = (T.keycaps || []).find((e) => t >= e.from && t < e.to);
    if (!ev) {
      keycapEl.hidden = true;
      return;
    }
    keycapEl.hidden = false;
    keycapEl.style.left = ev.x + "px";
    keycapEl.style.top = ev.y + "px";
    keycapEl.innerHTML = (ev.keys || []).map((k) => `<span class="key">${k}</span>`).join("");
  }

  window.__render = function (t) {
    const k = frameAt(T.keyframes, t);
    if (!k) return;
    if ((T.region || "filmstrip") === "pip") {
      renderPip(k);
    } else {
      renderFilmstrip(k);
      renderStage(k, t);
    }
    renderCursor(t);
    renderKeycap(t);
  };

  // Initial paint at t=0 so opening the file standalone shows something.
  window.__render(0);
})();
