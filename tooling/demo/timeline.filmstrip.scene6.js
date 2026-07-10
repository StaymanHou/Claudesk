// Scene 6 ("The New Bandwidth") — A3 filmstrip demo timeline. FORK of the WP3
// timeline.filmstrip.js narrative, restructured for Scene 6's VO: "That's four
// projects I'm already the expert on, all moving at once, while I move between
// them. Reviewing. Steering. Unblocking." (local t=66.64-78.26s in master).
//
// Narrative correction vs WP3's file (which is "3 idle, 1 active — spot the one
// that needs you"): Scene 6 needs all FOUR tiles genuinely busy/streaming AT
// ONCE — the point is parallelism, not "spot the one." Every tile gets its own
// independent `busy` spec (rendered as a small ticking glyph+token line under
// the tile body — see shell.js renderFilmstrip / shell.css .tile-busy, added
// alongside this file) so none of them ever reads as idle or unknown.
//
// Paced to real narration cadence (NOT the stock README GIF-loop timing):
//   t=0     — all 4 running, catan-companion focused on center stage (Watch.
//             cuts in right as this starts).                         "..."
//   t=2.2   — cursor glides+clicks tax-cruncher → promotes to center stage.
//             Faster cadence than WP3's single mid-clip click.       "Reviewing."
//   t=4.2   — hugo-blog flips to AWAITING (blue blink) while tax-cruncher
//             keeps streaming on stage — something needs redirection. "Steering."
//   t=6.2   — cursor clicks the awaiting hugo-blog tile to center stage — STILL
//             UNANSWERED (switch ≠ answer, same real-CC cadence as WP3).
//   ~6.9-8.0 — keycap beat (1 + ⏎) resolves it; hugo-blog resumes running.
//                                                                     "Unblocking."
//   t=8.5   — pull back: cursor makes a final glide+click (recipe-box), closing
//             on all 4 tiles simultaneously visibly running/streaming — "all
//             moving at once" as the closing image. Hold to end (duration 9.0).
//
// PROJECT CAST unchanged from WP3 (deliberately unrelated projects, not
// microservices — see that file's header for the rationale): catan-companion
// (Swift iOS), tax-cruncher (Rust CLI), hugo-blog (Go static site), recipe-box
// (a recipe web app).
//
// Classic <script> (not a module — file:// blocks ES module imports in
// Chromium, the capture path). Mirrors the window.TIMELINE = window.TIMELINE
// || {...} fallback form so capture.mjs --timeline injection (addInitScript,
// runs first) wins.
//
// String fields are injected via innerHTML by shell.js — author-controlled
// dev input only (see shell.js header note).

window.TIMELINE = window.TIMELINE || {
  region: "filmstrip",
  // Cursor glide track: 3 distinct glide+click points across the ~9s (vs WP3's
  // single click) so it reads as genuine rapid switching between projects.
  // Coords are CSS px in the 1000x600 viewport. Tile centers (filmstrip padding
  // 14px, tiles 150px wide with 10px gaps): i=0 -> x~89, i=1 -> x~249,
  // i=2 -> x~409, i=3 -> x~569, tile head y~52.
  cursor: [
    { t: 0, x: 430, y: 330 },
    { t: 1.85, x: 430, y: 330 }, // idle on stage while catan-companion streams
    { t: 2.05, x: 249, y: 52, click: true }, // glide up + CLICK tax-cruncher tile
    { t: 2.4, x: 249, y: 52 },
    { t: 3.6, x: 430, y: 330 }, // ease back down to read the promoted stage
    { t: 5.85, x: 430, y: 330 }, // idle while hugo-blog flips awaiting (t=4.2)
    { t: 6.05, x: 409, y: 52, click: true }, // glide up + CLICK awaiting hugo-blog tile
    { t: 6.4, x: 409, y: 52 },
    { t: 6.9, x: 360, y: 250 }, // ease toward the prompt for the keycap resolve
    { t: 8.05, x: 360, y: 250 },
    { t: 8.25, x: 569, y: 52, click: true }, // final glide + CLICK — recipe-box
    { t: 8.6, x: 569, y: 52 },
    { t: 9.0, x: 569, y: 52 },
  ],
  // Keycap: the UNBLOCKING is a keyboard action (distinct from the mouse
  // switch at t=6.2) — "1" then "⏎" resolves hugo-blog's awaiting question.
  keycaps: [{ from: 6.9, to: 8.0, x: 360, y: 250, keys: ["1", "⏎"] }],
  keyframes: [
    {
      // t=0 — ALL FOUR running, nobody idle/unknown. catan-companion is
      // focused on center stage, mid tool-use; the other three each carry
      // their own busy spec so their filmstrip tiles show live ticking
      // activity too — "four projects moving at once."
      t: 0,
      tiles: [
        {
          name: "catan-companion",
          status: "running",
          body: "● Edit ScoreView.swift",
        },
        {
          name: "tax-cruncher",
          status: "running",
          body: "● Read federal_2024.rs",
          busy: {
            startT: 0,
            endT: 2.2,
            words: ["Crunching", "Verifying"],
            tokensStart: 2100,
            tokensPerSec: 900,
          },
        },
        {
          name: "hugo-blog",
          status: "running",
          body: "● Build · hugo build",
          busy: {
            startT: 0.3,
            endT: 2.2,
            words: ["Rendering", "Building"],
            tokensStart: 900,
            tokensPerSec: 500,
          },
        },
        {
          name: "recipe-box",
          status: "running",
          body: "● Bash · npm test",
          busy: {
            startT: 0.6,
            endT: 2.2,
            words: ["Testing", "Bundling"],
            tokensStart: 1400,
            tokensPerSec: 650,
          },
        },
      ],
      active: 0,
      stage: {
        lines: [
          { cls: "prompt", text: "❯ add a turn timer to the score tracker" },
          { text: "" },
          { cls: "accent", text: "● Edit(Sources/Views/ScoreView.swift)" },
          { cls: "dim", text: "  ⎿ Updated with 23 additions" },
        ],
        // LIVE: catan-companion is mid-work — a fast cascade + a working line
        // spinning/ticking across the beat.
        busy: {
          startT: 0,
          endT: 2.2,
          words: ["Compiling", "Wrangling", "Simulating"],
          tokensStart: 3800,
          tokensPerSec: 2600,
          streamFrom: 0.12,
          streamEach: 0.13,
          stream: [
            { cls: "accent", text: "● Update(Sources/Models/Game.swift)" },
            { cls: "dim", text: "  ⎿ Added 9 lines, removed 2" },
            { cls: "diff-add", text: "    43 +  var turnDeadline: Date?" },
            { cls: "diff-add", text: "    44 +  func endTurn() {" },
            { cls: "diff-add", text: "    45 +    turnDeadline = .now + 90" },
            {
              cls: "accent",
              text: "● Bash(xcodebuild -scheme CatanCompanion)",
            },
            { cls: "dim", text: "  ⎿ Compiling Models (12 sources)" },
            { cls: "ok", text: "  ⎿ Build succeeded in 4.2s" },
          ],
        },
        changes: [
          { cls: "ok", text: "+ Sources/Views/TurnTimer.swift" },
          { cls: "accent", text: "~ Sources/Views/ScoreView.swift" },
          { cls: "dim", text: "  2 files · +41 −4" },
        ],
      },
    },
    {
      // t=2.2 — "Reviewing." Cursor click promotes tax-cruncher to center
      // stage. catan-companion, hugo-blog and recipe-box KEEP running with
      // fresh busy specs of their own — nobody goes idle just because focus
      // moved off them.
      t: 2.2,
      tiles: [
        {
          name: "catan-companion",
          status: "running",
          body: "● Bash · xcodebuild",
          busy: {
            startT: 2.2,
            endT: 4.2,
            words: ["Linking", "Testing"],
            tokensStart: 4600,
            tokensPerSec: 700,
          },
        },
        { name: "tax-cruncher", status: "running", body: "● Read federal_2024.rs" },
        {
          name: "hugo-blog",
          status: "running",
          body: "● Render · partials",
          busy: {
            startT: 2.3,
            endT: 4.2,
            words: ["Rendering", "Minifying"],
            tokensStart: 1500,
            tokensPerSec: 450,
          },
        },
        {
          name: "recipe-box",
          status: "running",
          body: "● Edit RecipeCard.tsx",
          busy: {
            startT: 2.4,
            endT: 4.2,
            words: ["Formatting", "Testing"],
            tokensStart: 2200,
            tokensPerSec: 600,
          },
        },
      ],
      active: 1,
      stage: {
        lines: [
          {
            cls: "prompt",
            text: "❯ handle the 2024 bracket update in the federal calc",
          },
          { text: "" },
          { cls: "accent", text: "● Read(src/brackets/federal_2024.rs)" },
          { cls: "dim", text: "  ⎿ Read 142 lines" },
        ],
        busy: {
          startT: 2.2,
          endT: 4.2,
          words: ["Crunching", "Verifying"],
          tokensStart: 2100,
          tokensPerSec: 900,
          streamFrom: 0.2,
          streamEach: 0.35,
          stream: [
            { cls: "accent", text: "● Edit(src/brackets/federal_2024.rs)" },
            { cls: "ok", text: "  ⎿ Updated with 7 additions" },
            { cls: "accent", text: "● Bash(cargo test brackets::)" },
            { cls: "dim", text: "  ⎿ running 12 tests" },
          ],
        },
        changes: [
          { cls: "accent", text: "~ src/brackets/federal_2024.rs" },
          { cls: "dim", text: "  1 file · +7 −0" },
        ],
      },
    },
    {
      // t=4.2 — "Steering." hugo-blog flips to AWAITING (blue blink) — the
      // one-glance "this one needs you" signal — while tax-cruncher (still
      // focused) keeps cycling on center stage. catan-companion and
      // recipe-box keep their own independent busy work going too.
      t: 4.2,
      tiles: [
        {
          name: "catan-companion",
          status: "running",
          body: "● Bash · swift test",
          busy: {
            startT: 4.2,
            endT: 6.2,
            words: ["Testing", "Verifying"],
            tokensStart: 5300,
            tokensPerSec: 500,
          },
        },
        { name: "tax-cruncher", status: "running", body: "● cargo test" },
        {
          name: "hugo-blog",
          status: "awaiting",
          body: "? Draft or publish?",
        },
        {
          name: "recipe-box",
          status: "running",
          body: "● Bash · npm test",
          busy: {
            startT: 4.3,
            endT: 6.2,
            words: ["Bundling", "Testing"],
            tokensStart: 2800,
            tokensPerSec: 550,
          },
        },
      ],
      active: 1,
      stage: {
        lines: [
          {
            cls: "prompt",
            text: "❯ handle the 2024 bracket update in the federal calc",
          },
          { text: "" },
          { cls: "accent", text: "● Edit(src/brackets/federal_2024.rs)" },
          { cls: "ok", text: "  ⎿ Updated with 7 additions" },
          { cls: "accent", text: "● Bash(cargo test brackets::)" },
          { cls: "ok", text: "  ⎿ test brackets::federal_2024 ... ok" },
        ],
        busy: {
          startT: 4.2,
          endT: 6.2,
          words: ["Verifying", "Crunching"],
          tokensStart: 5100,
          tokensPerSec: 800,
          streamFrom: 0.25,
          streamEach: 0.4,
          stream: [
            { cls: "accent", text: "● Bash(cargo test --release)" },
            { cls: "dim", text: "  ⎿ running 47 tests" },
            { cls: "ok", text: "  ⎿ test result: ok. 47 passed" },
          ],
        },
        changes: [
          { cls: "accent", text: "~ src/brackets/federal_2024.rs" },
          { cls: "ok", text: "+ tests/federal_2024.rs" },
          { cls: "dim", text: "  2 files · +58 −0" },
        ],
      },
    },
    {
      // t=6.2 — "Unblocking" begins. Cursor click promotes hugo-blog to
      // center stage — STILL UNANSWERED (switch ≠ answer; a real-shaped
      // AskUserQuestion tool call is on screen, matching real Claude Code
      // cadence, same mechanic as WP3 beat 3). tax-cruncher and the others
      // keep working independently in the background.
      t: 6.2,
      tiles: [
        {
          name: "catan-companion",
          status: "running",
          body: "● cargo test ⎿ ok",
        },
        {
          name: "tax-cruncher",
          status: "running",
          body: "● cargo test ⎿ ok",
          busy: {
            startT: 6.2,
            endT: 7.4,
            words: ["Wrapping", "Finalizing"],
            tokensStart: 6200,
            tokensPerSec: 400,
          },
        },
        { name: "hugo-blog", status: "awaiting", body: "? Draft or publish?" },
        {
          name: "recipe-box",
          status: "running",
          body: "● Bash · npm test",
          busy: {
            startT: 6.3,
            endT: 7.4,
            words: ["Testing", "Bundling"],
            tokensStart: 3300,
            tokensPerSec: 500,
          },
        },
      ],
      active: 2,
      stage: {
        // Real-shaped AskUserQuestion for hugo-blog — unanswered.
        lines: [
          { cls: "prompt", text: "❯ ship the new pricing-page draft" },
          { text: "" },
          { cls: "accent", text: "● Read(content/pricing/draft.md)" },
          { cls: "dim", text: "  ⎿ Read 88 lines" },
          { text: "" },
          { cls: "askq-tab", text: "☐ Publish target" },
          {
            cls: "askq-question",
            text: "The draft looks ready. How should this go out?",
          },
          { cls: "askq-opt sel", text: "❯ 1. Publish now" },
          {
            cls: "askq-od",
            text: "Builds the site and pushes to the live pricing page immediately.",
          },
          { cls: "askq-opt", text: "&nbsp;&nbsp;2. Schedule for tomorrow" },
          {
            cls: "askq-od",
            text: "Holds the build and publishes at 9am local time.",
          },
          { cls: "askq-opt", text: "&nbsp;&nbsp;3. Keep as draft" },
          {
            cls: "askq-foot",
            text: "Enter to select · Tab/Arrow keys to navigate · Esc to cancel",
          },
        ],
        changes: [
          { cls: "dim", text: "awaiting answer…" },
          { cls: "accent", text: "~ content/pricing/draft.md" },
        ],
      },
    },
    {
      // t=7.4 — the SEPARATE answer (keycap beat spans t=6.9-8.0, resolving
      // mid-beat): hugo-blog resumes RUNNING and the build/publish proceeds.
      // "Unblocking" lands here. All four are back to genuinely running.
      t: 7.4,
      tiles: [
        {
          name: "catan-companion",
          status: "running",
          body: "● Build succeeded",
          busy: {
            startT: 7.4,
            endT: 8.5,
            words: ["Idling", "Watching"],
            tokensStart: 6400,
            tokensPerSec: 150,
          },
        },
        {
          name: "tax-cruncher",
          status: "running",
          body: "● cargo test ⎿ ok",
          busy: {
            startT: 7.4,
            endT: 8.5,
            words: ["Finalizing"],
            tokensStart: 6500,
            tokensPerSec: 300,
          },
        },
        {
          name: "hugo-blog",
          status: "running",
          body: "● hugo build --minify",
          busy: {
            startT: 7.4,
            endT: 8.5,
            words: ["Publishing", "Deploying"],
            tokensStart: 1900,
            tokensPerSec: 700,
          },
        },
        {
          name: "recipe-box",
          status: "running",
          body: "● Bash · npm test",
          busy: {
            startT: 7.5,
            endT: 8.5,
            words: ["Testing"],
            tokensStart: 3600,
            tokensPerSec: 450,
          },
        },
      ],
      active: 2,
      stage: {
        lines: [
          { cls: "prompt", text: "❯ ship the new pricing-page draft" },
          { text: "" },
          { cls: "accent", text: "● Bash(hugo build --minify)" },
          { cls: "ok", text: "  ⎿ Site built in 812ms" },
        ],
        busy: {
          startT: 7.4,
          endT: 8.5,
          words: ["Publishing", "Deploying"],
          tokensStart: 1900,
          tokensPerSec: 700,
          streamFrom: 0.15,
          streamEach: 0.3,
          stream: [
            { cls: "accent", text: "● Bash(rsync -av public/ prod:/www/)" },
            { cls: "ok", text: "  ⎿ Published 214 files" },
          ],
        },
        changes: [
          { cls: "ok", text: "+ content/pricing/draft.md → live" },
          { cls: "dim", text: "  1 file · published" },
        ],
      },
    },
    {
      // t=8.5 — closing image: pull back to all FOUR tiles simultaneously
      // visibly running/streaming, reinforcing "all moving at once." A final
      // cursor glide+click lands on recipe-box (the third distinct switch),
      // selling continuous rapid rotation right up to the hold. Duration is
      // 9.0s total; this keyframe holds to the end (and can be frozen further
      // by media-compositing to fill the ~11.6s VO window per the A3 plan).
      t: 8.5,
      tiles: [
        {
          name: "catan-companion",
          status: "running",
          body: "● Watching for changes",
        },
        {
          name: "tax-cruncher",
          status: "running",
          body: "● cargo test ⎿ ok",
        },
        {
          name: "hugo-blog",
          status: "running",
          body: "● Published to prod",
        },
        {
          name: "recipe-box",
          status: "running",
          body: "● Edit RecipeCard.tsx",
          busy: {
            startT: 8.5,
            words: ["Formatting", "Testing"],
            tokensStart: 3800,
            tokensPerSec: 500,
          },
        },
      ],
      active: 3,
      stage: {
        lines: [
          { cls: "prompt", text: "❯ add servings-scaler to the recipe card" },
          { text: "" },
          { cls: "accent", text: "● Edit(src/components/RecipeCard.tsx)" },
          { cls: "dim", text: "  ⎿ Updated with 14 additions" },
        ],
        // Open-ended (no endT) — keeps ticking through the freeze-hold tail so
        // the closing frame still reads as mid-stream, not finished.
        busy: {
          startT: 8.5,
          words: ["Formatting", "Testing", "Bundling"],
          tokensStart: 3800,
          tokensPerSec: 900,
          streamFrom: 0.15,
          streamEach: 0.25,
          stream: [
            { cls: "accent", text: "● Bash(npm test -- RecipeCard)" },
            { cls: "dim", text: "  ⎿ running 6 tests" },
            { cls: "ok", text: "  ⎿ test result: ok. 6 passed" },
          ],
        },
        changes: [
          { cls: "accent", text: "~ src/components/RecipeCard.tsx" },
          { cls: "dim", text: "  1 file · +14 −1" },
        ],
      },
    },
  ],
};
