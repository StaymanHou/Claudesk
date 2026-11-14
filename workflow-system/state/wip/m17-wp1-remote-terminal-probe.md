---
drive_mode: autopilot
---

# Feature: M17 WP1 — Remote terminal probe (tmux on the mini)

**Workflow:** feature
**State:** verify-codify (all phases complete)
**Created:** 2026-11-14
**WBS:** `workflow-system/product/wbs.md` → WP1 (type: probe, timebox 1 day)

## Problem Statement

M17 runs a remote workspace's CC inside `tmux -L claudesk` on the mini, reached over `ssh -tt`
inside Claudesk's existing PTY + xterm.js pane (`arch/remote-workspaces.md` §B, §C). Research
proved attach, resize, keystrokes, reconnect and the forwards, but **not** the things a user would
notice first in the pane: scrollback (tmux re-renders, so history may live in tmux, not xterm.js —
arch §I, UNPROBED), bracketed paste surviving tmux as one prompt (the Prompt panel's `⌘↵`, F-a
ruling), TERM / truecolor / UTF-8 / tmux status line, whether `/exit` ends the tmux session (the R-1
mechanism), and spawn-to-ready latency (sets vision Metric 7's open-time budget). WP3 builds the
spawn path around tmux, so a failure here must change the design **before** WP3. The success
criterion (WBS): every item is PASS, or FAIL with a chosen mitigation written into
`arch/remote-workspaces.md` — nothing left "probably fine".

**This is a probe: no product code is written.** The output is evidence plus decisions recorded in
`arch/remote-workspaces.md` (§C's tmux option string, §I's scrollback entry) and
`wbs.md` → "Probe outcomes". Probe scripts live in the session scratchpad.

**Probe vehicle.** No remote spawn path exists until WP3, so the probe runs the planned remote
command in a **real Claudesk xterm.js pane**: the second terminal (`TerminalPane` → the same
`XtermPane`, `scrollback: 10000`, the same `color_tty_env` TERM/COLORTERM/LANG as the CC spawn) of a
local scratch workspace (`../claudesk-scratch/scratch-a`) in `pnpm tauri:dev`, driven through the
`tauri` MCP bridge (`cc_input` via `__TAURI_INTERNALS__.invoke`, buffer read via the React fiber per
`mcp-tauri-bridge-caveats.md` (e)/(i)/(n)). The command typed is §C's planned remote command (or the
closest probe form of it). Known fidelity gap, recorded rather than hidden: the pane's child is a
login zsh that then runs `ssh`, not `ssh` directly; Phase 1 checks the shell did not alter
`TERM`/`COLORTERM`/`LANG` before ssh (positive control).

**Third-party / external dependency:** the target host itself (`<user>@<mini-host>`
over Tailscale). WP1 *is* the probe for it; research already probed the host facts.

**⚠️ Blocker found at plan time (2026-11-14):** `claude auth status` on the mini reports
`loggedIn: false`. Every CC-dependent check (Phase 2) needs CC logged in on the mini, and which
account logs in on a shared host is the operator's (and possibly the tank side's) decision, not the
agent's. Phase 1 holds every check that does not need CC; Phase 2 is `BLOCKED` on that login.

**Mini hygiene (declared fence for all phases):** work only under the dedicated tmux server
`-L claudesk` (session names `cd-probe-*`) and a scratch dir `~/.claudesk-probe/` on the mini. Never
touch the mini's sshd config, the operator's own tmux, or `~/.claude/settings.json`. A CC run in the
scratch dir writes a transcript dir under `~/.claude/projects/` and a trust entry in `~/.claude.json`:
the transcript dir is removed at cleanup; the `~/.claude.json` entry is **left and recorded** (editing
that file on a shared host is riskier than the stale entry).

## Work Tree

- [x] Phase 1: Terminal parity under tmux — the checks that need no CC login
  **Observable outcomes:**
  - CLI (control): in the scratch-a second terminal, before ssh, `printf '%s|%s|%s' "$TERM" "$COLORTERM" "$LANG"` reads `xterm-256color|truecolor|en_US.UTF-8` in the xterm buffer (the shell did not alter `color_tty_env`).
  - CLI (state-changing, mini: `-L claudesk` server + `~/.claudesk-probe/`): typing `ssh -tt <host> "zsh -lc 'exec tmux -L claudesk new -A -s cd-probe-1 -c ~/.claudesk-probe …'"` into that pane yields a tmux pane whose `tmux -L claudesk display -p '#{pane_height}x#{pane_width}'` (read over a separate ssh exec) equals the xterm `term.rows`x`term.cols` read via the bridge, **with `status off`** — no status-line row is consumed.
  - CLI (1.1 scrollback, per candidate): after `seq 1 400` inside the tmux pane, the xterm buffer read via the bridge reports, for each of three configs — (A) plain tmux, (B) `terminal-overrides ',xterm*:smcup@:rmcup@'`, (C) `mouse on` (copy-mode on wheel) — `buffer.active.type`, `buffer.normal.length`, and whether lines `1..400` appear **in order without duplicates** in the normal buffer (A expected: alternate buffer, history absent from xterm). For C, a synthetic `WheelEvent` (deltaY < 0) dispatched on the pane's `.xterm-screen` puts the tmux pane in copy mode (`#{pane_in_mode}` = 1 over a separate exec) and shows earlier lines on screen. The chosen config is the one where earlier output is reachable by wheel **and** the buffer is not corrupted; ties are broken in favour of native xterm.js scrollback (B) because the turn-marker jump (`turnMarkers.ts`) reads the xterm buffer.
  - CLI (1.2 bracketed paste, stand-in): with the chosen config, a payload built by `stagedPayload.ts` (`PASTE_START`…`PASTE_END`, three lines) sent via `cc_input` into a tmux pane running `cat -v` arrives as **one** framed block (`^[[200~line1^Mline2^Mline3^[[201~` or the tmux-rewritten equivalent) — i.e. tmux forwards the paste envelope to an app that enabled `?2004h`. A second run into a pane whose app did **not** enable `?2004h` records what tmux does (strips the envelope or not) as a fact for WP3.
  - CLI (1.3 TERM/colour/UTF-8): inside the tmux pane, `printf '%s|%s|%s' "$TERM" "$COLORTERM" "$LANG"` is recorded; `printf '\e[38;2;255;100;0mX'` lands in the xterm buffer as a cell with `isFgRGB() === true` and fg `0xff6400` (truecolor survives tmux; if not, retry with `terminal-features ',xterm-256color:RGB'` and record the needed option); a line of CC's glyphs (`⏺ ✻ ⎿ ─ │ ❯`) prints and reads back byte-identical from the buffer (UTF-8 survives ssh + tmux).
  - CLI (1.5a latency to tmux-ready): with a warm ControlMaster (`ssh -M -N -S <short ctl>`), the time from issuing the remote command to the tmux pane's first output, and the cold-connection time, are each measured 3× by a host-side script under `script(1)` (median recorded). Not measured via a webview timer: the agent-launched dev window is hidden and throttles timers (caveat (n)).
  - CLI (cleanup): `tmux -L claudesk ls` on the mini reports no server / no session; `~/.claudesk-probe` holds only what Phase 2 still needs (or is absent if Phase 2 is skipped).
  **Alignment questions:**
  - Scrollback in action: in your own Claudesk's second terminal, paste the probe command for the chosen config, run `seq 1 400`, and scroll with the trackpad. Does it feel like a local pane, and is the chosen config what you want (the trade-off — B keeps xterm.js-native scrollback, C uses tmux copy-mode with its own keys)?
  - (decision) If no config gives full parity, which compromise is acceptable for M17 — or is it a reason to swap the session host (`dtach`/`abduco`, ~+2–3 days on the checkpoint)?
  - [x] P1.1 Preflight: dev app up (`pnpm tauri:dev`), scratch-a open, second terminal open, bridge reaches the xterm `Terminal` and the terminal's PTY session id; control read of TERM/COLORTERM/LANG  <!-- status: done -->
  - [x] P1.2 Attach + geometry + `status off` (pane size equals xterm size)  <!-- status: done -->
  - [x] P1.3 Scrollback: configs A/B/C measured from the buffer; wheel test for C (and B, A for contrast); pick one  <!-- status: done -->
  - [x] P1.4 Bracketed paste through tmux with the `cat -v` stand-in (envelope forwarded / stripped)  <!-- status: done -->
  - [x] P1.5 TERM / COLORTERM / LANG inside tmux; truecolor cell check; UTF-8 glyph round-trip  <!-- status: done -->
  - [x] P1.6 Latency to tmux-ready (warm master vs cold), host-side `script(1)` timing, 3× each  <!-- status: done -->
  - [x] P1.7 Record Phase 1 findings: draft §C tmux option string + §I scrollback outcome in `arch/remote-workspaces.md`; Phase-1 rows in `wbs.md` → "Probe outcomes"; mini cleaned  <!-- status: done -->
  - [x] verify-auto  <!-- status: done -->
    — evidence: `git status --porcelain -- src src-tauri package.json pnpm-lock.yaml` → exit 0, empty output (probe changed no code; `pnpm verify:auto` not required per plan)
    — evidence: `ssh <mini> 'tmux -L claudesk ls'` → "no server running on /private/tmp/tmux-502/claudesk"; `~/.claudesk-probe` holds only b/c/d/e.conf (kept for Phase 2); local `/tmp/cdp-wp1.sock` absent
    — evidence: code-fence balance in the WIP, `arch/remote-workspaces.md`, `wbs.md` → 2 fences each (even)
  - [x] verify-self  <!-- status: done -->
    - [x] control TERM/COLORTERM/LANG pre-ssh  <!-- status: UNVERIFIED: no harness — xterm buffer read needs the orchestrator-only MCP tauri bridge; buildable: no. Orchestrator's saved reading supports it. -->
      — evidence: orchestrator bridge read `CTRL:xterm-256color|truecolor|en_US.UTF-8|en_US.UTF-8`
    - [x] attach geometry + status off — PASS
      — evidence: subagent t1.py client PTY 40x120 → d.conf/c.conf pane "40x120 status=off"; positive control `-f /dev/null` → "39x120 status=on"; orchestrator: xterm 62x141 = tmux 62x141
    - [x] 1.1 scrollback — PASS after in-place fix (first run FAIL/BLOCKING: no config chosen; see [SHORTCUT-2026-11-14]); fresh re-check: choice C + RGB + cancel-before-inject stated consistently in arch §I/§C.1/wbs, E marked open; one cosmetic stale WIP line then fixed
      — evidence: subagent t3.py c.conf history 1..400 in order, no dups; t2.py wheel → in_mode=1, typed input swallowed, lands after cancel; b/e burst sends 218/247 of 400 lines
    - [x] 1.2 bracketed paste — PASS
      — evidence: t2/t4.py ?2004h → `^[[200~line1`,`line2`,`line3^[[201~`; ?2004l → envelope stripped
    - [x] 1.3 TERM/colour/UTF-8 — PASS
      — evidence: t1.py d.conf client stream `38;2;255;100;0`, c.conf `38;5;202`; glyphs byte-identical; orchestrator xterm cell isFgRGB true ff6400 under d.conf
    - [x] 1.5a latency — PASS
      — evidence: re-run cold median 0.986 s / warm 0.254 s vs recorded 1.005 s / 0.257 s
    - [x] cleanup — PASS
      — evidence: `tmux -L claudesk ls` → "no server running"; ~/.claudesk-probe = b,c,d,e.conf only; /tmp/cdp-wp1.sock absent; ~/.claude + ~/.claude.json untouched (mtime Nov 13); side effect ~/.zsh_history appended (recorded in Discoveries)
    - [x] align: scrollback in action — CAPTURED
      — evidence: operator commands — E: `ssh -tt <user>@<mini-host> "zsh -lc 'exec tmux -L claudesk -f ~/.claudesk-probe/e.conf new -A -s cd-probe-op -c ~/.claudesk-probe'"`; C (+RGB): same with `d.conf`; `ssh <user>@<mini-host> 'zsh -lc "tmux -L claudesk kill-server"'` between configs and when done; in C leave copy-mode with q/Esc before typing; table in arch §I
    - [x] align: (decision) compromise vs swap session host — CAPTURED
      — evidence: alt+mouse-off ruled out (wheel types arrows); C complete history, swallows typing while scrolled, cancel-before-inject fixes injections, no turn markers; E native scrollback + markers, bursts lose lines (61/400 in xterm, ~220–250/400 sent); RGB needed in any config; latency 1.0 s cold / 0.25 s warm
  - [x] verify-human  <!-- status: done (operator, 2026-11-14) -->
    - [x] P1.verify-human.1 Scrollback in action (C + RGB vs E, own trackpad) — operator: ok  <!-- status: done -->
    - [x] P1.verify-human.2 (decision) Scrollback config for M17 — operator: **C** (+ RGB, mandatory cancel-before-inject); E retired  <!-- status: done -->
    - [x] P1.verify-human.3 (decision) `Any`-key copy-mode exit binding — operator: **no** (standard q/Esc)  <!-- status: done -->
  - [x] verify-codify  <!-- status: done -->
    Test scope: full — suite not long (`runtimes.md` → `pnpm verify:auto` Last 56s)
    — evidence: `pnpm verify:auto` → EXIT=0 in 97s; vitest "Test Files 299 passed (299) / Tests 3856 passed (3856)"; every cargo `test result: ok`, 0 failed (lib: 1104 passed)
    — codified: no product code exists to test (probe). The ratified decisions are written as WP3's inputs: arch §C.1 ("WP3's conf": `status off`, `mouse on`, `terminal-features ',xterm*:RGB'`, loaded with `-f`; mandatory `send-keys -X cancel` before every Claudesk injection; multi-line injections wait for CC ready), arch §I (scrollback table + ratified C, E retired, no `Any` binding), arch §C (LANG/LC_* cross ssh; arbitrary vars don't), `wbs.md` → "Probe outcomes" Phase-1 rows, backlog SURFACE-2026-11-14-REMOTE-MULTILINE-INJECT-BEFORE-CC-READY. WP3's tests pin the conf string and the cancel-before-inject once the spawn path exists.
    — No integration boundary — phase adds no code (probe documents only).

- [x] Phase 2: CC-dependent checks — real CC inside tmux on the mini
  **Relevance check (before Phase 2):**
  - Requester still needs this: yes — `/exit` ending tmux (R-1), paste-as-one-prompt and CC-ready latency are still unproven, and WP3 builds on them
  - Requirements unchanged: yes — one refinement: the scrollback check now targets the ratified config C, not E (verify-human 2026-11-14)
  - Solution still feasible: yes — once CC is logged in on the mini
  - No superior alternative discovered: yes
  **Verdict:** proceed when unblocked. 2026-11-14: `claude auth status` over ssh still reports `loggedIn: false`; the operator is logging in via screen sharing.
  **Observable outcomes:**
  - CLI (state-changing, mini: `~/.claudesk-probe/scratch`, `-L claudesk`): CC started in the tmux pane with the chosen Phase-1 options and the argv shape `build_cc_argv` produces (`--dangerously-skip-permissions`, `--model haiku` to keep turns cheap) reaches its input prompt; any first-run screen (folder trust, onboarding) is recorded verbatim as a WP5 input (remote `folder_trusted`).
  - CLI (1.1 on CC): CC is asked to print 1–200 one per line; under the ratified config C (`d.conf`) the turn's first lines are reachable via copy-mode (`#{pane_in_mode}`=1 after a wheel-up, `capture-pane -p -S -` contains line 1), and a skill-style injection sent while scrolled up lands after `send-keys -X cancel` (the WP3 mitigation, on real CC).
  - CLI (1.2 on CC): a three-line `stagedPayload.ts` payload + `\r` sent via `cc_input` produces **one** user turn whose text contains all three lines — verified from the remote transcript (`ssh <host> 'tail -n 50 ~/.claude/projects/<slug>/*.jsonl'`: exactly one new user message, containing `line1\nline2\nline3`), not from the screen.
  - CLI (1.3 on CC): CC's TUI cells that are coloured in a local pane are `isFgRGB()` (or palette, matching local) in the remote pane's buffer — compared against the same read from scratch-a's local CC pane (positive control).
  - CLI (1.4 `/exit`): `/exit` + `\r` via `cc_input` ends CC, and then `tmux -L claudesk has-session -t cd-probe-cc` exits non-zero and the outer `ssh` returns to the local zsh prompt in the pane. Separately, `/exit` + `\n` alone does **not** submit (autocomplete only, per `cc-tui-cr-not-lf`) — confirmed in the buffer before sending `\r`.
  - CLI (1.5b latency to CC-ready): warm master, remote command issued → CC input prompt glyph in the raw output, measured 3× by the host-side `script(1)` script; median recorded as the Metric 7 open-time budget input.
  - CLI (1.6 cleanup): `tmux -L claudesk ls` → no server; `~/.claudesk-probe` absent; the probe's `~/.claude/projects/-Users-<user>--claudesk-probe-scratch` dir absent; the `~/.claude.json` trust entry recorded as left.
  **Alignment questions:**
  - CC's TUI in action: side-by-side screenshot of the remote CC pane and scratch-a's local CC pane. Does the remote one look right to you (colours, glyphs, layout)?
  - Latency in action: the measured open-to-CC-prompt median. Is it acceptable as Metric 7's open-time budget?
  - [x] P2.1 CC on the mini under the chosen tmux config; record first-run screens  <!-- status: done -->
  - [x] P2.2 Scrollback on a real CC turn  <!-- status: done -->
  - [x] P2.3 Bracketed paste → one prompt (transcript-verified)  <!-- status: done -->
  - [x] P2.4 CC colour parity vs local pane  <!-- status: done -->
  - [x] P2.5 `/exit` ends the tmux session; `\n` vs `\r`  <!-- status: done -->
  - [x] P2.6 Latency to CC-ready, 3×  <!-- status: done -->
  - [x] P2.7 Final write-up: `arch/remote-workspaces.md` §C/§I/§E (R-1 mechanism confirmed or mitigated), `wbs.md` → "Probe outcomes" complete, Metric 7 budget noted; mini cleaned (1.6)  <!-- status: done -->
  - [x] verify-auto  <!-- status: done -->
    — evidence: `git status --porcelain -- src src-tauri package.json pnpm-lock.yaml | wc -l` → 0 (no code changed)
    — evidence: docs intact — arch 28301 bytes, 10 section headings (A–I + C.1), fences 2; wbs fences 2; WIP fences 4 (even)
    — evidence: mini — `tmux -L claudesk ls` → "no server running"; `~/.claudesk-probe` absent; `~/.claude/projects` empty; no remote `claude`; token `-rw------- 109` kept; local `/tmp/cdp-wp1.sock` absent
  - [x] verify-self  <!-- status: done -->
    - [x] P2 first open + prompt (argv)  <!-- status: UNVERIFIED: undrivable — the yolo argv stops at CC's Bypass Permissions warning, which is the operator's to accept on a shared account (declined). Default-mode argv reaches the prompt (re-run confirmed). -->
      — evidence: saved P2.1 (trust dialog → Bypass warning → "No, exit" → CC exited → tmux server gone); re-run default mode → "⏸ manual mode on · ? for shortcuts"; auth re-run with token → loggedIn true / oauth_token, without → false / none
    - [x] 1.1 scrollback on real CC (inline) — PASS (gap closed by verify-self on real CC)
      — evidence: vs2/drive*.log — history_size 175, line 1 present, 0 missing; 10× SGR wheel-up → in_mode 1; `/exit\r` while scrolled → swallowed (session + CC alive, no new user msg); `send-keys -X cancel` → injection "Reply with only the word LANDED" = exactly 1 user turn, reply LANDED. In fullscreen mode copy-mode does not apply (saved P2.2(A))
    - [x] 1.2 paste → one turn — PASS
      — evidence: saved transcript c6d6d1a0… 1 user msg (3 lines joined by \n) → "PASTED"; re-run 0f44b3f2… same shape, 1 user msg → "PASTED"
    - [x] 1.3 colour — PASS (colour-mode parity; screens not like-for-like)
      — evidence: remote capture-pane -e: TMUX unset → 38;2 ×10 / 38;5 ×0; TMUX kept → 38;2 ×0 / 38;5 ×10; local CC pty positive control → 38;2 present, 38;5 absent; orchestrator xterm cells d77757 / 888888 / 999999 RGB
    - [x] 1.4 /exit — PASS, with a doc overclaim corrected
      — evidence: `/exit\n` → session alive, input "❯ /exit"; `/exit\r` → has-session 1, no remote claude, client ssh exit 0. ⚠️ Corrected arch §C.1 + wbs: "R-1 needs no new close path" was false while scrolled up (inline) — the close path must cancel copy-mode first
    - [x] 1.5b latency — PASS
      — evidence: recorded 1.297 s cold / 0.547 s warm; re-run 1.265 s / 0.504 s (sentinel `shortcuts`, default-mode status line; yolo-mode timing not measured)
    - [x] 1.6 cleanup — PASS
      — evidence: "no server running"; `~/.claudesk-probe` absent; no `*claudesk-probe*` projects dirs; no remote claude; token `-rw------- 109` untouched; `/tmp/cdp-wp1.sock` absent
    - [x] align: CC's TUI in action — CAPTURED
      — evidence: scratchpad/wp1/p2.4-side-by-side.png — right: remote CC (orange logo, "Claude Code v2.1.325 / Haiku 5.5 · Claude API", "❯ Try …", "⏸ manual mode on"); left: scratch-a's local CC on its folder-trust dialog (not like-for-like); SGR: remote RGB 215;119;87 / 136;136;136 / 153;153;153, local RGB incl. 153;153;153
    - [x] align: latency as Metric 7 budget — CAPTURED
      — evidence: CC-ready 1.30 s cold / 0.55 s warm (re-run 1.27 / 0.50); tmux-ready alone 1.0 / 0.26
  - [x] verify-human  <!-- status: done (operator, 2026-11-14) -->
    - [x] P2.verify-human.1 CC's TUI on the remote (screenshot) — operator: layout clarified (remote workspace = remote CC in the LEFT pane, no CC on the right, no local CC; arch intro updated); the remote CC render itself: yes, looks right  <!-- status: done -->
    - [x] P2.verify-human.2 CC-ready latency as Metric 7's open-time budget — operator: accepted (~0.5 s warm / ~1.3 s cold)  <!-- status: done -->
    - [x] P2.verify-human.3 (decision) Remote CC TUI mode — operator: **(B) inline, "match what my local panes do"** (agent had recommended (A)); recorded in arch §I + wbs  <!-- status: done -->
    - [x] P2.verify-human.4 (needs you) Yolo on the remote — operator accepted the warning on the mini; verified: `skipDangerousModePermissionPrompt: true` in host `~/.claude/settings.json`, yolo start in a trusted folder → prompt directly, status "⏵⏵ bypass permissions on (shift+tab to cycle)"  <!-- status: done -->
  - [x] verify-codify  <!-- status: done -->
    Test scope: full — last phase
    — evidence: `pnpm verify:auto` → EXIT=0 in 47s; vitest "Test Files 299 passed (299) / Tests 3856 passed (3856)"; every cargo `test result: ok`, 0 failed (lib: 1104 passed)
    — codified: no product code exists to test (probe). Decisions written as WP2–WP5 inputs: arch §C.1 (remote CC auth via `setup-token` token exported remote-side; `unset TMUX` for truecolor; WP3's remote inner command; `/exit` swallowed in copy-mode → cancel before close; first-open dialogs + persisted yolo acceptance key WP4 must preserve; latency), arch §I (inline mode decided), arch intro (remote workspace = remote CC in the left pane, no local CC), §H preflight auth check; `wbs.md` "Probe outcomes" Phase 2 table; backlog SURFACE-…-REMOTE-CC-AUTH-KEYCHAIN-LOCKED-OVER-SSH (decided) and SURFACE-…-REMOTE-CLOSE-SWALLOWED-IN-COPY-MODE (high); design priors `a-session-behaves-the-same-wherever-it-runs` and `explicit-action-keeps-its-meaning-passive-event-preserves-work`. WP3's tests pin the inner command, the conf and cancel-before-inject/close once the spawn path exists.
    — No integration boundary — phase adds no code (probe documents only).

## Notes for the verify nodes (probe-shaped)

- **verify-auto:** no product code changes, so the gate is `git status` showing only docs
  (`arch/remote-workspaces.md`, `wbs.md`, this WIP) changed; `pnpm verify:auto` is **not** required
  unless a file under `src/` or `src-tauri/` changed (it must not).
- **verify-self:** re-read each recorded outcome against its raw evidence (buffer dumps, `tmux`
  exec output, timing logs saved in the scratchpad) — an outcome without a saved raw reading is not
  PASS.
- **verify-codify:** a probe has no product behaviour to pin. Codify = the decisions written into
  `arch/remote-workspaces.md` (the tmux option string WP3 must use, the scrollback ruling, the
  paste and `/exit` facts) and `wbs.md` → "Probe outcomes". WP3's tests pin the option string when
  the spawn path exists.

## Current Node
- **Path:** Feature > ship
- **Active scope:** ship (all phases complete)
- **Blocked:** none (Phase 2 unblocked 2026-11-14 by the operator's `setup-token` token)
- **Unvisited:** ship, finalize
- **Open discoveries:** SURFACE-2026-11-14-REMOTE-MULTILINE-INJECT-BEFORE-CC-READY (backlog; consumed by WP3/WP5 via arch §C.1)

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->
[SURFACED-2026-11-14] WP3 / WP5 — tmux strips the bracketed-paste envelope until the pane app enables `?2004h`; a multi-line injection sent before CC is up on a remote workspace splits into several submits. Confirm the `cc_ready` gate covers the remote pane. (backlog: SURFACE-2026-11-14-REMOTE-MULTILINE-INJECT-BEFORE-CC-READY)
[SURFACED-2026-11-14] WP3 — `tmux -L` does not isolate `~/.tmux.conf`; this tmux defaults `mouse on`. WP3 passes `-f <claudesk conf>` with `status off`, the RGB terminal feature, and the operator-ratified scrollback config (C: `mouse on`; probe `d.conf`), plus cancel-before-inject on every Claudesk injection. Already written into arch §C.1 (no backlog entry: the arch doc is WP3's input).
[SHORTCUT-2026-11-14] P1.3/P1.7 — verify-self (fresh subagent) failed outcome 1.1 as BLOCKING: P1.3 "pick one" was marked done while arch/wbs recorded only a lean to E, overriding the plan's pre-registered rule without saying so. In-place doc fix to the P1.7 write-up: arch §I/§C.1 and wbs now state the rule's pick (C + RGB + mandatory cancel-before-inject), with E as the open alternative Phase 2 re-measures and the operator decides. Two inaccuracies the subagent found were corrected in the same pass: COLORTERM is set by tmux itself (no truecolor evidence), and LANG/LC_* DO cross ssh via the default SendEnv (arch §C, research.md). Re-verified by a second fresh subagent (see verify-self).
[SURFACED-2026-11-14] Mini hygiene — the probe panes' interactive zsh appended the typed probe commands to the mini's `~/.zsh_history` (outside the declared fence; left untouched). WP3's real spawn runs `claude` as tmux's command under a non-interactive `zsh -lc`, so it writes no shell history; Phase 2's probe should run CC directly as the tmux command, not via a typed shell line. (No backlog entry: probe-only.)
[SURFACED-2026-11-14] product:arch (WP2/WP3) — ⚠️ **Remote CC auth: the macOS login Keychain is unreadable from ssh sessions.** After the operator ran `claude auth login` over `ssh -t`, `<user>`'s login Keychain holds a `Claude Code-credentials` item (`security find-generic-password` sees it), yet `claude auth status` reports `loggedIn: false` from a non-tty ssh exec, from `ssh -tt`, AND inside `tmux -L claudesk` — and `security show-keychain-info` answers "User interaction is not allowed" (locked for the ssh session). No `~/.claude/.credentials.json` fallback was written. So every Claudesk-spawned remote CC would start logged out. Needs an auth mechanism decision (arch §C/§H; WP2.5 preflight must check `loggedIn`). (backlog: SURFACE-2026-11-14-REMOTE-CC-AUTH-KEYCHAIN-LOCKED-OVER-SSH)
[SURFACED-2026-11-14] research fact correction — the mini's `~/.claude/settings.json` now EXISTS (`{"theme": "dark"}`, created by CC at the operator's login, 14:21). research.md's "does not exist; Claudesk's install creates the file" is stale; arch §D's merge-on-fetched-JSON already handles it.
[SURFACED-2026-11-14] WP3 — CC emits only 256 colours while `TMUX` is set (FORCE_COLOR / TERM / TERM_PROGRAM don't help); `unset TMUX` before `exec claude` gives RGB. Written into arch §C.1 as a WP3 spawn requirement. (No backlog entry: arch is WP3's input.)
[SURFACED-2026-11-14] WP3 / operator decision — a fresh host boots CC 2.1.325's fullscreen TUI (no `tui` key), unlike the operator's inline local CC; it decides where history lives. (A) fullscreen vs (B) inline via `CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN=1` measured in arch §I; decision taken at Phase 2 verify-human.
[SURFACED-2026-11-14] WP5 — first open on a fresh host shows CC's folder-trust dialog, then (yolo argv) the Bypass Permissions warning. The probe declined the warning (not the agent's to accept on a shared account). WP5's remote `folder_trusted` and first-open UX must account for both.
[SURFACED-2026-11-14] WP8 — CC auto-updated on the mini mid-probe (2.1.323 → 2.1.325). Remote CC versions drift independently of the main box; acceptance should record the remote version.
[SURFACED-2026-11-14] WP3 (correctness) — verify-self found that in inline mode `/exit\r` typed while tmux is in copy-mode is swallowed, so `kill()` would drop the ssh and leave the remote session running (R-1 violation). The remote close path must `send-keys -X cancel` before `/exit\r`. Arch §C.1 + wbs corrected (they had claimed R-1 needs no new close path). (backlog: SURFACE-2026-11-14-REMOTE-CLOSE-SWALLOWED-IN-COPY-MODE)
[SURFACED-2026-11-14] WP4 — the operator's yolo acceptance lives in the host's `~/.claude/settings.json` (`skipDangerousModePermissionPrompt: true`, beside `theme`). WP4's hook-install merge writes that file and must preserve both keys. Written into arch §C.1.
[INCIDENT-2026-11-14] P2.7 — the agent's edit script ended with `open(A,'w').write(open(A).read())`, which truncated the UNTRACKED `arch/remote-workspaces.md` to 0 bytes. Recovered by replaying the original Write + every recorded edit from the session transcripts in memory; validated against all 4 in-session Read captures (55 lines) and the re-check subagent's line citations — all matched. Restored file sha1 d9bee26f…; lesson saved as memory `open-w-truncates-before-read-wipes-untracked-file`.
[SURFACED-2026-11-14] Phase 2 — CC is not logged in on the mini (`claude auth status` → `loggedIn: false`). Blocks every CC-dependent check; the operator decides which account logs in on that shared host.

## Probe evidence

Raw readings, verbatim from the scratchpad log (instrument per line: xterm buffer via the React fiber, `tmux display`/`capture-pane` over a separate exec, or the host-side PTY timer).

```
control (pre-ssh): CTRL:xterm-256color|truecolor|en_US.UTF-8|en_US.UTF-8
P1.2: tmux display 62x141 status=off; client_termfeatures=bpaste,ccolour,clipboard,cstyle,focus,sync,title (no RGB); no ~/.tmux.conf on mini; default mouse=on, default-terminal=tmux-256color
P1.3 A (default: mouse on, altscreen): xterm active=alternate, normal buffer holds 0/400 of seq; wheel x5 -> tmux copy-mode [20/341]
P1.3 A' (mouse off, altscreen): wheel -> xterm sends arrow keys -> zsh history recall ("cd" appeared on prompt); history unreachable  => FAIL
P1.3 B (mouse off, smcup@:rmcup@): burst `seq 1 400`: active=normal, len 62, baseY 0, 61/400 present (340..400) -> burst lost; slow loop 1001..1150 @30ms: 150/150 ordered, 0 dups, baseY 90
P1.3 C (mouse on, altscreen, -f conf): tmux capture-pane history 400/400 (1..400); xterm alt buffer; wheel x40 -> in_mode=1 scroll_position=195/341, screen shows 145..206
P1.3 C trap: injected "echo INJECTED-WHILE-SCROLLED\r" while in copy-mode -> swallowed (emacs mode-keys moved 195->135), never reached shell
P1.3 C mitigation 1: `send-keys -X cancel` over master then inject -> lands (2 grep hits: cmd+output)
P1.3 C mitigation 2: `bind -T copy-mode Any "send -X cancel"` -> exits copy-mode but EATS first key ("echo" -> "cho")
P1.3 E (B + RGB): slow 2001..2150 in normal buffer len 152 baseY 90; wheel x10 -> viewportY 90->50, no keys reached remote, in_mode=0
P1.4 ?2004h on in pane app: cat -v shows ^[[200~line1 / line2 / line3^[[201~ (envelope forwarded intact; payload from stagedPayload.ts = ESC[200~line1\rline2\rline3ESC[201~)
P1.4 ?2004l in pane app: cat -v shows line1/line2/line3 with no envelope (tmux strips it)
P1.5 inside tmux: IN:tmux-256color|truecolor|en_US.UTF-8|en_US.UTF-8; glyphs 23fa 273b 23bf 2500 2502 276f byte-exact; RGB(255,100,0) -> palette 0xca (202) WITHOUT RGB feature; WITH `terminal-features ,xterm*:RGB` -> isFgRGB true fg ff6400, client_termfeatures includes RGB
P1.6 latency (host-side pty, sentinel in tmux inner cmd): cold median 1.005s (1.023,1.005,0.995); warm-master median 0.257s (0.257,0.229,0.259)
verify-self subagent (2026-11-14, host-side PTY stand-in): COLORTERM=truecolor present inside `tmux -f /dev/null` with no client COLORTERM -> set by tmux itself; `ssh -G` -> sendenv LANG / sendenv LC_*; local LANG=C -> remote shows C (LANG crosses via SendEnv)
verify-self subagent: burst under b.conf/e.conf -> client stream scrolled with CSI 38S/… + redraw, distinct lines sent 218 / 247 of 400; latency re-run cold 0.986s / warm 0.254s
side fact: tmux kill-server -> "[server exited]" then outer ssh closed and local zsh prompt returned (session end ends the ssh)
```

### Phase 2 raw readings

```
auth-1: after `claude auth login` over ssh -t: Keychain item svce "Claude Code-credentials" acct <user> present; `claude auth status` loggedIn:false from plain ssh exec, from ssh -tt, and inside tmux -L claudesk; `security show-keychain-info` -> "User interaction is not allowed"; no ~/.claude/.credentials.json
auth-2 (operator chose setup-token): ~/.claudesk/cc-oauth-token -rw------- 109 bytes 1 line; with it exported: ssh -tt -> loggedIn:true authMethod:oauth_token, `claude -p` -> TOKEN-OK; inside tmux -> TMUX-OK
P2.1 first open (bypassPermissions argv): screen 1 folder-trust ("Accessing workspace: ~/.claudesk-probe/scratch ... ❯ No, exit / Yes, I trust this folder"); screen 2 "WARNING: Claude Code running in Bypass Permissions mode ... ❯ No, exit / Yes, I accept" -> agent chose No, exit (not accepted on operator's behalf) -> CC exited -> tmux "[exited]" -> server gone -> ssh closed; relaunch with --permission-mode default reached prompt "❯ Try ..." / "⏸ manual mode on"; banner "Haiku 5.5 · Claude API"
P2.4 colour: env of remote claude: COLORTERM=truecolor TERM=tmux-256color TERM_PROGRAM=tmux TMUX=...; tmux client_termfeatures incl RGB; CC emitted 38;5 (246,174,244,153) — baseline, FORCE_COLOR=3, -u TERM_PROGRAM, TERM=xterm-256color all 38;5; `env -u TMUX` -> 38;2 (153;153;153 / 215;119;87 / 136;136;136); xterm cells after launcher `unset TMUX`: logo rgb d77757, rule rgb 888888, hint rgb 999999 (was palette 0xae/0xf4 before)
P2.4 note: local CC pane comparison was NOT like-for-like (local pane sat on scratch-a's trust dialog); screenshot scratchpad/wp1/p2.4-side-by-side.png
P2.2 fullscreen discovery: mini ~/.claude/settings.json has no "tui" key -> CC 2.1.325 boots fullscreen TUI (~/.claude.json fullscreenBootPending); local ~/.claude/settings.json "tui":"default" (inline); mini outside tmux emits ?1049h; pane alternate_on=1 under every env variant (base, TERM=xterm-256color, -u TERM_PROGRAM, TMUX set)
P2.2 (A) fullscreen: 200-line turn -> tmux history_size=0, only 146..200 on screen; wheel x40 in pane -> mouse_any=1, in_mode=0 (tmux passed wheel to CC), CC view scrolled to top showing "❯ Print the integers..." / "⏺ 1" / "2"
P2.2 (B) inline via CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN=1: alternate_on=0; 200-line turn -> history_size=175, numeric lines 1..200, missing 0
P2.3 paste: stagedPayload submit:true bytes "ESC[200~Reply with only the word PASTED.\rsecond line of the paste\rthird line of the pasteESC[201~\r" via cc_input -> transcript c6d6d1a0…jsonl: user messages 1: 'Reply with only the word PASTED.\nsecond line of the paste\nthird line of the paste'; assistant 'PASTED'
P2.5 /exit: "/exit\n" -> not submitted (session alive, input shows /exit, "ctrl+g to edit in Vim"); cleared with ^U^U; "/exit\r" -> has-session exit 1, "no server running", no remote claude process, pane: "[exited]" / "Connection ... closed." / local prompt
P2.6 latency to CC-ready (sentinel "shortcuts" in status line; host-side pty; d.conf; trusted scratch): cold median 1.297s (1.225,1.297,1.341); warm median 0.547s (0.471,0.601,0.547). First attempt with sentinel "manual mode on" timed out: words are SGR-separated in the raw stream (instrument error, not CC)
cleanup: ~/.claudesk-probe removed; ~/.claude/projects probe dirs removed; tmux -L claudesk no server; no remote claude; /tmp/cdp-wp1.sock absent. LEFT by design: ~/.claudesk/cc-oauth-token (operator's, production), ~/.claude.json trust entry for the scratch path + fullscreenBootPending, ~/.claude/settings.json {"theme":"dark"} (CC's own), ~/.zsh_history lines from Phase 1
```
