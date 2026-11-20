<!-- Part of the Claudesk architecture set. Index + load-bearing constraints: ../arch.md -->
# The `~/.claude/` substrate — install & uninstall

*(Install wizard shipped 2026-07-29, commits `a6fb194` + `b95466f`; the deleting path 2026-07-31, `da4a854` + `8626ba7`.)*

Recorded here because `SURFACE-2026-07-28-MCCC-INSTALL-FEATURE-NEEDS-SANDBOXED-DEV-AND-VERIFY`
(**high**) requires the posture to live in `arch.md`, not only in a WIP file that gets archived.

### The problem this shape solves

This is the **first Claudesk code to mutate state outside its own app-data dir.** It writes into
`~/.claude/` — which, on the operator's machine, is symlinks into a companion repo they actively
edit. The naive implementation of "uninstall what we installed" deletes by resolved path, and
`_ref/claude-customization`, `~/.claude/skills/feature-build`, and the operator's real repo can all
resolve to the same bytes. So a path-based implementation can destroy the operator's working repo
while believing it is removing an install.

### The answer: provenance, not abstinence

**What Claudesk installed is RECORDED at install time and NEVER inferred from a resolved path.**

| State | Meaning | Affordance |
|---|---|---|
| `Absent` | no substrate found | the install wizard |
| `Managed` | present **and** Claudesk holds a well-formed record | (WP3.5b: the 3-intent uninstall wizard) |
| `Developer` | present but **unrecorded** — a hand-clone, the operator's live repo, or a record too damaged to trust | describe only; **never** offer removal |

`Developer` is the load-bearing arm, and **every degraded read lands there**: missing, unreadable,
and corrupt records all collapse to one `None` (`provenance::read_record` returns `Option`, not
`Result`, precisely so the caller *cannot* distinguish cases that must not be distinguished).
`Managed` is reachable only by an affirmative, well-formed record — because it is the only state a
future deleting path may act on, so file corruption must never arm a delete.

### Record location — a constraint, not a preference

`~/.claudesk/install-record.json`, beside the managed clone. **Deliberately NOT the per-identity
`settings.json`:** `~/.claudesk/vendor/` is not bundle-identity-scoped, so `com.claudesk.app` and
`com.claudesk.app.dev` share one clone and must read one record. A per-identity record would give
them divergent views of one directory in a feature whose whole model is "only touch what we recorded."

### Module layout — each file is an enforcement boundary

- **`sandbox.rs`** — the test fixture, `#[cfg(test)]` so a production `use` fails to compile. Built
  **first** and proven to contain writes, per the SURFACE's mandated ordering. Exposes
  `assert_contains_all_writes` (outer boundary) and the tighter `assert_writes_stay_under(root, …)`;
  **both canonicalize their inputs**, because on macOS `/var` symlinks to `/private/var` and an
  uncanonicalized prefix compare reports a contained path as an escape.
- **`provenance.rs`** — the record. Path-arg'd read/write; no ambient root.
- **`runner.rs`** — the two spawns. Pure `(program, args)` builders (following
  `updater::quarantine_clear_command`, deleted at M14 WP2 — the pattern outlived it) + thin spawners. **The provenance write is sequenced LAST**,
  after `install.sh` exits zero, so "a failed install leaves no record" is structural rather than a
  cleanup step. `OutputSink` keeps the whole run testable without a running app.
- **`terminal.rs`** — a **pure reducer**: what does an outcome *mean* (gate action / cleanup /
  what to surface)? Separate from `runner` because root `CLAUDE.md` requires revert-semantics
  control flow to be a pure function asserted as a value. The division: **runner reports, terminal
  decides, the caller acts.** Every non-success arm reverts the gate, written per-arm rather than via
  a shared default so a new variant is forced to decide.
- **`commands.rs`** — the **only** layer that resolves real paths, pinned by a test asserting exactly
  one `env::var("HOME")` in the file.

### Injectable roots everywhere, enforced by tests

No ambient `home_dir()` / `env::var("HOME")` anywhere below `commands`. Each module carries a source
guard that fails if one appears — the mirror image of `workflow_substrate::commands`'s read-only
guard. This is what makes the sandbox possible at all, and it is the shape WP3.5b's deleting code
inherits.

### Two failure modes worth remembering (both invisible to the automated gates)

1. **A safety guard must be mutation-proven, not merely present.** Three guards here looked like
   proof and were not: a containment assert comparing two *test-constructed* paths (a real escape to
   `/tmp` passed it — fixed by having production report `cloned_to`, a canonicalized filesystem
   *observation*); a source-position guard for the write-last ordering (a `write_record` moved onto
   the failure branch passed it); and a `#[cfg(test)]`-split extractor that silently scanned seven
   lines of a 1000-line file.
2. **A background worker that reports via events needs a panic boundary.** The lock release and the
   terminal event were originally the closure's last statements, so one panic produced two
   unrecoverable states: a permanently wedged single-run lock and a UI stuck mid-run with no exit.
   Fixed with a `Drop`-based `RunGuard` that releases and reports on both the normal and unwinding
   paths — the pattern any future long-running command should copy.

### WP3.5b, as built — the deleting path and its compiler-enforced guard (SHIPPED 2026-07-31, `da4a854` + `8626ba7`)

*(This section was a forward-look until 2026-07-31; it is now as-built. WP3.5a's "ships no deleting path at all" property has intentionally expired.)*

**The refuse-guard is enforced by the compiler, not by review** (`workflow_install/guard.rs`, built as task ONE, before any deleting path existed). Every deleting operation consumes an **`UninstallTarget`** whose field is **private with no constructor but `refuse_guard`** — so a delete that skips the guard *does not compile*, proven by an `E0451` test. This is the answer to "a test-only guard cannot protect against a bug that ships": the guarantee is structural.

The guard consumes **only the recorded provenance** — never a caller-supplied path, never a path inferred by resolving symlinks under `~/.claude/` — and hard-refuses when: there is no well-formed record (absent/unreadable/corrupt all collapse to `None` upstream, so the arm *cannot* distinguish cases that must not be distinguished — this also covers a hand-clone sitting inside Claudesk's own vendor dir, because **location is not provenance**); the recorded path cannot be canonicalized; the resolved target is, sits inside, or *contains* a protected root (home itself, `~/.claude/`, or any ancestor of home — which includes `/`); or the target is not a directory or lacks `uninstall.sh`.

Also as-built:
- **`--dry-run` drives the preview.** The dialog shows `uninstall.sh --dry-run`'s *real* output as the removal list, so preview and action share one source of truth and cannot drift — and the script's own view cross-checks Claudesk's record.
- **Order of operations: script → clone-dir removal → provenance record deleted LAST.** A failed uninstall therefore cannot clear the record, structurally rather than by cleanup.
- **One single-run lock shared by all three substrate-touching commands**, with the `Drop`-based `RunGuard` panic boundary WP3.5a introduced. ⚠️ **Since backlog-paydown 2026-11-08 WP6 (`1ccf9c4`) it is taken in ONE place and released in ONE place:** `HeldRunLock::try_acquire` (acquire-and-hold is one step, `None` when held) and `HeldRunLock`'s `Drop`. `RunGuard` holds the lock and releases it FIRST in its `Drop`, before the panic-fallback emit. Each command's synchronous half is a plain `begin_install` / `begin_uninstall` (lock, then validate), so an early refusal releases by drop and a test drives the real path. A source guard pins exactly one take and one release.
- **The subprocess primitives are shared with the adjudicator** (`src-tauri/src/subprocess/`: own process group, group kill + reap, `StopOnDrop`, the 250 ms drain grace, and the limits of a group kill, stated once). `run_streaming` keeps lines still queued at either kill exit and caps accumulated output at 4 MiB: the clean start, one note, then the last 200 lines / 64 KB of EACH stream, stdout's then stderr's (operator rulings at WP6: a flooding `install.sh` that fails must still show its last error, and a shared tail let that error be evicted). A line is bounded at 4 MiB and invalid UTF-8 is decoded lossily rather than ending the read.
- **`SURFACE-2026-07-29-QUALITY-WP3.5A-SOURCE-GUARD-CONSOLIDATION` was resolved here**, and the six copy-pasted guards became one `source_guard.rs` extractor + a **module-level** (not crate-level) delete allowlist. The rescope matters: the rule is no longer "no deletes exist" — that expired the moment this WP landed — but *"deletion APIs appear only where the allowlist says, in the counts it says."* It is documented as a **tripwire with a known alias bypass**; the behavioral tests are the real coverage.
- **Two operator-caught lessons, both generalizing.** (1) *A predicate answering a question ADJACENT to the one asked will pass every test written from the same misunderstanding* — substrate detection was wrong twice (bare `is_dir()`, shipped in v0.2.9; then "non-empty"), both suites green, until the operator asked "what if the user already had their own skills?". It now keys on a **symlink resolving into a repo whose `install.sh` carries the `claude-workflow-system` marker**, degrading to "not installed" in every failure mode. (2) *Driving a UI by `data-testid` verifies logic and proves nothing about reachability* — three "verified live" passes were hollow while the dialog was 702px in a 599px panel with its button row below the fold. **Measure geometry explicitly.**
- **A slot holding a long-lived surface must render in EVERY resolved arm**, not only the arm that summons it — hit twice in mirror-image form. **M11's Docs tab inherits this rule.**


---

## Remote hosts (M18) — 📐 PLANNED 2026-11-18 (`/product-arch`; not built)

**Milestone 18, the remote workflow substrate.** Scope was settled at the entry grill
(`roadmap.md` → "### Milestone 18" → "Scope, settled at the entry grill"). In short: detect the workflow system
on each remote **host account**; install it there **in-app**, with provenance and a paired Uninstall; show
**drift** against GitHub; offer **Update** for Managed installs. It also carries three remote
fixes: Recycle respawn, the bypass-dialog inject, and the `claude` PATH fallback. **YAGNI:** this covers one host
account per remote row, and **no remote profiles**. The remote `CLAUDE_CONFIG_DIR` stays the account's `~/.claude`.

### R.1 The decision this design hangs on: the host is a third input to the ONE workflow funnel

Since F-b, "may this workspace use the workflow layer?" has one answer:
`config_store::profiles::workflow_applicable(gate, profile)` (TS `isWorkflowApplicable`). Every
project-scoped consumer reads that answer, never the raw gate (`arch/profiles.md`; `workflowApplicableGuard.test.ts`). Those consumers are:
- the spawn's `CLAUDESK_DRIVE_MODE`;
- the open check's `/session-restore` arm;
- the drive-mode line;
- the skill row (with Recycle and Session-Start);
- the Docs tab;
- the supervisor.

**M18 adds the host as a third input:**
`workflow_applicable(gate, profile, host)`, where `host` is `Local` (always applicable, so local
behaviour is unchanged) or `Remote(HostSubstrate)`, which is applicable only when the substrate is **present** (`Managed` or
`Developer`). This is a one-place change: every consumer already reads the funnel, so none of them learns about hosts.

- **Why not a parallel "host has skills" flag read at each skill-injecting site:** that would be a second source of
  truth beside the funnel. The funnel exists because a profile is the same question ("does this CC
  identity have the skills?") asked of a different context, and a host is that question again.
- ⚠️ **This revises one grill default.** The grill assumed that Docs stays on a skill-less host. Through the funnel,
  **Docs goes absent there too**, matching a non-default profile today. That is consistent with how profiles already
  behave, and cheap to revisit. The Prompt panel isn't gated, so it stays.
- **Unknown fails closed.** Until a host's substrate is known, `host` reads as **absent**. The open check always
  runs before a remote open (§R.2), so a real open always has a known value. The default mirrors the gate's
  "seed `false`, never flash on".
- **Gate OFF:** no probe runs and nothing is shown, so the OFF state stays byte-identical. The open check already skips the remote
  `.session.md` read with the gate OFF; the substrate probe rides the same condition.
- **The note.** With the gate ON and the substrate absent, the workspace shows one plain-words line in the skill-row
  slot: "The workflow system isn't installed for `<user@host>`. Install it in Settings → Remote hosts." It links to
  that group (prior `a-silent-non-action-must-not-read-as-done`). It is a **gated surface**, so it joins
  the OFF-invariant guard as a new **subject of arm 5 (SKILL-ROW)**. ⚠️ That raises the pin from **6 arms / 10 subjects to 6 arms / 11 subjects**, and
  `workflow-gate.md` must be updated in the same change (that file was missed by two count sweeps already).

### R.2 Detection: the local predicate, run on the host, in the open check's one exec

- **Same definition as local, no new one.** Local `workflow_substrate::skills_dir_exists` asks: does an entry under `~/.claude/skills/` resolve,
  through a symlink, into `<repo>/skills/<name>`, where `<repo>/install.sh` carries `claude-workflow-system`? The remote probe is a
  **constant** shell fragment, `SUBSTRATE_PROBE` in `remote_cmd`, with no interpolated value, that answers exactly this.
  It prints `CLAUDESK-OPEN:substrate:yes|no`, the resolved repo root, and that repo's `git rev-parse HEAD`.
- ⚠️ **A parity guard, not a promise.** A test runs `SUBSTRATE_PROBE` locally under a temp `HOME` against the same fixtures as
  `skills_dir_exists`'s tests, and asserts the two agree case by case: real dir, dangling link, link into a repo
  without the marker, the marker present. This is the `filter_listing_agrees_with_discover` pattern. A drifted shell copy
  would otherwise answer an *adjacent* question, the failure that shipped twice locally (§WP3.5b lesson 1).
- **It rides the existing open-check exec.** No new exec, and no per-tick cost. `OpenFacts` gains `substrate: Option<HostProbe>`,
  which is `None` when not probed (gate OFF).
- **Provenance on the host** follows the local rule unchanged: **recorded, never inferred**. The same exec reads
  `~/.claudesk/install-record.json` on the host (as ONE hex line, so a multi-line record survives the line protocol; probed at WP3), and Rust parses it with the local `provenance` parser, so degraded reads collapse to `None`. The result is
  `Managed` only for a well-formed record. The record is **identity-shared**, not per bundle id, because dev and prod share one host clone,
  for the same reason as local ("Record location" above). ⚠️ The mini's hand install has no record, so it reads as
  **`Developer`**: drift is shown, there is no Update or Uninstall, and there is no adopt path (grill).
- **The cache.** `LinkRegistry` keeps the last `HostSubstrate` **per host** and broadcasts a `remote-substrate` event on
  change. The open check writes it, and so do Install, Update and Uninstall when they finish. The frontend reads it through one hook,
  `useHostSubstrate(projectPath)`, which seeds by invoke and re-syncs on the event. That is the seam-hook discipline: never a one-shot read
  (the WP3 defect, `workflow-gate.md`). Local keys return `Local` without IPC.

### R.3 Install, Update, Uninstall over the host's master

**The scripts are still the source of truth** (runner header). Claudesk runs `install.sh`, `uninstall.sh` and `git`
**on the host** and reimplements none of them.

- **Transport: a streaming exec over the ControlMaster.** It uses the `subprocess::run_streaming` primitives with `/usr/bin/ssh -S <ctl>
  -o BatchMode=yes -- <host> zsh -lc '<script>'` as the program. It is **not** the 10 s `EXEC_TIMEOUT_MS` exec, because an install takes
  seconds to minutes. It runs on a worker, under the **same single-run lock** (`HeldRunLock`) and the same `RunGuard` panic
  boundary as local, so only one substrate operation runs at a time, app-wide. If the link is not `Up`, the operation refuses
  with a plain-words message and never starts.
- **Install:** `git clone https://github.com/StaymanHou/stayman-claude-code-customization.git <root>/.claudesk/vendor/my-claude-code-customization`.
  The URL is the **public HTTPS** one, because a host has no GitHub key (grill fact). The local wizard's SSH URL stays as it is.
  Then `install.sh` runs in the clone, and **the record is written LAST**, on the host, by a constant `printf` of the JSON
  that Rust built, only after `install.sh` exits 0. A failed install leaves no record, structurally. Unlike local, there is **no directory picker**:
  the path is fixed (it is a host, and nobody browses it).
- **Update (Managed only):** `git -C <clone> pull --ff-only` → `install.sh` → rewrite the record with a new
  `updated_at`. An ff-only failure (local edits on the host clone) stops before `install.sh` and says so.
- **Uninstall (Managed only)** goes through a **remote refuse-guard of the same shape as local**: a
  `RemoteUninstallTarget` whose field is private and whose only constructor is `remote_refuse_guard`. The guard is fed
  **only** by the host record, plus a host `cd -P && pwd -P` canonicalization of the record's path, and a pure check refuses
  `$HOME`, `~/.claude`, any ancestor of `$HOME`, a non-directory, or a missing `uninstall.sh`. The `E0451` test is copied with it. The
  preview is the host's real `uninstall.sh --dry-run` output, as local. The order is script → clone-dir removal → record
  deleted LAST. ⚠️ The clone-dir removal is a **remote `rm -rf` of a guard-produced path**. It is added to the
  `source_guard` delete allowlist as its own module entry, and a test asserts the command builder accepts only a
  `RemoteUninstallTarget`.
- **The local gate is never touched by a remote operation.** Local "Uninstall & disable" reverts the gate because it removes the
  only substrate the gate applies to. A host is one of several, so remote Uninstall only changes that host's `HostSubstrate`.
- **Injected host root.** Every remote substrate command takes the host's root as a parameter. It is never a literal `~`: it is the
  `$HOME` the link already prints behind a sentinel at connect (§B). `install.sh` / `uninstall.sh` run with `HOME=<root>`
  exported. **Debug builds only** may replace the root with a sandbox dir on the host
  (`CLAUDESK_REMOTE_SUBSTRATE_ROOT`, read in the commands layer under `cfg(debug_assertions)`), which is how M18 is verified
  **without ever touching the live host-account install** that the tank workspace depends on. This is the remote analogue of
  `docs/lessons/sandboxed-home-verification.md`.

### R.4 Drift (Settings only)

- **What is compared:** the host clone's `HEAD` (from the open-check probe or a refresh) against `git ls-remote <url> HEAD`, **run from the
  host**. The URL is the record's `origin_url` for Managed, or the repo's own `remote get-url origin` for Developer (read-only).
- ⚠️ **"Behind GitHub", not "N commits behind".** A count needs a `fetch`, which writes into the host repo's `.git` on a
  read path. That would be a write into a Developer install Claudesk does not own. This revises the grill wording. The readout shows the
  two short SHAs and "up to date / behind GitHub / can't check (reason)".
- **When:** when Settings → Remote hosts is shown, one exec per host. Not on open (`ls-remote` reaches GitHub, about 1 s, and
  would slow every remote open) and never polled (prior `background-work-only-for-what-is-on-screen`). This revises the grill's
  "on open"; presence is still checked on every open.

### R.5 Where the controls live: Settings → "Remote hosts"

A Settings group with **one entry per distinct host among the remote rows**. Each entry shows the state (Absent / Managed /
Developer), the HEAD, the drift, and the buttons: Install (Absent), Update (Managed + behind), Uninstall (Managed). It follows the M10.9
boundary ("Settings owns the substrate; discovery lives elsewhere"). **It is not gated:** like the local substrate section, it
is the on-ramp, and it shows only when at least one remote row exists. Run output streams into the same output panel the local
wizard uses. A host whose link is down shows "connect a workspace on this host to check". Settings never brings up a link by itself.

### R.6 Preflight, for a fresh host account (what an install actually meets next)

- **Developer tools:** before `git clone`, `d=$(xcode-select -p 2>/dev/null) && [ -n "$d" ] && [ -x "$d/usr/bin/git" ]` (probed at WP3,
  `wbs.md` → "Probe outcomes" (5)). On a Mac without the Command Line Tools, `git` is a stub that pops a GUI installer on the
  host's console and fails over ssh. ⚠️ The bare `xcode-select -p` is not enough: it does not validate a path, and on a no-tools
  host its empty output turns `test -x "$(xcode-select -p)/usr/bin/git"` into a test of the shim, which passes. The refusal names
  the fix (`xcode-select --install` at the host's console).
- ✅ **`claude` not on the `zsh -l` PATH — BUILT at M18 WP2 (2026-11-18)**
  (`SURFACE-2026-11-17-REMOTE-CLAUDE-ONLY-ON-INTERACTIVE-PATH`). One constant fragment,
  `remote_cmd::CLAUDE_PATH_FALLBACK` (`command -v claude || PATH="$HOME/.local/bin:$PATH"`), runs ahead of the
  first `claude` in the deployed `cc-launch` and in the add-remote preflight (so `AUTH_CHECK` gets it too). A
  `claude` on PATH still wins. When neither place has it, the preflight's message names both places and the
  `~/.zprofile` fix (`preflight::missing_tool`). Claudesk never edits a dotfile.
- ✅ **The bypass-permissions warning — BUILT at M18 WP2 (2026-11-18)**
  (`SURFACE-2026-11-17-AUTO-RESUME-INJECT-ANSWERS-BYPASS-PERMISSIONS-DIALOG-NO-EXIT`, high). As built, the
  condition is the session's recorded spawn permission (Claudesk spawns with `--permission-mode
  bypassPermissions`, not `--dangerously-skip-permissions`; both show the warning) plus the key in
  `settings.json`. Remote reads it in the open-check exec beside `TRUSTED_KEYS` (`BYPASS_ACCEPTED`, a
  constant perl fragment). Local and remote withhold and say so; Recycle's restore too. Authority:
  `session-resumption.md` → "The inject arm withholds…".

### R.7 Remote Recycle never respawns CC — ✅ FIXED at WP1 (2026-11-18, `411bff8`)

**As built:** the cause was the Reconnect DOOR being re-sent by the relaunch (a workspace keeps `open_intent` for its whole life), so `cc_spawn_remote` attached to the session Recycle's `/exit` had just ended. Both constraints below held, and the fix is frontend-only (`relaunchIntent` + `XtermPane`'s `doorUsedRef`). Full record: `remote-workspaces.md` §E, Recycle row.

`SURFACE-2026-11-17-REMOTE-RECYCLE-NEVER-RESPAWNS-CC` is a **bug with an unconfirmed cause**, so M18 schedules it
**reproduce-first** (dev build, scratch row), not design-first. Two constraints bound the fix:
- **The respawn is a NEW session, never a reattach.** After Recycle's `/exit` the tmux session is gone (CC runs as its only
  process). The respawn must go through the spawn path (`new -A … cc-launch …`) that a fresh open uses, then the cancel-before-inject
  funnel for `/session-restore`. ⚠️ The reconnect rule "`attach -t =`, never `new -A`" governs *reconnect*,
  not respawn. Do not "fix" the reconnect path to create sessions.
- **Recycle is explicit (R-1).** The `/exit` it types must not be classified as the operator's close, which would latch Ended and
  write an end-intent. The leading suspect (backlog entry) is exactly that misclassification, or a `wait_not_closing` that never clears.

### R.8 Verification constraints for every M18 WP

- ⚠️ **The live host install is off-limits.** `<user>@<mini-host>`'s `~/.claude` serves the running tank workspace.
  Install, Update and Uninstall are verified only against `CLAUDESK_REMOTE_SUBSTRATE_ROOT=<scratch dir on the host>` (§R.3)
  from a dev build. Detection may *read* the live account.
- Remote checks fire real commands only in the scratch remote folder (memory `remote-verify-hygiene`).
- Installed-build acceptance waits for a release (`installed-build-verify-deferred-to-release`).

### R.9 Open, for the WBS's probe WP (not decidable on paper) — ✅ ANSWERED at WP3 (2026-11-20, `0c45070`)

**Answers + design consequences:** `wbs.md` → "Probe outcomes". In short: (1) a local kill does NOT stop the host; cancel = one
remote group-kill exec, pgid as a stream sentinel (no pid file), honoured only during the clone (operator ruling A); (2) the re-run
is content-idempotent, so Update stays as designed; (3) `HOME=<root>` contains every write; (4) the probe adds +16 ms median. The
host record crosses the open check as one hex line (§R.2). The original questions follow.


1. **Cancel over the master.** Does killing the local `ssh` process group of a streaming exec stop the remote `git clone` / `install.sh`?
   Without a tty, the remote side may run on. If so, the remote script writes its own pid to the record's directory and cancel
   runs one `kill -- -<pgid>` exec.
2. **`install.sh` re-run idempotency** for Update: is a second run on an installed account clean, with no duplicate `CLAUDE.md` block
   and no prompt?
3. **`HOME=<root>` reaches every write** `install.sh` / `uninstall.sh` make, so the sandbox root actually contains them
   (assert with the local `sandbox.rs` discipline: canonicalize, then compare).
4. **The `SUBSTRATE_PROBE` cost** added to the open check's exec: it must stay inside the open's latency budget (the open check runs today at
   about 0.14 s per exec).
