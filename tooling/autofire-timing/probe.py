#!/usr/bin/env python3
"""M12 WP3 Phase 1 — the injection-timing probe.

═══════════════════════════════════════════════════════════════════════════════
THE QUESTION

M12's auto-resume must inject a slash command into a *freshly spawned* CC session.
The WP3 draft spec assumed it could fire at `cc_ready` because "a terminal buffers
stdin by design." Reconciliation found that premise false twice over:

  1. `cc_ready` is CLAUDESK'S OWN frontend-listener handshake. It fires immediately
     after `invoke(cc_spawn)` resolves (`XtermPane.tsx:429`) and flushes Claudesk's
     buffered OUTPUT (`cc_session/commands.rs:112`). It reports that the frontend is
     ready to RECEIVE — never that CC is ready to ACCEPT.

  2. CC is a raw-mode TUI, not a line-buffered shell. It reads keystroke events; the
     "early bytes sit in the tty buffer until the reader wakes up" intuition does not
     transfer from a shell (see `[[raw-mode-cr-is-enter]]`).

So: at what moment does a command written into a fresh CC PTY actually EXECUTE?

═══════════════════════════════════════════════════════════════════════════════
⚠️ THE PREDICATE — DEFINED BEFORE ANY RUN (task P1.2)

This is written down first on purpose. Deciding "did it execute?" *after* seeing the
output is how a probe rationalizes whatever it found. The repo has a standing lesson
for this: `[[observable-outcomes-execution-evidence]]` — an echoed command proves
TYPING, never EXECUTION.

The failure mode being guarded against is specific and likely: CC's TUI echoes typed
characters into its input box. So a buffer containing the text "/session-restore" is
COMPLETELY CONSISTENT with the command never running — the bytes landed in the input
box and are still sitting there, unsubmitted or ignored.

Therefore we do NOT probe with `/session-restore`. We probe with a command whose
execution produces output that its own echo cannot possibly contain:

    /status

`/status` is a CC built-in that prints a multi-line report (version, model, account,
working directory...). Its ECHO is the 7 characters "/status". Its EXECUTION emits
hundreds of bytes of report text that share no substring with the echo.

  EXECUTED      := the post-send buffer contains report-body markers that appear
                   ONLY in /status's output (e.g. a "Model" or "Account"/"Version"
                   label), i.e. text that the echo of "/status" cannot produce.
  NOT-EXECUTED  := no such marker, regardless of whether "/status" itself is visible.
                   ⚠️ Seeing "/status" in the buffer is NOT a pass. That is the
                   precise confusion this predicate exists to prevent.

A third outcome is real and must be reported honestly rather than forced into the
binary: INDETERMINATE — CC never reached an interactive state at all within the
window (e.g. it printed a trust prompt, an auth error, or nothing). A probe that
reports NOT-EXECUTED when CC simply never booted would send WP3 chasing a timing fix
for a setup problem.

═══════════════════════════════════════════════════════════════════════════════
WHY A PYTHON PTY AND NOT THE REAL APP

The measurement needs the *conditions* Claudesk creates, not Claudesk itself:
a real PTY, CC spawned with the same argv + env, and a write issued at a controlled
delay after spawn. `pty.fork()` reproduces all three, is scriptable, repeatable, and
— critically — needs no running app, so it cannot touch the operator's live session.

The spawn is mirrored from `cc_session/mod.rs`:
  argv: claude --permission-mode <mode> [--model <m>]   (build_cc_argv)
  env:  TERM=xterm-256color COLORTERM=truecolor
        LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8              (color_tty_env)

⚠️ SAFETY. This script spawns and reaps ONLY its own child, by the PID `pty.fork()`
returned to it. It never scans the process table, never matches by name, never kills
by port. On 2026-07-13 a blanket name/port kill during a verify-self run killed the
operator's live application; the dev and prod builds share the process name
`claudesk`. Nothing here can repeat that: there is exactly one PID and we own it.

It also runs `claude` in a THROWAWAY scratch repo (`tmp/scratch/scratch-a`), never a
real project, per the standing scratch-workspace convention.
"""

from __future__ import annotations

import argparse
import errno
import os
import pty
import re
import select
import signal
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path

# ── The spawn, mirrored from cc_session/mod.rs ────────────────────────────────
CC_CMD = "claude"
CC_ARG_PERMISSION_MODE = "--permission-mode"
DEFAULT_MODE = "bypassPermissions"  # yolo, Claudesk's default

COLOR_TTY_ENV = {
    "TERM": "xterm-256color",
    "COLORTERM": "truecolor",
    "LANG": "en_US.UTF-8",
    "LC_ALL": "en_US.UTF-8",
}

# ── The probe command + its predicate (see module docstring) ──────────────────
PROBE_COMMAND = "/status"

# ⚠️ REVISED AFTER THE CALIBRATION RUN (2026-08-04) — the first predicate FALSE-PASSED.
#
# What happened: the original markers were content words ("model", "account",
# "version", "session"). The calibration run reported EXECUTED 1/1, and auditing the
# capture showed the command had NOT executed at all — `/status` sat unsubmitted in the
# input box while CC displayed its slash-command AUTOCOMPLETE DROPDOWN, whose
# description text reads:
#
#     /status   Show Claude Code status including version,
#               model, account, API connectivity, and tool…
#
# Every one of those markers appears in that *description*. So the predicate matched
# CC's menu describing the command rather than the command's output.
#
# The lesson generalizes past this probe: it is not enough that a marker be absent from
# the command's own ECHO — it must also be absent from any UI CC paints *about* the
# command. The original reasoning ("/status's echo is 7 chars, its report is hundreds of
# bytes") was true and still insufficient, because a third surface existed that the
# reasoning did not enumerate. Cf. `[[guard-predicate-completeness-vs-mutation-landing]]`
# — a passing check whose predicate is incomplete is under-determined, not evidence.
#
# The fix is a STRUCTURAL marker instead of a content one: `/status`'s report is rendered
# as a bordered panel containing labelled rows with a colon, e.g. "Version: 2.1.221" /
# "Model: …" / "Account: …". A dropdown description is prose and contains no such
# "Label:" row for these fields. So we require the label-with-colon form, and we
# additionally REFUSE the match when the autocomplete-dropdown signature is present.
EXECUTION_MARKERS = (
    r"version\s*:",
    r"model\s*:",
    r"account\s*:",
    r"memory\s*:",
    r"session\s*id\s*:",
)

# If ANY of these is present in the post-send output, CC is showing its slash-command
# picker — the command was typed but NOT submitted. This is a hard veto: it flips a
# marker match to NOT-EXECUTED rather than merely failing to add evidence, because the
# dropdown's prose is exactly what produced the original false pass.
AUTOCOMPLETE_VETO = (
    r"/statusline",   # a sibling command only the picker would list
    r"/release-notes",
    r"/usage\s",
)

# Evidence that CC reached an interactive state at all. Without one of these, a
# "no marker" result is INDETERMINATE (CC never booted) rather than NOT-EXECUTED
# (CC booted and dropped our bytes) — a distinction WP3 must not have blurred.
INTERACTIVE_MARKERS = (
    "welcome to claude code",
    "? for shortcuts",
    "bypass permissions",
    "cwd:",
    "/help",
    ">",
)


def strip_ansi(s: str) -> str:
    """Drop CSI/OSC escape sequences so marker matching sees plain text.

    A TUI paints with cursor moves and colour codes; leaving them in makes
    substring matching unreliable (a marker can be split by a reposition).
    """
    s = re.sub(r"\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)", "", s)  # OSC
    s = re.sub(r"\x1b[\[\(][0-9;?]*[ -/]*[@-~]", "", s)  # CSI / charset
    s = re.sub(r"\x1b.", "", s)  # stragglers
    return s


@dataclass
class RunResult:
    """One cold-spawn measurement."""

    index: int
    delay_ms: int
    verdict: str  # EXECUTED | NOT-EXECUTED | INDETERMINATE
    reached_interactive: bool
    matched_markers: list[str] = field(default_factory=list)
    echo_seen: bool = False
    bytes_before_send: int = 0
    bytes_after_send: int = 0
    capture_path: Path | None = None
    note: str = ""


def judge(*, pre_text: str, post_text: str, index: int, delay_ms: int) -> RunResult:
    """THE PREDICATE, as a pure function over captured text.

    Extracted deliberately (not inlined in the run loop) for two reasons:

    1. **It is the part that was wrong.** The first version of this predicate reported
       EXECUTED on a run where the command never executed. A predicate that can be
       wrong is code, and code needs to be re-runnable against the evidence that broke
       it — that is what `--arm selftest` does. Cf. the standing repo method
       `[[extract-for-import-when-a-raw-guard-cant-express-the-property]]`: extract the
       decision so a test can drive the real thing.
    2. It keeps the judging rules in one readable place rather than interleaved with
       PTY plumbing.

    Verdicts:
      EXECUTED      — a structural "Label:" row from /status's report is present
      NOT-EXECUTED  — CC was interactive but produced no report (incl. the veto case:
                      the slash-command picker is on screen, so the command was typed
                      but never submitted)
      INDETERMINATE — CC never reached an interactive state; a SETUP problem, and NOT
                      an answer about injection timing
    """
    combined = pre_text + post_text

    # ⚠️ The markers embed `\s*` at every internal boundary, and `\s` matches NEWLINES as
    # well as spaces — so a single plain-text search already spans every way the TUI panel
    # can break a label: `Version: 2.1.221`, `Version:2.1.221` (box-drawing stripped, so
    # words run together), and a wrap putting a newline between the label and its colon.
    #
    # A second whitespace-stripped comparison was written here first, on the assumption
    # that column-collapsed output needed it. **Mutation testing proved it dead** (three
    # attempts, 2026-08-04): disabling it left the suite green against the verbatim panel
    # capture AND against a wrap-split label, because `\s*` had already covered both. The
    # only inputs it uniquely matched were mid-word splits (`ver sion:`), which a
    # column-wrap does not produce.
    #
    # It was deleted rather than kept-and-justified-by-a-contrived-fixture. Standing
    # lesson, which this very branch violated: an observation is only decisive when a
    # broken implementation would give a DIFFERENT answer — ask what the code does
    # *unaided* before asserting a branch is load-bearing.
    def hit(pattern: str) -> bool:
        return bool(re.search(pattern, post_text))

    vetoed = [v for v in AUTOCOMPLETE_VETO if hit(v)]
    matched = [m for m in EXECUTION_MARKERS if hit(m)]
    reached_interactive = any(m in combined for m in INTERACTIVE_MARKERS)
    echo_seen = PROBE_COMMAND.lower() in post_text
    note = ""

    if vetoed:
        # The slash-command picker is on screen: the command was TYPED, not SUBMITTED.
        # A hard veto rather than a missing-evidence case — the picker's own description
        # prose is precisely what produced this probe's first false pass, so a marker
        # hit alongside the picker must not be believed.
        verdict = "NOT-EXECUTED"
        note = f"autocomplete picker visible ({','.join(vetoed)}) — typed, not submitted"
        matched = []
    elif matched:
        verdict = "EXECUTED"
    elif not reached_interactive:
        verdict = "INDETERMINATE"
        note = "CC never reached an interactive state"
    else:
        verdict = "NOT-EXECUTED"

    return RunResult(
        index=index,
        delay_ms=delay_ms,
        verdict=verdict,
        reached_interactive=reached_interactive,
        matched_markers=matched,
        echo_seen=echo_seen,
        note=note,
    )


def spawn_cc(project_dir: Path, mode: str) -> tuple[int, int]:
    """Fork a PTY running `claude` in `project_dir`. Returns (pid, master_fd).

    Mirrors Claudesk's spawn: same argv shape, same env additions, cwd = project.
    """
    argv = [CC_CMD, CC_ARG_PERMISSION_MODE, mode]
    pid, master_fd = pty.fork()
    if pid == 0:  # ── child ──
        try:
            os.chdir(project_dir)
            env = dict(os.environ)
            env.update(COLOR_TTY_ENV)
            os.execvpe(CC_CMD, argv, env)
        except Exception:  # pragma: no cover - child cannot report normally
            os._exit(127)
    return pid, master_fd


def drain(master_fd: int, seconds: float) -> bytes:
    """Read whatever the PTY emits for `seconds`. Non-blocking, EOF-tolerant."""
    out = bytearray()
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        remaining = deadline - time.monotonic()
        try:
            ready, _, _ = select.select([master_fd], [], [], min(0.1, remaining))
        except (OSError, ValueError):
            break
        if not ready:
            continue
        try:
            chunk = os.read(master_fd, 65536)
        except OSError as e:
            if e.errno in (errno.EIO, errno.EBADF):  # child exited; EOF on master
                break
            raise
        if not chunk:
            break
        out.extend(chunk)
    return bytes(out)


def reap(pid: int, master_fd: int) -> None:
    """Terminate and reap OUR child only. PID-scoped — see the safety note above."""
    for sig in (signal.SIGTERM, signal.SIGKILL):
        try:
            os.kill(pid, sig)
        except ProcessLookupError:
            break
        for _ in range(30):  # up to ~1.5s per signal
            try:
                done, _ = os.waitpid(pid, os.WNOHANG)
            except ChildProcessError:
                done = pid
            if done:
                break
            time.sleep(0.05)
        else:
            continue
        break
    try:
        os.close(master_fd)
    except OSError:
        pass


def slash_command_bytes(command: str) -> bytes:
    """Byte-for-byte port of `cc_session::slash_command_bytes` (mod.rs:251).

    Strips any trailing CR/LF the caller supplied, then appends exactly one CR.
    ⚠️ CR (0x0d), never LF: in raw mode CR is Enter, while `\\n` only triggers
    autocomplete typeahead (`[[cc-tui-cr-not-lf]]`, `[[raw-mode-cr-is-enter]]`).
    The production fire path will call the Rust function; this mirrors it so the
    probe measures the same bytes rather than an approximation.
    """
    return command.rstrip("\r\n").encode() + b"\r"


def run_once(
    *,
    index: int,
    project_dir: Path,
    mode: str,
    delay_ms: int,
    settle_s: float,
    capture_dir: Path | None,
) -> RunResult:
    """One cold spawn: spawn → wait `delay_ms` → send → settle → judge."""
    pid, master_fd = spawn_cc(project_dir, mode)
    try:
        # The pre-send window. delay_ms=0 models firing at `cc_ready`: the spawn
        # invoke has resolved, so from Claudesk's perspective this is the earliest
        # moment a fire could happen.
        pre = drain(master_fd, delay_ms / 1000.0) if delay_ms > 0 else b""

        payload = slash_command_bytes(PROBE_COMMAND)
        try:
            os.write(master_fd, payload)
        except OSError as e:
            return RunResult(
                index=index,
                delay_ms=delay_ms,
                verdict="INDETERMINATE",
                reached_interactive=False,
                bytes_before_send=len(pre),
                note=f"write to PTY failed: {e}",
            )

        post = drain(master_fd, settle_s)
    finally:
        reap(pid, master_fd)

    pre_text = strip_ansi(pre.decode("utf-8", "replace")).lower()
    post_text = strip_ansi(post.decode("utf-8", "replace")).lower()

    result = judge(pre_text=pre_text, post_text=post_text,
                   index=index, delay_ms=delay_ms)
    result.bytes_before_send = len(pre)
    result.bytes_after_send = len(post)

    capture_path = None
    if capture_dir is not None:
        capture_dir.mkdir(parents=True, exist_ok=True)
        capture_path = capture_dir / f"run-{index:02d}-delay{delay_ms}ms.log"
        capture_path.write_bytes(
            b"=== PRE-SEND ===\n" + pre + b"\n=== POST-SEND ===\n" + post
        )
    result.capture_path = capture_path
    return result


def print_table(results: list[RunResult]) -> None:
    print()
    print(f"  {'run':>3}  {'delay':>7}  {'verdict':<14}  {'interactive':<11}  "
          f"{'echo':<5}  {'bytes(pre/post)':>16}  markers")
    print(f"  {'-'*3}  {'-'*7}  {'-'*14}  {'-'*11}  {'-'*5}  {'-'*16}  {'-'*20}")
    for r in results:
        print(
            f"  {r.index:>3}  {r.delay_ms:>5}ms  {r.verdict:<14}  "
            f"{'yes' if r.reached_interactive else 'NO':<11}  "
            f"{'yes' if r.echo_seen else 'no':<5}  "
            f"{r.bytes_before_send:>7}/{r.bytes_after_send:<8}  "
            f"{','.join(r.matched_markers) or '-'}"
        )
    print()


COLD_SPAWN_FLOOR = 5


def verdict_line(results: list[RunResult], delay_ms: int) -> str:
    """The one line WP3 Phase 4 consumes. Flakiness is reported, never rounded up.

    ⚠️ The sample-size guard below is not decoration. Found at verify-self (2026-08-04):
    with `--runs 1` this function printed *"EXECUTED 1/1 … reliable across cold spawns"*
    — a reliability claim from a single sample, inside the very line the summary block
    labels "what WP3 Phase 4 consumes". The `--runs` parser already warned that <5 is
    not a cold-start claim, and then the verdict line contradicted the warning. An
    advisory warning upstream is worthless if the machine-readable output downstream
    still overclaims; the guard has to live where the claim is *made*.
    """
    n = len(results)
    executed = sum(r.verdict == "EXECUTED" for r in results)
    indet = sum(r.verdict == "INDETERMINATE" for r in results)

    # Below the floor, no run count can support a *reliability* claim — so refuse to
    # phrase one, whatever the outcome was. Report the observation, not a conclusion.
    if n < COLD_SPAWN_FLOOR and executed == n and indet == 0:
        return (
            f"INSUFFICIENT-SAMPLE {executed}/{n} EXECUTED at delay={delay_ms}ms — "
            f"below the {COLD_SPAWN_FLOOR}-cold-spawn floor, so this is an OBSERVATION, "
            f"NOT a reliability claim. Re-run with --runs {COLD_SPAWN_FLOOR} or more "
            f"before any phase builds on it."
        )

    if indet == n:
        return (
            f"INDETERMINATE {n}/{n} at delay={delay_ms}ms — CC never reached an "
            f"interactive state. This is a SETUP problem, not a timing answer. "
            f"Do NOT conclude anything about injection timing from this run."
        )
    if executed == n:
        return (
            f"EXECUTED {n}/{n} at delay={delay_ms}ms — firing at this point is "
            f"reliable across cold spawns."
        )
    if executed == 0:
        return (
            f"NOT-EXECUTED {n}/{n} at delay={delay_ms}ms — CC booted but the command "
            f"did not run. Bytes sent this early are dropped; escalate to a measured "
            f"delay or the hook-channel signal."
        )
    return (
        f"⚠️ FLAKY {executed}/{n} EXECUTED at delay={delay_ms}ms — this is NOT a pass. "
        f"A partially-reliable fire is the worst outcome (works warm, fails cold). "
        f"Treat as NOT-EXECUTED and measure a safe delay."
    )


def main() -> int:
    repo = Path(__file__).resolve().parents[2]
    ap = argparse.ArgumentParser(
        prog="probe.py",
        description="Measure when a slash command injected into a fresh CC PTY "
                    "actually EXECUTES (not merely echoes).",
        epilog="Arms: --arm cc-ready (delay 0, models firing at cc_ready) | "
               "--arm delay-sweep (find the earliest reliable delay) | "
               "--arm hook-probe (does a fresh session emit a hook event unprompted?)",
    )
    ap.add_argument(
        "--arm",
        choices=("cc-ready", "delay-sweep", "hook-probe", "selftest"),
        default="cc-ready",
        help="which measurement to run (default: cc-ready)",
    )
    ap.add_argument("--runs", type=int, default=5,
                    help="cold spawns per delay (default 5; <5 is rejected as "
                         "insufficient for a cold-start claim)")
    ap.add_argument("--delay-ms", type=int, default=0,
                    help="ms to wait after spawn before sending (cc-ready arm)")
    ap.add_argument("--settle", type=float, default=6.0,
                    help="seconds to read output after sending (default 6)")
    ap.add_argument("--project", default=str(repo / "tmp/scratch/scratch-a"),
                    help="project dir to spawn CC in (default: tmp/scratch/scratch-a)")
    ap.add_argument("--mode", default=DEFAULT_MODE,
                    help=f"--permission-mode value (default {DEFAULT_MODE})")
    ap.add_argument("--capture-dir", default=str(repo / "tmp/autofire-timing"),
                    help="where to write raw PTY captures (gitignored tmp/)")
    ap.add_argument("--no-capture", action="store_true",
                    help="skip writing raw capture files")
    ap.add_argument("--selftest-capture", default=None,
                    help="selftest arm: path to a saved capture to re-judge through "
                         "the CURRENT predicate (regression-tests the predicate itself)")
    args = ap.parse_args()

    project_dir = Path(args.project).resolve()
    if not project_dir.is_dir():
        print(f"error: project dir not found: {project_dir}", file=sys.stderr)
        return 2
    # Refuse to spawn CC anywhere but a scratch repo unless forced by an explicit
    # --project outside it. This is the scratch-workspace convention, made mechanical.
    if "tmp/scratch/" not in str(project_dir):
        print(f"warning: {project_dir} is not a tmp/scratch/* repo — a real CC session "
              f"will start there", file=sys.stderr)

    capture_dir = None if args.no_capture else Path(args.capture_dir)

    print(f"── M12 WP3 Phase 1: injection-timing probe ──")
    print(f"   arm       : {args.arm}")
    print(f"   project   : {project_dir}")
    print(f"   command   : {PROBE_COMMAND}  (bytes: {slash_command_bytes(PROBE_COMMAND)!r})")
    print(f"   predicate : EXECUTED iff post-send output contains a /status REPORT "
          f"marker {EXECUTION_MARKERS}")
    print(f"               ⚠️ an echoed '{PROBE_COMMAND}' is NOT a pass")

    if args.arm == "selftest":
        # Replay a saved capture through the CURRENT predicate. This exists because the
        # first predicate FALSE-PASSED a real run (see EXECUTION_MARKERS' comment): the
        # only way to trust a revised predicate is to re-judge the evidence that broke
        # the old one and confirm the verdict flips. A predicate is code, and this is its
        # regression test.
        target = Path(args.selftest_capture) if args.selftest_capture else None
        if target is None or not target.is_file():
            print(f"error: --selftest-capture must name a saved capture file",
                  file=sys.stderr)
            return 2
        raw = target.read_bytes().decode("utf-8", "replace")
        post = raw.split("=== POST-SEND ===", 1)[-1]
        pre = raw.split("=== POST-SEND ===", 1)[0]
        r = judge(pre_text=strip_ansi(pre).lower(),
                  post_text=strip_ansi(post).lower(),
                  index=0, delay_ms=-1)
        print(f"\n   capture : {target}")
        print(f"   verdict : {r.verdict}")
        print(f"   vetoed  : {r.note or '-'}")
        print(f"   markers : {','.join(r.matched_markers) or '-'}")
        print(f"   echo    : {'yes' if r.echo_seen else 'no'}")
        return 0

    if args.arm == "hook-probe":
        print("\nThe hook-probe arm is not implemented as an automated measurement.")
        print("Rationale: it asks whether a FRESH CC session emits any hook event")
        print("unprompted, which is observable only through Claudesk's own hook socket")
        print("(a running app), not from this standalone PTY. Run it as a live check")
        print("if and only if the cc-ready and delay-sweep arms both fail.")
        return 0

    delays = [args.delay_ms] if args.arm == "cc-ready" else [0, 250, 500, 1000, 2000, 4000]

    if args.runs < 5:
        print(f"\n⚠️ --runs={args.runs} is below the 5-cold-spawn floor. A single warm "
              f"sample is explicitly rejected by the plan; proceeding, but the result "
              f"is NOT a cold-start claim.", file=sys.stderr)

    overall: list[tuple[int, list[RunResult]]] = []
    for delay in delays:
        print(f"\n   ── delay={delay}ms, {args.runs} cold spawns ──")
        results: list[RunResult] = []
        for i in range(1, args.runs + 1):
            r = run_once(
                index=i,
                project_dir=project_dir,
                mode=args.mode,
                delay_ms=delay,
                settle_s=args.settle,
                capture_dir=capture_dir,
            )
            results.append(r)
            print(f"      run {i}: {r.verdict}"
                  f"{' (' + ','.join(r.matched_markers) + ')' if r.matched_markers else ''}"
                  f"{'  [never interactive]' if not r.reached_interactive else ''}")
        print_table(results)
        line = verdict_line(results, delay)
        print(f"   VERDICT: {line}")
        overall.append((delay, results))
        # In a sweep, stop at the first delay that is reliably EXECUTED.
        if args.arm == "delay-sweep" and all(r.verdict == "EXECUTED" for r in results):
            print(f"\n   → earliest reliable delay found: {delay}ms")
            break

    print("\n" + "=" * 74)
    print("SUMMARY (this is what WP3 Phase 4 consumes)")
    print("=" * 74)
    for delay, results in overall:
        print(f"  {verdict_line(results, delay)}")
    if capture_dir is not None:
        print(f"\n  raw captures: {capture_dir}")

    # Exit 0 only for a delay that is BOTH all-EXECUTED and at/above the cold-spawn
    # floor. ⚠️ The floor is part of the exit condition, not just the printed text: a
    # caller (CI, a script, a later phase) that checks `$?` must not read "one warm
    # sample passed" as success when the verdict line itself refuses to claim it.
    # Same defect class as the printed overclaim fixed in `verdict_line` — two outputs
    # of one function must not disagree.
    any_reliable = any(
        len(res) >= COLD_SPAWN_FLOOR and all(r.verdict == "EXECUTED" for r in res)
        for _, res in overall
    )
    return 0 if any_reliable else 1


if __name__ == "__main__":
    sys.exit(main())
