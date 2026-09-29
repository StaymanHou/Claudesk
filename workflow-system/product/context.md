---
stage: context
state: complete
updated: 2026-09-29
---

# Context

The project CLAUDE.md is at `CLAUDE.md` (project root). It is hand-curated and was **merged, not
regenerated**.

**Active milestone:** **Milestone 16: right-panel media viewer.** It was decomposed 2026-09-29 into
3 WPs in `workflow-system/product/wbs.md`, after a `/util-grill-me` pass whose rulings are recorded
there:
- Depth is chosen by file type.
- The review scope is fixed.
- Media opens in the existing editor file tab, with no new tab kind.

**First work package:** **WP1: Probe, media in the real WKWebView.** It checks asset-protocol
transport and range seeking, confinement including symlinks, the codec matrix,
`requestVideoFrameCallback`, fullscreen, native PDF, and parity between dev and an installed-style
build. ⚠️ It is a **GO/NO-GO gate on WP2 and WP3**.

**Entry point:** `/feature-plan` for WP1. It is a timeboxed probe with its design already settled,
so a spec pass would have nothing to decide. WP2 and WP3 each enter through `/feature-spec` when
they come up (WP2 is size L, touches the file-tab consumer sweep, and adds trust surface).

## What this pass changed

- **`CLAUDE.md` → `## Current Milestone`:** gained an M16 lead block carrying the grill rulings.
  The stale *"THE ACTIVE CYCLE IS M14's REMAINDER"* heading was relabeled **CLOSED**, and its
  rulings were kept as reference. The "Execution order" paragraph's *"no live `wbs.md`"* line now
  points at the M16 WBS.
- **`roadmap.md` → M16:** the Shape line changed from "a single feature" to probe + 2 build WPs, and
  the Exit Criteria now point at `wbs.md`.
- **Backlog `SURFACE-2026-09-25-RIGHT-PANEL-MEDIA-VIEWER`:** its status now reads "decomposed as M16".
- `.gitignore` already matched the canonical block (no diff), and the memory symlink was already in
  place.
