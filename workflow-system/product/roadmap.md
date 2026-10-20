---
stage: roadmap
state: complete
updated: 2026-10-20  # M16 closed
---

# Roadmap

Claudesk grows in increments you can dogfood, and each one is usable on its own. **Every milestone
planned so far has shipped** (M1–M16, both Group F asks, and the features inserted after them). This
file now holds three things: a one-line index of what shipped, the rulings that still bind future
work, and what comes next.

⚠️ **The full milestone and revision text (1,202 lines) is archived VERBATIM at
[`archive/revision-log/roadmap-2026-06-to-09.md`](archive/revision-log/roadmap-2026-06-to-09.md)**
(condensed 2026-09-29). Section headings are unchanged there, so an older citation like
*"`roadmap.md` → Revision 2026-08-14"* resolves to the same heading in that file. **The as-built
record is `arch/<subsystem>.md`** (indexed by `arch.md`). Where the two disagree, `arch/` wins.

**Conventions (unchanged):**
- Milestones are a **flat, continuous list**, and `## Group` headings are cosmetic only.
- A between-milestone insert is numbered `N.5` (or `N.9`) so the tail does not renumber.
- A **QoL bucket** is an OPEN collection of dogfooding papercuts. There have been four so far
  (M6, M10.5, M11.5, M13.5), and each closed at 4–5 WPs.
- Operator asks may enter as **un-numbered items** (Group F) and get numbered only when scheduled.

## Shipped

| # | Milestone | Closed | What it delivered |
|---|---|---|---|
| M1 | Bare shell + tab substrate (PoC) | 2026-06-19 | Tauri shell, picker, PTY terminal running `claude`, tab substrate; thumbnail probe PASS (live ~1 fps mirrors) |
| M2 | Lite editor + diff viewer | 2026-06-22 | CM6 editor (finder, palette, find/replace, splits, tabs, file tree), git diff viewer, panel hotkeys, Sublime Text + Merge buttons (kept permanently) |
| M3 | CC lifecycle & state plumbing | 2026-06-22 | Hook script + `AF_UNIX` socket + status broadcaster; state comes from hooks, never PTY scraping |
| M4 | Multi-workspace UX | 2026-06-24 | Filmstrip with live mirrors, `⌘⇧`+digit, drag-reorder, collapse, focus indicator. **This was the dogfood-replace point** |
| M5 | Picture-in-picture | 2026-06-27 | NSPanel PiP with 4 layouts and auto-summon on blur; display-only |
| M6 | Friend-requested QoL (bucket) | 2026-06-28 | Stuck-dot fix, split control, terminal zoom, wrap toggle, gitignored-file reach, no-yolo setting |
| M7 | Menu-bar status item | 2026-06-29 | Tray alarm (lit when any workspace is awaiting input) and an actuator menu; the popover was cut as a PiP subset |
| M8 | Demo assets | 2026-06-29 | Synthesized filmstrip and PiP GIFs in the README |
| M9 | Time-analytics panel | 2026-07-16 | Absorbed claude-time: write-gated SQLite, reclassifier, dashboard (default OFF) |
| M10 | In-app auto-updater | 2026-07-18 | minisign-signed updater; Homebrew installs self-update too |
| M10.5 | QoL bucket | 2026-07-19 | PiP top-right default, active-close confirm, SIGHUP-first group kill, UTF-8 fixes |
| M10.9 | Workflow-features opt-in gate | 2026-07-31 | `workflow_features_enabled` (default OFF, byte-identical when off); the two-tier audience |
| M11.5 | QoL bucket | 2026-08-01 | Per-project `--model` override on the picker row, plus pre-M11 guard debt |
| M11 | Workflow-docs markdown viewer | 2026-08-03 | Gated docs panel with live reload |
| M12 | Smart auto-resume + drive mode | 2026-08-12 | Two-signal resume (unclean flag → `--continue`, else `.session.md` → `/session-restore`); drive mode on the picker row, delivered through a hook |
| M13 | Skill orchestration | 2026-08-18 | A fixed five-button skill row, plus Recycle Session as a callable operation. **Group C closed: all six vision metrics met** |
| M13.5 | QoL bucket | 2026-08-26 | Window-state persistence, the BackgroundWork (purple) state, turn-boundary `↑ N/N ↓`, drive mode on the workspace surface |
| M14 | Polish & open-source release | 2026-09-18 | MIT license, a README with two setup tiers, a read-only hotkey reference, Developer-ID signing and notarization (`v0.5.2`) |
| M15 | Workflow supervisor | 2026-09-15 | Typed policy graph, turn-end break detection, auto-fire, `claude -p` adjudicator, context-pressure recycle at 400k tokens |
| F-a | Prompt staging area | 2026-09-22 | CM6 prompt panel, bracketed-paste send (`⌘↵`) and stage-only (`⇧⌘↵`), sent-draft ring |
| F-b | Isolated CC profiles as workspaces | 2026-09-24 | `CLAUDE_CONFIG_DIR` profiles spawned directly, with per-profile hook registration (`arch/profiles.md`) |
| — | Supervisor activity record | 2026-09-28 | `supervisor-activity.log` JSONL, badge hint, `▾` popover, turn `⚙` |
| — | Silent-supervisor fix | 2026-09-28 | Three causes fixed (`778fe72`); shipped in `v0.7.1` |
| — | Analytics week export | 2026-09-29 | Day view 5.7× faster, resumed-session lives, Week default, `claudesk export-week` (`v0.7.1`) |
| M16 | Right-panel media viewer | 2026-10-20 | Images, SVG, sniff-gated PDF, audio and video open in the editor file tab: glance viewer, review player (midpoint frame-step, frame-accurate timecode, reload keeps the playhead), a 4 GiB cap with Open in default app (`arch/right-panel-surfaces.md`) |

**Carried forward from shipped work. These are not complete, so read them before reading any `[x]` as "done":**
- ⚠️ **M15's live half: firing IS observed on an installed build** (`v0.7.1`, four fires on
  2026-10-12 in `bluecg-maps`), but the on-screen checks (a fire with its `⚙`, a fire while another
  app is focused, Esc recovery) are still unconfirmed. Tracked at
  `SURFACE-2026-09-14-SUPERVISOR-NEVER-OBSERVED-FIRING-IN-A-LIVE-SESSION`; closes in M16.5.
- ⚠️ **F-a's motivating case, voice dictation, is ASSUMED WORKING, NOT VERIFIED.** macOS text-input
  services do not engage under `pnpm tauri:dev`, so it needs an installed build.
- ⚠️ **F-b has two checks deferred to the release gate:** an installed-`.app` profile spawn with its
  status dot, and whether `trash::delete` needs a Finder Automation grant.
- ⚠️ **M16 has two checks deferred, NOT passed:** hardened runtime for the media transport and player (a notarized release build; deferred to `/release`), and the operator's `scripture-reading` dogfood review pass (AC-21, deferred 2026-10-20). The installed-origin tier passed on a debug bundle only.
- ⚠️ **M13's dynamic skill registry was NEVER BUILT, and that was deliberate.** The fixed five shipped
  instead. A registry would need an enumerator plus a YAML parser, which reverses the §4c decision
  (the command name is the only stable cross-repo coupling). M15 R-7 declined it. It re-enters only
  as a product decision.

## Standing rulings (settled; do not re-litigate)

Each ruling is one line here. Its full text is in the archive, under the heading named.

- **Ownership boundary with mccc (2026-08-14): "absorb the machine, not the skills."** Claudesk owns
  the drive mode's VALUE and TURN-BOUNDARY enforcement. mccc owns its MEANING and INTRA-TURN
  semantics, and mccc's prose remains the fallback for sessions run without Claudesk. Full absorption
  of mccc was rejected. → *Milestone 15*, *Revision 2026-08-14*.
- **M15 R-1–R-7.** Among them: the stored mode is the authority, and Mode 0 is not a suppressor. The
  recycle threshold is an absolute token count, and no model→window map exists. The verdict lives in
  TypeScript. → `arch/workflow-supervisor.md`.
- **M14 R-1:** sign and notarize, with minisign kept and the trust anchor `774E2E8429FDF78A`
  unchanged. **M14 R-2:** project-list management was **DROPPED, not deferred**. → *Milestone 14*.
- **F-a:** newlines are preserved through bracketed paste, and `slashCommandPayload` is not modified.
  → *F-a decisions — `/util-grill-me`, 2026-09-21*.
- **F-b:** the profile/project model, hook-registration ownership, and self-hosting. → *F-b decisions
  — `/util-grill-me`, 2026-09-23*.
- ⛔ **Turn-output re-orientation (F-c) was DROPPED** (2026-09-15). Re-open it only on a fresh operator
  ask, never by citing the product thesis. → *F-c*.
- **Group C lesson for the next `/product-vision`:** success metrics written as "every X", or that
  name a mechanism, were refuted by the build twice. Metrics that name an outcome survived.
  → *Milestone 13*, Group C exit.
- ⭐ **A `/util-grill-me` pass is the ENTRY step of each operator-requested capability**, not a review
  step. (This was the Group F convention, and it carries forward.)

## Next

**Order set by the operator on 2026-09-29.** ✅ **M16 closed 2026-10-20**; its roadmap entry is archived verbatim at `archive/milestone-16-right-panel-media-viewer/roadmap-entry.md`, with its WBS beside it.

### Then, in order

1. ✅ **mccc upstream asks were delivered 2026-09-29** to mccc's `workflow-system/inbox/` as three
   messages: M15 WP2 (delete Phase 9), M15 WP4 (Work Tree schema pin), and the 2026-09-23 paydown's
   13 asks. No Claudesk milestone is needed. The Claudesk backlog entries close as each ask lands
   upstream.
2. **Milestone 16.5: supervisor hardening + QoL + paydown bucket** — scoped at a `/util-grill-me`
   pass on 2026-10-20 (rulings below are SETTLED). ✅ **Its gate is MET:** the installed `v0.7.1`
   fired four times on 2026-10-12 (`bluecg-maps`, autopilot, P3→P5→P7→P9 in
   `supervisor-activity.log`). Decomposition: `wbs.md`.
   - ⚠️ **Operator ruling: ONE bucket holds everything** (the picker fix included; nothing ships
     ahead of the WBS), and the **adjudicator re-measurement is IN** (it needs an operator labelling
     pass). Both reversed the agent's recommendation.
   - **Supervisor:** a fire on a transition token quoted in prose; a leaked workspace subscription
     (the duplicate *decision* is already contained; the leak and the lost `⚙` remain);
     `is_turn_start` firing on mid-turn dequeues; an alarm for a transcript-format change; the
     adjudicator re-measurement (`SURFACE-2026-09-15-ADJUDICATOR-MARGIN-NEEDS-A-LARGER-LABELLED-SET`);
     and closing `SURFACE-2026-09-14-SUPERVISOR-NEVER-OBSERVED-FIRING-IN-A-LIVE-SESSION` with its
     three on-screen checks (`⚙`, a fire with another app focused, Esc recovery) as acceptance.
   - **Status dot (measure first):** the artifact-watch purple dot, and a verify-human pause with a
     background shell reading purple, not blue (workflow-gated, default OFF).
   - **QoL:** picker filter autocorrect; per-result / per-file replace (⚠️ needs a UX decision: the
     Find Results tab is read-only); a failed delete/trash surfaces an error (the create-collision
     half already shows inline); a go-to-line (⌘⌥G) Settings hotkey row; derived model-alias hints;
     keyboard pan/zoom in the Day view; variable-frame-rate frame-step in the review player.
   - **Last WP: a code-quality paydown** over the carried findings (`/util-backlog-paydown` shape).
   - ⛔ **The stale minimap is EXCLUDED** — feature-sized (upstream issue #1, a `drawLine` rewrite),
     pulled from M11.5 for that reason; soft-wrap off is the workaround.
3. **A short `/product-vision` revisit BEFORE numbering anything past M16.** All six vision success
   metrics are met, and every milestone since M14 has been an operator ask. The open question is
   whether **non-coding workspaces** (the direction F-b opened, which M16 serves) is a product
   direction or a one-off. The two remaining vision Future Possibilities (PiP click-to-focus and a
   visual view of workflow state) are weighed there too.

**Held open, not scheduled:**
- The stale minimap (feature-sized; revive as its own feature when the `drawLine` rewrite is worth
  funding). The other QoL seeds and the paydown were absorbed into M16.5.

## Revisions

- **2026-10-20 (b)** — M16.5 scoped at a `/util-grill-me` pass: one bucket of supervisor hardening + the status-dot items + the QoL seeds (minimap excluded) + a closing code-quality paydown; the supervisor gate recorded as met by the 2026-10-12 fires.
- **2026-10-20** — M16 (right-panel media viewer) closed at `/product-finalize`: moved to Shipped, its two deferred checks added to "Carried forward", and its Next entry archived verbatim with the cycle docs. Next in order: the supervisor-hardening bucket (still gated on a live fire), then the `/product-vision` revisit.
- **2026-09-29** — Condensed. All closed milestone and revision text moved verbatim to
  `archive/revision-log/roadmap-2026-06-to-09.md`; the file went from 1,202 lines to about 110.
  Execution order set by the operator: **M16 media viewer** → a supervisor-hardening bucket (gated
  on a live fire) → a `/product-vision` revisit before M17. The mccc asks went to its inbox.
- *Earlier revisions, 2026-06-15 → 2026-09-25, are in the archive under their original headings.*
