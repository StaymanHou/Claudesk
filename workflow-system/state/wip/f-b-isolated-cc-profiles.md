---
drive_mode: autopilot
---

# Feature: F-b — Isolated CC profiles as Claudesk workspaces

**Workflow:** feature
**State:** spec
**Created:** 2026-09-23
**Entry:** spec (complex feature)
**Source:** `roadmap.md` → Group F → F-b + "F-b decisions — `/util-grill-me`, 2026-09-23" (4 rulings,
settled — do not re-litigate); backlog `SURFACE-2026-09-14-MANAGE-ISOLATED-CC-PROFILES-AS-CLAUDESK-WORKSPACES`.

## Problem Statement

The operator runs several **isolated Claude Code environments** — each a `CLAUDE_CONFIG_DIR`
(`~/.config/claude-<name>/`) with its own `CLAUDE.md`, skills, MCP servers, memory and history.
Claudesk cannot host any of them: it spawns bare `claude` with the ambient config (`~/.claude`),
and its status hook is registered only in `~/.claude/settings.json`, so a profile session would
emit **no hook events** and lose the status dot — the product's core value. Today a profile runs
only in a bare terminal via a `~/.zshrc` wrapper function, and creating one means running the
boilerplate's shell script by hand.

F-b makes a profile a **per-project spawn choice** on the picker row, lets Claudesk **create**
profiles natively through a wizard, and keeps the status channel lit for profile sessions.

**Measured context (grill, 2026-09-23):** 6 config dirs exist; 4 are bound to one directory,
`presentation` spans 3, `original` (a near-empty "vanilla" profile with no workflow system) spans
9. Four directories already run under two profiles. A fresh config dir starts "Not logged in"
despite the shared keychain. Transcripts land under `$CLAUDE_CONFIG_DIR/projects/<slug>/`.

## User Stories

- As the operator, I want to pick which profile a project spawns under, **on the picker row next
  to the model and drive-mode cells**, so the choice sits where the spawn is chosen.
- As the operator, I want to **create a profile from inside Claudesk** with a short wizard that has
  good defaults, so setting one up is no longer a shell script plus `source ~/.zshrc`.
- As the operator, I want to **adopt my existing `~/.config/claude-*` profiles** without recreating
  them, so F-b pays off on day one.
- As the operator, I want a profile session's **status dot, PiP tile, menu-bar entry and time
  analytics** to work exactly as a default session's do — including when I launch that profile
  from a bare terminal.
- As the operator, I want **workflow features never to fire into a profile** that doesn't carry the
  workflow system, so the supervisor or auto-restore never types a slash command a session can't run.

## Acceptance Criteria

**A. The profile model and the picker cell**
1. A **profile** is a named `CLAUDE_CONFIG_DIR`. The built-in profile **"default"** means *no*
   `CLAUDE_CONFIG_DIR` (i.e. `~/.claude`) and cannot be removed.
2. Claudesk keeps a **profile list** (name, config-dir path, provenance: `created` | `adopted`),
   persisted in its own app-data store — **never** in a profile dir or the project repo.
3. Each `projects.json` entry gains an optional profile reference. **Absent = "default"**, and the
   key is omitted from disk, so existing `projects.json` files and users who never touch the cell
   are byte-for-byte unaffected (the `default_model` precedent).
4. Every picker row shows a **profile cell** beside the model and drive-mode cells. The picker
   container may widen to fit (operator, grill). The cell offers every listed profile plus a
   "New profile…" entry that opens the wizard.
5. The cell is **lite-IDE core — NOT gated on `workflow_features_enabled`**. With the gate OFF, the
   row shows model + profile and no drive-mode cell, exactly as today apart from the new cell.
6. A row referencing a profile that is no longer in the list (removed, or its dir is gone)
   **degrades to a visible "missing profile" state and refuses to spawn** with a message naming the
   profile. It must **never** silently fall back to "default" — a silent fallback would run the
   session under the wrong `CLAUDE.md`, permissions and memory.

**B. Spawning under a profile**
7. Opening a workspace whose row names a non-default profile spawns `claude` with
   `CLAUDE_CONFIG_DIR=<dir>` in the PTY env, set through the existing `cc_spawn_env` path. **No
   shell function, no wrapper, no login-shell indirection.**
8. Opening a **default** row spawns with `CLAUDE_CONFIG_DIR` **explicitly removed** from the child
   env, so an inherited value (e.g. `pnpm tauri:dev` launched from a terminal that set it) can
   never silently move a default session into a profile.
9. The row's model cell set to "inherit" inherits **the profile's** default model (CC's own
   resolution — Claudesk passes no `--model`). No code change expected; verified, not assumed.
10. The spawned session's pane footer shows the profile's permission mode (evidence the config dir
    was honored — `settings.json`'s `permissions.defaultMode` is read at spawn).
11. The **unclean-exit `--continue` arm stays ungated and works under a profile** (CC resolves the
    conversation inside `CLAUDE_CONFIG_DIR`). ⚠️ **Changing a row's profile clears that row's
    unclean-exit flag**, so the next open never fires `--continue` into a profile that has no
    conversation for that directory.

**C. Status channel — persistent per-profile hook registration (ruling 3)**
12. On every launch, Claudesk registers its hook into **each listed profile's**
    `<dir>/settings.json`, using the same idempotent, additive, marker-scoped merge M3 uses for
    `~/.claude/settings.json`. A profile the operator hand-edited gets its entry back on the next
    launch.
13. The registration is **additive** — it never removes, reorders or rewrites a hook entry it did
    not install, and it preserves every other key in that `settings.json` (`neo` carries a
    hand-built deny fence and allow-list).
14. A profile session's events light the filmstrip dot, PiP tile and menu-bar row for its workspace
    **identically** to a default session, across all four states (Idle / Running / AwaitingInput /
    BackgroundWork).
15. A profile session launched from a **bare terminal** (e.g. `claude-neo` in Terminal.app) also
    emits events and is captured by time analytics, the same as a bare-terminal default session is
    today.
16. The `~/.claude` registration is **unchanged** — same file, same code path, same behavior.
17. Dev and prod identities each register their own marker into every profile, as they already do
    for `~/.claude`, and never touch each other's entry.

**D. Profile lifecycle**
18. **Create (wizard).** Steps through: name → config dir (default `~/.config/claude-<name>`, the
    boilerplate's convention, so a hand-written `~/.zshrc` function would still line up) →
    **permission mode, a step that is ALWAYS shown** with a pre-selected default (preserves the
    boilerplate's "silence is not a gate" rule) → log retention (`cleanupPeriodDays`, default
    `99999`) → optional default model → confirm. It writes the dir, a `settings.json` with those
    values, and the seeded `CLAUDE.md` guard (never read/write `~/.claude`; check
    `$CLAUDE_CONFIG_DIR` before any config edit). It then adds the profile to the list and registers
    the hook.
19. The wizard **refuses** to create over an existing non-empty dir (it offers "adopt instead") and
    rejects a name that collides with a listed profile.
20. The wizard **writes nothing to `~/.zshrc`** and never edits the existing wrapper functions.
21. **First spawn under a new profile** shows CC's own login flow in the PTY. Claudesk does not
    automate or intercept it.
22. **Adopt.** "Add existing config dir…" lists `~/.config/claude-*` dirs that are not yet listed as
    suggestions and accepts any other dir via a picker. It writes **nothing** into the dir except the
    hook registration (C.12). Nothing is auto-imported.
23. **Remove from Claudesk (keep the dir).** Available for every non-default profile. It
    **unregisters Claudesk's hook** from that dir's `settings.json` (only Claudesk's entries) and
    drops the profile from the list. Rows referencing it go to the missing-profile state (A.6).
24. **Delete.** Offered **only for `created` profiles**. It moves the config dir to the **macOS
    Trash** behind a confirm that names the dir and states that history and memory go with it —
    never `rm -rf`. No separate hook teardown is needed, because the registration goes with the dir.
25. Create / Remove / Delete live together in a **Profiles group in the `⌘,` Settings panel**
    (paired affordances). "New profile…" is also reachable from the picker cell.

**E. Workflow layer — ALWAYS off for non-default profiles (ruling 4)**
26. For a workspace whose profile is not "default", the workflow layer **does not exist**,
    regardless of `workflow_features_enabled`. That covers the supervisor, the skill row, the
    `/session-restore` inject arm, the drive-mode cell and readout, and `CLAUDESK_DRIVE_MODE` in the
    spawn env. This follows the gate's own rule — absent, not greyed.
27. The decision is made in **one function** ("is the workflow layer applicable to this
    workspace?" = gate ON ∧ profile is default) that every one of those consumers reads. No surface
    may re-derive it. Guarded caller-side, per the funnel lesson (`docs/lessons/verify-self-tiers.md`).
28. The OFF-invariant guard still reports **6 arms / 9 subjects** and stays green. Profile-scoped
    suppression is covered by its own test that fails if any listed consumer ignores the function.

**F. Config-dir-aware readers**
29. Every Claudesk computation of a CC transcript path resolves against the workspace's config
    dir, not a hardcoded `~/.claude/projects/<slug>/`. That includes `transcript::transcript_dir_for`
    and the M15 supervisor's consumers. The slug rule itself is unchanged: realpath, with `/` and
    `.` mapped to `-`.

**G. Gate**
30. `pnpm verify:auto` is green. Each new guard is mutation-proven with the mutant confirmed landed
    in executable code. Profile spawn + status are smoke-tested from an **installed `.app`
    launched from Finder** (env/spawn change — the dev build does not reproduce GUI-env behavior),
    deferred to the `/release` gate per the operator's standing preference.

## Out of Scope

- **The boilerplate repo** (`claude-code-wrapper-agent-boilerplate`). It is not absorbed, driven or
  modified. If a config dir needs agent-driven reshaping, the operator opens that repo as an
  ordinary row.
- Running the **same directory under two profiles concurrently**. A row is one dir and one
  profile; `WorkspaceRegistry` stays path-keyed.
- A **hooks off-switch** (per profile or global). `hook_uninstall` has no caller today either.
- **Workflow features in any non-default profile**, ever (ruling 4). This is not deferred.
- A **per-profile dimension in the time-analytics dashboard**.
- Editing a profile's settings after creation (deny fences, MCP, skills, statusline). That is done
  in a CC session, not a Claudesk form.
- Writing, editing or removing `~/.zshrc` wrapper functions.
- Filesystem sandboxing. A profile isolates config only, not the filesystem or auth.
- Cleanup on Claudesk uninstall (no code runs; the registration is harmless because the hook script
  exits 0 unconditionally).

## Technical Constraints

- **Spawn seam:** `cc_spawn_env` / `resolve_cc_spawn_env` (`src-tauri/src/cc_session/mod.rs`) owns
  the child env and already carries the drive-mode and gate signals. `CLAUDE_CONFIG_DIR` goes in
  there, and the drive-mode var must additionally be suppressed for non-default profiles (E.26). ⚠️
  `CC_CMD` stays `"claude"`.
- **Hook seam:** `hook_install::install` / `uninstall` already take the settings path as a
  parameter. `install_on_launch` and `user_settings_path` hardcode `~/.claude/settings.json`, which
  is the only part that generalizes. ⚠️ **"Never delete a hook you did not install"** and
  **provenance, not abstinence** (`arch/claude-substrate.md`) apply to every profile dir, and the
  drift fixture stays.
- **Status routing is by `cwd`** (`WorkspaceRegistry::resolve_cwd`, longest-prefix). A profile
  changes nothing about routing. ⚠️ **Known, inherited cross-talk:** a bare-terminal session
  (default *or* profile) in an open workspace's directory lights that workspace's dot. That is
  today's behavior for default sessions, and profiles just extend it. Not fixed here.
- **Transcript reader:** `transcript::transcript_dir_for(home, project_path)` hardcodes
  `home/.claude/projects`. It needs a config-dir input, and its callers need the workspace's
  profile.
- **Workflow gate:** the seam is `useWorkflowFeaturesEnabled` (15 consumers). E.27's per-workspace
  predicate must compose with it, not bypass it. ⚠️ `arch/workflow-gate.md`: a gated surface must
  **not exist** when off, and the guard bites at the type declaration.
- **Picker cells:** `ProjectModelCell.tsx` (open-string model; do NOT validate) and the drive-mode
  native `<select>` (closed set; bad values fail serde and take the list down). The profile cell is
  a closed set drawn from the profile list. ⚠️ A profile reference that fails to resolve must
  degrade that **row** (A.6), never fail the whole `projects.json` read.
- **Persistence:** `projects.json` (per-row reference) + `AppSettings` / app-data (the profile
  list). Dev/prod identities have separate app-data dirs, so each keeps its own list. The dev
  build's one-time seed from prod applies only to `projects.json`, so profile references in seeded
  rows may be "missing" in dev (A.6 covers it).
- **Trash:** moving to Trash needs a macOS API (e.g. `NSFileManager trashItemAtURL` via an existing
  crate, or `osascript` Finder). ⚠️ If it runs from a `#[command]`, **do not block the main thread**
  (`src-tauri/tests/sync_commands_do_not_block.rs` enforces this).
- **No 3rd-party dependency** beyond the Claude Code CLI itself (already a hard prerequisite).
  `CLAUDE_CONFIG_DIR` and per-dir `settings.json` hooks were probed at CC 2.1.280.
- **Priors applied:**
  - `[PRIOR: set-a-spawn-time-choice-where-the-spawn-is-chosen]` agrees with the ruling: the
    profile cell sits on the picker row.
  - `[PRIOR: gate-substrate-dependent-feature-class-behind-default-off-opt-in]` agrees: the workflow
    class is absent, not greyed, where its substrate is missing (E.26).
  - `[PRIOR: paired-actions-need-paired-affordances]` leaning towards Create / Remove / Delete
    together in one Settings group (D.25). Flag it if that's wrong.

## Open Questions

Small and build-time. None of these gates the spec; each is a Phase-1 probe task in the plan.

- [ ] **Fresh-config-dir first run in a PTY.** Beyond login, what does interactive `claude` show in a
      new config dir: theme picker, folder-trust dialog, `bypassPermissions` warning? Does seeding
      `theme` / `skipDangerousModePermissionPrompt` in the wizard suppress any of them? This decides
      which wizard defaults are worth seeding.
- [ ] **`claude --continue` when the config dir has no conversation for the cwd.** Does it error,
      exit, or start fresh? A.11's flag-clear makes this rare, but the spawn must not hard-fail if
      it happens.
- [ ] **Trash mechanism.** Pick the crate or API. Confirm it does not require an Accessibility/TCC
      grant from an installed build.

## Asked / Assumed

**Asked** (at `/util-grill-me`, 2026-09-23, recorded in `roadmap.md`)
- What a profile is → a `CLAUDE_CONFIG_DIR`, chosen by a picker-row cell beside model and drive
  mode; the picker may widen.
- Who creates profiles → a native wizard with good defaults; the boilerplate is out of scope.
- Hook registration → persistent per profile; register on launch, unregister on remove; no work on
  delete or uninstall; no off-switch.
- Workflow layer in non-default profiles → **always off** (operator hardened this from an
  assumption to a rule).

**Assumed** (defaults taken without asking — correct any of these at spec review)
- **Delete is offered only for `created` profiles**; adopted ones get Remove only. This extends the
  provenance rule: Claudesk trashes only what it made. Cheap to widen later.
- **The profile list lives in Claudesk's app-data** and each dev/prod identity keeps its own. It
  mirrors how `projects.json` is per-identity.
- **A missing profile refuses to spawn** rather than falling back to default (A.6). Silent fallback
  runs the wrong config, and refusing is the safer default.
- **Changing a row's profile clears its unclean-exit flag** (A.11).
- **The default profile explicitly unsets `CLAUDE_CONFIG_DIR`** in the child env (A.8).
- **The wizard's default config dir follows the boilerplate convention** `~/.config/claude-<name>`.
- **The wizard's option set** is name, dir, permission mode, retention, and optional model. Theme,
  TUI and statusline are left to a later CC session, unless the first-run probe shows seeding one
  suppresses a first-run prompt.
- **Profile management lives in the `⌘,` Settings panel** as a Profiles group, with "New profile…"
  also in the picker cell.

## Work Tree
<!-- written by /feature-plan -->

## Current Node
- **Path:** F-b > spec
- **Active scope:** spec review
- **Blocked:** none
- **Unvisited:** plan → build/verify phases → ship → review-quality → finalize
- **Open discoveries:** none

## Discoveries
