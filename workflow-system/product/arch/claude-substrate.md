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
  `updater::quarantine_clear_command`) + thin spawners. **The provenance write is sequenced LAST**,
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
- **One single-run lock shared by all three substrate-touching commands**, with the `Drop`-based `RunGuard` panic boundary WP3.5a introduced.
- **`SURFACE-2026-07-29-QUALITY-WP3.5A-SOURCE-GUARD-CONSOLIDATION` was resolved here**, and the six copy-pasted guards became one `source_guard.rs` extractor + a **module-level** (not crate-level) delete allowlist. The rescope matters: the rule is no longer "no deletes exist" — that expired the moment this WP landed — but *"deletion APIs appear only where the allowlist says, in the counts it says."* It is documented as a **tripwire with a known alias bypass**; the behavioral tests are the real coverage.
- **Two operator-caught lessons, both generalizing.** (1) *A predicate answering a question ADJACENT to the one asked will pass every test written from the same misunderstanding* — substrate detection was wrong twice (bare `is_dir()`, shipped in v0.2.9; then "non-empty"), both suites green, until the operator asked "what if the user already had their own skills?". It now keys on a **symlink resolving into a repo whose `install.sh` carries the `claude-workflow-system` marker**, degrading to "not installed" in every failure mode. (2) *Driving a UI by `data-testid` verifies logic and proves nothing about reachability* — three "verified live" passes were hollow while the dialog was 702px in a 599px panel with its button row below the fold. **Measure geometry explicitly.**
- **A slot holding a long-lived surface must render in EVERY resolved arm**, not only the arm that summons it — hit twice in mirror-image form. **M11's Docs tab inherits this rule.**

