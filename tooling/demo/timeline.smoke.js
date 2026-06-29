// Smoke-test timeline — the verify-self artifact for WP2. A minimal ~3s filmstrip
// scenario exercising every dot state + a running→awaiting flip + an active-tile
// promote. NOT a polished demo (that's WP3/WP4); just enough to prove the shell +
// pipeline render a legible looping GIF end-to-end.
//
// Guarded as a FALLBACK: capture.mjs --timeline <file> injects a scenario via
// addInitScript BEFORE this runs, so this only applies when the shell is opened
// standalone (or built with no --timeline). Don't clobber an injected timeline.
window.TIMELINE = window.TIMELINE || {
  region: "filmstrip",
  keyframes: [
    {
      t: 0,
      tiles: [
        { name: "api-gateway", status: "running", body: "● Refactoring…" },
        { name: "web-client", status: "running", body: "● Running tests…" },
        { name: "infra-tf", status: "idle", body: "idle" },
        { name: "docs-site", status: "unknown", body: "—" },
      ],
      active: 0,
      stage: {
        lines: [
          { cls: "prompt", text: "❯ claude" },
          { cls: "dim", text: "─ api-gateway ─ yolo ─────────────" },
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
      // web-client needs input — flips to AWAITING (blue blink).
      t: 1.4,
      tiles: [
        { name: "api-gateway", status: "running", body: "● Refactoring…" },
        { name: "web-client", status: "awaiting", body: "? Approve change" },
        { name: "infra-tf", status: "idle", body: "idle" },
        { name: "docs-site", status: "unknown", body: "—" },
      ],
      active: 0,
      stage: {
        lines: [
          { cls: "prompt", text: "❯ claude" },
          { cls: "dim", text: "─ api-gateway ─ yolo ─────────────" },
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
      // user clicks web-client -> it promotes to center stage.
      t: 2.6,
      tiles: [
        { name: "api-gateway", status: "running", body: "● Refactoring…" },
        { name: "web-client", status: "running", body: "● Building…" },
        { name: "infra-tf", status: "idle", body: "idle" },
        { name: "docs-site", status: "unknown", body: "—" },
      ],
      active: 1,
      stage: {
        lines: [
          { cls: "prompt", text: "❯ claude" },
          { cls: "dim", text: "─ web-client ─ yolo ─────────────" },
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
