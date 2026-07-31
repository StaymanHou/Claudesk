# Feature: Per-project CC default-model override

**Workflow:** feature
**State:** ship (complete)
**Created:** 2026-07-31
**Milestone:** 11.5 (WP1 — lead deliverable)
**Resolves:** `SURFACE-2026-07-31-PER-WORKSPACE-CC-MODEL-OVERRIDE`
**drive_mode:** autopilot

## Problem Statement

Claude Code's model selection is machine-global: pick a model for one project and it silently stays selected everywhere, so the operator forgets to switch back and subsequent work on *other* projects runs on the wrong model. Across 20+ rotating projects that is a recurring, silent correctness/cost problem. The fix is to make the model choice **follow the project**: a per-project `default_model` stored in `projects.json`, visible **on each project's picker row**, and passed to the spawned CC as `--model <value>`. **Unset must mean "inherit CC's own global default"** — that is today's behavior, so every existing project and every user who never touches the control is completely unaffected.

*[Updated 2026-07-31 at Phase 2 verify-human: the control was planned and first built on the **workspace header**; the operator rejected that placement and moved it to the **picker row**, right-aligned, as a click-to-edit label. The problem being solved is unchanged — but the placement is now load-bearing to it, because the value is read at spawn and a picker column makes every project's model comparable at a glance, which is what a *forgetting* problem actually needs. See design prior `set-a-spawn-time-choice-where-the-spawn-is-chosen`.]*

The work is larger than it looks because the precedent the roadmap named does not exist. Per `wbs.md` → Finding 1, M6's permission mode is **app-global** (`AppSettings.cc_permission_mode`) and `Project::default_drive_mode` is a documented never-read placeholder with no read path, write path, or UI. **`default_model` is therefore Claudesk's first genuinely per-project, read-at-spawn setting** — this feature builds that storage path rather than cloning one, while mirroring the permission-mode *mechanism* (typed value → persisted → read-at-spawn → `--flag` → pure `build_cc_argv` → event rebroadcast).

**No 3rd-party dependency.** Task 1.1's `claude --help` read is a local CLI inspection, not an external API/SDK integration, so no probe WP is required (`wbs.md` → "3rd-Party Integration Rules"). **That probe is already DONE — findings below.**

## Probe findings (task 1.1 — complete, 2026-07-31)

Ran ahead of planning because the answers decide the control shape and the failure copy.

1. **`--model` accepts BOTH an alias and a full model name.** Verbatim from `claude --help`: *"Model for the current session. Provide an alias for the latest model (e.g. 'fable', 'opus', or 'sonnet') or a model's full name (e.g. 'claude-fable-5')."* → The value set is genuinely **open**. This independently confirms the roadmap's no-hardcoded-list constraint: a fixed dropdown would reject valid values and rot on every CC release.
2. **An invalid value fails LOUDLY and does not silently fall back.** `claude --model definitely-not-a-real-model-xyz -p "say hi"` returns: *"There's an issue with the selected model (definitely-not-a-real-model-xyz). It may not exist or you may not have access to it. Run --model to pick a different model."*
3. **⚠️ The failure is rendered by CC INSIDE the session, not at exec.** The PTY spawn itself succeeds; the error text appears in the terminal pane the operator is already looking at. **Design consequence: Claudesk must NOT validate the value client-side.** CC's own message is more accurate than anything Claudesk could produce (it knows about entitlements, not just existence), it is already visible in the right place, and a Claudesk-side allowlist would reject models CC gained after this build shipped. Store and forward the string verbatim; let CC adjudicate.

**Therefore the control is free-text with alias suggestions** (a `datalist` of the three documented aliases as *hints*, not constraints) plus an explicit "Default (CC's own)" choice for unset. No validation beyond trim-to-unset.

## Work Tree

- [x] Phase 1: Storage + argv (backend, no UI)  <!-- status: done -->
  **Observable outcomes:**
  - CLI: `cargo test -p claudesk --all-targets` exits 0; the new tests named `default_model_*` and `build_cc_argv_*` all pass.
  - CLI: a `projects.json` written with `default_model` unset contains **no** `default_model` key — verified by a round-trip test asserting the serialized bytes lack the substring, and a legacy file with no such key still parses.
  - CLI: `build_cc_argv` with `None` yields argv containing **no** `--model` token; with `Some("opus")` yields exactly one `["--model", "opus"]` pair; with `Some("   ")` yields no `--model` token (whitespace = unset).
  - CLI: `build_cc_argv` with `None` still contains `--permission-mode` (proves the deliberate asymmetry is preserved, not accidentally "fixed").
  - [x] P1.1 Add `default_model: Option<String>` to `Project` (`config_store/mod.rs:41`) with `#[serde(default, skip_serializing_if = "Option::is_none")]`, matching the `display_name` idiom directly above it. Doc-comment it as the **first live per-project setting**, explicitly contrasting the never-read `default_drive_mode` beneath it so the next reader does not mistake one for the other.  <!-- status: done -->
  - [x] P1.2 Round-trip tests: unset → key absent from serialized JSON; legacy file lacking the key → parses to `None`; `add_or_touch` on an existing project **preserves** a set `default_model` (it currently clones the record after touching `last_opened_at` — prove the new field survives).  <!-- status: done -->
  - [x] P1.3 Build the per-project read/write path (**new — no precedent**): `read_default_model(data_dir, project_path) -> Result<Option<String>, ConfigError>` and `set_default_model(data_dir, project_path, Option<String>) -> Result<(), ConfigError>` in `config_store`. The setter must preserve every other field of that project **and** every other project in the list. Path matching uses the same verbatim comparison `add_or_touch` uses. A path with no record is **not** an error for the reader (returns `None`); for the setter it is an error (nothing to attach to).  <!-- status: done -->
  - [x] P1.4 Tests for P1.3 that would fail on a naive implementation: setting on project B leaves project A's `display_name`, `last_opened_at`, and `default_model` untouched; setting `None` **removes** the key rather than storing `null`; reading an unknown path returns `None` not an error. ⚠️ Name each test after what it actually asserts — per `SURFACE-2026-07-29-SETTINGS-PRESERVES-OTHER-FIELDS-TEST-NAME-OVERSTATES-ASSERTION`, a `*_preserves_other_fields` name that checks one field is the overstated-assertion class this repo has already been bitten by three times.  <!-- status: done -->
  - [x] P1.5 Extend the pure `build_cc_argv` (`cc_session/mod.rs:303`) to `build_cc_argv(mode, model: Option<&str>)`, appending `--model <value>` **only when `Some` and non-empty after trim**. Keep `--permission-mode` unconditional. Update the existing doc comment to state the asymmetry and *why* (unset has no representable flag value), so it does not read as an oversight.  <!-- status: done -->
  - [x] P1.6 Read the project's `default_model` in `SessionRegistry::spawn` (`cc_session/mod.rs:723`) alongside the existing permission-mode read — **no signature change**, `project_path` is already a parameter. Mirror the existing degradation exactly: any failure (no app-data dir, unreadable/corrupt `projects.json`, no record for the path) resolves to `None` = inherit CC's default, **never** an error that blocks the spawn. Thread the value through `PtyCcSession::spawn` to `build_cc_argv`.  <!-- status: done -->
  - [x] P1.7 **(pulled forward from P2.1 — a clippy consequence, not scope creep.)** The two Tauri commands `project_get_default_model` / `project_set_default_model` + their `lib.rs` registration. After P1.3, `set_default_model` had no non-test caller, so `cargo clippy --all-targets -- -D warnings` failed on `dead_code`. The options were an `#[allow(dead_code)]` someone must remember to remove, or landing the ~20-line real caller now — landed the caller. **Phase 2 keeps the whole frontend half** (P2.2–P2.6); P2.1's remaining work is just verifying the registration from the FE side.  <!-- status: done -->
  - [x] verify-auto  <!-- status: done -->
  - [x] verify-self  <!-- status: done -->
  - [x] verify-human  <!-- status: done -->
    - [x] P1.verify-human.1 Boundary check — `claude` accepts the exact argv shape the spawn now builds. **Operator delegated this to the agent** ("you just self verify"); run live against the real CLI, all three arms: `--permission-mode default --model opus` → `OK`; `--permission-mode default` with NO `--model` (the inherit path) → `OK-NOMODEL`; `--permission-mode default --model claude-fable-5` → `OK-FULLID`. The middle arm is the load-bearing one — it proves omit-when-unset is a *valid invocation*, not merely an untested assumption.  <!-- status: done -->
    - [x] P1.verify-human.2 `--model` omit-when-unset asymmetry CONFIRMED as the intended contract (not an inconsistency to normalize later).  <!-- status: done -->
    - [x] P1.verify-human.3 No-client-side-validation CONFIRMED as the intended failure posture — CC adjudicates the value, Claudesk forwards it verbatim.  <!-- status: done -->
    - [x] P1.verify-human.4 P2.1 pull-forward ACKED — the two IPC commands + `lib.rs` registration stay in Phase 1 (chosen over an `#[allow(dead_code)]` that would need remembering to remove).  <!-- status: done -->
  - [x] verify-codify  <!-- status: done -->

- [x] Phase 2: IPC + picker-row model control  <!-- status: done (control RELOCATED from the workspace header at verify-human) -->
  **Observable outcomes:**
  - CLI: `pnpm exec tsc --noEmit` exits 0; `pnpm lint` exits 0; `pnpm vite build` exits 0.
  - CLI: `pnpm test` exits 0 with the new `modelOverride*` test files passing and the 1400-test baseline still green.
  - Browser (MCP bridge, live app): the focused workspace header contains `[data-testid="workspace-model-control"]`; its displayed value reads `Default` for a project that has never set one — i.e. the active choice is visible **without a click** (`[[explicit-selectable-mode-over-inferred-mode]]`).
  - Browser (MCP bridge, live app): typing `opus` into the control and committing it, then reading it back via `invoke("project_get_default_model", {path})`, returns `"opus"`; after an app relaunch the header still shows `opus` (persistence across process lifetime).
  - Browser (MCP bridge, live app): clearing the control back to empty returns the display to `Default`, and `projects.json` on disk no longer contains a `default_model` key for that project.
  - Console: no JS errors and no unhandled promise rejections while exercising the control.
  - [x] P2.1 Two Tauri commands in `config_store/commands.rs` — `project_get_default_model(path)` and `project_set_default_model(path, model: Option<String>)` — delegating to P1.3 and mapping `ConfigError` to `String` like their siblings. Register both in `lib.rs`'s invoke handler. ⚠️ Per `[[tauri-command-removal-needs-invoke-sweep]]` the FE/BE binding is stringly-typed, so grep the registration after adding.  <!-- status: done -->
  - [x] P2.2 A typed IPC wrapper module `src/cc/modelOverrideIpc.ts`, mirroring `permissionModeIpc.ts` exactly (that file's own header documents the pattern: wire calls live apart from the pure core so the core stays vitest-pinnable without a running app). No `invoke` call anywhere else.  <!-- status: done -->
  - [x] P2.3 A pure module `src/cc/modelOverride.ts` holding the normalization + the alias hint list: `normalizeModelValue(raw): string | null` (trim; empty → `null`), and `MODEL_ALIAS_HINTS = ["fable", "opus", "sonnet"]` documented as **hints only, never a validation allowlist** (probe finding 3). Unit-test the normalizer against `""`, `"   "`, `" opus "`, and a full ID.  <!-- status: done -->
  - [x] P2.4 The header control in `Workspace.tsx` beside the existing `workspace-split-control`: a free-text `input` with a `datalist` of the alias hints, `placeholder="Default (CC's own)"`, seeded from `project_get_default_model` on mount, committing on blur + Enter. Show the active value directly in the field (no click needed). **Do not validate** — store what the operator typed. ⚠️ Do **not** call the persist inside a React state updater (StrictMode double-invokes them — the exact defect caught in M10.9 WP2's `useSettingControl`); read the value from a ref outside the updater.  <!-- status: done -->
  - [x] P2.5 Communicate next-spawn semantics, matching the permission mode's existing wording: a `title`/hint stating the change applies to the **next** CC session for this project, so a mid-session change is not read as a silent no-op. No auto-recycle — out of scope.  <!-- status: done -->
  - [x] P2.6 Tests: the normalizer (P2.3); a component test that the control renders the persisted value and calls the setter once per commit (not twice — pin the StrictMode regression); and that an empty commit sends `null`, not `""`.  <!-- status: done -->
  - [x] verify-auto  <!-- status: done -->
  - [x] verify-self  <!-- status: done -->
  - [x] verify-human  <!-- status: done -->
    - [x] P2.verify-human.1 Visual/ergonomic judgment — **REJECTED then FIXED in place.** Operator: *"I don't like the UI/UX. Can the selection be here? share the same row of each workspace title and align to the right side?"* + a picker screenshot. Control RELOCATED from the workspace header to the picker row (right-aligned), reshaped from a permanent input to a click-to-edit label, and the inherited boxed-button chrome stripped. Re-verified live: see the Phase 2 verify-human record.  <!-- status: done -->
    - [x] P2.verify-human.2 Copy judgment — label now reads `Default` (compact, in-row) with `Default (CC's own)` as the edit-mode placeholder; tooltip reworded to *"Applied when this project's session starts"* (the picker row IS pre-spawn, so the header's "applies to the NEXT session" caveat no longer fits). Not separately objected to.  <!-- status: done -->
    - [x] P2.verify-human.3 Boundary check — **discharged by the relocation itself + live re-verify.** The workspace header is now byte-for-byte back to its pre-WP1 shape (guarded by a test asserting `Workspace.tsx` contains no `modelOverride`/`workspace-model-control` and that the CSS class is gone), so the split controls cannot have regressed. The boundary MOVED to `ProjectPicker.tsx`; re-verified live that clicking the model does NOT open the project and that the row still opens normally.  <!-- status: done -->
  - [x] verify-codify  <!-- status: done -->

- [x] Phase 3: End-to-end argv proof + roadmap corrections  <!-- status: done -->
  **Observable outcomes:**
  - CLI: with a project's `default_model` set to `sonnet`, opening that workspace and running `ps -o args= -p <claude-pid>` shows `--model sonnet` in the live process arguments.
  - CLI: with `default_model` unset, the same `ps` inspection shows **no** `--model` token at all (not `--model default`, not an empty value) — the inherit path proven on the real process, not just in a unit test.
  - CLI: `grep -c "exact precedent to mirror" workflow-system/product/roadmap.md` returns 0 — the incorrect precedent claim is gone.
  - CLI: full gates green — `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test --all-targets`, `pnpm test`, `pnpm exec tsc --noEmit`, `pnpm lint` all exit 0.
  - [x] P3.1 Drive the live app (MCP bridge + scratch repos per the `tmp/scratch/` convention) to prove both `ps` outcomes above. This is the outcome no unit test can give: it proves the value actually reaches the spawned process, across the FE→IPC→registry→argv→PTY chain.  <!-- status: done -->
  - [x] P3.2 Correct `roadmap.md`'s M11.5 deliverable text per Finding 1 — the precedent is the permission-mode **mechanism**; the per-project **storage** is new. Also record the probe findings (alias-or-full-ID, loud in-session failure, no client-side validation) so the next reader does not re-run the probe.  <!-- status: done -->
  - [x] P3.3 Correct M14's stale "default CLI args for `claude`" line as the roadmap itself instructs: PiP shipped at M5, permission-mode at M6, and this WP consumes the `--model` part. Leave whatever genuinely remains.  <!-- status: done -->
  - [x] P3.4 Note for `/product-finalize`: the per-project read path is a real as-built architectural addition (the project's first per-project setting with a live read/write path) → record in `arch.md`. Already flagged in `wbs.md`; restated here so the close cannot miss it.  <!-- status: done -->
  - [x] verify-auto  <!-- status: done -->
  - [x] verify-self  <!-- status: done -->
  - [x] verify-human  <!-- status: done -->
    - [x] P3.verify-human.1 Feature-level acceptance — operator: **"all good"**.  <!-- status: done -->
    - [x] P3.verify-human.2 Doc-accuracy spot-check APPROVED, incl. the M14 Settings-line rewrite (scope removed, not annotated).  <!-- status: done -->
    - [x] P3.verify-human.3 Design prior `set-a-spawn-time-choice-where-the-spawn-is-chosen` accepted as proposed; the `⚠️ INFERRED` why stands unedited (operator may sharpen later — the file itself invites it).  <!-- status: done -->
  - [x] verify-codify  <!-- status: done -->

## Current Node
- **Path:** Feature > ship
- **Active scope:** **ALL THREE PHASES COMPLETE** — every impl task and all 12 verification gates `[x]`. Ready for `/feature-ship`.
- **Blocked:** none
- **Unvisited:** none
- **Open discoveries:** 2 — `SURFACE-2026-07-31-NO-REACT-COMPONENT-RENDER-HARNESS` (low) and `SURFACE-2026-07-31-MODEL-ALIAS-HINTS-COULD-BE-DYNAMIC` (low, filed from the operator's Phase 3 question)

### Phase 3 verify-codify result (2026-07-31) — PASS · **ALL PHASES COMPLETE**

**No integration boundary** for the test set — Phase 3 changed no application code.

**One gap found and closed, prompted by the operator's own question.** At verify-human the operator asked *"what would happen if CC introduced a new model?"* Auditing coverage for that property revealed it was pinned at **two** of three layers — the TS normalizer (`does NOT reject an unrecognized value`) and the Rust argv builder (`cc_argv_accepts_an_alias_or_a_full_model_id_verbatim`) — but **not at the store**, which is the layer where a well-meaning "sanity check" is most likely to be added.

Worse, the store's existing `set_default_model_accepts_a_full_model_id_verbatim` used `claude-fable-5` — **a model that exists today** — so it would keep passing against a validator seeded with today's known models. Added `set_default_model_accepts_a_model_that_does_not_exist_yet`, using a deliberately non-existent value. **Mutation-proven with the exact future mistake:** adding a `KNOWN: &[&str]` allowlist filter to `normalize_model` fails the new test **while the old one still passes** — which is precisely why the old one was insufficient.

**Nothing else needed a test.** The `ps`-argv contract is inherently live-only (no test can construct an `AppHandle`; proven on real processes at build), and the operator-confirmed items were doc accuracy and a design-prior review — neither is a code behavior.

**Gates:** `cargo fmt --check` 0 · `clippy --all-targets -D warnings` 0 · backend **706 pass / 0 fail** (+1) · frontend **1427 pass / 0 fail**. No failures → §3b triage did not apply.

### Operator question logged: could `MODEL_ALIAS_HINTS` be dynamic? (2026-07-31)

Asked at the close of Phase 3. **Answer: yes, but not from CC's CLI — there is no `list-models` command** (verified: `claude --help` exposes `--model` and 11 subcommands, none enumerating models). So a dynamic list would need a *different* source, and each has a real cost:

- **Derive from usage (recently-used):** zero new dependencies, no network, and it is what the roadmap's own constraint text already suggested ("free-text / recently-used / derived"). Naturally surfaces the models *this operator* actually uses. **Cheapest and best-fit.**
- **Scrape CC's own config/state:** brittle coupling to an undocumented internal shape — the anti-brittleness rule M10.9 §4c established for the companion repo argues against it.
- **Query the Anthropic API's models endpoint:** authoritative and would even reflect entitlements, but it puts a **network call** into a feature that currently has none, needs credentials Claudesk does not hold, and must fail gracefully offline. A large surface for autocomplete convenience.

**Not built now, deliberately** — the current cost of staleness is bounded and small: the three hints affect *autocomplete only*, every value remains typeable, and the non-exhaustiveness is test-pinned at all three layers. Filed as `SURFACE-2026-07-31-MODEL-ALIAS-HINTS-COULD-BE-DYNAMIC` (low) with the recently-used option recommended.

### Phase 3 verify-self result (2026-07-31) — PASS (all 4 outcomes)

**No integration boundary** — this phase added no application code (only docs + a live proof), so the phase adds no consuming-surface change to verify. `Workspace.tsx` is byte-identical to HEAD.

**No subagent spawned:** bridge tools don't reach subagents, and there is no new UI this phase — a Playwright runner would have driven bare Vite and reported a confident PASS against nothing.

| # | Outcome | Evidence | Verdict |
|---|---|---|---|
| OC-1 | `default_model=sonnet` → `ps` shows `--model sonnet` | live PID 65686: `claude --permission-mode dontAsk --model sonnet` | PASS |
| OC-2 | unset → **no** `--model` token (not `--model default`, not empty) | live PID 69058: `claude --permission-mode dontAsk`; asserted 6/6 mechanically | PASS |
| OC-3 | `grep -c "exact precedent to mirror" roadmap.md` → 0 | **0**, run verbatim | PASS |
| OC-4 | six gates all exit 0 | `cargo fmt --check` 0 · `clippy --all-targets -D warnings` 0 · `cargo test --all-targets` 0 (705) · `pnpm test` 0 (1427) · `tsc --noEmit` 0 · `eslint` 0 | PASS |

**Two things checked beyond the literal outcome text, both worth recording:**

1. **OC-3 could have been satisfied by *moving* the bad claim rather than removing it.** So I also grepped `wbs.md`: **2 hits**. Both are Finding 1 **quoting the wrong claim in order to refute it** (its heading, and its `roadmap.md says …` citation) — correct and load-bearing; deleting them would erase the record of *what* was corrected. The outcome is genuinely met, not met-by-relocation.
2. **⚠️ OC-4's own wording is unsound and I did not follow it literally.** It specifies `pnpm exec tsc --noEmit`, which resolves to the **pnpm binary** and exits 0 regardless of type errors (found at Phase 1). I ran `./node_modules/.bin/tsc --noEmit` instead. A future re-run of this outcome as written would produce a meaningless pass — the outcome text is the defect, not the code.

`eslint`'s single warning is pre-existing in untouched `XtermPane.tsx:464`. The repo-wide `prettier --check .` failure was proven pre-existing at verify-auto (pristine tree: 37 files; the only delta is the session's pre-existing untracked `HANDOFF-REPLY-*.md`).

### Phase 3 verify-auto result (2026-07-31) — PASS, and it CAUGHT FOUR MISSES

Scoped to a docs-only phase, so the checks were doc-consistency + a no-app-code-moved confirmation.

| Check | Result |
|---|---|
| Stale `workspace-header selector` in `roadmap.md` | 1 hit, **line 4 = frontmatter revision log** (history, deliberately preserved) ✓ |
| **Broader staleness sweep** (other phrasings, `wbs.md` too) | **✗→✓ FOUND 4 STALE CLAIMS, all fixed** — see below |
| M14 line no longer lists shipped items as future work | `yolo-mode toggle` 0 · `menu-bar / PiP visibility toggles` 0 ✓ |
| `Workspace.tsx` byte-identical to HEAD | absent from `git status` → the Phase 2 revert was complete ✓ |
| No orphaned model files in `workspace/` | none — `useModelOverride.ts` + its test are gone ✓ |
| `tsc --noEmit` | 0 ✓ |
| WP1 guards (27 tests) | pass ✓ |

**⚠️ The narrow check would have passed while the docs stayed wrong.** Grepping the exact phrase `"workspace-header selector"` found only the frontmatter and looked clean. Sweeping *other phrasings of the same claim* found **four live staleness bugs in `wbs.md`** that the phrase-match missed: task **1.6** ("Surface the control **on the workspace header**"), the WP1 **description** ("visible control on the workspace"), the **file-touch table** (`workspace header` as WP1's surface), and the **exit-criteria table** ("visible on the workspace"). All four now name the picker row and carry the as-built correction. **Lesson for the next doc-resync: grep the CLAIM, not the sentence** — a placement assertion has many spellings, and the one you happen to remember is not the one that rots.

**A discrepancy chased to ground rather than dismissed:** `prettier --check .` fails on **38** files, none of them WP1's. Rather than wave that off, verified it by stashing all of this session's work and re-running: a **pristine tree fails on 37**. The single-file delta is `HANDOFF-REPLY-to-claudesk-2026-07-29.md` — the pre-existing untracked file present in the session's opening `git status`, which only appears as a delta because `git stash --include-untracked` removes it during the baseline probe. **So: a pre-existing repo condition, not introduced by this feature, and every WP1 file is prettier-clean.** (Worth noting the project's own `pnpm format:check` gate is therefore currently red on `main` — filed nowhere yet; not this feature's to fix.)

### Phase 3 build result (2026-07-31)

**Relevance check (before Phase 3):**
- Requester still needs this: **yes** — and the argv proof is the only remaining evidence that the feature does what it claims.
- Requirements unchanged: **yes** for the proof; the *docs* requirements grew, because Phase 2's relocation made four roadmap passages stale.
- Solution still feasible: **yes** — proven, below.
- No superior alternative discovered: **yes**.
**Verdict:** proceed.

**P3.1 — ⚠️ THE ARGV CONTRACT IS PROVEN ON LIVE PROCESSES.** Both outcomes captured in a single `ps` observation, two workspaces open at once, both children of the dev app (PID 60714):

```
65686 60714 claude --permission-mode dontAsk --model sonnet    ← scratch-a (default_model = sonnet)
69058 60714 claude --permission-mode dontAsk                   ← scratch-b (unset)
```

Asserted **mechanically**, not by eye — 6/6: 2 spawned processes · exactly 1 with `--model sonnet` · exactly 1 with **no `--model` token at all** · **0** with `--model default` · **0** with an empty `--model` value · `--permission-mode` on **both**. This is the consuming-surface (`cc_spawn`) proof that Phases 1–2 structurally could not reach: nothing in this repo can construct an `AppHandle`, so the FE→IPC→registry→argv→PTY chain is only observable on a real process. **The value was set through the real UI** (picker-row click → type → blur), not by a direct IPC write, so the whole chain is exercised.

**⚠️ A correctness trap avoided while measuring, worth recording:** the first `ps` sweep matched `claude --permission-mode bypassPermissions` (PID 4964) and it would have been easy to read that as the spawned session. It is **this session's own CC** — different permission mode, no `--model`, and not a child of the app. **Filter by PPID = the dev app's PID**, never by process name: on this machine `claude` processes belonging to the operator are always running, and a name match would produce a confident wrong answer in either direction.

**P3.2 / P3.3 — roadmap corrections (four stale passages, not one).** Finding 1's precedent correction was already applied at `/product-wbs`, so the real work was the staleness Phase 2's relocation introduced: (a) the M11.5 deliverable's "workspace-header (or picker-row) selector" — resolved to picker-row-only, with the reason; (b) two "why not M14" passages that cited a *workspace-header selector* as the shape; (c) the `[[explicit-selectable-mode-over-inferred-mode]]` note, sharpened to "visible **without interaction**" (which is what the prior actually governs) since the edit affordance is now behind a click while the state never is; (d) the exit criteria. **M14's Settings line was rewritten** rather than patched: of the five things it listed, four had already shipped (menu-bar M7, PiP M5, permission-mode M6, `--model` here) — it now names only what genuinely remains (project-list management, hotkeys) and records that the panel *exists* to be extended. The probe findings are recorded in the roadmap too, so the `claude --help` read is never repeated. One `workspace-header selector` mention survives **on purpose**: it is inside the frontmatter revision log, which is a historical record of what was decided at the time — a new revision note was prepended instead of rewriting history.

**P3.4 — the `arch.md` content for `/product-finalize` is now written out** in `wbs.md`, not left as a one-line reminder: five items, including the two the WBS got wrong (the UI surface is the picker row, reversing what both the WBS and roadmap specified) and the two a future reader would otherwise "fix" (the argv asymmetry, the deliberate absence of validation).

**No code changed this phase** — `Workspace.tsx` no longer appears in `git status`, confirming the Phase 2 revert was complete. Suites re-run to be sure: frontend **1427 pass / 0 fail**, backend **705 pass / 0 fail**.

**Cleanup:** the `sonnet` test write cleared (dev profile back to **0** `default_model` keys), prod profile verified untouched, both spawned `claude` processes reaped, ports free — and **the operator's own CC session (PID 4964) confirmed still alive**, which is the check a blanket `pkill` would have failed.

### Phase 2 verify-codify result (2026-07-31) — PASS · **PHASE 2 COMPLETE**

A coverage-gap audit over the three behaviors verify-human confirmed. **One gap was worth closing; two were deliberately left, with reasons — not skipped silently.**

**(a) The boxed-chrome CSS regression → CODIFIED (+1 test, mutation-proven).** This is the one that earned a test: it **shipped visibly wrong while every gate was green** (tsc, eslint, 1426 tests). The cause is a real textual coupling — `App.css` has a global `input, button` rule (`border-radius: 8px; border: 1px solid transparent; background-color: #2a2a2a`), and the cell *must* be a `<button>` to be clickable, so it inherits that chrome unless all three are explicitly overridden. The new test asserts the three overrides exist with chrome-less values, **and** asserts the global rule still exists so that if the global chrome is ever removed the test's premise gets re-examined rather than silently kept. **Mutation-proven:** deleting the three override lines — the exact live defect — fails it. It is honest about its boundary: it pins *declarations*, not rendered pixels (computed style needs a browser); the live `getComputedStyle` check is what proved the fix and is recorded above.

**(b) Click-to-edit → exactly one input + N-1 labels → NOT written, and the reason is structural.** This needs a real React render with state transitions. **This repo has no component-render harness**: `@testing-library/react` is not a dependency and **not one of the 123 test files renders a component**. Adding one is a genuine decision (new dependency + harness + a posture change), not a codify step — so it is filed as `SURFACE-2026-07-31-NO-REACT-COMPONENT-RENDER-HARNESS` (low) rather than smuggled in here. Writing a mock-heavy substitute would have produced a test that passes whether or not the behavior works, which is the one thing this state is told not to do.

**(c) The write landing on the correct row only → ALREADY COVERED at the layer where it is real.** `config_store::tests::set_default_model_on_one_project_leaves_every_field_of_the_others_untouched` (Rust, mutation-proven) asserts full sibling records are byte-identical. A TS test would mock the IPC and prove only that I passed the argument I passed — duplicate coverage of the wrong thing. Skipped per §2's "do not duplicate" rule.

**Integration boundary — satisfied by name.** `ProjectPicker.tsx` is the consuming surface, and `projectModelCell.test.ts` asserts against it explicitly (the row order is *consumed* via `PICKER_ROW_CELLS.map`, exactly one `<ProjectModelHints />`, the cell is a flat sibling), on top of the live picker driven at verify-self and verify-human.

**Full suites green, no filters:** frontend **1427 pass / 0 fail** (123 files) · backend **705 pass / 0 fail** (6 targets) · `tsc` 0 · `prettier --check` clean. No failures, so §3b triage did not apply.

**Phase 2 test total: +27** (18 pure-module + 9 structural), replacing the 9 that were deleted with the orphaned header hook.

### Phase 2 verify-human result (2026-07-31) — REJECTED on UI/UX, FIXED in place, then APPROVED

**Did NOT auto-skip** — an integration boundary applies (criterion 2: `Workspace.tsx` backs an existing UI surface), which forbids the F11 path outright.

**The operator rejected the placement outright**, with a picker screenshot: *"I don't like the UI/UX. Can the selection be here? share the same row of each workspace title and align to the right side?"* Two clarifying questions settled the shape: **picker row only** (remove from the header entirely — not both, which would need a sync path for one value across two surfaces) and **a compact label that becomes editable on click** (not a permanent input, which is noise on every row with 20+ projects).

**What changed:**
- **New** `components/picker/ProjectModelCell.tsx` — label→input on click, right-aligned, per-row.
- **New** `components/picker/pickerRowOrder.ts` — the row's cell sequence as data (see the guard note below).
- **Reverted** the workspace header to its pre-WP1 shape; **deleted** the now-orphaned `useModelOverride.ts` + its test file rather than leaving dead code with tests attached.
- Copy adjusted to the new location: tooltip says *"Applied when this project's session starts"* — the header's "applies to the NEXT session" caveat no longer fits, because the picker row **is** pre-spawn.

**⚠️ The most important thing learned this gate — a source-text guard I wrote provably did NOT work.** The row's load-bearing rule is a *nesting* one: the open-project area is a `<button>`, so the model cell must be its **sibling** (nested, every click meant for the model would open the project). My first guard compared the position of `<ProjectModelCell` against *"the first `</button>` in the file"* — which is a different button in the picker header. I deliberately nested the cell to test the guard and **it passed 5/5**. That is the positional-slicing failure this repo has now hit three times (`...WP2-RAW-GUARDS-STILL-LOAD-BEARING`, `...CFG-TEST-SPLIT-BLINDS-SOURCE-GUARDS`). Fixed by making the row order **data the component maps over** (`PICKER_ROW_CELLS`) and asserting the value. Mutation-proven twice: breaking the sibling predicate fails a test, **and** making the component stop consuming the value (so the guard would become decorative) also fails a test.

**One CSS defect found and fixed live, not by any gate:** the cell is a `<button>` (it must be clickable), so it inherited the app's global button chrome — `#2a2a2a` fill + 8px radius — rendering the row as **three boxed tiles** instead of the single row the operator asked for. Caught by reading `getComputedStyle` on the real element, then overridden to chrome-less. Neither `tsc`, `eslint`, nor any test would have flagged this; it is only visible on screen.

**Live re-verification of the fix** (MCP bridge, real app): 7 rows each render a model cell; the label is transparent with 0px radius (chrome gone); **clicking the model does NOT open the project** (the nesting rule holds in practice, not just in the guard); click→edit yields exactly **1 input + 6 labels** with the input focused and the placeholder showing; a commit wrote `opus` to **scratch-b only** — the row actually edited — leaving **1 of 7** records with the key.

**A false alarm worth recording as method:** I first read `enteredEditMode: false` and started diagnosing a real defect. It was a **stale element reference** — an earlier probe had already flipped a row into edit mode, so the DOM had shifted under a captured `cells[0]`. The lesson is to re-query after any state-changing probe rather than trusting a held reference; the "defect" was my measurement.

**Gates after the rework:** frontend **1426 pass / 0 fail** (123 files) · backend **705 pass / 0 fail** · `tsc` 0 · `eslint` 0 errors · `vite build` 0 · `prettier --check` clean.

**Cleanup:** both test writes (`sonnet` on scratch-a, `opus` on scratch-b) removed — dev profile back to **0** `default_model` keys; **prod profile verified never touched**; ports free, no orphan process.

**Design prior captured (proposed):** `set-a-spawn-time-choice-where-the-spawn-is-chosen` — see `workflow-system/product/design-priors.md`. The rejection carried a transferable *why*, not just a placement preference, which is what makes it a prior rather than a one-off fix.

### Phase 2 verify-self result (2026-07-31) — PASS (all 6 outcomes), driven LIVE

**Integration boundary:** applies (criterion 2 — `Workspace.tsx` backs an existing UI surface with user-visible change). Phase 2's outcomes cite the consuming surface by name (`[data-testid="workspace-model-control"]` in the focused workspace header), so the rule is satisfied — unlike Phase 1, this phase's boundary IS observable at its own tier.

**Driven by the orchestrator through the `mcp__tauri__*` bridge, not a subagent** — `[[mcp-bridge-tools-not-exposed-to-subagents]]`: the bridge tools don't reach spawned subagents, which silently fall back to bare Vite with no Tauri IPC and would have produced a confident PASS against a surface that cannot observe any of this. `__TAURI_INTERNALS__` confirmed present (`hasTauri: true`) before asserting anything.

| # | Outcome | Evidence | Verdict |
|---|---|---|---|
| OC-1 | tsc / lint / vite build exit 0 | verify-auto | PASS |
| OC-2 | vitest green, baseline held | 1427 pass / 0 fail (123 files) | PASS |
| OC-3 | control present in header, reads `Default` without a click | present; `value: ""`, `placeholder: "Default (CC's own)"` | PASS |
| OC-4 | type `opus` → commit → IPC read-back returns `"opus"`; survives relaunch | read-back `"opus"`; after a **real process restart** the header seeded `sonnet` from disk | PASS |
| OC-5 | clearing returns to `Default`; no `default_model` key on disk | key **removed entirely** — `grep` finds no `default_model` and **0 `null` literals** in the file | PASS |
| OC-6 | no JS errors / unhandled rejections | `window.onerror` + `unhandledrejection` collectors: **0** across type→commit→clear→re-commit; bridge console log: 0 errors | PASS |

**Baseline captured BEFORE touching anything** (what makes OC-5 falsifiable rather than assumed): scratch-a's record was exactly `{project_path, last_opened_at, display_name}` with **zero** `default_model` keys across all 7 records. After set→clear it returned to that exact shape.

**The strongest single result — per-project isolation, shown not asserted.** With both workspaces mounted simultaneously (the "all workspaces stay mounted" invariant), reading each workspace's own control paired with its own project name: **scratch-a → `sonnet`, scratch-b → `""`**. That is the feature's entire premise — the model follows the project, not the machine — demonstrated in one observation. Disk agreed throughout: exactly **1 of 7** records carried the key while set, and sibling records were byte-identical.

**Both commit gestures exercised, not just one:** blur (set `opus`) and Enter (clear). The Enter path needed the React-fiber workaround — a synthetic `KeyboardEvent` did **not** reach the handler (value stayed `"   "`); invoking the real `onKeyDown` via `__reactProps` committed correctly (`"   "` → `""`, i.e. whitespace normalized to unset). Consistent with the documented synthetic-event limitation.

**The build-flagged layout claim is CONFIRMED sound, by geometry rather than eyeball:** left-to-right `name(x=10) → split(x=902) → model(x=1040)`, control fully inside the header, `headerOverflowsX: false`, `bodyOverflowsX: false`, project name not squeezed (54px). And **`elementFromPoint` at the control's center returns the control itself** — reachable, not merely present (the WP3.5b unreachable-dialog lesson: presence ≠ clickable).

**Teardown + containment (no collateral damage):** operator had no app running at start (ports free, no `claudesk` process) — checked first, per `[[lsof-ti-tcp-misses-ipv6-vite]]`, precisely so nothing of theirs could be killed. Teardown was `driver_session{stop}` + `TaskStop` on my own two task ids; both ports released with **no orphan**, so no kill was needed at all. **Test artifact cleaned up:** the `sonnet` I wrote to scratch-a was removed, returning the dev profile to its pre-test state; the **prod** profile was verified never touched (0 `default_model` keys).

**One bridge note for the caveat chain:** `webview_wait_for{type:"selector"}` timed out ("Script execution timeout") on an element that a plain `querySelector` in `webview_execute_js` found immediately — the timeout was a bridge quirk, not absence. Don't read a `wait_for` timeout as a missing element; confirm with a direct query before concluding a FAIL. (Also re-confirmed caveat (d): an awaited `invoke()` inside `webview_execute_js` times out the eval — fire-then-poll via a `window.__x` global works.)

### Phase 2 verify-auto result (2026-07-31) — PASS

Scoped to the 7 changed files (per verify-auto's "not a full QA pass" rule), re-run independently of the build report:

| Check | Scope | Result |
|---|---|---|
| `eslint` on the 6 changed TS/TSX files | scoped | exit 0, **zero warnings** (the one project warning is in untouched `XtermPane.tsx`) |
| `tsc --noEmit` | project | exit 0 |
| `vitest` on the 2 new test files | scoped | **27 pass / 0 fail** |
| `vite build` | project | exit 0 — the import-smoke equivalent for this stack; `Workspace.tsx` gained 2 import specifiers |
| `cargo test --lib` | project | **705 pass / 0 fail** (backend untouched, but `commands.rs` gained callers) |

**Two boundary checks no compiler performs, both clean:**
- **CSS class defined, not phantom.** `workspace-model-control` is referenced twice in `Workspace.tsx` and defined by 4 selector blocks in `App.css:510-535`. Checked explicitly because "classes referenced with zero defined" was a **CRITICAL** review finding in M10.9 WP3.5a (eleven of them) and no automated gate catches it.
- **FE/BE command-name parity.** Each of `project_get_default_model` / `project_set_default_model` has exactly **1** FE `invoke` site and exactly **1** `lib.rs` registration. The binding is stringly-typed and invisible to both `tsc` and `cargo` — `[[tauri-command-removal-needs-invoke-sweep]]`.

**Tooling note held from Phase 1 and applied:** used `./node_modules/.bin/tsc`, not `pnpm exec tsc` — the latter resolves to the pnpm binary and exits 0 regardless of type errors.

### Phase 2 build result (2026-07-31)

**Relevance check (before Phase 2):**
- Requester still needs this: **yes** — the operator's lead ask for M11.5; nothing changed.
- Requirements unchanged: **yes** — Phase 1's probe already settled the control shape (free-text + hints, no validation).
- Solution still feasible: **yes** — Phase 1 landed the whole backend path; this was pure FE wiring onto it.
- No superior alternative discovered: **yes** — see the `useSettingControl` note below, which considered and rejected reuse on its merits.
**Verdict:** proceed.

**Landed:** `src/cc/modelOverride.ts` (pure core) · `src/cc/modelOverrideIpc.ts` (typed wire calls) · `src/components/workspace/useModelOverride.ts` (per-project control hook + pure `decideCommit`) · the header `input` + `datalist` in `Workspace.tsx` · `.workspace-model-control` styles in `App.css` · 27 tests across 2 new files.

**Gates:** `tsc --noEmit` 0 · `eslint` 0 errors (1 pre-existing `XtermPane` warning) · `vite build` 0 · **frontend 1427 pass / 0 fail** (123 files, up from 1400/121) · **backend still 705 pass / 0 fail** · `prettier --check` clean on all 7 touched files.

**P2.1 was already landed in Phase 1 (as P1.7), so this phase verified it from the FE side** rather than re-adding it: the command names match exactly across all three layers — FE `invoke("project_get_default_model")` / `("project_set_default_model")` ↔ `lib.rs:408-409` registration ↔ `commands.rs:175,187` definitions — and the param names (`path`, `model`) align too. That sweep is the `[[tauri-command-removal-needs-invoke-sweep]]` discipline: the binding is stringly-typed and invisible to both compilers.

**Deliberate deviation from `useSettingControl` — considered and rejected, not overlooked.** That hook models an **app-global** setting with a backend broadcast so every surface re-syncs. This setting is **per-project** with no broadcast (one workspace header shows a given project's value, and it is the surface that changed it). Reusing it would have meant inventing a per-project event with exactly one subscriber and threading a project key through an API built around a single global value — forcing a fit. What *is* reused is the **discipline**, reimplemented for the per-project shape: seed-on-mount, `cancelled` guard, optimistic set, revert-on-reject. Recorded in the module header so the next reader doesn't read it as ignorance of the existing hook.

**P2.6 was implemented differently than written, on purpose.** The task asked for "a component test that … calls the setter once per commit (not twice — pin the StrictMode regression)". **A component test cannot honestly pin that** — this is precisely the M10.9 WP2 lesson: the tests there modelled `set` with a plain closure, which has no StrictMode semantics to double-invoke, which is *why* the two-write defect reached code review undetected. Writing the same shape again would produce a test that passes whether or not the bug exists. Instead the commit **decision** was extracted as the pure `decideCommit` and pinned as a value (9 tests), and the React wrapper kept thin enough to read: `commit` takes `prev` from a ref, never from inside an updater. Mutation-proven: forcing `shouldPersist: true` **fails 3 tests** — the three no-op-blur cases.

**Mutation-proven guards this phase:** always-persist → 3 fails (no-op blur, whitespace-only diff, untouched-field blur). Every new assertion group was checked to bite, per the standing discipline.

**One thing to watch at verify-self (live):** the input sits *after* `.workspace-split-control`, which owns `margin-left: auto`. The new control deliberately does **not** carry a second auto margin (it would fight the first). Confirm the header still reads as one right-aligned row of chrome and that the project name is not squeezed — that is a layout claim only the live app can settle.

### Phase 1 verify-codify result (2026-07-31) — PASS · **PHASE 1 COMPLETE**

Built test-first, so codify was a **coverage-gap audit**, not a write-the-tests pass. Three of the four verified behavior groups were already pinned and mutation-proven; exactly one gap was real:

| Verified behavior | Coverage before codify | Action |
|---|---|---|
| Unset invisible on disk; legacy files parse | 13 store tests (mutation-proven) | none needed |
| Omit-when-unset argv; one-pair; blank=unset; asymmetry | 9 argv tests (mutation-proven) | none needed |
| Never-block-a-spawn degradation, 4 read states | 5 `resolve_spawn_model` tests (mutation-proven) | none needed |
| **`claude` accepts the composed argv** (verify-human leaf 1) | **none — live-only** | **+2 tests** |

**Added (+2, both mutation-proven):**
- `cc_argv_composes_the_exact_shapes_the_real_cli_accepted_at_verify_human` — asserts all three arms as **whole argv vectors**, so composition and ordering are pinned, not just the flag tokens. Mutation-proven: moving `--model` ahead of `--permission-mode` (`argv.insert(1, …)`) **fails 3 tests** including this one.
- `cc_argv_permission_mode_flag_matches_the_documented_cli_token` — `--model` was already pinned; its sibling was not. Both spellings are external contracts with the CLI.

**Deliberate decision — the codifying test does NOT invoke `claude`.** A test shelling out to the real CLI would need network, auth, and tokens, and would fail on any machine or CI runner without an authenticated `claude` — buying flakiness to re-check a fact about a tool we do not control. What *is* ours to keep correct is the argv we compose, which is what got pinned. Recorded in the test's own doc comment so a future reader does not "upgrade" it into a live invocation.

**Integration boundary — still open at this tier, by design.** The boundary (criterion 1: `SessionRegistry::spawn` ← `cc_spawn`) cannot get its end-to-end test here: nothing in this repo can construct an `AppHandle`, so `cc_spawn` → PTY is unobservable in-process. Phase 3's `ps -o args=` outcome is the consuming-surface test and cites `cc_spawn` by name. Flagged rather than silently satisfied by unit coverage.

**Full suites green, no filters:** backend **705 pass / 0 fail** (6 targets, +2), frontend **1400 pass / 0 fail** (121 files). `cargo fmt --check` + `cargo clippy --all-targets -- -D warnings` clean. No test failures, so §3b triage did not apply.

**Phase 1 test total: +27 new tests** — the lib target went from **678 → 705** across the phase (12 store-side incl. the `add_or_touch` no-override case · 10 argv-side · 5 spawn-degradation). Counted as the suite delta rather than by grepping name prefixes, since two pre-existing `cc_argv_*` tests would otherwise be miscounted as new.

### Phase 1 verify-human result (2026-07-31) — APPROVED (all 4 leaves)

**This phase did NOT auto-skip, deliberately.** The Mode-3 auto-skip gate was evaluated and gate (c) failed: an integration boundary applies (criterion 1 — `SessionRegistry::spawn` is consumed by the pre-existing `cc_spawn` command, and this phase modified it). Per the gate, a boundary **forbids the F11 skip path entirely** and requires a captured-output check against the consuming surface — so the checklist was presented rather than elided.

**Operator delegated leaf 1 to the agent** ("you just self verify if not already") and passed leaves 2–4. Three argv arms then run live against the real `claude` CLI:

| Argv shape | Corresponds to | Result |
|---|---|---|
| `--permission-mode default --model opus` | project with an alias override | `OK` |
| `--permission-mode default` (**no** `--model`) | project with **no** override — the inherit path | `OK-NOMODEL` |
| `--permission-mode default --model claude-fable-5` | project with a full-ID override | `OK-FULLID` |

The middle arm carries the weight: the whole WP rests on omit-when-unset, and this is the check that proves that argv is a *valid invocation* rather than an assumption inherited from the flag's documentation.

**Three decisions confirmed as intended contracts** (so future work does not "fix" them): the `--model` / `--permission-mode` asymmetry; no client-side model validation (CC adjudicates, Claudesk forwards verbatim); and the P2.1 pull-forward staying in Phase 1.

**No design prior captured** — §6b's discriminant did not fire. The operator confirmed decisions already made and reasoned through at plan time rather than correcting a product-design tradeoff, so there was no new transferable *why* to record.

### Phase 1 verify-self result (2026-07-31) — PASS (all 4 outcomes)

**No Playwright subagent was spawned, deliberately.** Phase 1 is pure Rust with no user-facing surface; its outcomes were declared CLI-tier at plan time. Spawning `feature-verify-self-runner` would have driven a bare Vite page with no Tauri backend — the documented dead end in `[[verify-self-stub-cannot-cross-subprocess-boundary]]` and `[[mcp-bridge-tools-not-exposed-to-subagents]]` — and produced a confident PASS against a surface that cannot observe any of this phase's behavior. The live-app tier is Phase 3's `ps -o args=` proof.

| # | Declared outcome | Evidence | Verdict |
|---|---|---|---|
| OC1 | `cargo test --all-targets` exits 0; the named tests pass | **703 pass / 0 fail**; 9 argv + 11 store tests confirmed green **by count** | PASS |
| OC2 | unset → no `default_model` key on disk; legacy file still parses | `unset_default_model_key_is_absent_from_serialized_json` + `legacy_file_without_default_model_key_parses_as_none` | PASS |
| OC3 | `None` → no `--model`; `Some("opus")` → exactly one pair; `Some("   ")` → none | `cc_argv_omits_model_entirely_when_unset`, `..._passes_exactly_one_model_pair_when_set`, `..._treats_blank_or_whitespace_model_as_unset` | PASS |
| OC4 | `None` still contains `--permission-mode` (asymmetry preserved) | `cc_argv_still_passes_permission_mode_when_model_is_unset` | PASS |

**Counting, not just grepping:** a name-filtered `cargo test` prints `ok` on zero matches, so each row was confirmed by test *count*. A `grep -cE 'FAILED|panicked'` returned 2 — both are pre-existing WP3.5a test **names** containing "panicked" (`a_panicked_run_still_reports_a_gate_revert`), not failures; `0 failed` is authoritative. Worth remembering: that grep is a bad failure detector in this repo.

### ⚠️ Integration boundary — found, and closed in place (not waved through)

The integration-boundary rule **fires** on this phase: criterion 1 holds, because `SessionRegistry::spawn` is consumed by the pre-existing `cc_spawn` Tauri command and I modified it. The four declared outcomes all cite `build_cc_argv` and the store — the *new* units — and **none cites `cc_spawn`**. On a literal reading that is a back-loop.

Investigated rather than rationalized. `cc_spawn` is a thin wrapper over `AppHandle` + `State<Registry>`, and **nothing in this codebase constructs an `AppHandle` in a test** (verified: zero hits for `tauri::test` / `mock_builder` across `src-tauri/src/`), so the `cc_spawn` → PTY path is *only* observable on a running app — which is exactly why Phase 3 exists and cites it.

But the real gap the rule was pointing at was genuine and fixable: the **never-block-a-spawn degradation rule** lived inline inside that untestable function, so "any config failure inherits CC's default" was an assertion in a doc comment rather than a verified property. Extracted it as the pure `resolve_spawn_model` and pinned it with 5 tests covering all four reachable read states (dir unresolvable / parse error / IO error / success-with-no-override / success-with-override). This is the repo's own M10.9 WP2 lesson applied: **extract the decision, assert the value** — don't leave a fallback rule where only a live app can see it.

Mutation-proven: replacing the degradation with `.expect("config read failed")` — i.e. propagating instead of degrading — **fails 2 of the 5**. Restored and re-confirmed green.

Phase 3's `ps` outcomes remain the proof that the value reaches the real process; what changed is that the *decision* no longer waits on a live app to be verified at all.

### Phase 1 verify-auto result (2026-07-31) — PASS

Every gate re-run independently of the build report, plus the frontend gates the build did not cover:

| Gate | Result |
|---|---|
| `cargo fmt --check` | exit 0 |
| `cargo clippy --all-targets -- -D warnings` | exit 0 |
| `cargo test --all-targets` | **698 pass / 0 fail** (6 targets) |
| `tsc --noEmit` | exit 0 |
| `eslint .` | exit 0 — **0 errors**, 1 pre-existing warning in `XtermPane.tsx:464` (untouched by this change) |
| `vitest run` | **1400 pass / 0 fail** (121 files) — exactly the pre-WP1 baseline |

**All four declared Phase 1 observable outcomes verified**, with 20 outcome-bearing tests (`*default_model*` + `cc_argv_*`) confirmed present and green — the count matters because a name-filtered `cargo test` reports "ok" on zero matches (`SURFACE-2026-07-29-CARGO-TEST-FILTER-OUTCOMES-ARE-VACUOUS-WITHOUT-A-COUNT`).

**The FE baseline holding at exactly 1400 is the meaningful signal here:** `Project` gained a wire field, and `RecentProject` consumes it structurally, so an unchanged FE suite confirms the new field is genuinely additive.

⚠️ **Tooling note for later phases:** `pnpm exec tsc` resolves to the **pnpm binary**, not tsc — it prints "Already up to date" and exits 0 regardless of type errors, which reads exactly like a passing type-check. Use `./node_modules/.bin/tsc --noEmit` (or `pnpm build`, which chains `tsc && vite build`).

### Phase 1 build result (2026-07-31)

**Gates green:** `cargo fmt --check` clean · `cargo clippy --all-targets -- -D warnings` clean · `cargo test --all-targets` **698 passed / 0 failed** across 6 targets (up from 678 — **+20 new tests**: 13 store-side, 7 argv-side). Runtime registry updated (4.04s warm).

**Mutation-proven, not merely passing.** Each guard was verified to *fail* against a deliberately broken implementation before being accepted — the vacuous-guard failure mode this repo has been bitten by repeatedly (M10.9 WP3.5a had three guards that looked like proof and were not):
1. Dropped the `.filter(|m| !m.is_empty())` from `build_cc_argv` → `cc_argv_treats_blank_or_whitespace_model_as_unset` **FAILED** ✓
2. Made `--model` **symmetric** with `--permission-mode` (always passed, `"default"` when unset) — the exact "helpful uniformity" tidy-up a future maintainer might attempt → **4 tests FAILED** ✓
3. Removed `skip_serializing_if` from the field → `unset_default_model_key_is_absent_from_serialized_json` and `clearing_default_model_removes_the_key_rather_than_writing_null` both **FAILED** ✓

All three implementations were restored and re-confirmed green.

**Frontend is untouched by the wire-shape change** — `RecentProject` (`ProjectPicker.tsx:33`) is a structural subset that already ignores extra fields (its own comment says `default_drive_mode` "exist[s] on the wire but [is] unused"), so no TS change was needed in Phase 1.

## Notes carried into build

- **Design prior — `[[explicit-selectable-mode-over-inferred-mode]]`:** fires on **rule 2 (agrees with the common-sense default)**. Both the roadmap and the prior independently point to a visible workspace control, so it is taken with higher confidence and needs no build-time disclosure. Its *continuous → discrete* face deliberately does **NOT** fire (over-infer guard, rule 5): probe finding 1 confirms an open value set, so "a few discrete presets" is unavailable. The prior governs **visibility of the choice**, which P2.4 honors.
- **Installed-`.app` smoke test is REQUIRED but deferred to the `/release` gate**, per `[[installed-build-verify-deferred-to-release]]`. This feature is spawn/PATH-adjacent, so the standing `CLAUDE.md` convention applies — it does not block verify-human here, but it must ride the next release.
- **verify-self posture:** Phase 1 is pure Rust → fully agent-verifiable via `cargo test`. Phases 2–3 need the live app; drive them through the `tauri` MCP bridge (caveats a→g in `CLAUDE.md`), **not** the `feature-verify-self-runner` subagent — per `[[mcp-bridge-tools-not-exposed-to-subagents]]` the bridge tools do not reach spawned subagents, which silently fall back to bare Vite with no Tauri IPC. Use `tmp/scratch/scratch-{a,b,c}` as the target projects since Phase 3 spawns real CC sessions. Teardown: `mcp__tauri__driver_session{stop}` + `TaskStop`, then **PID-scoped** port cleanup only — never a blanket `pkill`/port-kill (`[[lsof-ti-tcp-misses-ipv6-vite]]`: the operator may have their own app open).
- **Opportunistic only, do NOT expand scope:** `SURFACE-2026-07-29-CFG-TEST-SPLIT-BLINDS-SOURCE-GUARDS` names two vulnerable `split("#[cfg(test)]")` sites in `workflow_gate/commands.rs:76` and `workflow_substrate/commands.rs:87`. No phase here opens those files; leave them.

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->

[SHORTCUT-2026-07-31] P1.6 — The integration-boundary rule fired (`SessionRegistry::spawn` is consumed by the pre-existing `cc_spawn`, and no Phase 1 outcome cited it). Rather than back-loop F9b for an outcome that is structurally unverifiable at this tier (no test in this repo can construct an `AppHandle`), extracted the inline never-block-a-spawn degradation rule as the pure `resolve_spawn_model` and pinned it with 5 tests over all four reachable read states. Mutation-proven: propagating instead of degrading (`.expect(...)`) fails 2 of the 5. Re-verified via a fresh `cargo test --all-targets` run (703 pass / 0 fail) plus fmt + clippy. Gate 1 (trivial extension of the just-written leaf): holds — a function extraction within the same leaf's code. Gate 2 (fresh re-verification): holds — full suite re-run, not a re-read of prior state. Gate 3: this entry. The live `cc_spawn` → PTY argv proof remains Phase 3's `ps -o args=` outcome, which cites the consuming surface by name.
