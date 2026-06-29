// WP4 — PiP demo scenario timeline (round-3 re-author per operator fidelity
// correction 2026-06-29). The polished demo (NOT the WP2 smoke fallback):
// Claudesk's always-on-top Picture-in-Picture panel — a VERTICAL stack of LIVE
// workspace MIRRORS (each a compact, real-looking CC session) — pinned in a
// screen corner over an ACTIVE faux Slack work backdrop, keeping CC monitorable
// while the operator works elsewhere, and PINGING them the moment a workspace
// needs input. Then ⌘+Tab brings the REAL CLAUDESK WINDOW forward (full
// filmstrip + center stage — NOT just a focus ring on the PiP), where the
// operator answers in the promoted workspace and CC resumes.
//
// Narrative: "Do your other work — CC stays watchable in the corner and pings
// you the moment it needs you; ⌘+Tab back to Claudesk and you're answering."
//
// ROUND-3 FIDELITY FIX (operator, 2026-06-29): the round-2 ending kept the
// answer INSIDE the PiP panel, which misrepresented the UX — the PiP is the
// MONITOR; ⌘+Tab brings the actual Claudesk WINDOW forward and you act in the
// real workspace. So beats 4–6 now switch the composition to `region:'filmstrip'`
// (the real Claudesk window: filmstrip tiles + center stage) with tax-cruncher
// promoted to center stage showing the AskUserQuestion, then resuming. This
// reuses the SAME center-stage surface as the filmstrip demo (timeline.filmstrip.js).
//
// BEAT SHEET (~10s loop):
//   Beat 1 (t=0)   — heads-down in Slack: the operator TYPES a reply in the chat
//                    input (animated). PiP shows 2 live CC mirrors (recipe-box +
//                    tax-cruncher), streaming. [region: pip]
//   Beat 2 (t=2.4) — reply SENT (pops in); MORE messages arrive. Both still work.
//                    [region: pip]
//   Beat 3 (t=4.2) — THE PING: tax-cruncher mirror flips running → AWAITING (blue
//                    ring + "needs you" badge). recipe-box keeps running. [region: pip]
//   Beat 4 (t=5.8) — ⌘+Tab: the REAL CLAUDESK WINDOW comes forward (filmstrip +
//                    center stage). tax-cruncher auto-promoted to center stage,
//                    still AWAITING — its AskUserQuestion fills the stage.
//                    [region: filmstrip]  ← composition switch
//   Beat 5 (t=7.0) — the operator ANSWERS in the real workspace: option 1 picked.
//                    [region: filmstrip]
//   Beat 6 (t=8.0) — answered → tax-cruncher RESUMES running on center stage;
//                    its CC session streams again. Loop. [region: filmstrip]
//
// Two workspaces (operator's round-2 choice) carried through as the filmstrip
// cast too (recipe-box + tax-cruncher — two UNRELATED projects). CC-pane content
// reuses the filmstrip demo's busy/stream cadence (❯ prompt, ● bullets, ⎿
// results, diff-add/del hunks, busyAt spinner/token line; askq-* AskUserQuestion).
//
// Classic <script> (NOT a module). Uses `window.TIMELINE = window.TIMELINE ||
// {...}` fallback form so capture.mjs --timeline injection wins.
//
// String fields injected via innerHTML by shell.js — author-controlled dev input.

(function () {
  // ---- PiP mirror specs (beats 1–3, region:pip) ----
  function recipeMirror() {
    return {
      lines: [
        { cls: "prompt", text: "❯ add a servings scaler to the recipe view" },
        { cls: "accent", text: "● Edit(src/RecipeView.jsx)" },
      ],
      busy: {
        startT: 0,
        words: ["Wrangling", "Scaling", "Rendering", "Testing"],
        tokensStart: 2100,
        tokensPerSec: 320,
        streamFrom: 0.2,
        streamEach: 0.55,
        stream: [
          { cls: "diff-add", text: " + const scale = n / base" },
          { cls: "diff-add", text: " + return qty * scale" },
          { cls: "accent", text: "● Bash(npm test scaler)" },
          { cls: "ok", text: "  ⎿ 14 passed" },
        ],
      },
    };
  }
  function taxRunningMirror() {
    return {
      lines: [
        { cls: "prompt", text: "❯ handle the 2024 bracket update" },
        { cls: "accent", text: "● Read(src/brackets/federal_2024.rs)" },
      ],
      busy: {
        startT: 0,
        words: ["Crunching", "Computing", "Checking"],
        tokensStart: 3400,
        tokensPerSec: 410,
        streamFrom: 0.3,
        streamEach: 0.6,
        stream: [
          { cls: "dim", text: "  ⎿ Read 142 lines" },
          { cls: "accent", text: "● Bash(cargo check)" },
          { cls: "ok", text: "  ⎿ Finished in 1.2s" },
        ],
      },
    };
  }
  function taxAwaitingMirror() {
    return {
      lines: [
        { cls: "askq-tab", text: "☐ Tax year" },
        { cls: "askq-question", text: "Treat a prior-year return how?" },
        { cls: "askq-opt", text: "&nbsp;&nbsp;1. Use that year's brackets" },
        { cls: "askq-opt", text: "&nbsp;&nbsp;2. Always current-year" },
      ],
    };
  }

  // ---- filmstrip tiles (beats 4–6, region:filmstrip) — the real Claudesk window.
  function tiles(activeStatus) {
    return [
      { name: "recipe-box", status: "running", body: "● npm test scaler" },
      { name: "tax-cruncher", status: activeStatus, body: activeStatus === "awaiting" ? "? Tax year" : "● cargo test" },
    ];
  }

  // ---- center-stage content (beats 4–6) — tax-cruncher promoted ----
  // The full AskUserQuestion on the center stage (the real surface you answer in).
  function taxStageAwaiting(selected) {
    return {
      lines: [
        { cls: "prompt", text: "❯ handle the 2024 bracket update in the federal calc" },
        { text: "" },
        { cls: "accent", text: "● Read(src/brackets/federal_2024.rs)" },
        { cls: "dim", text: "  ⎿ Read 142 lines" },
        { text: "" },
        { cls: "askq-tab", text: "☐ Tax year" },
        { cls: "askq-question", text: "How should the calculator treat a return filed for a prior year?" },
        {
          cls: selected ? "askq-opt sel" : "askq-opt",
          text: (selected ? "❯ 1." : "&nbsp;&nbsp;1.") + " Use that year's brackets",
        },
        { cls: "askq-od", text: "Look up the historical bracket table by tax year. Correct for amended + late returns." },
        { cls: "askq-opt", text: "&nbsp;&nbsp;2. Always use current-year" },
        { cls: "askq-od", text: "Simpler, but wrong for amended / late-filed prior-year returns." },
        { cls: "askq-foot", text: "Enter to select · Tab/Arrow keys to navigate · Esc to cancel" },
      ],
      changes: [
        { cls: "dim", text: "awaiting answer…" },
        { cls: "accent", text: "~ src/brackets/federal_2024.rs" },
      ],
    };
  }
  function taxStageResumed() {
    return {
      lines: [
        { cls: "prompt", text: "❯ handle the 2024 bracket update in the federal calc" },
        { text: "" },
        { cls: "accent", text: "● Edit(src/brackets/federal_2024.rs)" },
        { cls: "ok", text: "  ⎿ Updated with 7 additions" },
      ],
      busy: {
        startT: 8.0,
        words: ["Testing", "Verifying"],
        tokensStart: 5200,
        tokensPerSec: 900,
        streamFrom: 0.25,
        streamEach: 0.5,
        stream: [
          { cls: "accent", text: "● Bash(cargo test brackets::)" },
          { cls: "dim", text: "  ⎿ running 12 tests" },
          { cls: "ok", text: "  ⎿ test brackets::federal_2024 ... ok" },
        ],
      },
      changes: [
        { cls: "ok", text: "+ tests/federal_2024.rs" },
        { cls: "accent", text: "~ src/brackets/federal_2024.rs" },
        { cls: "dim", text: "  2 files · +58 −11" },
      ],
    };
  }

  window.TIMELINE = window.TIMELINE || {
    region: "pip", // default/opening region; beats 4–6 override to 'filmstrip'

    // ---- ACTIVE work backdrop (pip beats): a live Slack thread ----
    backdropTitle: "# eng-standup",
    backdropLive: {
      messages: [
        { at: 0, author: "alex", text: "shipping the auth fix today? blocking the release" },
        { at: 0, author: "priya", text: "staging deploy is green on my end ✅" },
        { at: 2.4, author: "you", text: "yep — reviewing the diff now, up within the hour" },
        { at: 3.2, author: "alex", text: "🙏 also did the prod migration backfill finish?" },
        { at: 4.0, author: "priya", text: "backfill's done — 1.2M rows, no errors" },
      ],
      typing: [{ startT: 1.6, text: "yep — reviewing the diff now, up within the hour", sendAt: 2.4 }],
      // the operator REACTS to priya's "staging deploy is green" message (index 1)
      // with a 👍 — the cursor glides to it and clicks at t≈1.0 (see `cursor`).
      // Concrete "I'm actively working in Slack" texture; never touches the PiP.
      reactions: [{ at: 1.05, msgIndex: 1, emoji: "👍" }],
    },

    pipPos: { right: "28px", bottom: "28px" },

    keyframes: [
      {
        // Beat 1 — typing in Slack; both workspaces run live CC mirrors.
        t: 0,
        region: "pip",
        pip: [
          { name: "recipe-box", status: "running", mirror: recipeMirror() },
          { name: "tax-cruncher", status: "running", mirror: taxRunningMirror() },
        ],
      },
      {
        // Beat 2 — reply sent, more messages arrive; both still working.
        t: 2.4,
        region: "pip",
        pip: [
          { name: "recipe-box", status: "running", mirror: recipeMirror() },
          { name: "tax-cruncher", status: "running", mirror: taxRunningMirror() },
        ],
      },
      {
        // Beat 3 — THE PING: tax-cruncher mirror flips to awaiting (cell lifts).
        t: 4.2,
        region: "pip",
        pip: [
          { name: "recipe-box", status: "running", mirror: recipeMirror() },
          { name: "tax-cruncher", status: "awaiting", mirror: taxAwaitingMirror() },
        ],
      },
      {
        // Beat 4 — ⌘+Tab brings the REAL Claudesk WINDOW forward. Composition
        // switches to filmstrip+stage; tax-cruncher promoted to center stage,
        // still awaiting — the full AskUserQuestion fills the stage.
        t: 5.8,
        region: "filmstrip",
        tiles: tiles("awaiting"),
        active: 1,
        stage: taxStageAwaiting(false),
      },
      {
        // Beat 5 — the operator ANSWERS in the real workspace: option 1 picked.
        t: 7.0,
        region: "filmstrip",
        tiles: tiles("awaiting"),
        active: 1,
        stage: taxStageAwaiting(true),
      },
      {
        // Beat 6 — answered → tax-cruncher resumes running on center stage. Loop.
        t: 8.0,
        region: "filmstrip",
        tiles: tiles("running"),
        active: 1,
        stage: taxStageResumed(),
      },
    ],

    // Mouse cursor (pip beats only): glides to priya's message and CLICKS a 👍
    // reaction at t≈1.05 (the operator actively working in Slack), then moves to
    // the input box as they start typing (t≈1.6), then rests. It NEVER touches
    // the PiP (display-only) — coords stay in the Slack backdrop (top-left).
    // After the ⌘+Tab region switch (t=5.8) the cursor track has ended (clamped
    // off-screen-ish) so it doesn't wander the Claudesk window — the answer there
    // is keyboard (1 + ⏎).
    // Mouse cursor (pip beats only): glides to priya's message and CLICKS a 👍
    // reaction at t≈1.05 (the operator actively working in Slack), then moves to
    // the input box as they start typing (t≈1.6), then rests. It NEVER touches
    // the PiP (display-only) — coords stay in the Slack backdrop (top-left).
    // After the ⌘+Tab region switch (t=5.8) the cursor leaves the viewport so it
    // doesn't wander the Claudesk window — the answer there is keyboard (1 + ⏎).
    cursor: [
      // coords measured from the rendered DOM: the 👍 chip center is ~(320,116);
      // the cursor TIP is at its element (0,0), so we aim the tip at the chip's
      // left edge so the arrow sits ON the chip.
      { t: 0, x: 140, y: 230 },
      { t: 0.9, x: 314, y: 112 }, // glide up to the 👍 chip on priya's message
      { t: 1.05, x: 314, y: 112, click: true }, // CLICK the 👍 reaction
      { t: 1.7, x: 150, y: 600 }, // drop to the input box to type the reply
      { t: 2.6, x: 150, y: 600 },
      { t: 5.4, x: 150, y: 600 }, // rest in Slack through the ping
      { t: 5.55, x: -60, y: -60 }, // ⌘+Tab → cursor leaves (Claudesk is kbd-driven now)
    ],

    keycaps: [
      // ⌘+Tab — the switch-to-Claudesk gesture, spanning the beat-4 region flip.
      { from: 5.4, to: 6.4, x: 470, y: 320, keys: ["⌘", "⇥"] },
      // 1 + ⏎ — answering the AskUserQuestion in the REAL workspace (beat 5),
      // near the selected option line on the center stage.
      { from: 6.7, to: 7.8, x: 360, y: 520, keys: ["1", "⏎"] },
    ],
  };
})();
