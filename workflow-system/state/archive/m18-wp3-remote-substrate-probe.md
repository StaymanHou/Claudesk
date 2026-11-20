---
drive_mode: autopilot
---

# Feature: M18 WP3 — Probe: remote substrate behaviour on the mini

**Workflow:** feature
**State:** finalize (complete)
**Completed:** 2026-11-20
**Created:** 2026-11-20
**WBS:** `workflow-system/product/wbs.md` → WP3 (type: probe, size S, timebox half a day)
**Design:** `workflow-system/product/arch/claude-substrate.md` → "Remote hosts (M18)" §R.2, §R.3, §R.6, §R.8, §R.9

## Problem Statement

WP4–WP7 build detection, Install, Update and Uninstall of the workflow system on a remote host account, over the
host's ssh ControlMaster. Four host behaviours decide how they get built, and none can be settled on paper
(§R.9): (1) whether SIGKILLing the local ssh process group of a streaming exec (what `subprocess::kill_group`
does on cancel) also stops the remote `git clone` / `install.sh`. If not, cancel needs a remote pid file plus a
`kill -- -<pgid>` exec. (2) Whether a second `install.sh` run is clean (no duplicate `CLAUDE.md` block, no prompt).
If not, Update must become Uninstall + Install. (3) Whether `HOME=<root>` contains every write `install.sh` and
`uninstall.sh` make, which the whole sandbox-root verification strategy (§R.8) depends on. (4) What the drafted
`SUBSTRATE_PROBE` (+ the host-record `cat`) adds to the open check's ~0.14 s exec. Plus what `git` does over ssh
on a Mac without the Command Line Tools (the §R.6 preflight). **Deliverable:** `wbs.md` → "## Probe outcomes",
one measured answer per question and its design consequence. **This is a probe, not a build:** no app code ships.
The only repo writes are the WBS Probe-outcomes section, this WIP, and a throwaway test file deleted at the end
(P2.2).

Problem statement unchanged (2026-11-20, F9b re-entry from verify-self): the five questions are the same. The back-loop is about evidence fidelity: unknown 2's record ignored file metadata, and unknown 1's host captures were never saved.

**Fences (from §R.8 and memory `remote-verify-hygiene`):**
- Host = `<user>@<mini-host>`, the dev account. ⚠️ Take the host part from the dev `projects.json` `ssh://` keys,
  strip the user, and prepend the dev account (memory `mini-remote-user-is-stayman`). Never use the admin account.
- **All writes go in ONE sandbox root on the host:** `~/claudesk-m18-sandbox` (a fresh dir, created by P1.1, removed by
  P2.5). Never write to the live `~/.claude`, `~/my-claude-code-customization`, or tank's `~/tank-sim-lite-demo`.
  The live account is **read-only** (detection probe only).
- **The probe uses its OWN ControlMaster.** The socket lives in the session scratchpad, opened with `ssh -M -S <sock> -fN`
  and closed with `ssh -S <sock> -O exit`. It never uses a Claudesk master and never launches the dev app, so no
  Claudesk workspace or tmux server is touched. The transport is the same one the app uses (`ssh -S <ctl> -o BatchMode=yes -- <host>
  zsh -lc …`).
- ⚠️ **The tank workspace runs CC on this account the whole time,** so `~/.claude/projects`, `todos`, `statsig`, history
  etc. change for reasons that have nothing to do with the probe. Containment is judged on the files `install.sh` writes
  (`skills/`, `agents/`, `hooks/` link targets, `CLAUDE.md`, `settings.json`) plus a `find -newer` sweep of the real
  `$HOME` with CC's own runtime dirs listed and excluded explicitly. It is NOT judged by a whole-`~/.claude` shasum, which
  tank's activity would turn into a false finding.
- Tracked files carry placeholders only (`<user>`, `<mini-host>`); the repo is public.

## Work Tree

- [x] Phase 1: Install-side probes: containment, idempotency, cancel (§R.9 unknowns 1–3)  <!-- status: done -->
  **Observable outcomes:**
  - CLI (read-only, live account): a **before** baseline is captured to the scratchpad: `readlink` list of every entry in
    the live `~/.claude/{skills,agents,hooks}`, shasums of `~/.claude/CLAUDE.md` and `~/.claude/settings.json`, and the
    live clone's `git -C ~/my-claude-code-customization rev-parse HEAD` + `status --porcelain`. Each part is non-empty
    and its command exits 0.
  - CLI (state-changing, host sandbox only): `git clone <public HTTPS URL> ~/claudesk-m18-sandbox/.claudesk/vendor/my-claude-code-customization`
    exits 0 over the probe's own master, then `HOME=~/claudesk-m18-sandbox ./install.sh` exits 0 with stdin `</dev/null`
    (a prompt would block or fail, which is itself the answer to unknown 2's "no prompt" half).
  - CLI (unknown 3): every path that is new or modified since a marker `touch`ed just before the install lies under the
    canonicalized sandbox root (`cd -P && pwd -P`), except paths in an **explicitly listed** CC-runtime exclusion set.
    The live baseline re-read after the install is byte-identical to the before baseline. Every `skills/`/`agents/` link
    in the sandbox resolves into the sandbox clone, never into the live clone.
  - CLI (unknown 2): a second `HOME=<root> ./install.sh </dev/null` exits 0. A diff of the sandbox file list + link
    targets + `CLAUDE.md` before/after the re-run is recorded. `grep -c` of the workflow block's begin marker in
    `<root>/.claude/CLAUDE.md` = 1. Any backup file the re-run creates is listed.
  - CLI (unknown 1, state-changing, sandbox only): a streaming exec over the probe master runs a sandbox-only script that
    writes its own `$$`/pgid to `<root>/probe-pid`, then runs a long remote step and writes `<root>/probe-after` when that
    step ends. Run it **twice**: (a) the long step is `sleep 60` (deterministic) and (b) a real `git clone` into a
    `<root>/cancel-clone` dir, throttled or repeated so it is in flight. Each time, the local ssh is started in its own
    process group and SIGKILLed via `kill -KILL -<pgid>` (matching `subprocess::kill_group`) mid-step. Within ≤5 s, and
    again after the step's natural end time, the host's `ps -axo pid,ppid,pgid,stat,command` filtered to the recorded
    pgid is captured. The verdict is "remote stops" (no process in that pgid, no `probe-after`) or "remote runs on"
    (process alive or `probe-after` written), recorded per run.
  - CLI (uninstall containment, unknown 3's `uninstall.sh` half): `HOME=<root> ./uninstall.sh --dry-run` output is
    recorded, then the real `HOME=<root> ./uninstall.sh </dev/null` exits 0. The `-newer` sweep and the live-baseline re-read
    are repeated with the same pass rule as above. Then the sandbox is **re-installed** (one `install.sh` run) so Phase 2
    can probe it as an installed root.
  **Alignment questions:**
  - none (each unknown has a mechanical answer; its design consequence is the operator's to review at Phase 2's verify-human,
    once all five answers are in one place)
  - [x] P1.1 Probe master + host string: derive `<user>@<mini-host>` per the fence, open the scratchpad ControlMaster, `mkdir ~/claudesk-m18-sandbox` (refuse if it already exists), capture the live before-baseline  <!-- status: done -->
  - [x] P1.2 Sandbox clone + first `install.sh` with `HOME=<root>`, a marker before, then the `-newer` sweep + the live re-read (unknown 3, install half)  <!-- status: done -->
  - [x] P1.3 Second `install.sh` run + diff + the block count (unknown 2)  <!-- status: done (re-done at F9b with a mode/inode/mtime snapshot + a planted `.bak`) -->
  - [x] P1.4 The cancel probe, runs (a) and (b) (unknown 1). Kill only the probe's own local pgid, and sweep the host for that pgid afterwards  <!-- status: done (re-run at F9b with every capture saved to `scratchpad/wp3/cancel2/`) -->
  - [x] P1.5 `uninstall.sh --dry-run` + the real uninstall in the sandbox, the sweep + live re-read (unknown 3, uninstall half), then re-install for Phase 2  <!-- status: done -->
  - [x] P1.6 Record raw evidence (commands, outputs, timings, with identifiers redacted) in this WIP under `## Evidence`  <!-- status: done -->
  - [x] verify-auto  <!-- status: done (re-run after F9b) -->
    — evidence (after F9b): `git status --short` → exit 0, only `M backlog.md` (+10 lines, the new SURFACE) and `?? wip/`; no code touched.
    — evidence (after F9b): `idem2.out`, `cancel2/timeline.txt` and all 9 `cancel2/*-host-*.txt` captures non-empty.
    — evidence (after F9b): identifier grep over the WIP + the backlog's added lines → 0 + 0 hits.
    — evidence (first pass): probe phase, no code changed. `git status --short` → exit 0, only `?? workflow-system/state/wip/` (no tracked file touched).
    — evidence: identifier grep (host labels, the tailnet suffix, the admin account, the dev account's remote forms) over the WIP → 0 hits.
    — evidence: the raw outputs (`live-before/after1/after2.txt`, `cancel-{a,b-progress,c}.out`) are all non-empty; `cmp live-before.txt live-after2.txt` → exit 0.
  - [x] verify-self  <!-- status: done (re-run after F9b: 6/6 PASS) -->
    — first pass (kept for the record): vs.4 FAILED (unknown 2's record was contents-only), vs.5 UNVERIFIED (host captures not saved) → F9b fixed P1.3 + P1.4
    - [x] vs.1 live before-baseline  — evidence: `baseline.sh` re-run → exit 0, `cmp` identical to `live-before.txt` (54 links, both shasums, f8e8873, empty porcelain)
    - [x] vs.2 sandbox clone + install  — evidence: origin = the public HTTPS URL, HEAD f8e8873; `.install1.out` 55 `[new]`, no prompt; master socket up
    - [x] vs.3 unknown 3 install containment  — evidence: `.sweep-install1.txt` 74/27/1/1 (all tank); `cmp live-before live-after1` identical; host `.idem2-*` snapshots: 54 links, 0 outside the sandbox clone
    - [x] vs.4 unknown 2 idempotency  — evidence: `idem2.out` + host `.idem2-{A,B}-{pre,post}` agree: A 644→600, inode 8486379→8487539, same sha 81c48ac0…; B planted `.bak` gone, new inode; 55 `[ok]`; block count 1 (measured after B); cause matches `install.sh` §"Inject workflow snippet"
    - [x] vs.5 unknown 1 cancel  — evidence: `cancel2/timeline.txt` + 9 host captures: (a) +3 s zsh + sleep alive, after the end `after-sleep` exists and `after-echo` doesn't; (b) both clones `clone_exit=0`, HEAD f8e8873, 13 entries; (c) 5 procs → `kill_exit=0` → none at +1 s/+11 s, no clone dir; round trip 0.13 s
    - [x] vs.6 uninstall containment  — evidence: artifacts unchanged since pass 1 (55 `[remove]`, 2 tank sweep hits, `cmp live-before live-after2` identical); the sandbox is installed (54 links, block 1)
  - [x] verify-human  <!-- status: done --> — zero admissible leaves (F11); digest printed, advanced per drive_mode=autopilot. The design-consequence questions are deliberately at Phase 2 verify-human
  - [x] verify-codify  <!-- status: done -->
    Test scope: full — suite not long (`runtimes.md` → `pnpm verify:auto` Last 54s)
    — evidence: `pnpm verify:auto` → EXIT=0 in 47 s; vitest 321 files / 4088 pass; cargo 1436 pass / 0 fail (log: scratchpad `wp3/verify-auto-full.log`).
    — No new tests: probe phase, no code. No integration boundary (isolated probe artifacts only). The measured behaviours are the host's `install.sh` + ssh, not Claudesk code; their regression tests land with the code that depends on them: containment → WP6.4 (with the tank-noise exclusion list, not a whole-`~/.claude` shasum); the remote pgid cancel → WP6 (6.3); idempotent re-run → WP7.4.

- [x] Phase 2: Detection probe, the CLT case, cleanup, and the Probe outcomes write-up (§R.9 unknown 4 + §R.6)  <!-- status: done -->
  **Observable outcomes:**
  - CLI: a drafted `SUBSTRATE_PROBE` (a constant shell fragment with no interpolated value) prints
    `CLAUDESK-OPEN:substrate:yes|no`, the resolved repo root and its `git rev-parse HEAD`. It answers the SAME question
    as `workflow_substrate::skills_dir_exists`: a symlinked entry resolving into `<repo>/skills/<name>` whose
    `<repo>/install.sh` contains `WORKFLOW_MARKER`. Run locally under a temp `HOME` against the four fixture shapes
    (real dir, dangling link, link into a repo without the marker, the marker present), it agrees with the Rust
    predicate case by case, which a throwaway comparison shows (the WP4.1 parity test's shape, not the test itself).
  - CLI (read-only, live account): the probe reads `substrate:yes`, a root equal to the live clone's `pwd -P`, and a HEAD
    equal to its `rev-parse HEAD`. With `HOME=<sandbox root>` it reads `yes` + the sandbox clone. Against an empty temp
    root it reads `no`. A `cat ~/.claudesk/install-record.json` alongside reads "absent" on the live account (expected
    Developer).
  - CLI (unknown 4): the open-check command string, taken verbatim from `remote_cmd::open_check_command` via a throwaway
    test that prints it (never retyped), is timed over the probe master **≥10 runs each**, without and with the probe +
    record `cat` appended. Report median and max of each, and the delta. The comparison is against today's ~0.14 s.
  - CLI (§R.6): the host's `xcode-select -p` result is recorded. The no-CLT `git` behaviour over a non-tty ssh is recorded
    as exit code + stderr, from a simulation that cannot pop a GUI installer on the host's console (e.g. an invalid
    `DEVELOPER_DIR`), or else cited from Apple's documented stub behaviour, with the evidence's source stated.
  - CLI (cleanup, state-changing, sandbox only): `rm -rf ~/claudesk-m18-sandbox` after `cd -P` confirms the path is the
    sandbox and not `$HOME`. Afterwards `test -e` is false. The live baseline re-read is byte-identical to Phase 1's before
    baseline. The host shows no process carrying the probe's pgids. The probe master is closed (`-O exit`) and its socket
    is gone. The throwaway test file is deleted, and `git status` shows only `wbs.md` + this WIP.
  - CLI: `wbs.md` → "## Probe outcomes" has one entry per question (unknowns 1–4 + CLT), each with the measured answer
    and a "→ WP<n>" design consequence. `grep` of the added lines for the mini's host labels, the tailnet suffix, the admin account and
    the dev account's remote-path forms finds nothing (memory `mini-remote-user-is-stayman` → pre-push grep list).
  **Alignment questions:**
  - Unknown 2's consequence: if `install.sh` re-runs clean, Update stays `pull --ff-only` → `install.sh` as designed. If not,
    the probe proposes Uninstall + Install. Now that you see the measured re-run, still what you want? `(decision)` if
    it is not clean.
  - Unknown 1's consequence: if the remote side runs on after a local SIGKILL, cancel gains the remote pid file + a
    `kill` exec (§R.9.1). Does that cancel shape read right to you, or would you rather make Install uncancellable once
    the clone has started? `(decision)` only if the probe says the remote side runs on.
  - Unknown 4: is the measured open-latency delta acceptable for a probe that runs on every gate-ON remote open?
  - [x] P2.1 Draft `SUBSTRATE_PROBE` in the scratchpad + the local four-fixture agreement run against `skills_dir_exists` (via a throwaway test that calls it)  <!-- status: done -->
  - [x] P2.2 Throwaway test (deleted in P2.5) that prints `open_check_command(...)` verbatim. Time it ±probe, ≥10 runs each, over the probe master  <!-- status: done -->
  - [x] P2.3 Run the probe against the live account (read-only), the sandbox root and an empty root. Read the record on the live account  <!-- status: done -->
  - [x] P2.4 Record the CLT / `git` stub behaviour (simulation with no GUI popup, or a cited source)  <!-- status: done -->
  - [x] P2.5 Cleanup: the sandbox `rm -rf` (path-checked), the live baseline re-read, the host pgid sweep, the master `-O exit`, delete the throwaway test files  <!-- status: done -->
  - [x] P2.6 Write `wbs.md` → "## Probe outcomes" (answers + consequences + the drafted `SUBSTRATE_PROBE` for WP4.1 to adopt), then the identifier grep  <!-- status: done -->
  - [x] verify-auto  <!-- status: done -->
    — evidence: `git diff --quiet -- src-tauri` → exit 0; `zz_wp3_probe.rs` absent; `grep -rn zz_wp3 src-tauri/src` → 0 (throwaway fully removed).
    — evidence: the `wbs.md` "Probe outcomes" fenced block `diff` against the tested draft (`substrate-probe-draft.txt`) → identical; fences balanced (4).
    — evidence: `zsh -n -c <block>` → ok. The block run read-only on this Mac → `substrate:yes`, root = the local mccc clone, head f8e8873 (a 13th, real-world agreement point).
    — evidence: identifier grep over the added lines of `wbs.md`/`runtimes.md`/`backlog.md` and over the WIP → 0 + 0.
  - [x] verify-self  <!-- status: done (6/6 PASS after an in-place fix of vs.6; 3 Alignment questions CAPTURED) -->
    - [x] vs.1 the draft probe agrees with skills_dir_exists  — evidence: `parity.txt` 12/12, 4 positives with the right root; the runner's fresh local re-run of the 4 named shapes matched; mutated marker → `no`; the non-UTF-8 divergence reproduced (perl `yes`, UTF-8 decode raises)
    - [x] vs.2 live / sandbox / empty reads  — evidence: fresh read-only live read `substrate:yes`, root = the live clone's `pwd -P`, head `f8e8873` = `rev-parse HEAD`, record absent; sandbox + empty from `p23.out`
    - [x] vs.3 open-check latency  — evidence: `timing.txt` 30 runs all exit 0, recomputed: without median 0.117 / max 0.179 s, with 0.133 / 0.214 s, Δ +16 / +35 ms; the command string came from the builder (saved test reviewed). Caveat: the dir/tmux parts took the fast path in both arms
    - [x] vs.4 CLT  — evidence: `clt.out` + a fresh read: `xcode-select -p` → the Xcode dir, exit 0, not a tty; the simulation exits 1 with `xcrun: error: invalid DEVELOPER_DIR path`
    - [x] vs.5 cleanup  — evidence: sandbox absent; no process in pgids 37840/38021/38096/38188; fresh baseline `cmp` identical; no `/tmp/cdk3.*`; the remaining `ssh -M` 6044 is `/Applications/Claudesk.app`'s (09:04, predates the probe); `lib.rs` = `lib.rs.orig`, `git diff -- src-tauri` empty; dirty = `runtimes.md`, `backlog.md`, `wbs.md`, the WIP only
    - [x] vs.6 `wbs.md` Probe outcomes  — evidence (after the in-place fix): 5 entries each with a → WP consequence; identifier grep 0 over all added lines. First pass FAILED: (5)'s preflight `test -x "$(xcode-select -p)/usr/bin/git"` passes on a no-CLT host (empty path → tests the shim). Fixed to the guarded form, proven with a stub (`preflight/preflight.out`: naive 0 = wrong, guarded 2; invalid DEVELOPER_DIR 1; real 0 here + on the mini); the (3) sweep wording was corrected to name the non-tank hits; the mutation evidence was saved (`preflight/mutation.out`). Re-verified by a fresh runner (see Discoveries SHORTCUT)
    - [x] align: Unknown 2's consequence (Update stays `pull --ff-only` → `install.sh`?)  — evidence: `idem2.out` (content-clean, no prompt, block 1, same sha; NOT metadata-clean: 644→600, a pre-existing `.bak` deleted); `vs-rerun.out` 55 `[ok]`
    - [x] align: Unknown 1's consequence (cancel shape; `(decision)`, since the remote runs on)  — evidence: `cancel2/` (a: alive at +3 s, died at its next stdout write; b: both clones `clone_exit=0`; c: one remote group-kill exec → no process at +1 s, no clone dir, 0.13 s). The proposal is a pgid sentinel on the stream, cancel only during the clone, and Install removing a stale vendor clone
    - [x] align: Unknown 4 (is +16 ms median acceptable on every gate-ON remote open?)  — evidence: `timing.txt` (15+15, medians 0.117 → 0.133 s, max 0.179 → 0.214 s)

  - [x] verify-human  <!-- status: done (operator 2026-11-20: "1 ok, 2 A, 3 ok") -->
    - [x] P2.verify-human.1: Update stays `pull --ff-only` → `install.sh` → record (content-clean re-run; `.bak` loss logged upstream) — still what you want?  <!-- status: done — ok -->
    - [x] P2.verify-human.2: (decision) the cancel shape: local SIGKILL + one remote group-kill exec, pgid as a stream sentinel, cancel only during the clone, Install clears a stale vendor clone  <!-- status: done — A (as recommended) -->
    - [x] P2.verify-human.3: +16 ms median (+35 ms max) on every gate-ON remote open — acceptable?  <!-- status: done — ok -->
  - [x] verify-codify  <!-- status: done -->
    Test scope: full — last phase
    — evidence: `pnpm verify:auto` → EXIT=0 in 54 s; vitest 321 files / 4088 pass; cargo 1436 pass / 0 fail (log: scratchpad `wp3/verify-auto-full-p2.log`).
    — No new tests in Claudesk: probe phase, no code, no integration boundary. The probe's checks become real tests where the code lands: the 12-fixture parity → WP4.1 (`substrate_probe_agrees_with_skills_dir_exists`, plus the non-UTF-8 fixture); the CLT preflight's three arms with a stub `xcode-select` → WP6; containment on the script-written set → WP6.4; the cancel arms (local + remote group kill, cancel disabled during `install.sh`, a stale vendor clone) → WP6; the re-run → WP7.4.

## Evidence

All runs 2026-11-20 on `<user>@<mini-host>` (macOS 26.6, `git 2.50.1 (Apple Git-155)`, `xcode-select -p` = an
Xcode.app developer dir, `CLAUDE_CONFIG_DIR` unset). Transport: the probe's own ControlMaster
(`ssh -M -S <sock> -o BatchMode=yes -o ControlPersist=no -fN`), scripts sent as `zsh -l -s` on stdin or as
`ssh -S <sock> -o BatchMode=yes -- <host> "zsh -lc '<script>'"`. ⚠️ The session scratchpad path is too long for a Unix
socket (≥104 bytes, `ControlPath too long`), so only the socket lives in a short `mktemp -d /tmp/cdk3.XXXX`. Raw outputs
are in the session scratchpad `wp3/` (not tracked: they carry the real host).

**P1.1 — live before-baseline (read-only).** 54 links (48 `skills/` + 6 `agents/`; no `hooks/` dir), shasums of
`~/.claude/CLAUDE.md` + `settings.json`, the live clone at `f8e8873` with an empty `status --porcelain`, and `~/.claudesk` listed.
The sandbox `~/claudesk-m18-sandbox` did not exist before and was created fresh (`cd -P` → under the real `$HOME`).

**P1.2 — unknown 3, install half: CONTAINED.** `git clone` (public HTTPS URL) into `<root>/.claudesk/vendor/my-claude-code-customization`
→ exit 0 in **3.9 s**. `HOME=<root> ./install.sh </dev/null` → exit 0 in **0.45 s**, no prompt. Clone HEAD `f8e8873` (= the live clone).
`find $HOME -xdev -path <root> -prune -o -newer <marker> -print` → 103 hits, **all tank's own activity**:
`Library/Application Support/Epic` 74, `tank-sim-lite-demo/**` 27, an `UnrealEngine/UnrealTrace` log 1, and
`.claude/projects/-Users-<user>-tank-sim-lite-demo` 1 (tank's CC transcript). There were **zero** hits in `~/.claude/{skills,agents,hooks}`,
`~/.claude/CLAUDE.md`, `settings.json`, or any dotfile. Every sandbox link resolves inside `<root>` (no `OUTSIDE` line). The link set is
48 + 6, identical to live. Live re-read: **byte-identical** to the before-baseline.

**P1.3 — unknown 2: CONTENT-idempotent, not metadata-idempotent, and it deletes an existing `CLAUDE.md.bak`.**
(First record, corrected at F9b after verify-self vs.4: the original snapshot hashed contents only, so it could not see the points below.)
Re-run 2026-11-20 with a snapshot of every `<root>/.claude` entry (link target / file mode + inode + mtime + sha / dir mode); raw
output in scratchpad `wp3/idem2.out`.
- Case A, a plain re-run: exit 0, no prompt, `[ok] CLAUDE.md (workflow block already up to date)`. Every link is identical. `CLAUDE.md` has the
  **same sha** (`81c48ac0…`) but a **new inode, new mtime, and mode 644 → 600**.
- Case B, an operator's own `CLAUDE.md.bak` (other content) planted before the re-run: exit 0. Afterwards the **`.bak` is gone**, and `CLAUDE.md` was
  replaced again (new inode, same sha).
- Block count: measured once, after case B (= 1). Case A's count is inferred, since A and B leave `CLAUDE.md` with the same sha.
- The cause is `install.sh` §"Inject workflow snippet". On the "block present" path it runs `cp CLAUDE.md CLAUDE.md.bak` (overwrite),
  `awk … > $(mktemp)`, `mv` that tmp file over `CLAUDE.md` (mktemp's 0600, a new inode), and `rm CLAUDE.md.bak` if `cmp` shows no change.
  Backlog: `SURFACE-2026-11-20-INSTALL-SH-RERUN-DELETES-AN-EXISTING-CLAUDE-MD-BAK` (upstream, low).
- Original run (the first record), still valid for what it measured: a contents-only snapshot was identical, and 55 `[ok]`, 0 `[new]/[update]/[append]`.
⚠️ Side finding: `install.sh` **never writes `settings.json`**. It only PRINTS four permissions to add (`Read/Edit(~/.claude/**)`
and `Read/Edit(<clone>/**)`), and `uninstall.sh` symmetrically only prints them. The mini's hand install merged them by hand.

**P1.4 — unknown 1: a local SIGKILL does NOT stop the remote side; a remote process-group kill does.** Re-run at F9b with **every
capture saved** in scratchpad `wp3/cancel2/` (the first run's host captures were printed, not saved: verify-self vs.5). Each run has
`timeline.txt` (start/kill epoch), `<id>-local.out`, and `<id>-host-<when>.txt`, which holds the `ps` filtered to the recorded pgid, an `ls`
of the probe files, their contents, and the clone dir's HEAD. The local `ssh` runs in its own process group
(`perl -e 'setpgrp(0,0); exec @ARGV'`) and is killed with `kill -KILL -<pgid>` (= `subprocess::kill_group`). The script's first act
writes `ps -o pgid= -p $$` to `<root>/probe-<id>-pgid`. The driver is saved as `cancel2/driver.sh` (copied after the run). Host-vs-local clock skew is under 1 s, so the "+N s" labels are ±1 s. On the host, the `zsh -lc` is a session leader (`Ss`, pgid = its pid) under sshd.
- (a) `sleep 20; touch after-sleep; echo line; touch after-echo`, killed at +4.0 s. Local ssh dead (`a-local-alive.txt` empty). **+3 s**:
  zsh + `sleep 20` alive in the pgid. **After the step's end**: no process remains, `after-sleep` **exists**, and `after-echo` does **not**.
  → The remote runs on until its **next stdout write**, which kills it. (20 s instead of the plan's 60 s does not matter: verify-self agreed,
  since the step still had about 16 s left at the check.)
- (b) A real `git clone` of the public URL, killed at +1.6 s (2% received). With `--progress` and with `--quiet`, the **+1.5 s** capture shows
  `git index-pack` still running and the clone dir has no HEAD yet. At **+12 s**: no process, `after-clone` = `clone_exit=0`,
  and the clone dir has HEAD `f8e8873` and 13 entries (a complete checkout). `after-echo` is absent. → The clone **completes** after the
  local kill; stderr progress writes do not kill git; only the shell's next stdout `echo` dies.
- (c) The candidate cancel: same clone, local kill at +1.6 s, then ONE exec. Its `ps before kill` shows 5 processes in the pgid (zsh,
  `git clone`, `git remote-https`, `git-remote-https`, `index-pack`); then `kill -TERM -- -<pgid>` → `kill_exit=0`. **+1 s and +11 s**:
  no process, **no clone dir** (git's own signal handler removed the partial clone), and no `after-clone`. The exec's round trip was 0.13 s.
- ⚠️ Consequence beyond §R.9.1: a remote group kill that lands DURING `install.sh` stops it between two `ln -s`. That leaves
  some workflow links and **no record**, and the §R.2 probe would then read `substrate:yes` without a record = **Developer**, which offers no
  Uninstall. `install.sh` takes 0.45 s.

**P1.5 — unknown 3, uninstall half: CONTAINED.** `HOME=<root> ./uninstall.sh --dry-run` → exit 0, 55 `[remove] … (dry-run)`
lines, nothing removed (48 skills still there). The real run → exit 0, 55 removed. Sweep since its marker: 2 hits, both
`tank-sim-lite-demo/Source/TankSim`. Live re-read: **byte-identical**. Residue in `<root>/.claude`: an EMPTY `CLAUDE.md` (0 bytes,
the block removed), `CLAUDE.md.bak`, and empty `skills/` + `agents/` dirs. Then a re-install (`[append]` the block into the empty
file, backup `.bak` overwritten) → 48 skills, 1 block. The sandbox is left **installed** for Phase 2.

**P2.1 — the `SUBSTRATE_PROBE` draft + parity (12/12).** The draft is one `perl` process mirroring `skills_dir_exists` step for step;
its text is in `wbs.md` → "Probe outcomes" (4). A throwaway in-crate test (`src-tauri/src/zz_wp3_probe.rs` + a `#[cfg(test)] mod`
line in `lib.rs`, both removed at P2.5; a copy is saved in scratchpad `wp3/zz_wp3_probe.rs.saved`) ran it under `zsh -c` with
`HOME=<tempdir>` against 12 fixture shapes beside `crate::workflow_substrate::skills_dir_exists`. Result: **0 disagreements**, 4 positive
cases, and every positive printed the canonical repo root (`wp3/parity.txt`). **Mutation:** the probe's marker changed to
`…systemX` → the test FAILED (`disagreements` assert); the file was restored via `cp` and its shasum compared (1 unique hash).

**P2.2 — open-check latency (unknown 4).** The throwaway test wrote `open_check_command("claudesk-dev", "cd-zzwp3", "/tmp/zz-wp3-none", true)`
verbatim (`wp3/open-check-without.txt`), plus the same command with the draft appended INSIDE the one login-shell script (`open-check-with.txt`;
the unquote round-trip was asserted). Each was run 15× over the probe master, interleaved, all exit 0 (`wp3/timing.txt`). Without: min 0.088 /
**median 0.117** / max 0.179 s. With: min 0.107 / **median 0.133** / max 0.214 s. **Delta +16 ms median, +35 ms max.** Representativeness: the
probe walks the live account's real 48-skill tree; the dir/session parts read `no` (a non-existent path and session) and are identical in both arms.

**P2.3 — probe reads (`wp3/p23.out`).**
- **Live (read-only):** `substrate:yes`, root `~/my-claude-code-customization` = its `pwd -P`, head `f8e8873` = its `rev-parse HEAD`. No
  `~/.claudesk/install-record.json` → **Developer**.
- **Sandbox:** `HOME=<root>` → `yes`, root = the sandbox clone's `pwd -P`, head `f8e8873`.
- **Empty root** (`mktemp -d`) → `no`.
- **Sandbox + a fake record:** `record-hex:7b2278223a317d0a` (= `{"x":1}\n`), then the fake record was removed.

**P2.4 — CLT (`wp3/clt.out`).**
- **Real:** `xcode-select -p` → the Xcode.app developer dir, exit 0. `pkgutil` shows the CLT installed (26.6). `command -v git` = `/usr/bin/git` (the shim). Not a tty.
- **Simulation:** `DEVELOPER_DIR=/var/empty /usr/bin/git --version` → exit 1, `xcrun: error: invalid DEVELOPER_DIR path (/var/empty), missing xcrun …`.
  `DEVELOPER_DIR=/var/empty xcode-select -p` → prints `/var/empty`, **exit 0** (no validation).
- **Not measured:** the true no-CLT shim (no such host); cited per Apple's stub behaviour.

**P2.5 — cleanup (`wp3/cleanup.out`).** The path check confirmed `cd -P` = `$HOME/claudesk-m18-sandbox` (not `$HOME`) → `rm -rf` exit 0 → `test -e` false.
No stray `probe-`/`cancel-clone`/sandbox process on the host. Live baseline re-read `cmp` identical to `live-before.txt`. The probe master
was closed with `-O exit` (pid 9780 gone), its socket and `/tmp/cdk3.*` dir were removed. The one remaining `ssh -M` (pid 6044) belongs to the installed
`/Applications/Claudesk.app` (tank's workspace), predates the probe, and was left alone. The throwaway test was deleted, `lib.rs` restored (sha
`4d94ddf…` = before), and `git diff -- src-tauri` is empty. `git status` shows `runtimes.md` (the verify:auto timing entry),
`backlog.md` (the new SURFACE), `wbs.md` (outcomes) and this WIP.

**P2.6 — `wbs.md` → "## Probe outcomes"** is written: 5 answers, each with its → WP consequence, plus the draft constant. Identifier grep
of the added lines → 0.

## Retrospect
- **What changed in our understanding:**
  - Cancel over the master is not what §R.9.1 guessed. The host runs on after a local kill (a clone finishes), and dies only at its next stdout write. That makes a remote group kill necessary, and it also opens an app-death window around `install.sh`.
  - `install.sh` is content- but not metadata-idempotent, and it deletes an existing `.bak`.
  - `xcode-select -p` does not validate, and a naive preflight built on it passes on the very host it should refuse.
- **Assumptions that held:**
  - `HOME=<root>` contains every write, so the sandbox-root verification strategy (§R.8) is sound.
  - The re-run is clean enough for Update as designed.
  - A one-process probe fits the open-check budget (+16 ms).
- **Assumptions that were wrong:**
  - "The remote may run on → write a pid file": a stream sentinel is simpler.
  - The first idempotency record (contents-only snapshot) and the first cancel record (unsaved host captures) were too weak, and verify-self caught both.
  - The first CLT preflight was wrong.
  - Containment cannot be judged by a whole-`~/.claude` shasum on an account a live workspace uses.
- **Approach delta:**
  - One F9b back-loop in Phase 1 (evidence fidelity).
  - One in-place fix at Phase 2 verify-self (the preflight).
  - The probe used its own ControlMaster instead of a dev app, so no Claudesk session was touched.
  - The probe ran a 20 s sleep, not the planned 60 s (judged immaterial).
  - The review-quality doc drift was reconciled at finalize. The WP4.1/WP6 design gaps the review found (the `git` shim in the draft, the sandbox-root seam, the `install.sh` window guard) stay backlogged to those WPs.

**Closure:** Requester = operator — closure notice for self-record.
> **Feature complete:** M18 WP3 (probe) has shipped. It measured on the mini how a remote install, re-run, cancel and detection probe actually behave, and wrote one answer + design consequence per question into `wbs.md` → "Probe outcomes". WP4 starts from its drafted `SUBSTRATE_PROBE`, and WP6 from its cancel ruling A and the guarded preflight.

## Code-Quality Review — m18-wp3-remote-substrate-probe

*(ship commit `0c45070`; drive_mode=autopilot → 4 MAJOR + 4 MINOR auto-backlogged to `backlog-quality-findings.md` → `# m18-wp3-remote-substrate-probe — 2026-11-20`; pointer in `backlog.md`.)*

### Strengths
- Every "Measured" claim in `wbs.md` → "Probe outcomes" traces to a saved capture. When verify-self found gaps, both were re-run, and the corrected record is labelled rather than quietly swapped in.
- The `SUBSTRATE_PROBE` draft is checked against the real `skills_dir_exists` on 12 fixtures and mutation-proven. The one divergence (a non-UTF-8 `install.sh`) is recorded with a recommendation.
- The CLT preflight's empty-path trap was caught and proven with a stub. Measured, simulated and cited claims are kept apart.
- Operator rulings sit next to the evidence, with the rejected options named.
- Public-repo hygiene holds, the live account was provably read-only, and the upstream `.bak` SURFACE is well shaped.

### Issues
**CRITICAL**
- (none)

**MAJOR**
- [wbs.md "Probe outcomes" (4), the draft] The probe runs `git -C $root rev-parse HEAD` via PATH on every gate-ON open. On a host with broken or missing CLT that is the `/usr/bin/git` shim, which (5) says pops the installer. — WP4.1 would adopt it as written. → `SURFACE-2026-11-20-QUALITY-SUBSTRATE-PROBE-RUNS-THE-GIT-SHIM`
- [wbs.md (4)] The draft reads `$ENV{HOME}` with no seam for the debug sandbox root that WP4.6 and WP6.6 need. A `HOME=<root>` prefix breaks the "constant fragment" rule. → `…-SUBSTRATE-PROBE-HAS-NO-SANDBOX-ROOT-SEAM`
- [wbs.md (1), ruling A] Cancel-only-during-clone is enforced only by disabling the button. App death during `install.sh` SIGPIPEs it between links, and a cancel already in flight can land after the boundary. → `…-INSTALL-SH-WINDOW-UNGUARDED-AGAINST-STREAM-DEATH`
- [wbs.md WP6 description + 6.4; arch §R.2/§R.6/§R.9.1] Downstream text still describes the refuted designs (the whole-`~/.claude` shasum, the naive preflight, the pid file), and there are no WP6 tasks for the cancel items. → `…-WP6-TASK-TEXT-AND-ARCH-STILL-DESCRIBE-REFUTED-DESIGNS`

**MINOR**
- [WIP] P1.4 is `[ ]` with status done, under a Phase 1 marked `[x]`. → `…-WP3-WIP-P1-4-CHECKBOX-UNCHECKED`
- [runtimes.md] The previous `**Last:**` line was overwritten, and the new History bullets are unlabelled. → `…-RUNTIMES-PRIOR-LAST-OVERWRITTEN`
- [wbs.md (5)] The no-CLT `xcode-select -p` behaviour is stated as fact but was only stub-measured. → `…-NO-CLT-XCODE-SELECT-CLAIM-UNLABELLED`
- [wbs.md (4)] The `substrate-root:` line has no newline guard. → `…-SUBSTRATE-ROOT-LINE-NO-NEWLINE-GUARD`

### Assessment
Strong as a probe deliverable: measured answers with saved evidence, a mutation-proven parity draft, and honest self-corrections. The weaker side is how the findings carry forward. The drafted constant still runs the `git` shim and lacks a sandbox-root seam. Ruling A's `install.sh` window needs a host-side guard. The WP6 task text and arch still describe the refuted designs. Nothing measured is wrong. The risk is that WP4/WP6 builders follow their own task lines.

### If you disagree
Edit this section and mark a finding `[DISMISSED]` before `feature-finalize` archives the WIP.

## Current Node
- **Path:** Feature > done (archived)
- **Active scope:** none (finalized 2026-11-20)
- **Blocked:** none
- **Unvisited:** none (Phase 2 is the last)
- **Open discoveries:** SURFACE-2026-11-20-INSTALL-SH-RERUN-DELETES-AN-EXISTING-CLAUDE-MD-BAK (upstream, low); 8 code-quality findings (pointer in backlog.md)

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->
[SHORTCUT-2026-11-20] P2.verify-self.vs.6 — `wbs.md` (5)'s WP6 CLT preflight passed on a no-CLT host (empty `xcode-select -p` → `test -x /usr/bin/git` = the shim). Fixed in place to `d=$(xcode-select -p 2>/dev/null) && [ -n "$d" ] && [ -x "$d/usr/bin/git" ]`, proven with a stub (naive 0 / guarded 2 / invalid 1 / real 0, here + on the mini); also corrected (3)'s sweep wording and saved the mutation evidence. A trivial extension of P2.6's text, re-verified by a freshly spawned verify-self runner.
[SURFACED-2026-11-20] P1.3 — an `install.sh` re-run deletes an existing `~/.claude/CLAUDE.md.bak` and resets `CLAUDE.md` to 0600 (content-idempotent only). Upstream (mccc); WP7 Update is unchanged. Backlog `SURFACE-2026-11-20-INSTALL-SH-RERUN-DELETES-AN-EXISTING-CLAUDE-MD-BAK`.
