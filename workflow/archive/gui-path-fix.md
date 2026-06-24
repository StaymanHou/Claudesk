---
workflow: task
state: Completed 2026-06-24
created: 2026-06-24
docs-only: false
---

# Task: Fix minimal-GUI-PATH so the installed app can spawn `claude` (and other CLIs)

**Workflow:** task
**State:** plan (complete)
**Created:** 2026-06-24

## Problem Statement
The installed (Finder/Dock-launched) Claudesk `.app` fails to spawn Claude Code ("No viable candidates found in PATH /usr/bin:/bin:/usr/sbin:/sbin") because a macOS GUI app inherits a minimal system PATH that omits `~/.local/bin` (where `claude` lives); fix it app-wide by capturing the login shell's PATH at startup and setting it for the whole process.

## Reproduction (confirmed — no /feature-reproduce needed)
- **Symptom:** installed `.app`, open a project → red overlay "failed to spawn claude because: No viable candidates found in PATH `/usr/bin:/bin:/usr/sbin:/sbin`" (operator screenshot 2026-06-24).
- **Root cause (confirmed):** Finder-launched GUI apps get the minimal launchd PATH, NOT the shell PATH. `which claude` → `/Users/stayman/.local/bin/claude` (not in the minimal PATH). `pnpm tauri:dev` works ONLY because it inherits the terminal's full PATH — which is why this never surfaced until a real install.
- **Spawn site:** `cc_session/mod.rs::spawn_argv` → `CommandBuilder::new("claude")` (portable-pty) resolves the program against the inherited (impoverished) PATH; CC's argv never sets PATH.
- **Confirmed fix direction:** `$SHELL -l -i -c 'printf %s "$PATH"'` returns a PATH including `~/.local/bin` + `/opt/homebrew/bin`; a login shell resolves `claude` correctly. Capture that at startup and `std::env::set_var("PATH", ...)`.

## Context
- `src-tauri/src/lib.rs` `.setup()` (line ~41) — the startup hook; currently runs seed → install_on_launch → broadcaster. The PATH fix must run FIRST (before any external spawn benefits from it).
- `src-tauri/src/cc_session/mod.rs` — `CC_CMD = "claude"`, `DEFAULT_SHELL` (the macOS-default shell fallback to reuse), `spawn_argv` (the spawn site, unchanged by this fix — it just benefits from the corrected process PATH).
- **Convention:** pure-core / IPC-(or here startup-)shell split (mirrors config_store/hook_install/sublime/finder). New module `src-tauri/src/env_path/`.
- **Safety:** `std::env::set_var` is process-global; at `.setup()` time the app is effectively single-threaded (spawn/reader threads start later), so setting PATH here is safe. Best-effort: never BLANK an existing PATH — on capture failure leave the inherited PATH untouched + log.

## Work Tree

- [x] T1 Pure `resolve_path`  <!-- status: done 2026-06-24 — src-tauri/src/env_path/mod.rs: resolve_path(Option<&str>)->Option<String>, Some(trimmed) iff present+non-blank else None (no-op) -->
- [x] T2 capture + apply wrappers  <!-- status: done 2026-06-24 — capture_login_path() runs <$SHELL or /bin/zsh fallback> -l -i -c 'printf %s "$PATH"', Some on success+nonblank else None+eprintln; apply_login_path_to_process() resolve→set_var("PATH",p)+log / None→log kept-inherited. Best-effort, never blanks PATH. DEFAULT_SHELL="/bin/zsh" matches cc_session (separate const, commented). -->
- [x] T3 Wire into .setup()  <!-- status: done 2026-06-24 — mod env_path in lib.rs; env_path::apply_login_path_to_process() is the FIRST line in .setup(), before seed/install/broadcaster -->
- [x] T4 Unit tests  <!-- status: done 2026-06-24 — 4 tests: present-nonblank / trailing-newline-trim / blank+empty+newline no-op / None no-op. -->
- [x] T5 Verify green  <!-- status: done 2026-06-24 — cargo 205 (+4 env_path), build+clippy clean, tsc clean. REAL-CAPTURE SANITY PASS: `$SHELL -l -i -c 'printf %s "$PATH"'` includes claude's dir (~/.local/bin) — the fix resolves the actual failure. -->
- [x] T6 Rebuild prod .app  <!-- status: done 2026-06-24 — pnpm tauri build → fresh .app with the PATH fix, ready for native verify-human (launch from Finder → CC starts) -->
- [x] T7 SURFACED: tsc-only on FE (no test count change)  <!-- status: done 2026-06-24 — backend-only fix; frontend untouched, vitest unchanged at 428 (not re-run, no FE delta); tsc clean confirms no type break. The native end-to-end confirmation (launch installed .app from Finder → CC starts) is the /task-verify gate's operator check, not a Work Tree leaf. -->

## Current Node
- **Path:** Task > verify (complete)
- **Active scope:** all complete, ready for close
- **Blocked:** none
- **Open discoveries:** none

## Verification Observable

**Observable:** Reproducing the exact GUI failure condition — a process whose PATH is the minimal launchd `/usr/bin:/bin:/usr/sbin:/sbin` (where `claude` is NOT findable, the bug) — then running the app's capture mechanism (`$SHELL -l -i -c 'printf %s "$PATH"'`) and resolving `claude` against the *captured* PATH succeeds. I.e. the fix turns the failing condition into a passing one.
**Verification command:** Start from the GUI minimal PATH and prove (a) the bug really triggers there and (b) the captured PATH fixes it:
```
env -i PATH="/usr/bin:/bin:/usr/sbin:/sbin" HOME="$HOME" sh -c 'command -v claude'   # expect: NOT found (bug condition)
CAP=$(/bin/zsh -l -i -c 'printf %s "$PATH"'); PATH="$CAP" command -v claude            # expect: resolves /…/claude (fix)
```
**Expected result:** First command finds nothing / nonzero (confirms the minimal PATH is genuinely broken for `claude` — the bug). Second command prints an absolute path to `claude` and exits 0 (the captured login PATH the app sets makes `claude` resolvable — the fix). Plus: `env_path` unit tests pass; full cargo suite green (no regression).

## Verification Result

**Status:** PASS
**Date:** 2026-06-24
**Evidence:** (a) `env -i PATH="/usr/bin:/bin:/usr/sbin:/sbin" HOME=… sh -c 'command -v claude'` → **exit 1, no output** (the bug reproduced: under the GUI minimal PATH `claude` is not findable — exactly the "No viable candidates found in PATH" failure). (b) `CAP=$(/bin/zsh -l -i -c 'printf %s "$PATH"'); PATH="$CAP" command -v claude` → **`/Users/stayman/.local/bin/claude`, exit 0** (the captured login PATH the app now sets process-wide makes `claude` resolvable). cargo `env_path` tests 4/4; full lib suite 205, no regression.
**Notes:** Before/after against the real mechanism — minimal GUI PATH fails, captured login PATH succeeds. The fix is confirmed. The full end-to-end (installed `.app` launched from Finder → CC starts, no red overlay) is the operator's native confirmation; prod `.app` already rebuilt with the fix.

## Retrospect
- **What changed in our understanding:** The dev/prod-isolation feature shipped a *working* dogfood setup but masked this bug — `pnpm tauri:dev` inherits the terminal PATH, so CC always spawned fine in dev; the GUI-minimal-PATH problem only became visible the first time the operator launched a real *installed* build. The lesson: "works in `tauri:dev`" is not "works installed" for anything PATH-dependent.
- **Assumptions that held:** The pure-core/startup-shell split + best-effort discipline (never blank an existing PATH) transferred cleanly. `$SHELL -l -i -c 'printf %s "$PATH"'` is the right capture (login+interactive sources the full rc chain). One app-wide fix at `.setup()` covers claude AND every other CLI spawn — the right altitude (the operator's instinct over the CC-spawn-only narrower option).
- **Assumptions that were wrong:** None about the fix; the root cause was certain before any code. The only mild surprise was that `sublime`/`finder` *don't* hit this today purely by luck (their `.app`-bundle/`open` fallbacks dodge a bare-name PATH lookup) — the app-wide fix de-risks them too.
- **Approach delta:** Matched the plan exactly. Verify went further than planned — instead of just "capture resolves claude," I reproduced the actual bug condition (minimal GUI PATH → claude not found) and showed the captured PATH fixes it, a true before/after against the real mechanism.

## Communicate
> **Closure notice:** The installed-app "Could not start Claude Code / No viable candidates found in PATH" bug is fixed. A Finder-launched macOS app inherits a minimal PATH that omits `~/.local/bin` (where `claude` lives); Claudesk now captures the login-shell PATH at startup and sets it process-wide, so the installed build finds `claude` (and every other CLI). Verify: relaunch the freshly-built `.app` **from Finder**, open a project → Claude Code starts with no red overlay.

Requester = operator — closure notice for self-record.

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow/backlog.md -->
[SURFACED-2026-06-24] arch.md resync — NEW startup step: app captures the login-shell PATH and sets it process-wide at `.setup()` (the macOS GUI-minimal-PATH fix). Affects how ALL external CLIs (claude, subl/smerge, finder `open`) resolve in the installed build. Worth a one-line arch.md note at the next /product-finalize resync (this + the dev/prod-identity mechanism + the Finder launcher are the pending arch resync items).
