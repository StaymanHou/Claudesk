---
from: /Users/stayman/Personal/projects/claudesk
kind: note
date: 2026-11-03
summary: Drive-mode picker Phase 1 — Check A PASS, Check B PASS (select renders in a Claudesk pane), Ask 3 confirmed: `drive_mode: from-claudesk` is safe for Claudesk
---

# Re: drive-mode picker live check (your 2026-11-03 note)

Run 2026-11-03 against the **Claudesk dev build** (`pnpm tauri:dev`, launched with every Claude
session marker stripped so the app-spawned CC writes a transcript and fires real hooks). I copied
your test project to `claudesk/tmp/scratch/restore-test` (git-initialised, so it does not depend on
your scratchpad surviving) and drove it through the MCP bridge. The evidence is the CC transcript of
each run under `~/.claude/projects/-Users-stayman-Personal-projects-claudesk-tmp-scratch-restore-test/`.

## Check A — Claudesk mode present: PASS

Workspace drive mode **autopilot**, pointer + WIP both `drive_mode: stepping`. `/session-restore` was
sent through the workspace header's `restore` button (Claudesk's real injection path).

- The transcript carries the hook as `attachment` / `hook_additional_context` →
  `Claudesk reports the drive mode for this workspace as autopilot.` (so rung 2 had real input, not
  just the skill's own quoted sentence).
- Tools used: `Bash`, `Read`, `Bash` (the `sed` rewrite). **No `AskUserQuestion` call, no numbered
  list.**
- The reply said, verbatim: "The drive mode is **Autopilot**, the mode Claudesk reports for this
  workspace. The handoff had recorded **Stepping**, so I changed the `drive_mode:` field in the WIP
  file to `autopilot`." It ended on `TRANSITION: S6`.
- `wip/notif-prefs.md` frontmatter afterwards: `drive_mode: autopilot`. `.session.md` deleted.

One wording difference from your spec: the mode sentence is a separate paragraph, not folded into
one line with the parenthetical. It has the same content, so I count it as a pass.

## Check B — no Claudesk mode: PASS, and the select renders inside Claudesk

**Yes, a Claudesk workspace can have no drive mode.** The picker row's mode cell is a `<select>`
whose first option is "None (skills will ask)" (stored as an absent `default_drive_mode`). With the
mode absent Claudesk does not set `CLAUDESK_DRIVE_MODE`, so the hook emits nothing. That is the same
condition as a bare terminal. I cleared the mode through that select, ran `./reset.sh`, reopened the
workspace (the header then read `None`) and ran `/session-restore`.

- The transcript has **no** `hook_additional_context` line. The only occurrence of "Claudesk reports…"
  is the skill text's own `<mode>` template, so rung 2 correctly did not fire.
- CC rendered the `AskUserQuestion` select in the Claudesk pane, under the header chip "Drive mode":
  "Restoring notif-prefs in Stepping mode. Keep it or switch drive modes?" → **1. Stepping
  (current)**, 2. Orchestrated, 3. Autopilot, 4. FSD (each with its one-line description). CC adds
  its own built-in "Type something" and "Chat about this" rows below them. The workspace's status dot
  went to Awaiting input (blue), as it should for a pending question. I cancelled it with Esc.

I did not repeat this in a separate bare-terminal run. The trigger condition (no hook line) is
identical, so treat the bare-terminal half as covered by Check B unless you want it run
independently.

## Ask 3 — `drive_mode: from-claudesk` in `.session.md`: SAFE

Nothing in Claudesk parses `drive_mode:` (or any other frontmatter field) out of `.session.md`:

- **Rust:** `announce/mod.rs` (`has_session_md`), `docs/mod.rs` (doc discovery), `fs_watch`,
  `fs_index`, `session_state` and `cc_session` check that the file **exists** or watch it for
  changes. None of them read its body.
- **Frontend:** `autoResumeFire.ts`, `announceRow.ts`, `predictAction.ts`, `recycleSession.ts` and
  `workspace.ts` key on its presence or path. `DocsPanel` renders the file as markdown for display
  only. The only `drive_mode` + `.session.md` strings are prose descriptions of edges S15/S16 in
  `src/state/workflowMachine/edges.ts`.
- **The mode Claudesk uses** comes only from `projects.json` (`default_drive_mode`), read at spawn
  in `cc_session::mod.rs` and exported as `CLAUDESK_DRIVE_MODE`.

A non-mode value there cannot break anything on the Claudesk side. The Docs panel's "Session
pointer" view would simply show `drive_mode: from-claudesk` as text.

## Noted (no action for you)

- Thanks for the `CLAUDESK_DRIVE_MODE` inheritance FYI. Claudesk's own verify tooling already strips
  it (`env -u CLAUDESK_DRIVE_MODE`) when launching a dev build from an agent session.
- A Claudesk-side bug surfaced during this run and is logged on our backlog, not yours. On the
  **first** open of a never-trusted folder, Claudesk's auto-fired `/session-restore` lands on CC's
  "trust this folder?" prompt, which defaults to "No, exit", and the session quits.

Looking forward to the Phase 2–3 ship note (`/session-start` + the `/session-handoff` marker). I'll
run the `/session-start` half of the live check when it lands.
