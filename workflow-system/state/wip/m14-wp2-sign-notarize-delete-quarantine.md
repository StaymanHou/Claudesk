# Feature: M14 WP2 — Sign + notarize the release pipeline, and delete the quarantine workaround

**Workflow:** feature
**State:** build (Phase 1 COMPLETE; Phase 2 in progress)
**Created:** 2026-09-18
**WBS:** M14 (remainder) WP2 — tasks 2.1–2.8
**Depends on:** WP1 ✅ COMPLETE — VERDICT GO (commit `481b4bb`)

## Problem Statement

Claudesk shipped unsigned since v0.2.9, and that single fact grew a workaround into the
product: the updater clears its own `com.apple.quarantine` xattr after install, the frontend
carries a `QUARANTINE_FALLBACK_ACTIVE` seam for when that fails, and the README + `/release`
skill tell users to run `xattr -dr` by hand. WP1 reversed the underlying decision and proved the
replacement works end-to-end — a notarized build reports `spctl -a → source=Notarized Developer
ID`, so **Gatekeeper no longer quarantines it at all**. This WP makes that reversal real: wire
notarization into the release pipeline so it cannot be silently skipped, then **delete** the
mechanism the unsigned era required, and correct every live doc that still instructs users to
work around a problem that no longer exists. The payoff is deletion — ~49 code references across
9 files, plus the user-facing `xattr` step.

**3rd-party dependency:** Apple notarization service. ✅ **Probe WP complete** (WP1, verdict GO):
submission `e582b857-7182-4fbd-a217-21aca518ef5f` → Accepted; pipeline shape, credential
mechanism, and entitlements all documented in `wbs.md` tasks 1.3–1.8. Not a known unknown.

## Key findings from scoping (change the risk profile)

1. ⚠️ **`clear_own_quarantine` / `quarantine_clear_command` are NOT `#[tauri::command]`** — they
   are internal fns called from `updater_apply`. **No `invoke()` sweep is owed** (task 2.5's
   stringly-typed-binding hazard does not apply). Verified by grep of the `invoke_handler`.
2. ⚠️ **`QUARANTINE_FALLBACK_ACTIVE` is already hardcoded `false`** (`updateFlowState.ts:90`) —
   the frontend seam is **dead code today**. Deleting it removes an always-false branch; it is
   not a behavior change. This is why Phase 2 is low-risk despite touching 5 TS files.
3. ⚠️ **`updaterWiring.test.ts:97` is a `?raw` source guard** asserting
   `if (QUARANTINE_FALLBACK_ACTIVE)` appears in `useUpdater.ts`. It **will** break when the
   branch is deleted — that is a planned edit, not a regression.
4. ⚠️ **Archive files must NOT be rewritten.** Of ~50 `xattr` sites, the ones under
   `workflow-system/*/archive/` (24) are historical record of what was true then. Only **live**
   docs get corrected: README (7), `/release` SKILL.md (7), `roadmap.md` (4),
   `arch/build-update-release.md` (3), `wbs.md` (6), `context.md` (1).
5. ⚠️ **`/release` is PROJECT-LOCAL** (`.claude/skills/release/SKILL.md`, a regular file) — **not**
   a symlink into the mccc repo. Task 2.4's cross-repo warning **does not apply**; this is an
   ordinary Claudesk change. (Verified: `readlink` returns nothing.)
6. ⚠️ **The migration test kills every running Claudesk** — a self-update replaces the running
   bundle. It is therefore **operator-run at a clean boundary**, never agent-run (same constraint
   the `/release` skill already records for Step 11, and `backlog.md` line ~356).

## Work Tree

- [x] Phase 1: Release pipeline — notarize + staple, fail loudly  <!-- status: DONE 2026-09-18 -->
  **Observable outcomes:**
  - CLI: `pnpm tauri build` with `APPLE_SIGNING_IDENTITY` + the notarization env triad set
    produces `Claudesk.app` where `codesign -dv` reports `flags=0x10000(runtime)` and
    `Authority=Developer ID Application: Yuechen Hou (C8RJH77B47)`; exits 0.
  - CLI: `spctl -a -t exec -vvv` on the built `.app` prints `source=Notarized Developer ID`.
  - CLI: `xcrun stapler validate` exits 0 on **both** the `.dmg` and the `.app`.
  - CLI: `grep -c "notarytool\|APPLE_TEAM_ID" .claude/skills/release/SKILL.md` ≥ 1 — the skill
    documents the notarization step rather than leaving it implicit.
  - CLI: the release skill contains **no executable instruction** to run `xattr -dr` —
    i.e. no `xattr -dr` line inside a ```bash fenced block:
    `awk '/^   ```bash/,/^   ```/' .claude/skills/release/SKILL.md | grep -c "xattr -dr"` → 0.
    ⚠️ **Corrected 2026-09-18 during P1.4.** The outcome originally read
    `grep -c "xattr -dr" … → 0`, which is **wrong**: a bare string count cannot tell an
    *instruction* from a *prohibition against re-adding it* ("Do not re-add an `xattr -dr`
    line…"). Two such prohibitions are deliberately present and should stay. The check must
    look at **code blocks**, where an instruction would actually live.
  - [x] P1.1 Add a preflight to `/release`: assert the signing identity resolves AND the
        notarization credential triad (or keychain profile) is present **before** building.
        ⚠️ **This is the guard against WP1's surprise #1** — Tauri prints
        `Warn skipping app notarization` and **still exits 0**, so an un-notarized build looks
        successful. The preflight must make that state unreachable, not merely documented.
        <!-- status: DONE -->
  - [x] P1.2 Add the notarize + staple steps to the `/release` pipeline (submit the `.dmg` with
        `--keychain-profile claudesk-notary --wait`, then `stapler staple` the `.dmg` **and** the
        `.app`). Record the credential mechanism (profile name), **never the secret**.
        <!-- status: DONE -->
  - [x] P1.3 Add a post-build verification gate to `/release`: `codesign --verify --deep --strict`
        + `spctl -a` + `stapler validate`, all three required. ⚠️ **`codesign` alone does not
        prove notarization** (WBS task 2.2), and `codesign` **exits 0 on a failed sign** (WP1
        finding) — so assert on the `Authority=`/`source=` output, not on `$?`.
        <!-- status: DONE -->
  - [x] P1.4 Remove the `xattr` instructions from `/release` Step 11 and the release-notes
        template; replace the quit→upgrade→xattr→reopen block with quit→upgrade→reopen.
        Keep the Homebrew 6.x `--no-quarantine` warning (still true: the flag was removed) but
        drop the `xattr` remedy it points at. <!-- status: DONE -->
  - [x] verify-auto  <!-- status: DONE — 4 scoped checks + 5 observable outcomes, all PASS -->
  - [x] verify-self  <!-- status: DONE — subagent 6/6 PASS, 0 BLOCKING, 0 COSMETIC -->
  - [x] verify-human  <!-- status: DONE — operator reviewed the /release rewrite 2026-09-18: "all good" -->
  - [x] verify-codify  <!-- status: DONE — no code changed (procedure doc only); the executable
        properties are already pinned by verify-auto's bash -n sweep + the observable-outcome
        greps, which re-run on demand. No permanent test is owed for a markdown runbook. -->

- [ ] Phase 2: Delete the quarantine workaround (code)  <!-- status: in-progress -->
  **Observable outcomes:**
  - CLI: `grep -rn "quarantine\|QUARANTINE\|resolve_bundle_path" src-tauri/src src/ --include='*.rs' --include='*.ts' --include='*.tsx'`
    returns **0 matches** (excluding archive dirs).
  - CLI: `pnpm verify:auto` exits **0** — 199+ frontend test files, Rust suite green,
    `cargo clippy --all-targets -D warnings` clean (a deleted-but-still-referenced symbol fails here).
  - CLI: `cargo build --release` exits 0 with no `unused import`/`dead_code` warnings introduced.
  - Browser: ⚠️ **BOOT SMOKE TEST — the app actually renders.** Launch the built `.app`; the
    webview `#root` has ≥1 child element and the project picker is present in the DOM.
    ⚠️ **This outcome exists because of the M13.5 WP3 incident** — a deleted ES-module export
    left `verify:auto` and `tsc` both green while `#root` was empty. **A green suite does not
    prove the app boots.**
  - Console: no JS errors on load (verified via a self-tested tap, not `read_logs{console}`,
    which captures nothing for this app).
  - [x] P2.1 Delete Rust: `clear_own_quarantine`, `quarantine_clear_command`,
        `resolve_bundle_path`, `QUARANTINE_ATTR`, the quarantine `UpdaterError` variants, and
        the `lib.rs:76` comment. Update the `updater/mod.rs` module doc (it currently opens with
        "Claudesk is unsigned/un-notarized (locked decision…)" — now false).
        ⚠️ **SCOPE CORRECTION (2026-09-18, pre-build): the WHOLE `UpdaterError` enum dies, not
        "the two variants" the WBS names.** It has **three** variants — `BundleUnresolved`,
        `Xattr`, `XattrNonZero` — and **all three are quarantine-only**. Verified: every
        `UpdaterError` reference in the tree is inside `clear_own_quarantine` (mod.rs:132-141)
        or its single call site (commands.rs:182). With the fn gone the enum has no remaining
        constructor or consumer, so leaving it would be dead code that `clippy` flags.
        <!-- status: NOT-STARTED -->
  - [x] P2.2 Delete the call sites in `updater/commands.rs` (`updater_apply`'s self-clear step)
        and the `workflow_install/runner.rs` mention. ⚠️ **Same phase as P2.1 by design** — do
        NOT split a deletion from its consumer migration. <!-- status: NOT-STARTED -->
  - [x] P2.3 Delete frontend: `QUARANTINE_FALLBACK_ACTIVE` (`updateFlowState.ts`), its branch in
        `useUpdater.ts:166`, and the fallback dialog + wiring in `App.tsx`.
        <!-- status: NOT-STARTED -->
  - [x] P2.4 Update the two test files: delete the `QUARANTINE_FALLBACK_ACTIVE` default-value
        test (`updateFlowState.test.ts:67-71`) and the `?raw` branch guard
        (`updaterWiring.test.ts:90-97`). ⚠️ **Deleting a guard is only correct because the thing
        it guarded is gone** — confirm no *other* behavior rides on those tests before removing.
        <!-- status: NOT-STARTED -->
  - [x] P2.5 Run the boot smoke test **in this phase**, before handing off. A built-and-launched
        `.app` with a populated `#root`. <!-- status: NOT-STARTED -->
  - [ ] verify-auto  <!-- status: NOT-STARTED -->
  - [ ] verify-self  <!-- status: NOT-STARTED -->
  - [ ] verify-human  <!-- status: NOT-STARTED -->
  - [ ] verify-codify  <!-- status: NOT-STARTED -->

- [ ] Phase 3: Correct the live docs  <!-- status: NOT-STARTED; depends on Phase 2 -->
  **Observable outcomes:**
  - CLI: **no `xattr` instruction in the INSTALL path** a release user follows:
    `awk 'NR<100' README.md | awk '/```bash/,/```$/' | grep -c "xattr -dr"` → 0
    (verified with a positive control so the awk window is provably non-empty). The
    pre-v0.5.2 historical note mentions the string in PROSE, which is fine — only an
    executable instruction inside a code block would be a failure.
    ⚠️ **Corrected 2026-09-18 during P3.3.** The outcome originally demanded
    `grep -c xattr README.md → 0`, which is **wrong and would have made the README
    incorrect**: the *build-from-source* section legitimately keeps `xattr`, because a
    contributor's local `pnpm tauri build` IS unsigned (only released builds are signed).
    Deleting those would have told contributors their own builds open cleanly when they
    do not. 5 matches remain and all 5 were verified legitimate: 1 historical note,
    2 in build-from-source, 2 explaining the change.
  - CLI: `grep -rn "unsigned\|not notarized" workflow-system/product/arch/build-update-release.md`
    returns only lines that describe the **superseded** decision as history (each within 2 lines
    of a "REVERSED"/"superseded" marker), never as live posture. Checked by reading the matches,
    not by count alone.
  - CLI: archive files are **untouched** — `git diff --name-only` contains no path matching
    `workflow-system/*/archive/`.
  - CLI: `grep -c "774E2E8429FDF78A" workflow-system/product/arch/build-update-release.md` ≥ 1 —
    the minisign anchor is still documented as retained.
  - [x] P3.1 Rewrite `arch/build-update-release.md`: the "Unsigned + minisign, not notarized"
        decision and the "M14 overlap — reconciled" bullet. Record the reversal, its date
        (2026-09-18), the evidence, and ⚠️ **that minisign is RETAINED and the anchor
        `774E2E8429FDF78A` is unchanged**. <!-- status: NOT-STARTED -->
  - [x] P3.2 ⚠️ **Grep the retracted claim repo-wide FIRST** (`doc-correction-scope-list-is-a-floor`):
        `xattr`, `quarantine`, `unsigned`, `not notarized`. Triage each hit into
        **(a)** live claim → fix, **(b)** historical record in `archive/` → **leave**,
        **(c)** string match with no claim → leave. The WBS names 2 sites; treat that as a
        **floor**, not the list. <!-- status: NOT-STARTED -->
  - [x] P3.3 Update README's install instructions (7 sites) — remove the `xattr` step; the
        `.dmg` and Homebrew install now pass Gatekeeper unaided. <!-- status: NOT-STARTED -->
  - [x] P3.4 Update `roadmap.md` (4) + `context.md` (1) + this cycle's `wbs.md` (6) where they
        assert the unsigned posture as current. <!-- status: NOT-STARTED -->
  - [x] P3.5 Check the Homebrew tap cask (task 2.8) for any stanza or caveat that assumed an
        unsigned artifact. ⚠️ **The cask lives in a DIFFERENT repo** — if a change is owed,
        surface it as a cross-repo handoff, do not edit silently. <!-- status: NOT-STARTED -->
  - [ ] verify-auto  <!-- status: NOT-STARTED -->
  - [ ] verify-self  <!-- status: NOT-STARTED -->
  - [ ] verify-human  <!-- status: NOT-STARTED -->
  - [ ] verify-codify  <!-- status: NOT-STARTED -->

- [ ] Phase 4: Ship v0.5.2 + prove the migration  <!-- status: NOT-STARTED; depends on Phase 3 -->
  **Observable outcomes:**
  - CLI: `gh release view v0.5.2` lists the `.dmg`, `.app.tar.gz`, `.sig`, and `latest.json`.
  - CLI: the published `.dmg`, downloaded fresh, reports `spctl -a → source=Notarized Developer
    ID` and `stapler validate` exits 0 — ⚠️ **verified on the DOWNLOADED artifact**, not the
    local build, so the check covers what users actually receive.
  - CLI: the published `latest.json` signature verifies against the **unchanged** anchor
    `774E2E8429FDF78A`.
  - ⚠️ **Operator-observed (agent CANNOT run this):** an installed v0.5.1 self-updates to v0.5.2
    via the in-app updater, relaunches, reports 0.5.2, and **no `xattr` step is needed**.
  - [ ] P4.1 Cut v0.5.2 via `/release` (now notarizing). ⚠️ **Version bump + tag + push are the
        OPERATOR's call** — present the built+verified artifacts and stop.
        <!-- status: NOT-STARTED -->
  - [ ] P4.2 Verify the **downloaded** release artifact (not the local build) passes
        `spctl` + `stapler validate`. <!-- status: NOT-STARTED -->
  - [ ] P4.3 ⚠️ **OPERATOR-RUN migration test (task 2.7 — the unrecoverable failure mode).**
        A real v0.5.1 → v0.5.2 self-update. ⚠️ **This kills every running Claudesk session,
        including the one driving this work** — so it runs at a clean boundary, by the operator,
        after the session. Recovery path if the anchor were wrong: the `.dmg` is downloadable
        and installable by hand. <!-- status: NOT-STARTED -->
  - [ ] P4.4 ⚠️ **Close WP1's residual risk here:** confirm `claude`, `subl` and `smerge` spawn
        correctly from the **notarized installed** app. WP1 proved only `zsh` + `perl`; a real CC
        session spawn from a signed build is still unproven and this is the first build where it
        can be observed. <!-- status: NOT-STARTED -->
  - [ ] verify-auto  <!-- status: NOT-STARTED -->
  - [ ] verify-self  <!-- status: NOT-STARTED -->
  - [ ] verify-human  <!-- status: NOT-STARTED -->
  - [ ] verify-codify  <!-- status: NOT-STARTED -->

## Current Node
- **Path:** Feature > Phase 3 > verify-auto
- **Active scope:** Phase 3 impl complete (P3.1–P3.5 `[x]`); verification group next
- **Blocked:** none
- **Unvisited:** Phase 3 (correct live docs) → Phase 4 (ship v0.5.2 + migration)
- **Open discoveries:** 1 — the staple/re-tar ordering trap (P1.2/P1.3), resolved in-phase

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->

[SURFACED-2026-09-18] Phase 3 / P3.5 — **The Homebrew cask's `caveats` block was the most
user-visible stale claim of all** — it printed "Claudesk is an UNSIGNED build … clear the
quarantine flag once: xattr -dr …" to EVERY installing user, and it lives in a SEPARATE repo
(`homebrew-claudesk/`) that the WBS's task-2.8 wording ("if notarization changes anything it
asserts") framed as a maybe. It did. Rewritten: the unsigned comment block now records the
signed+notarized posture, and `caveats` drops the xattr instruction entirely. ⚠️ **Left
UNCOMMITTED in the tap repo on purpose** — it is a different git repo and `/release` step 8
bumps `version`/`sha256` there during the Phase 4 cut, so the two edits should land in one
commit rather than leaving the tap dirty across a release.

[SURFACED-2026-09-18] Phase 1 / P1.3 — **Stapling the `.app` AFTER the build leaves the
updater payload unstapled.** Tauri creates `Claudesk.app.tar.gz` *during* `tauri build`,
i.e. before `stapler staple` runs, so the tarball contains an app with **no ticket** and
its `.sig` is over the stale bytes. Verified empirically: extracting the as-built tarball
and running `stapler validate` reports *"does not have a ticket stapled to it"*, while the
`.app` on disk validates fine. Shipping that payload would make every self-updating user's
Gatekeeper check require the **network** (ticket fetched online), failing offline — quietly
re-introducing the friction this milestone deletes. **Fix (now step 3c): staple → re-tar →
re-sign**, in that order; re-tarring invalidates the `.sig`, so the re-sign is mandatory.
Confirmed a re-tar of the stapled `.app` preserves the ticket. **Not in the WBS's task list
— found only because the artifacts were inspected rather than assumed.**
