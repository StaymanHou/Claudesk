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

## Remote hosts (M18) — 📐 PLANNED 2026-11-18 (`/product-arch`); §R.1–R.2 ✅ BUILT at WP4, §R.4–R.5 (readout) ✅ BUILT at WP5, §R.3 Install + §R.6 preflight ✅ BUILT at WP6, §R.3 Update + Uninstall ✅ BUILT at WP7 (2026-11-20)

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

### R.1 + R.2 as built — ✅ WP4 (2026-11-20)

What the build settled that the design above left open (the WP4 WIP's D1–D10; the design text below is kept as written):
- **HEAD is read in perl from `.git`, never with `git`** (loose ref → `packed-refs` → detached; a `.git` FILE prints no
  head). On a host without the Command Line Tools, `/usr/bin/git` is the shim that asks for the GUI installer.
- **The debug sandbox root** is the Mac-side `CLAUDESK_REMOTE_SUBSTRATE_ROOT`. A debug build passes it as an env prefix
  (`CLAUDESK_SUBSTRATE_HOME=<quoted>`) on the probe's one command, and the constant reads that before `$HOME`. A release
  build's command is byte-identical with or without it, which a test pins.
- **The wire:** a `substrate-probed` line, then the probe. That lets the parser tell "not probed" (gate OFF → `None`)
  from "probed, no answer" (`Unknown`). The root line is withheld when the root contains a newline. Parity with
  `skills_dir_exists` is pinned over **16** fixture shapes, and three mutants of the constant are each killed by
  their own fixture. `skills_dir_exists` now reads `install.sh` as bytes.
- **Two funnels, one control.** Consumers read `workflow_applicable(gate, profile, host)`. The open check PRODUCES the
  host input, so it decides "probe at all?" with `workflow_applicable_before_host_probe`, then applies the full funnel
  to what it probed for the restore arm.
- **A remote OPEN takes its host input from the check's answer** (`StartSignals.hostSubstrate` → `hostFromOpenCheck`),
  not from the frontend cache. That cache is the last render's value, and the event is not ordered against the
  command's response.
- **The frontend store** is one module store: the first REMOTE consumer starts it by listening, then seeding. A local
  key never touches it, so it makes no IPC.
- **Picker remote rows** (operator ruling A, 2026-11-20): the drive-mode cell is absent until the row's host has been
  open-checked once in the app session (fail closed).
- **The note** (D8): Absent → "The workflow system isn't installed for `<host>`. Install it in Settings → Remote
  hosts.". Unknown → "Claudesk couldn't check whether the workflow system is installed for `<host>`." (operator ruling
  A). `<host>` is the SHORT host (the picker row's `shortHost`), and the full `user@host` is in the tooltip (operator,
  P3.verify-human.1). Not yet seeded → no note (it would flash). Its button opens Settings; WP5 task 5.2b makes it land
  on the group. The OFF pin is **6 arms / 11 subjects**.

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

### R.3 Install as built — ✅ WP6 (2026-11-20)

What the build settled (the WP6 WIP's D1–D11, archived as `m18-wp6-remote-install.md`; Update / Uninstall are WP7):
- **One host-side script, reporting through sentinels.** `workflow_install/remote_runner.rs` builds it (pure); it runs as ONE
  streaming exec over the master (`LinkRegistry::master_run_argv` = `master_only_exec_argv`, through
  `runner::run_streaming_abortable`), never the 10 s capture. Lines `CLAUDESK-RUN:pgid:<n>` (first), `phase:clone`,
  `phase:install`, `stale-removed`, `result:<arm>` are parsed live (`parse_run_line`) and never shown as output.
- **The order on the host:** root exists → `if ! { DEV_TOOLS_GUARD; }` (⚠️ GROUPED: a bare `! a && b && c` negates only `a`; the
  first draft did that and a stub-`xcode-select` test caught it) → **the host re-checks** (`SUBSTRATE_PROBE` against the root, plus
  the record): anything but `substrate:no` with no record is `already-present`, so a stale readout never acts → a leftover clone
  with no record is removed only when it is a real folder whose physical path is EXACTLY `<physical root>/.claudesk/vendor/<name>`
  (the module's one `rm -rf`, sanctioned in `source_guard`) → `phase:clone` + `git clone` of the public HTTPS URL with the
  developer dir's own `git` → `trap '' HUP PIPE TERM INT` → `phase:install` → `install.sh` with `HOME=<root>` as a DIRECT child of
  the script's shell (⚠️ never inside `( … )`: zsh resets an ignored trap in a subshell, so WP6's `( cd … && ./install.sh )` let a
  TERM/HUP kill it between two links; found and fixed at WP7 Phase 1, where WP6's test had passed only because its kill landed
  ~2 ms in, before the subshell forked), output to
  `<root>/.claudesk/install.log` (it is `set -e`: an echo into a dead pipe would end it) → the record LAST (Rust's JSON, a
  constant-format `printf` to a tmp file, then `mv`) → the log printed → `result:`.
- **Values enter quoted, in one pass.** `fill` substitutes the template's placeholders in ONE pass over the template; a chain of
  `str::replace` rescanned inserted values, so a root containing `__JSON__` left its `$(…)` unquoted and it ran (caught at
  Phase 2 verify-self).
- **The root** is the link's `$HOME` (`LinkRegistry::hold_if_up`, which also holds the link for the run and never brings one up),
  or a debug build's `CLAUDESK_REMOTE_SUBSTRATE_ROOT`; refused unless absolute, normalized, not `/`.
- **The outcome comes from the host.** After every ending the worker re-probes over the master through `settle_refresh` (which
  writes only a KNOWN answer, WP6 Phase 1) and the pure `remote_runner::resolve` decides: `ok` only when the host reads Managed;
  a run that never reported (late Cancel, dropped connection) is judged by what the host now is.
- **Cancel (ruling A):** honoured until `phase:install`. ⚠️ Revised at WP7 Phase 1 (D2): once the run's pgid is known, the
  worker sends `kill -TERM -- -<pgid>` over the master ONCE and then reads the stream to its END (`remote_runner::abort_poll`,
  behind `commands::stream_with_cancel`); it stops the local ssh only before the pgid arrives. A local stop does not stop the
  host's run, so the WP6 shape (kill, then stop locally) could report "Nothing was installed" while the host went on to Managed.
  A kill the host did not confirm prints `CANCEL_UNCONFIRMED_NOTE` and still waits; a late kill is ignored by the trap and the
  run reports `result:ok` ("Cancel came after install.sh had started…").
- **Commands:** `workflow_remote_install_start(host)` (sync: `begin_remote_run(…, Install)` takes the shared `HeldRunLock`, then
  refuses a non-row host, a non-Absent cached state, a link that is not Up, a bad root) and `workflow_remote_run_cancel` (renamed
  from `workflow_remote_install_cancel` at WP7; a lock write; refused as too late in the install phase). Events: since WP7 the one
  `remote-run-*` triple below. The local gate is never touched.
- **The UI:** `RemoteInstallPanel` in each Settings → Remote hosts entry: "Install…" only on an Absent entry whose link is Up;
  consent (operator-approved copy, pinned by literal) → the streamed log + Cancel gated on the phase → the result. The entry's
  state comes through `useHostSubstrates`, so it (and every open workspace on the host) flips without a reopen; a success
  re-checks the host for HEAD + drift. A consent step closes whenever `offered` changes and renders only while offered.
- ⚠️ Known, backlogged: dev builds show every streamed line twice (the `useTauriListen` StrictMode leak,
  `SURFACE-2026-11-16-TAURI-UNLISTEN-REJECTION-ON-WORKSPACE-OPEN`, medium; seen again on WP7's Update log). The reopened-Settings gap
  was closed at WP7 (re-attach, below).

### R.3 Update + Uninstall as built — ✅ WP7 (2026-11-20)

What the build settled (the WP7 WIP's D1–D12, archived as `m18-wp7-remote-update-uninstall.md`):
- **The remote refuse-guard** (`workflow_install/remote_guard.rs`): `RemoteUninstallTarget` (private fields; its only constructor is
  `remote_refuse_guard`, so a struct literal elsewhere fails with `E0451`, proven by a verify-self mutation; a `syn` test pins the
  builders' signatures and the one constructor). Its inputs are the record AS THE HOST HOLDS IT NOW and a `HostObservation` (one
  read-only `perl` exec: the physical forms of the root, the account's REAL `$HOME`, both `.claude`s and the record's clone path,
  every value hex-encoded). It refuses: no record, unresolvable, the root or the real home, anything inside either `.claude`, an
  ancestor of a protected root, a non-directory, no `uninstall.sh`. ⚠️ Both the root AND the real `$HOME` are protected, so the
  debug sandbox override cannot weaken it. The observation is read twice and the record must not change in between.
- **Uninstall** (`workflow_install/remote_ops.rs`): preview = the host's own `uninstall.sh --dry-run` in the approved clone; the run
  script is built from the approved target ONLY and, under `trap '' HUP PIPE TERM INT` from line 1 (no Cancel, D7), the host
  RE-CHECKS the record's bytes and the clone's physical path (`result:changed`, nothing touched) → `uninstall.sh` (direct child) →
  `rm -rf` of the approved path → the record deleted LAST. A failure at any step keeps the record; the re-probe decides (`ok` only
  when Absent). The delete allowlist sanctions `remote_ops.rs`: one recursive `rm`, one `rm`.
- **Update**: the same guard and host re-check, then refuse a dirty clone / no upstream → `phase:fetch` (Cancel honoured; a stalled
  transfer gives up after 30 s under 1 KB/s) → the untrappable window: `merge --ff-only` (`not-ff` stops before `install.sh`),
  `install.sh` (direct child), the record rewritten LAST with `updated_at` (`InstallRecord.updated_at`, optional and skipped when
  `None`, so existing records serialize byte-identically). Probe outcome (2) held: `install.sh` re-runs content-idempotently.
- **One event triple for all three ops** (D11): `remote-run-output` `{host, op, line}`, `remote-run-phase` `{host, op, phase}`,
  `remote-run-finished` (`RemoteRunFinished` with `op`). `workflow_remote_run_state` → `{host, op, phase} | null`, read only
  while the lock is held; every begin, local included, resets the remote state.
- **The UI** (`RemoteRunPanel`, `remoteRunOffers`, D12, operator-approved at P4.verify-human): Install on Absent; Update on Managed +
  drift `differs`; Uninstall on Managed; every button only with the link Up; ⚠️ a Developer host (the live account) is offered
  nothing. Update has a short confirm; Uninstall's confirm IS the approved clone path + the host's dry run; Uninstall has no Cancel;
  Update cancels only while fetching. A Settings reopened mid-run re-attaches to the run (mount-time `workflow_remote_run_state`).
- ⚠️ Backlogged from the WP7 review (MAJOR, before WP8's release): the delete-scan tail anchor for `remote_ops.rs`, the re-attach's
  listener race, Update showing removal-worded guard refusals, and no test pinning the Uninstall template's signal window
  (`backlog-quality-findings.md` → `# m18-wp7-remote-update-uninstall`).

### R.4 Drift (Settings only)

- **What is compared:** the host clone's `HEAD` (from the open-check probe or a refresh) against `git ls-remote origin HEAD`, **run from the
  host**. ⚠️ **Revised at WP5 (D1):** the URL is the clone's own `origin`, for Developer AND Managed, not the record's `origin_url`.
  WP7's Update runs `git -C <clone> pull --ff-only`, which fetches from that same `origin`, so drift and Update cannot disagree, and the
  fragment stays constant (no JSON parsing on the host, no Rust-interpolated URL). A Managed clone's `origin` IS the record's URL unless
  someone edited the host clone.
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

### R.4 + R.5 as built — ✅ WP5 (2026-11-20)

What the build settled (the WP5 WIP's D1–D9, archived as `m18-wp5-remote-hosts-readout.md`):
- **One exec per host, the probe AND the drift:** `remote_cmd::substrate_refresh_command`. The probe runs exactly as the open check's (same
  `substrate-probed` marker, same debug sandbox prefix), captured in `$p`; the drift half reads the root the PROBE printed, never
  re-derived. One parser for both callers: `parse_substrate` (shared by `parse_open_facts` and `parse_refresh`).
- **Every remote `git` is behind `DEV_TOOLS_GUARD`** (`d=$(xcode-select -p) && [ -n "$d" ] && [ -x "$d/usr/bin/git" ]`, Probe outcome (5))
  and runs as `"$d/usr/bin/git"`, never a PATH lookup, non-interactively (`GIT_TERMINAL_PROMPT=0`, ssh `BatchMode=yes`, stdin closed).
  ⚠️ The `-n` test only bites for empty output with exit 0 (the assignment's own status catches exit 2); a test drives that arm.
  WP6's preflight reuses the constant.
- **The drift line:** `drift-remote:<sha>`, or `drift-error:no-devtools | no-origin | git:<last line>`. `remote_substrate::Drift`
  (`up_to_date | differs | cant_check`; `differs` was `behind` until M18 WP6 P1.2) compares FULL heads; `differs` means only that they differ (no fetch, D6). Absent / Unknown → no drift at all.
- **Commands:** `remote_hosts` (sync: the distinct hosts of the VALID remote rows, each with `link_up` + its cached substrate) and async
  `remote_substrate_refresh(host)` over `LinkRegistry::master_exec` (Up-only, master-only; a caller guard pins it as the only `links.`
  call). A down link answers `link_down` and sends nothing; a host that is not a row's host is refused before any exec. An answer writes
  the per-host cache through `set_substrate` (the same `remote-substrate` event every workspace hears).
- **The group:** "Remote hosts", right after Workflow features, rendered only when `remote_hosts` is non-empty, NOT gated (the on-ramp,
  operator-confirmed). Each entry: the full `user@host` (operator decision), the state tag (Developer / Managed / Absent / Unknown), a detail
  line with `HEAD <short>` (tooltip: the clone root), and the drift or "Connect a workspace on this host to check." line. The substrate is
  read through `useHostSubstrates` (the seam), never a one-shot copy. Refresh runs once per mount, only for hosts whose link is Up; closing
  the panel starts no further work.
- **5.2b:** the absent-host note's button calls `onOpenSettings("remote-hosts")` (required on `CenterStage` / `Workspace`); App's
  `openSettingsAt` sets the highlight, and `SettingsGroup` scrolls a highlighted group into view. **D8:** every close (button, Esc, the ⌘,
  toggle) clears App's `settingsHighlight`; before WP5 nothing did, so every open after the invite re-flashed Workflow features.
- ✅ Fixed at M18 WP6 Phase 1: a refresh whose PROBE printed no answer leaves the cache as it was and answers `Failed` (a read-only
  readout never demotes a known host; the open check still writes `Unknown`, WP4 D5), and `Drift::Behind` is now `Differs`.

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
