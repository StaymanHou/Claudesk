---
drive_mode: autopilot
---

# Feature: F-b — Isolated CC profiles as Claudesk workspaces

**Workflow:** feature
**State:** verify-codify (phase 3 complete)
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

*Problem statement unchanged (2026-09-24, Phase 2 F9b re-entry) — the failure was a pre-existing inherited-env leak exposed by the live check, not a change in what F-b is for.*

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
    `99999`) → optional default model → **theme** and **status line**, both pre-filled from the
    **default profile's current values, read at wizard time** (operator, spec review 2026-09-23)
    → **mouse tracking** and **copy-on-select**, both **pre-set to OFF** (operator) → confirm. It
    writes the dir, the config files holding those values, and the seeded `CLAUDE.md` guard (never
    read/write `~/.claude`; check `$CLAUDE_CONFIG_DIR` before any config edit). It then adds the
    profile to the list and registers the hook.
    - **Where each value lives (measured in the CC 2.1.281 binary, 2026-09-23):**
      - **Status line** → `settings.json` `statusLine`, copied **verbatim** from
        `~/.claude/settings.json` (today `{"type":"command","command":"npx -y ccstatusline@latest"}`).
      - **Mouse tracking** has no settings key. It is the env var `CLAUDE_CODE_DISABLE_MOUSE`, so
        OFF = `settings.json` `env.CLAUDE_CODE_DISABLE_MOUSE = "1"`. That keeps it inside the
        profile, not in Claudesk's spawn env, so it also holds in a bare terminal.
      - **Copy-on-select** → the **global-config** key `copyOnSelect` (default `true`), which lives
        in `<dir>/.claude.json`, not `settings.json`. OFF = `copyOnSelect: false`.
      - **Theme** → a global-config key (built-in default `"dark"`). The default profile sets none,
        so it resolves to `"dark"`. The wizard writes the **resolved** value explicitly rather than
        leaving it unset. ✅ **RESOLVED by probe P1.1 (1): `theme` goes in `settings.json`.** A
        `theme` in `.claude.json` is **stripped at startup**. ⚠️ **Do NOT seed
        `hasCompletedOnboarding`**: it also skips CC's own login step (D.21). The cost is one Enter on
        CC's theme picker, which is already on Dark.
    - ⚠️ **"Default to the default profile" is a snapshot at creation, not a live link.** Changing
      `~/.claude` later does not propagate to profiles that already exist.
    - ⚠️ A copied status-line command that references a `~/.claude/…` path would point back into
      the default profile. The wizard shows the copied command so the operator can see it. Today's
      value (`npx ccstatusline`) is path-free.
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

- [x] **Fresh-config-dir first run in a PTY.** Beyond login, what does interactive `claude` show in a
      new config dir: theme picker, folder-trust dialog, `bypassPermissions` warning? Does seeding
      `theme` / `skipDangerousModePermissionPrompt` in the wizard suppress any of them? Also: does a
      **pre-seeded `<dir>/.claude.json`** (holding only `copyOnSelect` + `theme`) survive CC's first
      run, with CC merging its defaults in rather than overwriting? And is `theme` honored from
      `settings.json` (where the existing profiles put it) or only from `.claude.json`? Verify both by
      reading the files back after a first run, not by trusting the write.
- [x] **`claude --continue` when the config dir has no conversation for the cwd.** Does it error,
      exit, or start fresh? A.11's flag-clear makes this rare, but the spawn must not hard-fail if
      it happens.
- [x] **Trash mechanism.** Pick the crate or API. Confirm it does not require an Accessibility/TCC
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
- ~~The wizard's option set excludes theme and status line.~~ **Corrected at spec review
  (operator):** the wizard includes theme + status line (pre-filled from the default profile) and
  mouse tracking + copy-on-select (default OFF). **`tui` is still NOT a wizard step.** CC's own
  default applies, and the operator can set it in a session. (The default profile has
  `tui: "default"`, and 4 of the 5 existing profiles use `"fullscreen"`, so there's no single value
  worth assuming.)
- **Profile management lives in the `⌘,` Settings panel** as a Profiles group, with "New profile…"
  also in the picker cell.

## Plan notes (feature-plan, 2026-09-23)

- **No live `wbs.md`.** M14's remainder is archived, and F-b is a single feature, not a WBS
  (ruling). Nothing to align phasing against.
- **Backlog:** no `high` item conflicts. Adjacent, and not to act on:
  `SURFACE-2026-09-14-SUPERVISOR-NEVER-OBSERVED-FIRING-IN-A-LIVE-SESSION`. F.29 changes the
  supervisor's transcript path input, so Phase 3 must leave the default-profile path
  byte-identical. ⚠️ The deleted-export lesson (`SURFACE-2026-08-25-A-DELETED-EXPORT-…`, high)
  binds every phase that renames a TS export: **never split an export deletion from its consumer
  migration across phases, and boot-smoke before trusting a live read.**
- **Why this phase order:**
  - The **workflow-off funnel (Phase 2) lands BEFORE any UI can open a profile workspace**
    (Phase 4). So there is never a build in which the supervisor can fire into a profile.
  - **Hooks (Phase 3) land before the picker UI**, so the first time the operator opens a profile
    from the picker, the dot is already lit. That avoids the "looks like it worked, silently dark"
    failure the roadmap names.
- **No 3rd-party dependency** beyond the `claude` CLI (probed at CC 2.1.280/281).

## Work Tree

- [x] Phase 1: Profile store + spawn under a profile (backend) + first-run probes  <!-- status: done 2026-09-24 -->
  **Observable outcomes:**
  - CLI: `cargo test --manifest-path src-tauri/Cargo.toml profile` → exit 0. The tests cover:
    - a `projects.json` with no `profile` key round-trips byte-identical
    - an unknown profile reference degrades that ONE row, and the list read still succeeds
    - `cc_spawn_env` yields `CLAUDE_CONFIG_DIR=<dir>` for a profile row, and yields a **removal**
      for a default row
  - CLI: under `pnpm tauri:dev` launched with `CLAUDE_CONFIG_DIR=/tmp/…/bogus` exported, opening a
    **default** row → `ps eww -p <claude child pid>` output does **not** contain `CLAUDE_CONFIG_DIR`
    (A.8).
  - CLI: a row pointed (via IPC) at a scratch adopted profile → `ps eww` of the child contains
    `CLAUDE_CONFIG_DIR=<scratch dir>`, and the child argv is exactly today's (no wrapper, `claude`
    first) (B.7).
  - CLI: a row pointed at a profile id absent from the list → the spawn IPC returns an error naming
    the profile, and `pgrep -P <app pid> claude` finds no new child (A.6).
  - CLI: setting a row's profile when its unclean-exit flag is set → `session-state.json` no longer
    carries that project's key (B.11).
  - CLI: the probe notes file `tmp/scratch/f-b-probes.md` exists and answers the three spec Open
    Questions, each with the command run and the output observed.
  - [x] P1.1 **Probes (spec Open Questions 1–3)** — ✅ answered, see Discoveries + `tmp/scratch/f-b-probes.md`. — scratch config dirs in the session scratchpad
    only, never a real profile. Each answer is recorded in the WIP file's Discoveries and in the
    probe notes.  <!-- status: done -->
    - **(1) Fresh-dir first run in a PTY:** what shows before and after login. Test whether
      pre-seeded `.claude.json` (`copyOnSelect: false`, `theme`) survives the first run. Test whether
      `theme` is honored from `settings.json` or `.claude.json`. Read the files back after the run.
      ⚠️ Login is operator-only, so the post-login half becomes a verify-human check.
    - **(2)** `claude --continue` in a config dir with no conversation for the cwd: does it error,
      exit, or start fresh?
    - **(3) Trash mechanism:** pick the crate or API. It must work from a Finder-launched build
      without a TCC grant.
  - [x] P1.2 **Profile list store.** ⚠️ **As built: its own `profiles.json`, NOT a field of `AppSettings`** (deviation from this line's original text). `AppSettings` deserializes in one shot, so one bad entry there would fail every setting; `config_store/profiles.rs` parses per entry. `Profile { name, config_dir, provenance }` — `name` IS the id. Per identity. Read degrades per entry: a malformed
    entry is dropped with a log line and never fails the whole settings read.  <!-- status: done -->
  - [x] P1.3 **`Project.profile: Option<String>`** (serde default, `skip_serializing_if`). It follows
    the `default_model` precedent, and `Project`'s field-docs guard stays green. ⚠️ An unresolvable
    reference must NOT fail serde; resolve it after reading.  <!-- status: done -->
  - [x] P1.4 **Spawn.** (+ probe (2): the argv `--continue` arm degrades to a fresh spawn when `<config_root>/projects/<slug>/` holds no `*.jsonl` — CC otherwise prints "No conversation found to continue" and EXITS.) Extend `resolve_cc_spawn_env` / `cc_spawn_env` with a resolved config
    dir, set `CLAUDE_CONFIG_DIR`, and add env **removal** to `spawn_argv`'s `CommandBuilder` for
    the default profile (`env_remove`). A missing profile → a typed `CcError` before any PTY opens.
    `spawn_shell` (the terminal panel) is **unchanged**: it is a login shell, not CC.  <!-- status: done -->
  - [x] P1.5 **Commands.** `profiles_list`, `profile_adopt(dir)` (store-only in this phase; hooks
    arrive in Phase 3), and `set_project_profile(path, id|null)`. The last one clears the row's
    unclean-exit flag through `key_for()`. Register them in `lib.rs`. ⚠️
    `sync_commands_do_not_block.rs` must stay green.  <!-- status: done -->
  - [x] verify-auto  <!-- status: done — `pnpm verify:auto` EXIT=0 (39s; 3000 FE / 943 Rust lib). First run caught my own source guard broken by a `cargo fmt` trailing-comma reflow; fixed by normalizing `, )`. The env_remove guard was mutation-proven 3/3 (drop the loop / shell gets the removal / CC passes empty), with each mutant confirmed landed -->
  - [x] verify-self  <!-- status: done — live, `pnpm tauri:dev` launched with a bogus CLAUDE_CONFIG_DIR exported (app PID carried it: positive control) -->
    - [x] A.8 default row → CC child `ps eww` has NO `CLAUDE_CONFIG_DIR` (it shows `CLAUDESK_DRIVE_MODE`, so env is visible — not an instrument gap)  <!-- status: PASS -->
    - [x] B.7 profile row (adopted scratch dir) → child has `CLAUDE_CONFIG_DIR=<scratch dir>`; argv identical to the default row's (`claude --permission-mode bypassPermissions`)  <!-- status: PASS -->
    - [x] B.11 `set_project_profile` change → the row's `session-state.json` key is gone  <!-- status: PASS -->
    - [x] A.6 row → removed profile → `cc_spawn` returns "…profile \"scratch\", which is no longer in Claudesk's profile list…"; child count unchanged (2); the refused spawn set no unclean flag  <!-- status: PASS -->
    - [x] Probe notes `tmp/scratch/f-b-probes.md` answer all three questions  <!-- status: PASS -->
  - [x] verify-human  <!-- status: done — boundary: modifies the existing `cc_spawn` path; capture = verify-self's live `ps eww` evidence + the 2026-09-24 argv re-check -->
    - [x] P1.verify-human.1 Operator ruling: `--permission-mode` argv vs a profile's `defaultMode` → **RULED 2026-09-23: omit `--permission-mode` for non-default profiles; the profile's `settings.json` governs. Default profile keeps the app-global flag.** ✅ **Built 2026-09-24 (`fc156ad`)**: `spawn_permission_mode` + `build_cc_argv(Option<…>)`, unit-tested + mutation-proven (a profile getting `Some(app_mode)` fails the test, landed). **Caller proven live**: default row → `claude --permission-mode bypassPermissions`, profile row → bare `claude` + `CLAUDE_CONFIG_DIR`. ⚠️ B.10's *footer* read was not done (the pane is not mounted on an IPC spawn) — folded into Phase 5 verify-human.  <!-- status: done -->
    - [ ] P1.verify-human.2 Operator logs in once under a scratch profile; agent reads back `.claude.json` / `settings.json` (probe (1) post-login half). **DEFERRED by operator 2026-09-23 to Phase 5 verify-human** (end-to-end create + login).  <!-- status: done (deferred) -->
  - [x] verify-codify  <!-- status: done — boundary = `SessionRegistry::spawn` (the `cc_spawn` path). Added: `compose_command` extracted so the child env is asserted as a VALUE (`get_env`: inherited CLAUDE_CONFIG_DIR stripped for default, profile value wins, shell untouched); `profile_spawn_caller_orders_its_profile_decisions` pins the CALLER (profile resolved before the flag consume and the PTY spawn; --continue guard after the arm, before the spawn; spawn gets `spawn_permission_mode(…)`). Each mutation-proven individually, all 3 compiled + landed + failed. verify:auto EXIT=0 (39s; 3000 FE / 947 Rust) -->

- [x] Phase 2: Workflow-layer applicability funnel — ALWAYS off for non-default profiles  <!-- status: done 2026-09-24 -->
  **Relevance check (before Phase 2):**
  - Requester still needs this: yes — the operator ruled "always off" at spec review.
  - Requirements unchanged: yes. Phase 1's ruling (no `--permission-mode` for profiles) touches the spawn argv only; ruling 4 is as written.
  - Solution still feasible: yes. `resolve_profile_spawn_env` already receives `profile_dir`, so the backend half is a one-input change.
  - No superior alternative discovered: yes.
  **Verdict:** proceed
  **Observable outcomes:**
  - CLI: `pnpm vitest run workflowApplicable` → exit 0. The test drives each consumer (supervisor,
    skill row, `/session-restore` inject arm, drive-mode cell, drive-mode readout) with a
    non-default-profile workspace and gate ON, and asserts each is **absent**. It asserts **by
    consumer identity, not by count** (lesson entry 15). Each consumer is mutation-proven
    **individually**: bypass the funnel in one consumer and that test fails.
  - CLI: `cargo test workflow_applicable` → exit 0. With gate ON and a non-default profile,
    `resolve_cc_spawn_env(...).env` contains **no** `CLAUDESK_DRIVE_MODE`, and `drive_mode` is
    `None`. The backend `arm_available` matches the frontend `armAvailable` for the inject arm.
  - CLI: `pnpm vitest run offInvariantGuard` → still reports 6 arms / 9 subjects, green.
  - Browser (MCP bridge, gate ON): a workspace opened on a row set to a scratch profile →
    `document.querySelector('[data-testid^="skill-row"]') === null`, and the drive-mode readout is
    absent. The same query on a default workspace → present (positive control).
  - CLI: `ps eww` of that profile workspace's `claude` child → no `CLAUDESK_DRIVE_MODE`. The default
    workspace's child → present when a mode is stored (positive control).
  - [x] P2.1 **One predicate, both sides.**
    - TS: `isWorkflowApplicable(gateOn, profileId)` is the single export, composed with
      `useWorkflowFeaturesEnabled` (not a bypass of it).
    - Rust: the mirror sits in the spawn-env resolver and in `announce::arm_available`.
    - Both key on "profile is default", never on a label or path.  <!-- status: done — ✅ As built: Rust `profiles::{is_default_reference, workflow_applicable}`; TS `state/workflowApplicable.ts` (`undefined` = unknown → fail closed). Workspace profile = `useWorkspaceProfile` (stored row via new `project_get_profile`, then the LIVE session via new `cc_session_profile` — a respawn re-reads projects.json). -->
  - [x] P2.2 **Route every consumer through it:**
    - `workspaceSupervisor.ts`
    - `skillButtons.ts` / Workspace skill row
    - `announceRow.ts` `armAvailable` (inject arm only — ⚠️ the **argv `--continue` arm stays
      ungated**, per "THE GATE APPLIES PER ARM")
    - `workspaceDriveMode.ts` + the picker drive-mode cell
    - `panelHost.ts` / `RightPanelHost.tsx` for the gated docs panel
    - Grep every `useWorkflowFeaturesEnabled` consumer (15 today) and classify each one:
      per-workspace, or app-wide (Settings / the invite stay app-wide).  <!-- status: done — ✅ Only FIVE modules call the hook; everything downstream takes the gate as a param. Routed: Workspace.tsx (both calls), RightPanelHost (new REQUIRED `workspaceProfile` prop), ProjectModelCell (`profile` prop), ProjectPicker (raw `gateOn` + per-row predicate). App.tsx stays app-wide (invite). Backend: spawn env (`resolve_profile_spawn_env` runs the gate through the predicate) + `announce_actions` (per-project gate). -->
  - [x] P2.3 **Caller-side guard.** Every per-workspace gate consumer must call the funnel, with
    the consumer list derived from source (a reverse guard — lesson entry 13: a one-directional
    guard cannot see an omission).  <!-- status: done — ✅ `workflowApplicableGuard.test.ts` (forward: direct-wrap shape at every call; row-scoped binding; REVERSE: allowlist entries exist and still call). Mutation-proven 4/4 individually (unwrap 2nd call / unwrap 1st call [also fails the live test] / bare picker read / stale allowlist). -->
  - [x] verify-auto  <!-- status: done — EXIT=0 (40s; 3018 FE / 951 Rust; OFF-invariant guard still 6 arms / 9 subjects). Two first-run failures fixed in place: (1) React Compiler `preserve-manual-memoization` on ProjectModelCell — passing a prop into the opaque `isWorkflowApplicable(...)` call widened its hand-memoized callbacks' inferred deps (bisected: inline `gateOn && profile === null` lints clean, the call does not); fixed with `useMemo`, and the guard generalized to the BOUND form (`const x = useWorkflowFeaturesEnabled()`, every read routed, `useMemo` deps array accepted) — re-mutation-proven 5/5. (2) clippy doc-lazy-continuation: `SpawnProfile` had been inserted between `resolve_spawn_profile`'s doc and its fn -->
  - [x] verify-self  <!-- status: done — 2/2 PASS (P2.verify-self.2 after one F9b) -->
    - [x] P2.verify-self.1 Browser (gate ON, both opened via the app's own `__seedWorkspace` open path): attributed PER WORKSPACE — scratch-b (profile `scratch`) has NO skill row / drive-mode readout / supervisor readout; scratch-a (default, same stored `autopilot`) has all three (positive control)  <!-- status: PASS -->
    - [x] P2.verify-self.2 CLI `ps eww` of the profile workspace's CC child → no `CLAUDESK_DRIVE_MODE`  <!-- status: PASS after F9b (2026-09-24) — first run FAILED on an INHERITED var (pre-existing leak, see SURFACE-2026-09-24-SPAWNED-CC-INHERITS-A-PARENT-CLAUDESK-DRIVE-MODE). Fix: `CC_SPAWN_ENV_REMOVE` (CLAUDE_CONFIG_DIR + CLAUDESK_DRIVE_MODE) and `SHELL_SPAWN_ENV_REMOVE` (CLAUDESK_DRIVE_MODE), value-tested + mutation-proven 2/2. Re-verify, app launched with the parent var still inherited (`ps eww` of app PID shows it): profile child → none; default child → `autopilot` (now necessarily Claudesk's OWN gated value — the positive control the first run could not give) -->
  - [x] verify-human  <!-- status: done — boundary (Workspace header, picker cells, cc_spawn env); capture = verify-self's live `ps eww` + per-workspace DOM attribution -->
    - [x] P2.verify-human.1 Operator ruling: keep the pre-existing inherited-`CLAUDESK_DRIVE_MODE` fix (`decde09`) inside F-b, or split it into its own task → **KEEP (operator 2026-09-24)**; named as a separate item in the ship summary  <!-- status: done -->
  - [x] verify-codify  <!-- status: done — boundary = Workspace UI + picker cell + `SessionRegistry::spawn`. Already covering: `workflowApplicableLive.test.tsx` (Workspace live mount, per surface by identity, positive control), backend spawn-env / announce / env-removal tests, the caller guard. Added: `projectModelCellProfileRender.test.tsx` (gate mocked ON; default row = mode line, profile row = none — positive control) and two CALLER pins in `profile_spawn_caller_orders_its_profile_decisions` (env resolver receives `profile.as_ref()`; the session records `profile.map(|p| p.name)`). Mutation-proven 3/3 individually, all compiled + landed. verify:auto EXIT=0 (39s; 3020 FE / 952 Rust) -->

- [x] Phase 3: Per-profile hook registration + config-dir-aware transcript reader  <!-- status: done 2026-09-24 -->
  **Relevance check (before Phase 3):**
  - Requester still needs this: yes. The operator's core value is the status dot, and a profile session is still dark.
  - Requirements unchanged: yes (ruling 3, persistent per-profile registration). Phase 2's env-strip fix does not touch hooks.
  - Solution still feasible: yes. `hook_install::{install, uninstall}` already take the settings path; `transcript_dir_for` already takes a config root (Phase 1).
  - No superior alternative discovered: yes. `--settings` per-spawn injection was ruled out at the grill for bare-terminal visibility.
  **Verdict:** proceed
  **Observable outcomes:**
  - CLI: after a launch with a scratch profile listed →
    `jq '.hooks | to_entries[] | .value[].hooks[].command' <scratch>/settings.json` contains
    exactly one Claudesk marker entry per registered event. Also
    `jq 'del(.hooks)' <scratch>/settings.json` is byte-identical to the pre-launch copy when a
    fixture carries a deny fence, an allow-list and a foreign hook (C.13).
  - CLI: a second launch → `shasum <scratch>/settings.json` is unchanged (idempotent).
  - CLI: hand-delete Claudesk's entry, relaunch → the entry is back (self-healing).
  - CLI: `profile_remove(id)` → the marker entry is gone, the foreign hook is still present, and
    the file otherwise matches its pre-registration copy (C/D.23).
  - CLI: `shasum ~/.claude/settings.json` taken around each profile add/remove **toggle** (not
    around a relaunch — `arch.md`) → unchanged (C.16).
  - Browser (MCP bridge): in a profile workspace, send a prompt → the filmstrip tile's status
    class goes to `running`, then `idle` after the turn (C.14). Positive control: the same flow on a
    default workspace.
  - CLI: `CLAUDE_CONFIG_DIR=<scratch> claude -p "say ok"` from a bare shell in an open
    workspace's dir → the Claudesk status log records the event for that workspace, and a
    time-analytics row exists for that session (C.15).
  - CLI: `cargo test transcript` → exit 0. With config dir `None`, `transcript_dir_for` resolves
    the path byte-identical to today's; with `Some(dir)` it resolves `dir/projects/<slug>` (F.29).
  - [x] P3.1 **Generalize `hook_install`.** Replace `user_settings_path()` with a list of targets
    (`~/.claude/settings.json` plus each profile's `settings.json`). `install_on_launch` iterates
    them. A failure on one profile is reported and does **not** abort the others or the
    `~/.claude` install. ⚠️ **Provenance:** remove only Claudesk's marker, never a foreign hook.
    Keep the drift fixture.  <!-- status: done — ✅ `install_on_launch` keeps the `~/.claude` install as its RESULT, then `install_into_profiles(&listed_profiles(app), …)` (per-profile failures emitted as `hook-install-error`, never abort the rest, never mask the default). A missing profile dir is skipped, never recreated. Tests: additive + every foreign key preserved (neo-shaped fixture), idempotent + self-healing, missing dir, dev/prod independence. ⚠️ The `is_dir` guards in install/unregister are EQUIVALENT mutants (the write fails on a missing parent; uninstall returns Ok on a missing file) — kept for the message, not load-bearing. -->
  - [x] P3.2 **`profile_adopt` registers; `profile_remove` unregisters, then drops the entry.** If
    the dir is gone, remove still drops the entry and just logs the skipped unregister.  <!-- status: done — ✅ Extracted `adopt_registered` (rollback on registration failure) + `remove_unregistered` (unregister first; entry KEPT if it fails; a deleted dir still drops). Mutation-proven 2/2 (no rollback / drop-before-unregister). -->
  - [x] P3.3 **`transcript_dir_for(config_root, project_path)`.** The root is `~/.claude` for
    default and the profile dir otherwise. Thread the workspace's profile through
    `transcript/commands.rs` and the supervisor's callers. The default path must stay
    byte-identical.  <!-- status: done — ✅ Signature landed in Phase 1; `transcript_tail` now resolves the root via `config_root_for_project` (default → `~/.claude`, listed → its dir, unlisted/unreadable → None → empty tail, never a guess at `~/.claude`). Default path byte-identical (`transcript_dir_is_under_dot_claude_projects`). -->
  - [x] verify-auto  <!-- status: done — EXIT=0 (50s; 3020 FE / 965 Rust), first run -->
  - [x] verify-self  <!-- status: done — live, orchestrator-driven (the bridge does not reach subagents); scratch profile fixture = neo-shaped (deny fence, allow-list, statusline, a FOREIGN Stop hook) -->
    - [x] P3.vs.1 Registration (after adopt): exactly 1 Claudesk entry for each of the 10 events; `del(.hooks)` IDENTICAL to pre; the foreign group IDENTICAL  <!-- status: PASS -->
    - [x] P3.vs.2 Self-heal: hand-deleted all our entries → launch 2 restored all 10  <!-- status: PASS -->
    - [x] P3.vs.3 Idempotent: launch 3 left the file byte-identical to launch 2 (`a26d8a8d…`)  <!-- status: PASS -->
    - [x] P3.vs.4 `profile_remove`: 0 entries left, foreign kept, file == pre-registration (parsed), dir kept, list empty  <!-- status: PASS -->
    - [x] P3.vs.5 `~/.claude/settings.json` hash unchanged across the adopt toggle AND the remove toggle (`46571fbf…`)  <!-- status: PASS -->
    - [x] P3.vs.6 In-app profile session (scratch-c, child `claude --model opus`, no --permission-mode): SessionStart → ws-4; injected prompt → UserPromptSubmit mapped=running emitted → the scratch-c filmstrip tile read "Running". `cc_session_profile` reported "scratch" for both profile sessions. (Needed `hasCompletedOnboarding` + trust seeded in the scratch profile's `.claude.json`; the profile is not logged in, so no real turn — the channel, not the model, is what is under test.)  <!-- status: PASS -->
    - [x] P3.vs.7 Bare-terminal `CLAUDE_CONFIG_DIR=<profile> claude -p` in scratch-b → SessionStart / UserPromptSubmit (running, emitted) / SessionEnd, all resolved to ws-1. NEGATIVE CONTROL after `profile_remove`: the same command → 0 events. ⚠️ Time-analytics capture N/A in dev (`time_tracking_enabled: false`).  <!-- status: PASS -->
    - [x] P3.vs.8 `cargo test transcript` (verify-auto run)  <!-- status: PASS -->
  - [x] verify-human  <!-- status: done — boundary (launch hook install, transcript_tail); capture = verify-self's jq/shasum/status-log evidence; the one agent-unreachable check deferred to Phase 4 -->
    - [ ] P3.verify-human.1 Operator opens a workspace under a real (logged-in) adopted profile and confirms the dot tracks idle → running → awaiting-input → idle across a real turn. [UNVERIFIED by agent — the scratch profile is not logged in, so only `running` was reachable.] **DEFERRED by operator 2026-09-24 to Phase 4 verify-human**, run against `~/.config/claude-original-dev` (created 2026-09-24 at the operator's request — a CONFIG-ONLY copy of `claude-original`; needs one `/login`).  <!-- status: done (deferred) -->
  - [x] verify-codify  <!-- status: done — boundary = `install_on_launch` + the `profile_adopt` / `profile_remove` / `transcript_tail` commands. Bodies already unit-tested at build (additive/foreign-preserving, idempotent, self-heal, missing dir, dev/prod independence, adopt rollback, unregister-first, config root). Added `profile_callers_route_through_the_tested_bodies`: pins the four AppHandle CALLERS (the ~/.claude install is still made AND is the returned result; the profile loop runs; adopt/remove route through the tested bodies; transcript_tail resolves the config root). Mutation-proven 4/4 individually — one first-draft mutant (M4) did not compile and was rewritten until it did. ⚠️ A snapshot-name collision (three `commands.rs`) destroyed the uncommitted test mid-mutation; recovered via `git show HEAD` + re-add, and banked in `.claude/memory/git-checkout-no-ops-on-untracked-file.md`. verify:auto EXIT=0 (46s; 3020 FE / 966 Rust) -->

- [ ] Phase 4: Picker profile cell + Settings "Profiles" group (adopt / remove / missing state)  <!-- status: NOT-STARTED; depends on Phases 2, 3 -->
  **Relevance check (before Phase 4):**
  - Requester still needs this: yes. It is the first operator-visible surface for everything Phases 1–3 built.
  - Requirements unchanged: yes, plus two recorded additions. The Settings permission control needs a one-line hint (the 2026-09-23 ruling). Verify-human now also carries the deferred P3.verify-human.1, run on `claude-original-dev`.
  - Solution still feasible: yes. `profiles_list` / `profile_adopt` / `profile_remove` / `set_project_profile` all exist and are live-proven.
  - No superior alternative discovered: yes.
  **Verdict:** proceed
  **Observable outcomes:**
  - Browser (MCP bridge): every picker row has `[data-testid="project-profile-cell"]` next to the
    model and drive-mode cells. Its options are "default" plus each listed profile plus
    "New profile…". The picker container is widened, and no cell text is truncated (checked by
    `scrollWidth <= clientWidth` on each cell).
  - Browser: with the gate **OFF**, the profile cell is present and the drive-mode cell is absent
    (A.5).
  - Browser: selecting a profile on a row, then reopening the picker, shows the value persisted;
    `jq '.projects[] | select(.project_path==…) .profile' projects.json` equals the id.
  - Browser: a row whose profile id is not in the list renders a `missing-profile` state naming the
    profile. Clicking the row shows a refusal message and **no** workspace opens (A.6).
  - Browser: in `⌘,` Settings, `[data-testid="settings-group-profiles"]` lists the profiles, each
    with a Remove button, plus "Add existing config dir…". The add dialog suggests the
    `~/.config/claude-*` dirs not yet listed.
  - CLI: `jq` shows the profile list in the app-data settings file updated after an add or remove.
  - [x] P4.1 **`ProjectProfileCell`.** A closed-set native `<select>`, per the drive-mode
    precedent (not the open-string model cell). Commit through `commitCellValue`. Widen the picker
    container. ⚠️ **No `var(--token)`** — there is no token layer; copy the hex values from the
    sibling cells. ⚠️ CSS↔component coupling is guarded in both directions for picker cells; extend
    it to this cell.  <!-- status: done — ✅ New `profile` cell after `model` in `PICKER_ROW_CELLS` (exact-order pins updated with triage); closed-set native `<select>` via `commitCellValue`; missing → `is-failed` + a disabled '(missing)' option so the select never silently shows default; ungated (module never reads the gate — asserted). Picker widened 640 → 760px (both rules). CSS↔component guard both directions in `projectProfileCellRender.test.tsx`. Profiles read ONCE per picker + re-read on `profiles-changed` (new backend event from adopt/remove). -->
  - [x] P4.2 **Missing-profile row state + open refusal** (frontend reflects the Phase 1 backend
    error).  <!-- status: done — ✅ `missingProfileRefusal` (pure, tested) runs in `handleOpenRecent` BEFORE `record_open` / `onOpen` — ordering pinned + mutation-proven (refusal moved after onOpen → fails). No workspace is minted. -->
  - [x] P4.3 **Settings "Profiles" group:** list, Remove (for every non-default profile), and
    "Add existing config dir…" (suggestions plus a folder picker via `tauri-plugin-dialog`). Delete
    and New arrive in Phase 5. ⚠️ **Per the 2026-09-23 ruling, the app-global permission-mode setting does NOT apply to profile workspaces** — the Settings permission control must say so (a one-line hint), or it reads as broken.  <!-- status: done — ✅ `ProfilesSettings.tsx` in a new `profiles` group directly after `claude-code` (group-order pin updated with triage; titles five → six); built-in default listed without a Remove; Remove per listed profile; suggestions from new `profile_adoption_suggestions` (`~/.config/claude-*` not yet listed) + 'Choose folder…' (dialog). Live-mount test drives the real clicks → `profile_remove {name}` / `profile_adopt {configDir}` by value. Permission-mode hint under the Claude Code control (`settings-permission-mode-profile-note`). -->
  - [x] verify-auto  <!-- status: done — EXIT=0 (44s; 3042 FE / 967 Rust) on the code committed as 7132586 (the run preceded the commit; nothing but the WIP changed between). Two in-build lint findings fixed first: React Compiler `set-state-in-effect` in ProfilesSettings (reload → version counter + inline effect) -->
  - [x] verify-self  <!-- status: done — live, orchestrator-driven; dev app data snapshotted + restored (incl. the gate toggle) -->
    - [x] P4.vs.1 Every picker row (7/7) has `project-profile-cell`; order = open, model, profile, remove; picker 760px (max-width 760px); 0 truncated cell lines (`scrollWidth ≤ clientWidth`)  <!-- status: PASS -->
    - [x] P4.vs.2 Gate OFF (toggled via `workflow_set_features_enabled`): profile cells 7/7, drive-mode lines 0. Positive control gate ON: 6 mode lines of 7 rows — the 7th is scratch-a, which names a (missing) non-default profile, so the per-row predicate correctly keeps it closed  <!-- status: PASS -->
    - [x] P4.vs.3 `profiles-changed`: adopting AFTER the picker mounted made the row's select offer `["", "scratch"]` with no reopen; choosing `scratch` persisted (`projects.json` scratch-a → "scratch") and the line read `scratch` `is-set`; survived a full webview reload  <!-- status: PASS -->
    - [x] P4.vs.4 Settings ⌘,: groups = claude-code, profiles, workflow-features, analytics, updates, hotkeys; `default` (~/.claude) listed with NO Remove; `scratch` with Remove; 7 suggestions = the operator's `~/.config/claude-*` dirs (none listed); Choose folder… present; permission-mode note present; no horizontal overflow  <!-- status: PASS -->
    - [x] P4.vs.5 Remove via the UI button → `profiles.json` `[]`, scratch `settings.json` 0 Claudesk entries; the group shows only `default`  <!-- status: PASS -->
    - [x] P4.vs.6 Missing: scratch-a line "⚠ scratch missing" `is-failed`; clicking the row → refusal toast naming "scratch", workspace headers 0 → 0, no CC child spawned  <!-- status: PASS -->
    - [x] P4.vs.7 ⚠️ "New profile…" in the cell is NOT present — by plan it arrives with the wizard in Phase 5 (noted, not a failure)  <!-- status: PASS (scoped to Phase 5) -->
  - [x] verify-human  <!-- status: done — boundary (picker page, Settings panel); capture = verify-self's live DOM/IPC evidence; 3/3 leaves after one F12 rework -->
    - [x] P4.verify-human.1 Judge the picker layout  <!-- status: PASS on re-judgment (operator 2026-09-24: "good"). First pass FAILED → rework: the profile is the FIRST LINE of the model cell's stack (`Profile: …`, always present, ungated), the separate column deleted, picker back to 640px, model column 12em. Second operator ruling at re-judgment: "yes, always prefix" → the model line now ALWAYS reads `Model: <value>` (gate on/off, set/unset; drive-mode line unchanged) — triaged tests updated; verify:auto EXIT=0 (38s); live: scratch-a `Profile: original-dev` / `Model: Default`, no truncation -->
    - [x] P4.verify-human.2 Adopt `claude-original-dev` via ⌘, → Profiles → its suggestion button (the dev profile — NOT a daily-use one)  <!-- status: PASS (operator 2026-09-24) -->
    - [ ] P4.verify-human.3 Set it on the scratch-a row, open, `/login` once, send a prompt: the scratch-a tile dot goes Running then back to Idle (**the deferred P3.verify-human.1** — real logged-in turn)  <!-- status: PASS (operator 2026-09-24); agent confirmed in the status log: SessionStart → UserPromptSubmit (running, emitted) → Stop (idle, emitted) for scratch-a/ws-1, via claude-original-dev's 10 dev hook entries -->
  - [ ] verify-codify  <!-- status: NOT-STARTED -->

- [ ] Phase 5: New-profile wizard + Delete-to-Trash  <!-- status: NOT-STARTED; depends on Phase 4 -->
  **Observable outcomes:**
  - Browser: "New profile…" (from the picker cell AND from Settings) opens the wizard.
    - Steps in order: name → dir (pre-filled `~/.config/claude-<name>`) → permission mode (the
      step always renders; a value is pre-selected) → retention (`99999`) → model (optional) →
      theme + status line (pre-filled from `~/.claude` at open time) → mouse tracking + copy-on-select
      (both pre-set OFF) → confirm.
    - The status-line step shows the copied command text.
  - CLI: after finishing the wizard with defaults, `settings.json` holds:
    - `permissions.defaultMode`
    - `cleanupPeriodDays == 99999`
    - `statusLine` deep-equal to `~/.claude/settings.json`'s
    - `env.CLAUDE_CODE_DISABLE_MOUSE == "1"`
    - Claudesk's hook marker

    Also `<dir>/.claude.json` has `copyOnSelect == false` and `theme` (in whichever file probe (1)
    showed CC reads). `<dir>/CLAUDE.md` contains the guard text.
    `grep -c "claude-<name>" ~/.zshrc` is unchanged, compared before and after.
  - CLI: the wizard pointed at an existing non-empty dir → a refusal with an "adopt instead" offer,
    and the dir is unchanged (`shasum -r` before and after). A name colliding with a listed profile
    is rejected (D.19).
  - CLI: Delete on a `Created` profile → after the confirm, the dir is gone from `~/.config` and
    present in `~/.Trash`, and the profile is gone from the list. For an `Adopted` profile, there is
    **no** Delete control in the DOM (D.24).
  - Browser: the first spawn under a freshly created profile shows CC's login screen in the pane
    (xterm **buffer** read, not the DOM — lesson (i)).
  - [ ] P5.1 **Wizard component** (steps above; a modal fits here because it is a setup surface,
    not a primary one — `primary-surface-is-zero-ceremony` does not fire).  <!-- status: NOT-STARTED -->
  - [ ] P5.2 **`profile_create` backend.** Refuse a non-empty dir. Write the files via a temp file
    plus rename. Snapshot the defaults from `~/.claude` at call time. Register the hook. Add the
    profile with `provenance: Created`. ⚠️ No `~/.zshrc` access in code at all.  <!-- status: NOT-STARTED -->
  - [ ] P5.3 **`profile_delete` (Created only).** Move to Trash via the probe (3) mechanism, then
    drop the entry. The confirm dialog names the dir, and states that history and memory go with
    it. Run it off the main thread.  <!-- status: NOT-STARTED -->
  - [ ] verify-auto  <!-- status: NOT-STARTED -->
  - [ ] verify-self  <!-- status: NOT-STARTED -->
  - [ ] verify-human  <!-- status: NOT-STARTED -->
    - [ ] Operator creates a real profile end-to-end, logs in, confirms theme + status line + no
      mouse capture + no copy-on-select, **and the pane footer shows the profile's permission mode (B.10)**, then deletes it and finds it in the Trash. (Includes the P1.verify-human.2 deferral: after `/login`, agent reads back `.claude.json` `copyOnSelect` + `settings.json` `theme`.)  <!-- status: NOT-STARTED -->
    - [ ] Installed-`.app` Finder-launch smoke (profile spawn + dot) — **deferred to the
      `/release` gate** per the operator's standing preference (G.30).  <!-- status: NOT-STARTED -->
  - [ ] verify-codify  <!-- status: NOT-STARTED -->

## Test Triage — `announceRow.test.ts` "the declared cell order is back to the M11.5 three" + `projectModelCell.test.ts` "emits the committed cell order as a VALUE"
Classification: Obsolete test — the new feature (F-b P4.1's per-row profile cell) intentionally extends the row the tests pin
Confidence: high
Evidence: both assert `PICKER_ROW_CELLS` equals `["open","model","remove"]` exactly, and P4.1 adds `"profile"` after `"model"` by design
Action: updated both to the new exact value `["open","model","profile","remove"]` — kept as EXACT-value assertions (the M12 WP3 precedent in the same test: never weaken to `toContain`); renamed the announceRow title, which named a count

## Test Triage — `settingsPanelWiring.test.ts` "declares exactly the five groups the panel is specified to have, in order"
Classification: Obsolete test — F-b P4.3 intentionally adds a sixth Settings group
Confidence: high
Evidence: the test asserts the exact ordered id list, and P4.3 inserts `profiles` after `claude-code` by design
Action: inserted `"profiles"` into the exact ordered list (kept exact, per the test's own instruction that a new group is a one-line deliberate edit); renamed the describe/it titles "five" → "six" (grep found no other reference to the old titles)

## Test Triage — Phase 4 F12 rework (operator vh1: profile as a LINE in the model cell, not a column)
Classification: Obsolete test — the operator's verify-human correction supersedes P4.1's column
Confidence: high
Evidence: vh1 (2026-09-24) "make it as a new row above the model selector and the drive mode selector … auto prefix it with 'Profile:'"
Action: (1) the two exact cell-order pins reverted to `["open","model","remove"]` (still exact); (2) `projectProfileCellRender.test.tsx` DELETED with its component and replaced by `projectModelCellProfileLine.test.tsx` (same properties, on the real model cell: first line, three states, missing never default, ungated, plus the moved refusal-ordering pin); (3) `projectModelCellRender.test.tsx` gate-OFF "exactly ONE line" updated — the profile line is now always present, so gate OFF renders profile + model (the mode line is still absent, which is the property the test exists for)
(4) `projectModelCellStructure.test.ts` "routes BOTH lines through the single writer" counted 2 commitCellValue calls; the profile line is a third ROUTED line (the invariant holds), so it now asserts by IDENTITY that the three writers — model, drive mode, profile — are each reached from a commitCellValue call, and that there are exactly three

- **Path:** F-b > Phase 4 > verify-codify
- **Active scope:** Phase 4 verify-codify (dev build PID 64837 still running for the operator)
- **Blocked:** none
- **Unvisited:** Phase 5 → ship → review-quality → finalize
- **Open discoveries:** none (permission-mode finding ruled + built)

## Discoveries
[SURFACED-2026-09-23] Phase 1 > P1.1 — probe (1): `theme` lives in `settings.json` (a `.claude.json` `theme` is stripped at startup); `copyOnSelect` lives in `.claude.json` and survives first run; seeding `hasCompletedOnboarding` skips CC's login step, so it is NOT seeded. Spec D.18 is corrected in place.
[SURFACED-2026-09-23] Phase 1 > P1.1 — probe (2): `claude --continue` with no conversation for the cwd prints "No conversation found to continue" and EXITS. P1.4 gains a transcript-exists guard on the argv arm.
[SURFACED-2026-09-23] Phase 1 > P1.1 — probe (3): reuse the existing `trash = "5"` dependency (`editor_fs::…` already calls `trash::delete` on directories, and it has shipped). No new dependency.
[SURFACED-2026-09-23] Phase 1 > verify-self — ran by the orchestrator, NOT the `feature-verify-self-runner` subagent: `mcp__tauri__*` bridge tools do not reach subagents (memory `mcp-bridge-tools-not-exposed-to-subagents`), and every Phase 1 outcome needs the bridge. Deviation from the SKILL's unconditional-spawn rule, taken for tool reachability.
[SURFACED-2026-09-23] Phase 1 > verify-self — ⚠️ **SPEC CONTRADICTION: `build_cc_argv` ALWAYS passes `--permission-mode <Claudesk's app-global mode>`, which overrides a profile's `permissions.defaultMode`.** So B.10 ("footer shows the profile's permission mode") cannot hold, and the wizard's always-shown permission-mode step (D.18) would have no effect inside Claudesk — only in a bare terminal. Observed live: the scratch profile's `defaultMode: "plan"` child still got `--permission-mode bypassPermissions`. Needs an operator ruling before Phase 5; logged to backlog.
