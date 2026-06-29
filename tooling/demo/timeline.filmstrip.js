// WP3 — Filmstrip demo scenario timeline. The polished demo (NOT the WP2 smoke
// fallback): 4 CC-driven projects in the filmstrip, attention shifting as one
// flips to AwaitingInput (blue blink), then a tile click that promotes it to
// center stage WITH ITS APPROVAL STILL PENDING, then a SEPARATE approval beat.
// Narrative: "4 projects in flight, one glance tells you which needs you, one
// click jumps there — then you decide."
//
// FOUR beats — switching workspaces and approving are DISTINCT steps (the click
// promotes the workspace but does NOT auto-approve; the approval is its own beat):
//   Beat 1 (t=0)   — 4 projects in flight; api-gateway running on center stage.
//   Beat 2 (t=2.0) — web-client needs input → flips AWAITING (blue blink). The
//                    blink is the single "this one needs you" signal at a glance.
//   Beat 3 (t=4.0) — user CLICKS web-client → it promotes to center stage but is
//                    STILL AWAITING: the real CC permission prompt is shown,
//                    nothing approved yet. (Switch ≠ approve.)
//   Beat 4 (t=6.0) — user APPROVES (a separate action) → web-client resumes
//                    RUNNING; the tool proceeds.
//
// CC-pane content is authored to match the real Claude Code TUI cadence
// (generalized, content-neutral — no real/sensitive project data): a `❯` prompt,
// `●` tool-use bullets, `⎿` tree-result lines, real tool names (Edit/Bash/Read),
// and the permission-prompt box (`Do you want to make this edit? ❯ 1. Yes …`).
//
// Classic <script> (NOT a module — shell.html loads JS as classic <script>;
// file:// blocks ES-module imports in Chromium, the capture path). Mirrors
// timeline.smoke.js's `window.TIMELINE = window.TIMELINE || {...}` fallback form
// so capture.mjs --timeline injection (addInitScript, runs first) wins; opening
// shell.html standalone still paints this scenario.
//
// String fields (tile.body, stage.lines[].text, stage.changes[].text) are
// injected via innerHTML by shell.js — author-controlled dev input only.

// PROJECT CAST — deliberately FOUR UNRELATED projects in different domains +
// stacks (a board-game iOS app, a Rust tax CLI, a Go blog engine, a recipe web
// app). This is load-bearing: the demo must read as "one operator rotating among
// many INDEPENDENT projects" — NOT four services of one system (which would
// misrepresent the core philosophy: parallelism across PROJECTS, not across
// agents within a project — see README "Parallelism across projects").
window.TIMELINE = window.TIMELINE || {
  region: "filmstrip",
  // Cursor glide track (continuous, interpolated by cursorAt — independent of the
  // keyframe snapping). Coords are CSS px in the 1000x600 viewport. The cursor
  // rests on the center stage, then glides UP to the tax-cruncher tile and CLICKS
  // (the switch, t≈3.85 — just before the panes snap to beat 3 at t=4.0), then
  // drops back toward the prompt while the user reads it.
  cursor: [
    { t: 0, x: 430, y: 330 },
    { t: 1.9, x: 430, y: 330 }, // idle on stage while the awaiting signal appears
    { t: 3.85, x: 224, y: 52, click: true }, // glide up to tax-cruncher tile + CLICK
    { t: 4.2, x: 224, y: 52 },
    { t: 5.4, x: 150, y: 250 }, // ease down toward the prompt as the user reads it
    { t: 8, x: 150, y: 250 },
  ],
  // Keycap events: the APPROVE is a KEYBOARD action (distinct from the mouse
  // switch). Show "1" then "⏎" near the "❯ 1. Yes" prompt line, spanning the gap
  // around the beat-4 snap (t=6.0) so it reads as "user typed 1 ⏎ to approve".
  keycaps: [{ from: 5.5, to: 6.6, x: 360, y: 250, keys: ["1", "⏎"] }],
  keyframes: [
    {
      // Beat 1 — four unrelated projects in flight. catan-companion (a Swift iOS
      // app) is the focused workspace, mid tool-use (real CC cadence: prompt →
      // ● tool bullet → ⎿ result).
      t: 0,
      tiles: [
        { name: "catan-companion", status: "running", body: "● Edit ScoreView.swift" },
        { name: "tax-cruncher", status: "running", body: "● Bash · cargo test" },
        { name: "hugo-blog", status: "idle", body: "idle" },
        { name: "recipe-box", status: "unknown", body: "—" },
      ],
      active: 0,
      stage: {
        lines: [
          { cls: "prompt", text: "❯ add a turn timer to the score tracker" },
          { text: "" },
          { cls: "accent", text: "● Edit(Sources/Views/ScoreView.swift)" },
          { cls: "dim", text: "  ⎿ Updated ScoreView.swift with 23 additions" },
          { cls: "accent", text: "● Bash(xcodebuild -scheme CatanCompanion)" },
          { cls: "dim", text: "  ⎿ Compiling CatanCompanion (iOS Simulator)" },
          { text: '<span class="cursor"></span>' },
        ],
        changes: [
          { cls: "ok", text: "+ Sources/Views/TurnTimer.swift" },
          { cls: "accent", text: "~ Sources/Views/ScoreView.swift" },
          { cls: "accent", text: "~ Sources/Models/Game.swift" },
          { cls: "dim", text: "  3 files · +71 −8" },
        ],
      },
    },
    {
      // Beat 2 — tax-cruncher (a Rust CLI, a totally different project) needs
      // input. Its dot flips to AWAITING (blue blink): the one glance that tells
      // you which project needs you. Focus stays on catan-companion — the signal
      // pulls the eye to the filmstrip, not the stage.
      t: 2.0,
      tiles: [
        { name: "catan-companion", status: "running", body: "● Bash · xcodebuild" },
        { name: "tax-cruncher", status: "awaiting", body: "? Approve edit" },
        { name: "hugo-blog", status: "idle", body: "idle" },
        { name: "recipe-box", status: "unknown", body: "—" },
      ],
      active: 0,
      stage: {
        lines: [
          { cls: "prompt", text: "❯ add a turn timer to the score tracker" },
          { text: "" },
          { cls: "accent", text: "● Edit(Sources/Views/ScoreView.swift)" },
          { cls: "dim", text: "  ⎿ Updated ScoreView.swift with 23 additions" },
          { cls: "accent", text: "● Bash(xcodebuild -scheme CatanCompanion)" },
          { cls: "ok", text: "  ⎿ Build succeeded (iOS Simulator)" },
          { text: '<span class="cursor"></span>' },
        ],
        changes: [
          { cls: "ok", text: "+ Sources/Views/TurnTimer.swift" },
          { cls: "accent", text: "~ Sources/Views/ScoreView.swift" },
          { cls: "accent", text: "~ Sources/Models/Game.swift" },
          { cls: "dim", text: "  3 files · +71 −8" },
        ],
      },
    },
    {
      // Beat 3 — one click jumps there. tax-cruncher promotes to center stage
      // (the active blue ring moves to it) but is STILL AWAITING: the real CC
      // permission prompt is on screen, nothing approved yet. Switch ≠ approve.
      t: 4.0,
      tiles: [
        { name: "catan-companion", status: "running", body: "● Bash · xcodebuild" },
        { name: "tax-cruncher", status: "awaiting", body: "? Approve edit" },
        { name: "hugo-blog", status: "idle", body: "idle" },
        { name: "recipe-box", status: "unknown", body: "—" },
      ],
      active: 1,
      stage: {
        lines: [
          { cls: "prompt", text: "❯ handle the 2024 bracket update in the federal calc" },
          { text: "" },
          { cls: "accent", text: "● Edit(src/brackets/federal_2024.rs)" },
          { cls: "dim", text: "  ⎿ replace the 2023 bracket table with 2024 figures" },
          { text: "" },
          { cls: "accent", text: "Do you want to make this edit to federal_2024.rs?" },
          { cls: "ok", text: "  ❯ 1. Yes" },
          { cls: "dim", text: "    2. No, tell Claude what to do differently" },
        ],
        changes: [
          { cls: "dim", text: "awaiting approval…" },
          { cls: "accent", text: "~ src/brackets/federal_2024.rs" },
        ],
      },
    },
    {
      // Beat 4 — the SEPARATE approval. The user picks "1. Yes" (its own action,
      // distinct from the switch in beat 3): tax-cruncher resumes RUNNING and the
      // tool proceeds.
      t: 6.0,
      tiles: [
        { name: "catan-companion", status: "running", body: "● Bash · xcodebuild" },
        { name: "tax-cruncher", status: "running", body: "● cargo test" },
        { name: "hugo-blog", status: "idle", body: "idle" },
        { name: "recipe-box", status: "unknown", body: "—" },
      ],
      active: 1,
      stage: {
        lines: [
          { cls: "prompt", text: "❯ handle the 2024 bracket update in the federal calc" },
          { text: "" },
          { cls: "accent", text: "● Edit(src/brackets/federal_2024.rs)" },
          { cls: "ok", text: "  ⎿ Updated federal_2024.rs with 7 additions" },
          { cls: "accent", text: "● Bash(cargo test brackets::)" },
          { cls: "dim", text: "  ⎿ running 12 tests…" },
          { text: '<span class="cursor"></span>' },
        ],
        changes: [
          { cls: "ok", text: "+ tests/federal_2024.rs" },
          { cls: "accent", text: "~ src/brackets/federal_2024.rs" },
          { cls: "accent", text: "~ src/brackets/mod.rs" },
          { cls: "dim", text: "  3 files · +58 −11" },
        ],
      },
    },
  ],
};
