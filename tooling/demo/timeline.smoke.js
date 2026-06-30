// Smoke-test timeline — the verify-self artifact for WP2. A minimal ~3s filmstrip
// scenario exercising every dot state + a running→awaiting flip + an active-tile
// promote. NOT a polished demo (that's WP3/WP4); just enough to prove the shell +
// pipeline render a legible looping GIF end-to-end.
//
// Guarded as a FALLBACK: capture.mjs --timeline <file> injects a scenario via
// addInitScript BEFORE this runs, so this only applies when the shell is opened
// standalone (or built with no --timeline). Don't clobber an injected timeline.
//
// Cast: FOUR UNRELATED projects (a Rust tax CLI, a recipe web app, a Go blog engine,
// a board-game iOS app) — NOT four services of one system, matching the README's
// parallelism-across-projects philosophy + timeline.filmstrip.js's cast note.
window.TIMELINE = window.TIMELINE || {
  region: "filmstrip",
  keyframes: [
    {
      t: 0,
      tiles: [
        { name: "tax-cruncher", status: "running", body: "● Refactoring…" },
        { name: "recipe-box", status: "running", body: "● Running tests…" },
        { name: "blog-engine", status: "idle", body: "idle" },
        { name: "catan-companion", status: "unknown", body: "—" },
      ],
      active: 0,
      stage: {
        lines: [
          { cls: "prompt", text: "❯ claude" },
          { cls: "dim", text: "─ tax-cruncher ─ yolo ─────────────" },
          { cls: "accent", text: "● Refactoring auth middleware…" },
          { cls: "dim", text: "  · editing token_store.rs" },
          { text: '<span class="cursor"></span>' },
        ],
        changes: [
          { cls: "ok", text: "+ token_store.rs" },
          { cls: "accent", text: "~ mod.rs" },
          { cls: "dim", text: "  3 files · +47 −12" },
        ],
      },
    },
    {
      // recipe-box needs input — flips to AWAITING (blue blink).
      t: 1.4,
      tiles: [
        { name: "tax-cruncher", status: "running", body: "● Refactoring…" },
        { name: "recipe-box", status: "awaiting", body: "? Approve change" },
        { name: "blog-engine", status: "idle", body: "idle" },
        { name: "catan-companion", status: "unknown", body: "—" },
      ],
      active: 0,
      stage: {
        lines: [
          { cls: "prompt", text: "❯ claude" },
          { cls: "dim", text: "─ tax-cruncher ─ yolo ─────────────" },
          { cls: "accent", text: "● Refactoring auth middleware…" },
          { cls: "dim", text: "  · editing token_store.rs" },
          { text: '<span class="cursor"></span>' },
        ],
        changes: [
          { cls: "ok", text: "+ token_store.rs" },
          { cls: "accent", text: "~ mod.rs" },
          { cls: "dim", text: "  3 files · +47 −12" },
        ],
      },
    },
    {
      // user clicks recipe-box -> it promotes to center stage.
      t: 2.6,
      tiles: [
        { name: "tax-cruncher", status: "running", body: "● Refactoring…" },
        { name: "recipe-box", status: "running", body: "● Building…" },
        { name: "blog-engine", status: "idle", body: "idle" },
        { name: "catan-companion", status: "unknown", body: "—" },
      ],
      active: 1,
      stage: {
        lines: [
          { cls: "prompt", text: "❯ claude" },
          { cls: "dim", text: "─ recipe-box ─ yolo ─────────────" },
          { cls: "ok", text: "● Tests passed (42/42)" },
          { cls: "dim", text: "  · npm run build" },
          { text: '<span class="cursor"></span>' },
        ],
        changes: [
          { cls: "ok", text: "+ Button.tsx" },
          { cls: "dim", text: "  1 file · +18 −2" },
        ],
      },
    },
  ],
};
