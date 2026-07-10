// A4 (Scene 6, "The New Bandwidth") — Zoom-style video-call GRID of 4 AI agent
// panes. NEW scenario file, sibling to WP4's timeline.pip.js — does NOT edit or
// reuse that file's narrative. WP4 told "heads-down elsewhere, corner PiP pings
// you, ⌘+Tab back to the real window" (a Slack backdrop + a ping-and-switch
// mechanic). This is a different shape entirely: Scene 6's VO ("It's like being
// in a meeting with four of me. Except I'm the only human in the room, and
// everyone else is faster than I am.", local 106.96s-120.58s) wants a pure
// OBSERVATIONAL beat — no Slack backdrop, no ping, no region-switch, no human
// webcam tile, nobody clicks or approves anything. Just four independently-live
// CC sessions, all genuinely moving at once, at visibly DIFFERENT paces — that
// asymmetry IS the joke ("everyone else is faster than I am").
//
// Reuses region:'pip' purely for its mirror+busyAt streaming mechanics (the
// same compact live-CC-mirror cell WP4 built, mirrorBody() + busyAt() in
// shell.js) — but the actual 2x2 full-bleed grid layout (no corner stack, no
// backdrop) is CSS supplied by the sibling shell file shell.pip.scene6.html,
// NOT shell.css/shell.html (the shared WP3/WP4 harness is untouched).
//
// FOUR project mirrors (same recurring cast as the filmstrip demo — a Swift
// iOS game, a Rust tax CLI, a Go blog engine, a React recipe app — "four
// independent projects," not four microservices of one system). Each pane
// authored with its OWN tokensPerSec / word bank / stream cadence so the four
// panes visibly do NOT move in lockstep: catan-companion churns fastest,
// tax-cruncher and hugo-blog sit in the middle, recipe-box is the visibly
// slowest of the four (still far faster than a human — the point is the
// spread between agents, not any pane reading as "slow").
//
// TWO keyframes (t=0, t=4.0) swap in fresh stream content per pane so all four
// panes keep reading as independently live for the full ~10s capture, not just
// a single burst that goes quiet halfway through. No cursor[], no keycaps[] —
// nothing is clicked or approved in this beat (a pure observational aside).
//
// Classic <script> (NOT a module — file:// blocks ES-module imports in
// Chromium, the capture path). `window.TIMELINE = window.TIMELINE || {...}`
// fallback form so capture.mjs's --timeline injection (addInitScript, runs
// before shell.js) wins; opening the shell standalone still paints this.
//
// String fields (mirror.lines[].text, busy.stream[].text) are injected via
// innerHTML by shell.js — author-controlled dev input only, not real project
// data (see timeline.filmstrip.js's header comment for the same note).

(function () {
  // ---- catan-companion (Swift iOS board-game companion) — FASTEST pace ----
  function catanMirrorA() {
    return {
      lines: [
        { cls: "prompt", text: "❯ add a turn timer to the score tracker" },
        { cls: "accent", text: "● Edit(Sources/Views/ScoreView.swift)" },
      ],
      busy: {
        startT: 0,
        endT: 4.0,
        words: ["Compiling", "Wrangling", "Linking"],
        tokensStart: 3800,
        tokensPerSec: 2600,
        streamFrom: 0.15,
        streamEach: 0.3,
        stream: [
          { cls: "diff-add", text: " + var turnDeadline: Date?" },
          { cls: "accent", text: "● Bash(xcodebuild -scheme CatanCompanion)" },
          { cls: "dim", text: "  ⎿ Compiling Views (18 sources)" },
          { cls: "ok", text: "  ⎿ Build succeeded in 4.1s" },
          {
            cls: "accent",
            text: "● Bash(swift test --filter TurnTimerTests)",
          },
          { cls: "ok", text: "  ⎿ Test Suite passed (9 tests)" },
        ],
      },
    };
  }
  function catanMirrorB() {
    return {
      lines: [
        { cls: "prompt", text: "❯ add a turn timer to the score tracker" },
        { cls: "accent", text: "● Edit(Sources/Views/TurnTimer.swift)" },
      ],
      busy: {
        startT: 4.0,
        words: ["Refactoring", "Polishing", "Verifying"],
        tokensStart: 14200,
        tokensPerSec: 2400,
        streamFrom: 0.2,
        streamEach: 0.32,
        stream: [
          { cls: "diff-add", text: " + withAnimation(.easeOut) { pulse = 1 }" },
          { cls: "accent", text: "● Bash(swift test)" },
          { cls: "ok", text: "  ⎿ All tests passed (14 tests)" },
          { cls: "accent", text: "● Bash(swiftformat Sources/)" },
          { cls: "ok", text: "  ⎿ 3 files reformatted" },
        ],
      },
    };
  }

  // ---- tax-cruncher (Rust CLI) — medium-fast pace ----
  function taxMirrorA() {
    return {
      lines: [
        { cls: "prompt", text: "❯ handle the 2024 bracket update" },
        { cls: "accent", text: "● Read(src/brackets/federal_2024.rs)" },
      ],
      busy: {
        startT: 0,
        endT: 4.0,
        words: ["Crunching", "Computing", "Checking"],
        tokensStart: 3400,
        tokensPerSec: 1500,
        streamFrom: 0.3,
        streamEach: 0.5,
        stream: [
          { cls: "dim", text: "  ⎿ Read 142 lines" },
          { cls: "accent", text: "● Bash(cargo check)" },
          { cls: "ok", text: "  ⎿ Finished in 1.2s" },
          { cls: "accent", text: "● Edit(src/brackets/federal_2024.rs)" },
          { cls: "diff-add", text: " + let table = brackets_for(year)?;" },
        ],
      },
    };
  }
  function taxMirrorB() {
    return {
      lines: [
        { cls: "prompt", text: "❯ handle the 2024 bracket update" },
        { cls: "accent", text: "● Edit(src/brackets/federal_2024.rs)" },
      ],
      busy: {
        startT: 4.0,
        words: ["Testing", "Verifying"],
        tokensStart: 9500,
        tokensPerSec: 1300,
        streamFrom: 0.25,
        streamEach: 0.55,
        stream: [
          { cls: "accent", text: "● Bash(cargo test brackets::)" },
          { cls: "dim", text: "  ⎿ running 12 tests" },
          { cls: "ok", text: "  ⎿ test brackets::federal_2024 ... ok" },
        ],
      },
    };
  }

  // ---- hugo-blog (Go static-site engine) — medium pace ----
  function hugoMirrorA() {
    return {
      lines: [
        {
          cls: "prompt",
          text: "❯ add reading-time estimate to the post layout",
        },
        {
          cls: "accent",
          text: "● Read(layouts/partials/post-header.html)",
        },
      ],
      busy: {
        startT: 0,
        endT: 4.0,
        words: ["Building", "Rendering", "Checking"],
        tokensStart: 1800,
        tokensPerSec: 700,
        streamFrom: 0.4,
        streamEach: 0.7,
        stream: [
          { cls: "dim", text: "  ⎿ Read 38 lines" },
          { cls: "accent", text: "● Edit(layouts/partials/post-header.html)" },
          { cls: "diff-add", text: " + {{ .ReadingTime }} min read" },
          { cls: "accent", text: "● Bash(hugo --minify)" },
          { cls: "ok", text: "  ⎿ Site built in 340ms" },
        ],
      },
    };
  }
  function hugoMirrorB() {
    return {
      lines: [
        {
          cls: "prompt",
          text: "❯ add reading-time estimate to the post layout",
        },
        { cls: "accent", text: "● Bash(hugo server -D)" },
      ],
      busy: {
        startT: 4.0,
        words: ["Rebuilding", "Verifying"],
        tokensStart: 5200,
        tokensPerSec: 650,
        streamFrom: 0.35,
        streamEach: 0.75,
        stream: [
          { cls: "dim", text: "  ⎿ Watching for changes" },
          { cls: "ok", text: "  ⎿ 0 build errors" },
          { cls: "accent", text: "● Bash(hugo --minify)" },
          { cls: "ok", text: "  ⎿ Site built in 310ms" },
        ],
      },
    };
  }

  // ---- recipe-box (React app) — SLOWEST of the four (still far faster than a
  // human — the spread between agents is the point, not this pane reading
  // "slow" in absolute terms). ----
  function recipeMirrorA() {
    return {
      lines: [
        { cls: "prompt", text: "❯ add a servings scaler to the recipe view" },
        { cls: "accent", text: "● Edit(src/RecipeView.jsx)" },
      ],
      busy: {
        startT: 0,
        endT: 4.0,
        words: ["Scaling", "Rendering", "Testing"],
        tokensStart: 2100,
        tokensPerSec: 420,
        streamFrom: 0.5,
        streamEach: 0.9,
        stream: [
          { cls: "diff-add", text: " + const scale = servings / base" },
          { cls: "diff-add", text: " + return qty * scale" },
          { cls: "accent", text: "● Bash(npm test scaler)" },
          { cls: "ok", text: "  ⎿ 14 passed" },
        ],
      },
    };
  }
  function recipeMirrorB() {
    return {
      lines: [
        { cls: "prompt", text: "❯ add a servings scaler to the recipe view" },
        { cls: "accent", text: "● Edit(src/RecipeView.jsx)" },
      ],
      busy: {
        startT: 4.0,
        words: ["Styling", "Testing"],
        tokensStart: 3800,
        tokensPerSec: 380,
        streamFrom: 0.4,
        streamEach: 0.95,
        stream: [
          { cls: "accent", text: "● Edit(src/RecipeView.jsx)" },
          { cls: "diff-add", text: " + <ServingsStepper value={servings} />" },
          { cls: "accent", text: "● Bash(npm test scaler)" },
          { cls: "ok", text: "  ⎿ 16 passed" },
        ],
      },
    };
  }

  window.TIMELINE = window.TIMELINE || {
    region: "pip", // stays 'pip' the whole clip — no region-switch mechanic
    // No backdropTitle/backdropLive: no faux Slack surface at all in this
    // scenario (the sibling shell.pip.scene6.html also force-hides .backdrop
    // via CSS as a second guard).

    keyframes: [
      {
        // Beat 1 (t=0) — all 4 panes running simultaneously, each visibly at
        // its own pace. Nobody is idle/unknown/awaiting — this is the "four of
        // me, all genuinely working" read.
        t: 0,
        pip: [
          {
            name: "catan-companion",
            status: "running",
            mirror: catanMirrorA(),
          },
          { name: "tax-cruncher", status: "running", mirror: taxMirrorA() },
          { name: "hugo-blog", status: "running", mirror: hugoMirrorA() },
          { name: "recipe-box", status: "running", mirror: recipeMirrorA() },
        ],
      },
      {
        // Beat 2 (t=4.0) — fresh stream content per pane (same task, next
        // increment of work) so every pane keeps reading as independently
        // live for the full ~10s capture rather than going quiet after its
        // first burst.
        t: 4.0,
        pip: [
          {
            name: "catan-companion",
            status: "running",
            mirror: catanMirrorB(),
          },
          { name: "tax-cruncher", status: "running", mirror: taxMirrorB() },
          { name: "hugo-blog", status: "running", mirror: hugoMirrorB() },
          { name: "recipe-box", status: "running", mirror: recipeMirrorB() },
        ],
      },
    ],
    // No cursor[]/keycaps[] — nothing is clicked or approved; a pure
    // observational aside (unlike WP3/WP4's click/approve narratives).
  };
})();
