---
drive_mode: autopilot
---

# Feature: M18 WP5: Settings → "Remote hosts" (read-only readout + drift)

**Workflow:** feature
**State:** verify-codify (all phases complete)
**Created:** 2026-11-20

## Problem Statement

WP4 made Claudesk know each remote host account's workflow substrate (Absent / Developer / Managed, plus the
clone's root and HEAD), cached per host in `LinkRegistry` and read through `useHostSubstrate`. Nothing shows that
knowledge to the operator yet. The absent-host note says "Install it in Settings → Remote hosts", but that group
does not exist, and its button opens Settings without landing anywhere. WP5 builds the group: one entry per
distinct host among the remote rows, with the state, the short HEAD and the drift against GitHub. Drift is
`ls-remote` from the host, run only while the group is on screen (§R.4, prior
`background-work-only-for-what-is-on-screen`). The group is read-only (no buttons yet: Install is WP6), it never
brings a link up (§R.5), and the absent-host note's button lands on it (5.2b). Design authority:
`arch/claude-substrate.md` → §R.4, §R.5. WBS: `wbs.md` → WP5 (tasks 5.1–5.4, incl. 5.2b).
Probe WP: WP3 is complete (`wbs.md` → "Probe outcomes"); the only third party is GitHub's public HTTPS
endpoint, reached by `git ls-remote` from the host (measured ~1 s at arch time).

## Plan decisions (taken in autopilot; each disclosed, each cheap to reverse)

- **D1. The drift URL is the clone's own `origin`** (`git -C <root> ls-remote origin HEAD`), for Developer AND
  Managed. ⚠️ This revises §R.4's "the record's `origin_url` for Managed". Why: WP7's Update runs
  `git -C <clone> pull --ff-only`, which pulls from the clone's configured `origin`, so drift then compares against
  exactly what Update would fetch, and drift and Update cannot disagree. It also keeps the fragment constant (no
  JSON parsing on the host, no Rust-interpolated URL). A Managed clone's `origin` IS the record's URL unless someone
  edited the host clone. Resync §R.4 at finalize.
- **D2. Every `git` call is behind the guarded developer-tools check** from Probe outcome (5):
  `d=$(xcode-select -p 2>/dev/null) && [ -n "$d" ] && [ -x "$d/usr/bin/git" ]`. Without it, on a host without the
  Command Line Tools, the `/usr/bin/git` shim pops a GUI installer on the host's console. WP4 kept HEAD in perl for
  this reason; drift is the first remote `git` call, so it inherits the guard (WP6 reuses the same fragment).
  Git runs non-interactively: `GIT_TERMINAL_PROMPT=0`, `GIT_SSH_COMMAND='ssh -o BatchMode=yes'`, stdin `/dev/null`.
- **D3. A refresh re-probes the substrate in the same exec** (`SUBSTRATE_PROBE` + the drift fragment, one exec,
  honouring the debug sandbox root exactly as the open check does) and writes the cache through
  `LinkRegistry::set_substrate`. So the readout's state and HEAD are fresh, and every `useHostSubstrate` consumer
  learns the change by the usual `remote-substrate` event. There is one cache, never a second Settings-only copy.
- **D4. The refresh runs over `LinkRegistry::master_exec`** (Up-only, master-only; never connects, never holds a
  link). A host whose link is not Up answers "link down", runs no ssh, and the entry says "Connect a workspace on
  this host to check." It still shows the last cached state if there is one. (§R.5: "Settings never brings up a
  link by itself".)
- **D5. The group is NOT gated** (§R.5, as written): like the local substrate block, it is the on-ramp. It renders
  only when at least one valid remote row exists. A gate-OFF refresh writes the cache, but every funnel consumer
  still reads `false` through the gate, so the workspace side stays byte-identical.
- **D6. "Behind GitHub" means "the host's HEAD differs from GitHub's HEAD"** (no fetch, so ahead/diverged are not
  distinguishable). The settled wording stays, with the two short SHAs shown so the reader can see it.
- **D7. Refresh on mount only.** No polling, no re-run on a later link change while the panel is open (the panel
  is modal; a link comes up only by opening a workspace, which closes Settings first). Results that arrive after
  unmount are dropped.
- **D8. The routed highlight resets.** `App`'s `settingsHighlight` is set by the invite and never cleared, so every
  later ⌘, re-flashes the routed group (a latent M10.9 defect that 5.2b would make visible on every open). An
  ordinary open (⌘, / menu / gear) clears it; a routed open (invite, absent-host note) sets it. The routed group is
  also scrolled into view, because "Remote hosts" sits below the fold.
- **D9. Folded in from the WP4 review:** the MAJOR `SURFACE-2026-11-20-QUALITY-HOST-ARG-GUARD-CHECKS-BY-INCLUDES`
  (Phase 3, test-only) and the MINOR `SURFACE-2026-11-20-QUALITY-ONOPENSETTINGS-OPTIONAL-PROP` (Phase 2: 5.2b
  changes that prop's signature anyway, so it becomes required in the same edit).

## Work Tree

- [x] Phase 1: Backend: the host list and `remote_substrate_refresh` (5.1)
  **Observable outcomes:**
  - CLI: `cargo test` (via `pnpm verify:auto`) passes new tests that run the drift fragment LOCALLY under a temp
    `HOME` against fixture repos with a local bare repo as `origin`: HEAD == origin's HEAD → `up to date`; HEAD
    behind origin → `behind` with both SHAs; no `origin` remote → `can't check` with a reason naming it; Absent
    (no substrate) → no drift line at all.
  - CLI: the developer-tools guard's three arms are unit-tested with a stub `xcode-select` first on `PATH` (empty
    stdout + exit 2 → refuses and runs no `git`; an invalid dir → refuses; a real dir → proceeds), and the refusal
    reason names `xcode-select --install`. Each arm is mutation-proven on its own.
  - CLI: a registry-seam test: with the host's link not Up, `remote_substrate_refresh` returns `link: down`, spawns
    no ssh, and leaves the cache untouched. A caller guard pins that the command's body reaches ssh only through
    `master_exec` (never `exec` / `ensure_and_hold`); deleting that restriction turns it red.
  - CLI: a refresh whose exec succeeds writes the cache via `set_substrate` (the `remote-substrate` sink fires once,
    with the fresh value); a host that is not among the remote rows is refused with an error and no exec.
  - CLI: the new async command is listed in `ASYNC_COMMANDS` (`src-tauri/tests/sync_commands_do_not_block.rs`) with
    its reason, and the test passes.
  - CLI (state-changing, dev app + scratch remote row + the mini's dev account, read-only on the host): from the
    dev app via the tauri MCP bridge, with a scratch remote workspace open on the mini (link Up),
    `invoke("remote_substrate_refresh", {host})` returns `developer`, a short HEAD equal to
    `ssh <host> git -C <root> rev-parse --short HEAD`, and a drift verdict equal to an independent comparison of
    that HEAD with `ssh <host> git -C <root> ls-remote origin HEAD` (both run by the agent, outside Claudesk).
    `remote_hosts` lists the host with `link: up`; after the scratch workspace closes and the link drops, a refresh
    returns `link: down`.
  - CLI (integration boundary, added at verify-self): the refactor moved the substrate lines of `parse_open_facts`
    into the shared `parse_substrate`, so the EXISTING consumer `remote_open_check` must still read the host:
    invoked on the scratch row (gate ON), it returns `kind: start` with `hostSubstrate` = `developer` + the same root
    and HEAD as the independent ssh read.
  **Alignment questions:**
  - none (no operator-visible surface yet; D1's URL choice becomes visible in Phase 2)
  - [x] P1.1 `remote_cmd`: the drift fragment (constant, no interpolated value; D2's guard; D1's `ls-remote origin HEAD`; non-interactive git) composed after `SUBSTRATE_PROBE` into one refresh command that honours `substrate_home_override` like `open_check_command`. Sentinel lines on the existing `CLAUDESK-OPEN:` protocol.  <!-- status: done -->
  - [x] P1.2 A pure parser: the refresh output → `(SubstrateRead, Drift)`, with `Drift = UpToDate { head, remote } | Behind { head, remote } | CantCheck { reason }`, compared on full SHAs, `None` when absent. Plain-words reasons (no developer tools; no origin; GitHub unreachable + the git stderr tail; HEAD unreadable).  <!-- status: done -->
  - [x] P1.3 Commands: `remote_hosts()` (distinct hosts of VALID remote rows, sorted, each with its link state and cached substrate) and async `remote_substrate_refresh(host)` (D3, D4; on a blocking worker; host must be a remote row's host). Register both; add the `ASYNC_COMMANDS` entry.  <!-- status: done -->
  - [x] P1.4 Tests: local fixture runs of the fragment, the guard's three arms with the stub, the parser, the link-down seam test, the caller guard, the cache write. Mutation-prove each new term individually.  <!-- status: done -->
  - [x] verify-auto  <!-- status: done -->
    — evidence: `pnpm verify:auto` → EXIT=0 in 63s (lint 0 errors, 1 pre-existing warning in the untouched `XtermPane.tsx`; format, `tsc`, `check:link` clean; vitest `Tests 4136 passed (4136)`; `cargo fmt --check` clean; clippy `--all-targets -D warnings` clean; `cargo test` lib `1418 passed; 0 failed`, `sync_commands_do_not_block` `16 passed`)
    — evidence: `cargo test --lib remote_` → `230 passed; 0 failed` (incl. `refresh_script` 9, the `remote_substrate` drift tests, the caller guard, the link-down + cache-write settles)
    — evidence: mutants M1–M9 each red on their own test (build notes), the tree restored and confirmed by shasum
  - [x] verify-self  <!-- status: done -->
    - [x] Drift script fixtures (runner)  — evidence: `cargo test --lib refresh_script` → `9 passed`: up to date, behind with both SHAs + `for-each-ref` unchanged (nothing fetched), NoOrigin, Absent → no drift
    - [x] Developer-tools guard, three arms (runner)  — evidence: same run; arm 1 (empty + exit 2 AND empty + exit 0) → NoDevTools + reason contains `xcode-select --install`; arm 2 `/var/empty` → NoDevTools; arm 3 → the dev dir's own git logs both calls. "Runs no git" in arm 1 is by code reading (the refusal branch only echoes), not by a log assertion
    - [x] Link-down seam + caller guard (runner)  — evidence: `a_refresh_with_the_link_down_sends_nothing_and_keeps_the_cache` ok; `the_refresh_asks_the_host_once_over_the_master_only` ok (`links_calls(worker) == ["master_exec"]`)
    - [x] Cache write once; distinct hosts; unknown host refused before any exec (runner)  — evidence: `a_refresh_that_answered_writes_the_cache_once` ok; `remote_hosts_are_the_distinct_valid_hosts_sorted` ok; the lookup's `?` precedes `links.master_exec`
    - [x] `ASYNC_COMMANDS` entry (runner)  — evidence: `cargo test --test sync_commands_do_not_block` → `16 passed`; the entry carries its reason
    - [x] Live refresh against the mini (orchestrator, tauri MCP bridge; subagents can't reach it)  — evidence: the agent's own ssh master: the live clone's HEAD `f8e8873970c0…` (`rev-parse --short` `f8e8873`), and `ls-remote origin HEAD` the same sha. Dev app: `remote_substrate_refresh` → `{outcome: checked, substrate: developer, root: ~/my-claude-code-customization, head: f8e8873970c0…, drift: up_to_date, remote: f8e8873970c0…}` (~260 ms over an Up link); `remote_hosts` lists the host with `link_up: true` (plus the old real row's host, `unknown`); `remote_host_substrates` carries the same value (cache written); `nobody@nowhere` → "is not the host of a remote project". ⚠️ The link was brought Up by the open check's 20 s grace (no CC session spawned), not by an open workspace as the outcome text says; the link state Up is the property under test.
    - [x] Live link-down  — evidence: after the dev app's master stopped (only the installed app's `ssh -M` remained, parent `/Applications/Claudesk.app`), `remote_hosts` → `link_up: false`; the refresh → `{outcome: link_down}` in 2 ms; the cache still `developer`
    - [x] Integration boundary: `remote_open_check` (the existing consumer of the refactored parser)  — evidence: on the scratch row, gate ON → `{kind: start, hostSubstrate: {state: developer, root, head: f8e8873970c0…}, trusted: true, sessionMd: false}`
  - [x] verify-human  <!-- status: done --> — zero admissible leaves (F11)
  - [x] verify-codify  <!-- status: done -->
    Test scope: full — suite not long (`runtimes.md` → `pnpm verify:auto` Last 63s)
    — evidence: new tests `the_wrapped_command_gives_the_same_answer_through_its_login_shell` (the whole `zsh -lc '<script>'` through `/bin/sh -c`, as sshd runs it; a double-quote wrapper mutant turns it red) and `only_a_given_sandbox_root_adds_the_prefix`; the consuming surface `remote_open_check` stays covered by the existing `decide_open` substrate-line tests in `remote_link/commands.rs`
    — evidence: `pnpm verify:auto` → EXIT=0 in 57s (vitest `4136 passed`; `cargo test` lib `1420 passed; 0 failed`; fmt + clippy clean; the one lint warning is the pre-existing `XtermPane.tsx` one)

- [x] Phase 2: The Settings group + landing on it (5.2, 5.2b, 5.3)
  **Relevance check (before Phase 2):**
  - Requester still needs this: yes — the absent-host note already points at a group that does not exist
  - Requirements unchanged: yes — §R.4/§R.5 as planned; Phase 1 confirmed the data shapes live
  - Solution still feasible: yes — `remote_hosts` + `remote_substrate_refresh` work against the mini
  - No superior alternative discovered: yes
  **Verdict:** proceed
  **Observable outcomes:**
  - Browser (tauri MCP bridge, dev app): with ≥1 remote row, ⌘, (or the menu) opens Settings and
    `[data-testid="settings-group-remote-hosts"]` exists, placed directly after `settings-group-workflow-features`,
    with one entry per distinct host. With no remote row (dev `projects.json` without one), the group is absent from
    the DOM.
  - Browser: the mini's entry reads `Developer`, the short HEAD from Phase 1's independent ssh read, and the drift
    verdict from Phase 1's independent comparison ("Up to date" or "Behind GitHub" + both short SHAs). While the
    refresh is in flight it reads "Checking…".
  - Browser: with the link down (no workspace open on the host), the entry says "Connect a workspace on this host to
    check." and still shows the cached state if one exists; the app's process list shows no new `ssh` spawned by
    opening Settings (`pgrep -fl "ssh.*<host>"` before/after).
  - Browser (state-changing: dev launch with `CLAUDESK_REMOTE_SUBSTRATE_ROOT=<empty dir on the mini>`, the dir created
    and removed by the agent): the entry reads `Absent`, with no drift line.
  - Browser: with the gate ON and a scratch remote workspace whose host reads Absent, clicking the absent-host
    note's Settings button opens Settings with `settings-group-remote-hosts` carrying `data-highlighted="true"` and
    scrolled into the body's visible rect (`getBoundingClientRect` inside the body's rect). Closing and re-opening
    with ⌘, highlights NO group (D8); the invite route still highlights `workflow-features`.
  - Browser: geometry at the app's minimum window size: the panel fits the window (panel bottom ≤ window inner
    height), the body scrolls to the group's last entry, and no entry overflows horizontally
    (`scrollWidth <= clientWidth`).
  - CLI: Vitest: closing the panel starts no further work: no `remote_substrate_refresh` invoke after unmount,
    whether a refresh was in flight or the host list had not arrived yet (`mockIPC` call count stays flat across a
    later tick). Mutation: removing the cancel turns it red. [Amended 2026-11-20, P2.verify-human.6 decision A: the
    original "drops the result (no `act` warning)" is unobservable under React 19, so the outcome now names the
    observable property.]
  - CLI: `tsc` fails if `onOpenSettings` is dropped from `CenterStage` / `Workspace` (required prop, D9), and the
    source guard it replaces is deleted.
  **Alignment questions:**
  - The entry's layout and words (state / short HEAD / drift / link-down line), seen against the mini: is this the
    readout you meant?
  - (decision) The entry names the host by its full `user@host`, unlike the picker and the note (short host).
    Settings is where you identify the account; still right?
  - (decision) The group sits right after "Workflow features". Right place?
  - D1 in action: drift compares against the clone's `origin`, which is what Update will pull. Still what you want?
  - [x] P2.1 `RemoteHostsSettings` body (reads `remote_hosts`, the substrate through `useHostSubstrates(true)` — the seam, never a one-shot copy — and drift from the refresh result); `SettingsGroup id="remote-hosts"` in `SettingsPanel`, rendered only when the host list is non-empty.  <!-- status: done -->
  - [x] P2.2 Refresh on mount, one call per host in parallel, cancelled on unmount (D7, 5.3).  <!-- status: done -->
  - [x] P2.3 5.2b: `onOpenSettings(group?)` → App sets `settingsHighlight` for a routed open and clears it for an ordinary one (D8); `SettingsPanel` scrolls the highlighted group into view once it renders (the group appears after an async read). Make `onOpenSettings` required (D9).  <!-- status: done -->
  - [x] P2.4 Styles (copy hex from the existing settings groups: no CSS token layer) + geometry measured live at the minimum window size (lesson: a 702px dialog in a 599px panel).  <!-- status: done -->
  - [x] verify-auto  <!-- status: done -->
    — evidence: `pnpm verify:auto` → EXIT=0 in 50s (lint 0 errors, the one pre-existing `XtermPane.tsx` warning; format, `tsc`, `check:link` clean; vitest `Tests 4148 passed (4148)`; `cargo test` lib `1420 passed; 0 failed`; fmt + clippy clean)
    — evidence: `vitest run remoteHostsSettings.test.tsx` → `11 passed`; mutants (early-unmount refresh, scroll call, down-host skip, group-always) each red, source restored by shasum
  - [x] verify-self  <!-- status: done -->
    - [x] Group placement + one entry per host (live)  — evidence: dev app via the bridge, picker gear → groups in order `claude-code, profiles, workflow-features, remote-hosts, analytics, updates, hotkeys`; two entries (the old real row's account + the scratch account). With NO remote row the group is absent: covered by the real-panel mount test `does not exist without a remote row, and asks nothing` (the dev `projects.json` always holds a remote row, so not driven live)
    - [x] Developer + HEAD + drift against the mini (live, real account)  — evidence: scratch workspace open (link Up), ⌘, → the scratch entry at 400 ms `Developer · installed by hand; Claudesk doesn't manage it · HEAD f8e8873` + `Checking GitHub…`, at 1.2 s `Up to date with GitHub.`; the HEAD's tooltip is the clone root; matches the agent's own ssh read (HEAD = `ls-remote origin HEAD` = `f8e8873970c0…`). Screenshot: session scratchpad `p2-developer.png` (shows the real host, so not committed)
    - [x] Link down (live)  — evidence: fresh launch, no workspace: both entries `Unknown · not checked yet` + `Connect a workspace on this host to check.`; after the workspace closed and its master stopped: the entry KEEPS `Developer · HEAD f8e8873` + the connect line. ssh PIDs identical before/after opening Settings both times (`6043 6044 6052`: the agent, and the installed app's tank link)
    - [x] Absent on the sandbox root (live, state-changing as declared: an empty `~/claudesk-wp5-sandbox` on the mini, removed after)  — evidence: dev launch with `CLAUDESK_REMOTE_SUBSTRATE_ROOT`; the scratch workspace shows the absent-host note (no skill row); the Settings entry reads `Absent · the workflow system isn't installed for this account`, no drift line. Screenshot `p2-absent.png` (scratchpad)
    - [x] 5.2b + D8 (live)  — evidence: the note's Settings button → 200 ms after: `data-highlighted="true"` + `settings-group-highlight`, body `scrollTop` 586 with the group inside the body rect; 1.6 s after: highlight gone. Then each close path (close button, ⌘, toggle, Esc), followed by a ⌘, open, → `anyHighlighted: false`, `scrollTop: 0`. The routed open at the same 200 ms read is the positive control. The invite route (`setSettingsHighlight("workflow-features")`) is unchanged and still pinned by `workflowInviteCopy.test.ts`; not driven live (the invite is acknowledged in the dev settings)
    - [x] Geometry (live)  — evidence: no `minWidth`/`minHeight` in `tauri.conf.json`, so measured at 800×500 and 520×500: the panel fits (`bottom ≤ innerHeight`), the body scrolls (2901/331) to the last entry, and there is no horizontal overflow (body 439/439, group 439/439; the `user@host` names wrap to 2 lines). Window restored to 1280×800
    - [x] Unmount drops work (runner)  — evidence: `remoteHostsSettings.test.tsx` 11 passed: no second refresh after a close while one is in flight, and no refresh at all when the panel closes before the list arrives (that mutant is killed)
      - [ ] Outcome wording vs test  <!-- status: FAILED-cosmetic --> — the plan's outcome promised "drops the result (no `act` warning)". A late `setChecks` is unobservable under React 19 (no warning, the mutant is equivalent), so no test can assert it. The code keeps the guard; the test asserts the observable 5.3 property (no work started after close)
    - [x] `onOpenSettings` required (runner)  — evidence: required in both prop interfaces, strict mode, no spread render sites; `tsc --noEmit` exit 0; the old presence guard is replaced by a which-function guard (`onOpenSettings={openSettingsAt}` + its body)
    - [x] align: the entry's layout and words — evidence: `p2-developer.png` + `p2-absent.png` (scratchpad); the words are in the Developer and Absent leaves above
    - [x] align: (decision) the full `user@host` in Settings — evidence: the entries render the full account and host (e.g. `<user>@<mini-host>`), and wrap at 520 px
    - [x] align: (decision) placement right after Workflow features — evidence: the group order above
    - [x] align: D1 in action (drift vs the clone's `origin`) — evidence: `Up to date with GitHub.` for HEAD `f8e8873`, and the clone's `origin` is the public HTTPS mccc URL (memory `remote-verify-hygiene` rule 5)
    - Cleanup: the dev app (agent-launched) stopped by its recorded PIDs with no workspace open; the dev `projects.json` / `settings.json` restored (`38ee76dd…` / `72bfef1c…` match); the sandbox removed (path-checked, empty); no `claudesk-dev` tmux server; the scratch folder unchanged; the agent's own master closed
  - [x] verify-human  <!-- status: done --> — operator 2026-11-20: "all good. go with your rec"
    - [x] P2.verify-human.1: the entry's layout and words (Developer / up to date, and Absent), from the screenshots — is this the readout you meant?  <!-- status: done -->
    - [x] P2.verify-human.2: D5 in action: the group shows even with Workflow features OFF (it is the on-ramp, like the local substrate block) — still what you want?  <!-- status: done -->
    - [x] P2.verify-human.3: D1 in action: drift compares against the install clone's own `origin` (what Update will pull), not the record's URL — still what you want?  <!-- status: done -->
    - [x] P2.verify-human.4: (decision) the full `user@host` in Settings vs the short host in the picker and the note  <!-- status: done --> — A: full `user@host`
    - [x] P2.verify-human.5: (decision) placement right after Workflow features  <!-- status: done --> — A: after Workflow features
    - [x] P2.verify-human.6: (decision) accept the cosmetic outcome-wording gap (the late-result guard is unobservable under React 19)  <!-- status: done --> — A: accept; amend the outcome wording at codify
  - [x] verify-codify  <!-- status: done -->
    Test scope: full — suite not long (`runtimes.md` → `pnpm verify:auto` Last 50s)
    — evidence: D8 codified at App level on the REAL app (jsdom boot of `src/main.tsx`): `settingsHighlightCloseButton.test.tsx` and `settingsHighlightCmdComma.test.tsx` (shared `settingsHighlightHarness.ts`). Each takes the invite's routed open (the positive control: highlighted), closes by its own path, and reopens from the picker gear (which clears nothing, so the close path's clear is what's proven). Mutants: dropping `closeSettings`' clear reds ONLY the close-button test; dropping the ⌘, toggle's clear reds ONLY the ⌘, test
    — evidence: the outcome wording amended per P2.verify-human.6 (decision A)
    — evidence: `pnpm verify:auto` → EXIT=0 in 56s (vitest `4150 passed`; `cargo test` lib `1420 passed`; fmt, clippy, `tsc`, `check:link` clean; the one pre-existing lint warning)

- [x] Phase 3: The host-argument guard checks each arm (WP4 review MAJOR)
  **Relevance check (before Phase 3):**
  - Requester still needs this: yes — the MAJOR is open in the backlog, and Phase 2 added no new host-arg site
  - Requirements unchanged: yes
  - Solution still feasible: yes
  - No superior alternative discovered: yes
  **Verdict:** proceed
  **Observable outcomes:**
  - CLI: `workflowApplicableGuard.test.ts` splits a host argument's top-level conditional arms and requires EACH arm
    to be a seam call or a seam-bound identifier. New self-tests: `c ? hostSubstrateFor(p, m) : LOCAL` (identifier
    arm) and `c ? hostFromOpenCheck(x) : { state: "developer" }` (object arm) are both flagged; the real picker
    open-path ternary still passes.
  - CLI: mutation: rewriting the real `ProjectPicker.tsx` open-path call's second arm to a non-seam value turns the
    guard red; reverting turns it green (`Tests N` line read on each run).
  - CLI: `pnpm verify:auto` exits 0.
  **Alignment questions:**
  - none (test-only)
  - [x] P3.1 Per-arm split in `checkHostArg` (nested ternaries recurse), plus the self-tests and the mutation proof.  <!-- status: done -->
  - [x] verify-auto  <!-- status: done -->
    — evidence: `pnpm verify:auto` → EXIT=0 in 52s (vitest `4151 passed (4151)`, incl. the guard's 7; `cargo test` lib `1420 passed`; fmt, clippy, `tsc`, `check:link` clean; the one pre-existing `XtermPane.tsx` lint warning)
    — evidence: the HEAD-copy proof + the two guard mutants (build notes)
  - [x] verify-self  <!-- status: done --> — no integration boundary (a test file only)
    - [x] Per-arm self-tests (runner)  — evidence: `vitest run workflowApplicableGuard.test.ts` → `7 passed`; the identifier arm (`LOCAL` not bound) and the object arm (not from the seam) are flagged, and the picker's real shape passes
    - [x] Picker mutation (runner, declared state change, restored)  — evidence: the second arm → `UNKNOWN_SUBSTRATE` landed (grep 1, `cmp` differs) → `2 failed | 5 passed (7)` with "ProjectPicker.tsx: host `UNKNOWN_SUBSTRATE` is not bound from the seam"; restored (shasum `9862e96d…` matches) → `7 passed`; `git status` of the picker dir is clean
    - [x] `pnpm verify:auto` (runner)  — evidence: EXIT=0, `Tests 4151 passed (4151)`, `test result: ok. 1420 passed; 0 failed`
  - [x] verify-human  <!-- status: done --> — zero admissible leaves (F11); the feature-level floor is met (Phase 2 had an operator look)
  - [x] verify-codify  <!-- status: done --> — no integration boundary (the phase adds a guard's own checks; its self-tests ARE the codified form)
    Test scope: full — last phase
    — evidence: `pnpm verify:auto` → EXIT=0 in 48s (vitest `4151 passed (4151)`; every `cargo test` binary `0 failed`, lib `1420 passed`; fmt, clippy, `tsc`, `check:link` clean; the one pre-existing lint warning)

## Current Node
- **Path:** Feature > ship
- **Active scope:** ship
- **Build notes (Phase 3):**
  - `checkHostArg` now unwraps whole-expression parens, splits a top-level conditional (`splitConditional`, recursive; `?.`/`??` are not its `?`), and requires EACH arm to be exactly one seam call (`closeOf` the call's paren = the arm's end) or a seam-bound identifier.
  - New self-test block covers: an identifier arm, an object arm, either arm, a nested inner arm, `||` / `??` chained after a seam call, all-seam nested + parenthesised arms, the picker's real shape, and `?.` inside an arm.
  - Old hole proven with HEAD's guard as a throwaway `zz` copy: with the picker's open-path second arm swapped for `UNKNOWN_SUBSTRATE`, HEAD's guard passes 6/6, the new one fails ("host `UNKNOWN_SUBSTRATE` is not bound from the seam"). Both pass on the clean tree.
  - Guard mutants (only arm a checked; a seam prefix suffices) each red.
  - At close: resolve `SURFACE-2026-11-20-QUALITY-HOST-ARG-GUARD-CHECKS-BY-INCLUDES` (this phase) and `SURFACE-2026-11-20-QUALITY-ONOPENSETTINGS-OPTIONAL-PROP` (Phase 2, D9) per delete-on-resolve.
- **Blocked:** none
- **Unvisited:** ship → review-quality → finalize
- **Open discoveries:** none

## Verification hygiene (R.8 + memory `remote-verify-hygiene`)
- Detection and drift may READ the mini's live dev account; nothing is written there. The sandbox root is an empty
  dir the agent creates on the host and removes afterwards.
- Real commands only in the scratch remote folder; check for open remote workspaces before stopping the app; a
  hand-added dev `projects.json` row needs integer timestamps. Never touch the installed Claudesk's `ssh -M` (tank).
- Restore the dev `projects.json` / `settings.json` to their pre-check state after verify-self.

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->
[AMENDED-2026-11-20] Phase 1 Observable outcomes — verify-self found an integration boundary the plan missed: the substrate lines of `parse_open_facts` moved into the shared `parse_substrate`, which `remote_open_check` consumes. I added a boundary outcome citing `remote_open_check` and drove it live in the same pass, instead of an F9b back-loop that would only have added the line.
