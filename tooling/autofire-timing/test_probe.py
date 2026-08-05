#!/usr/bin/env python3
"""Regression tests for the injection-timing probe's PREDICATE and its verdict wording.

    python3 tooling/autofire-timing/test_probe.py          # or: -m unittest discover

═══════════════════════════════════════════════════════════════════════════════
WHAT IS CODIFIED HERE, AND WHAT IS DELIBERATELY NOT

M12 WP3 Phase 1 was a measurement spike. Its *finding* — inject at ~1500 ms, and use
spawn argv `--continue` for the unclean-flag arm — is recorded in the WIP verdict, not
here. **A test cannot re-establish that finding**: doing so would spawn real Claude Code
sessions (~10 s each, network-dependent, and dependent on a `claude` binary being
installed and authenticated). A test suite that shells out to a live LLM CLI is not a
regression test; it is the probe, run again.

What CAN silently regress is the **predicate** — the code that decides whether a command
EXECUTED. That is what these tests pin, for a specific reason:

  ⚠️ THE PREDICATE FALSE-PASSED ONCE, ON REAL EVIDENCE.

Its first version matched content words ("model", "account", "version"). It reported
EXECUTED on a run where the command never executed — because Claude Code's slash-command
AUTOCOMPLETE DROPDOWN *describes* `/status` as *"Show Claude Code status including
version, model, account, API connectivity, and tool…"*. Every marker appeared in the menu
describing the command rather than in the command's output.

The original reasoning — *"`/status`'s echo is 7 characters, its report is hundreds of
bytes, so they cannot be confused"* — was **true and still insufficient**, because a
THIRD surface existed that the reasoning never enumerated: not the echo, not the report,
but the UI Claude Code paints *about* the command. Cf. the standing repo lesson
`[[guard-predicate-completeness-vs-mutation-landing]]` — a passing check whose predicate
is incomplete is under-determined, not evidence.

So `test_the_description_prose_alone_is_rejected_by_the_MARKERS` below is the regression
test for a real defect, not a hypothetical one. Its input is the actual dropdown text
captured from the live run that produced the false pass — with the picker's sibling-command
names removed, so that the MARKERS (not the veto) are what must reject it. See the fixture
comment for why that isolation is mandatory.

Second thing codified: the **cold-spawn floor**. `verdict_line()` printed *"EXECUTED 1/1
… reliable across cold spawns"* on a single sample, inside the block headed *"SUMMARY
(this is what WP3 Phase 4 consumes)"* — while the `--runs` parser had already warned that
<5 runs is not a cold-start claim. The probe contradicted its own warning. An advisory
warning upstream is worthless if the machine-readable output downstream still overclaims.

A third thing this file records: a whitespace-stripping branch in `hit()` was DELETED after
mutation testing proved it dead (`\\s` already matches newlines). The fixtures that failed to
justify it are kept, with the reasoning, so nobody re-adds it on the same assumption.

All are pinned by importing and driving the REAL functions, never a replica — the
standing method `[[extract-for-import-when-a-raw-guard-cant-express-the-property]]`.
`judge()` and `verdict_line()` were extracted from the run loop precisely so this file
can drive them as values.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import probe  # noqa: E402  — the real module under test, never a replica


# ⚠️ TWO INDEPENDENT CONTROLS REJECT THE DROPDOWN, AND EACH MUST BE TESTED ALONE.
#
# Found by mutation-testing this very file (2026-08-04): reverting EXECUTION_MARKERS to
# the original false-passing content words left all 17 tests GREEN. The reason is that the
# full dropdown capture contains BOTH the description prose AND sibling command names
# (`/statusline`, `/usage`) — so `AUTOCOMPLETE_VETO` rejected it and the marker regression
# was masked. The suite proved the veto worked and said *nothing* about the markers.
#
# This is the same shape as M11's finding that `rehype-raw` + `rehype-sanitize` are
# REDUNDANT rather than layered: each control suffices alone today, and each is
# load-bearing exactly when the other is absent. A test exercising both together cannot
# tell you which one is holding.
#
# So the fixtures are split by which control must catch them:
#
#   FALSE_PASS_DESCRIPTION_ONLY — dropdown *description prose*, sibling command names
#                                 REMOVED. The veto cannot see this. Only the structural
#                                 "Label:" requirement rejects it. ← pins EXECUTION_MARKERS
#   FALSE_PASS_PICKER_ONLY      — sibling command names, no description prose.
#                                 ← pins AUTOCOMPLETE_VETO
#   FALSE_PASS_DROPDOWN         — the verbatim capture (both signals), as it really
#                                 arrived. ← pins the real-world case end to end
#
# All three are kept: the split fixtures prove *which* control holds, the verbatim one
# proves the actual observed input is still rejected.

# The description prose ALONE — this is the text that fooled predicate v1. Every one of
# its content words ("version", "model", "account") is here; what is absent is any
# labelled `Version:` row. Verbatim from the capture, minus the sibling command lines.
FALSE_PASS_DESCRIPTION_ONLY = (
    "/status show claude code status including version, "
    "model, account, api connectivity, and tool…"
)

# The picker's sibling-command signature alone, with no description prose.
FALSE_PASS_PICKER_ONLY = (
    "/statusline /ide manage ide integrations /usage show session cost"
)

# The literal dropdown text from the capture that produced the false pass. Kept verbatim
# rather than paraphrased: a paraphrase would drift from the shape that actually fooled
# the predicate, and the drift would be invisible.
FALSE_PASS_DROPDOWN = (
    "/status show claude code status including version, "
    "model, account, api connectivity, and tool… "
    "/statusline setup claude code's status line ui "
    "/ide manage ide integrations and show status "
    "/usage show session cost, plan usage, and activity stats"
)

# A real /status report as it arrives from the TUI's bordered panel: box-drawing columns
# are stripped, so words run together. Verbatim shape from the 500 ms capture
# (`Version:2.1.221`, `SessionID:be25c8fd…`).
REAL_REPORT_SQUASHED = (
    "╭──────╮│version:2.1.221sessionid:be25c8fd-54b2-4f8b-a26f-1957e8285333"
    "model:default(opus5with1mcontext)│╰──────╯"
)

# A label split by a TUI line-wrap — the panel can break between a label and its colon.
# The markers' embedded `\s*` covers this, since `\s` matches newlines as well as spaces.
#
# ⚠️ This fixture is why a whitespace-stripping branch was DELETED from `probe.py` rather
# than kept. Three fixtures were written trying to prove that branch load-bearing (spaces
# between fields → the run-together panel string → this wrap-split label); disabling the
# branch left the suite GREEN against all three, because `\s*` had already covered them.
# The branch only matched mid-word splits (`ver sion:`), which a column-wrap cannot make.
# Standing lesson, which that branch violated: an observation is only decisive when a
# broken implementation would give a DIFFERENT answer.
REAL_REPORT_WRAPPED_LABEL = "version\n  : 2.1.221    model\n  : default (opus 5)"
REAL_REPORT_SPACED = (
    "version: 2.1.221  session id: be25c8fd-54b2-4f8b-a26f-1957e8285333  "
    "model: default (opus 5)"
)

INTERACTIVE = "welcome to claude code"


def verdict_for(post: str, pre: str = INTERACTIVE) -> str:
    """Drive the real predicate. Callers pass lowercase, as production does."""
    return probe.judge(
        pre_text=pre.lower(), post_text=post.lower(), index=0, delay_ms=0
    ).verdict


def runs(*verdicts: str) -> list[probe.RunResult]:
    """Synthetic run results for driving the real `verdict_line`."""
    return [
        probe.RunResult(index=i, delay_ms=1500, verdict=v, reached_interactive=True)
        for i, v in enumerate(verdicts, 1)
    ]


class PredicateRejectsTypingWithoutExecution(unittest.TestCase):
    """The core property: an ECHO — or any UI *about* the command — is never a pass."""

    def test_the_description_prose_alone_is_rejected_by_the_MARKERS(self):
        """⚠️ THE REGRESSION TEST — and it must isolate EXECUTION_MARKERS to be one.

        This input carries every content word that fooled predicate v1 ("version",
        "model", "account") and NO picker signature, so `AUTOCOMPLETE_VETO` cannot see
        it. Only the structural "Label:" requirement can reject it.

        Mutation-proven (2026-08-04): reverting EXECUTION_MARKERS to the original
        `("model","account","version","session")` makes THIS test fail. The earlier
        version of this test used the full dropdown capture and stayed GREEN under that
        same mutation, because the veto caught it instead — a test that proved the wrong
        control.

        If this fails, the predicate has been widened back into matching prose *about*
        the command, and every verdict the probe emits is untrustworthy.
        """
        self.assertEqual(verdict_for(FALSE_PASS_DESCRIPTION_ONLY), "NOT-EXECUTED")

    def test_the_picker_signature_alone_is_rejected_by_the_VETO(self):
        """The other control, isolated: sibling command names, no description prose.

        Mutation-proven: emptying `AUTOCOMPLETE_VETO` makes this test fail while the
        markers test above still passes — confirming the two controls are independently
        pinned rather than one covering for the other.
        """
        self.assertEqual(verdict_for(FALSE_PASS_PICKER_ONLY), "NOT-EXECUTED")

    def test_the_verbatim_capture_that_false_passed_is_rejected(self):
        """The real observed input, with both signals present, exactly as captured.

        Kept alongside the two isolated tests: they prove *which* control holds, this
        proves the actual real-world shape is still rejected end to end.
        """
        self.assertEqual(verdict_for(FALSE_PASS_DROPDOWN), "NOT-EXECUTED")

    def test_the_veto_beats_a_genuine_marker(self):
        """Picker visible AND a real `Version:` row → still NOT-EXECUTED.

        This is the harder case, and it is why the veto is a hard override rather than
        merely "absence of evidence". A pathological frame could contain both; the safe
        reading is that the command is still sitting in the input box.
        """
        both = FALSE_PASS_DROPDOWN + " " + REAL_REPORT_SPACED
        self.assertEqual(verdict_for(both), "NOT-EXECUTED")

    def test_bare_echo_is_not_a_pass(self):
        self.assertEqual(verdict_for("❯ /status"), "NOT-EXECUTED")

    def test_echo_is_present_in_every_negative_case(self):
        """Guards against a vacuous pass: these inputs must not be rejected merely
        because the command text is missing. The echo IS there; the report is not.

        Checked on the description-only fixture specifically — that is the one whose
        rejection depends on the markers, so it is the one whose non-vacuity matters.
        """
        for fixture in (FALSE_PASS_DESCRIPTION_ONLY, FALSE_PASS_DROPDOWN):
            with self.subTest(fixture=fixture[:40]):
                r = probe.judge(
                    pre_text=INTERACTIVE, post_text=fixture, index=0, delay_ms=0
                )
                self.assertTrue(
                    r.echo_seen,
                    "the probe command must appear in the input — else this is vacuous",
                )
                self.assertEqual(r.verdict, "NOT-EXECUTED")


class PredicateAcceptsRealExecution(unittest.TestCase):
    """The other half — a genuine report must still be recognised.

    Without these, the predicate could be 'fixed' by rejecting everything, which would
    pass every test in the class above while making the probe useless.
    """

    def test_a_real_report_executes(self):
        self.assertEqual(verdict_for(REAL_REPORT_SPACED), "EXECUTED")

    def test_the_verbatim_panel_shape_executes(self):
        """The real 500 ms capture shape: box-drawing stripped, words run together."""
        self.assertEqual(verdict_for(REAL_REPORT_SQUASHED), "EXECUTED")

    def test_a_marker_split_by_a_line_wrap_still_executes(self):
        """A wrap between a label and its colon must not read as NOT-EXECUTED.

        This is the property that matters (whitespace tolerance inside a marker), stated
        against behaviour rather than against an implementation branch — the previous
        version of this test named a whitespace-stripping branch that mutation testing
        proved dead, and that branch has since been deleted. Asserting the behaviour means
        this test survives however the tolerance is implemented.

        If it fails, a genuinely-executed command whose report wrapped would be judged
        NOT-EXECUTED — the probe under-reporting success.
        """
        self.assertEqual(verdict_for(REAL_REPORT_WRAPPED_LABEL), "EXECUTED")

    def test_markers_tolerate_every_whitespace_form_the_panel_can_emit(self):
        """One assertion per real rendering variant, so a tightened marker is caught."""
        for variant in ("version: 2.1.221", "version:2.1.221",
                        "version : 2.1.221", "version\n: 2.1.221"):
            with self.subTest(variant=variant):
                self.assertEqual(verdict_for(variant), "EXECUTED")


class PredicateSeparatesSetupFailureFromTimingAnswer(unittest.TestCase):
    """INDETERMINATE is a third outcome, not a flavour of NOT-EXECUTED.

    Collapsing them would send a later phase chasing a timing fix for a setup problem
    (no `claude` on PATH, an auth prompt, a trust dialog) — a wrong-cause diagnosis.
    """

    def test_never_interactive_is_indeterminate(self):
        self.assertEqual(verdict_for("", pre=""), "INDETERMINATE")

    def test_interactive_but_no_report_is_not_executed(self):
        self.assertEqual(verdict_for("some other output"), "NOT-EXECUTED")


class VerdictLineRefusesToOverclaim(unittest.TestCase):
    """The cold-spawn floor, pinned where the claim is MADE.

    Found at verify-self: `--runs 1` printed "EXECUTED 1/1 … reliable across cold
    spawns" in the line labelled "what WP3 Phase 4 consumes", contradicting the
    parser's own <5-run warning.
    """

    def test_under_floor_does_not_claim_reliability(self):
        for n in (1, 2, 3, 4):
            with self.subTest(runs=n):
                line = probe.verdict_line(runs(*(["EXECUTED"] * n)), 1500)
                self.assertIn("INSUFFICIENT-SAMPLE", line)
                self.assertIn("NOT a reliability claim", line)

    def test_at_and_above_the_floor_does_claim_reliability(self):
        """The floor must be exclusive — n == 5 is a claim, n == 4 is not. A guard that
        swallowed the 5-run case too would silence the probe's actual verdict."""
        for n in (5, 10):
            with self.subTest(runs=n):
                line = probe.verdict_line(runs(*(["EXECUTED"] * n)), 1500)
                self.assertIn("reliable across cold spawns", line)
                self.assertNotIn("INSUFFICIENT-SAMPLE", line)

    def test_the_floor_constant_is_five(self):
        self.assertEqual(probe.COLD_SPAWN_FLOOR, 5)

    def test_flaky_is_never_reported_as_a_pass(self):
        """A partial pass is the worst outcome (works warm, fails cold) — 350 ms measured
        1/5 then 0/5 across two independent samples. The wording must say NOT a pass."""
        line = probe.verdict_line(
            runs("EXECUTED", "NOT-EXECUTED", "NOT-EXECUTED", "NOT-EXECUTED", "NOT-EXECUTED"),
            350,
        )
        self.assertIn("FLAKY", line)
        self.assertIn("NOT a pass", line)

    def test_no_under_floor_input_can_phrase_a_reliability_claim(self):
        """Branch-order property, probed at verify-self by an independent reviewer:
        NO under-floor shape may reach the reliability wording — not just the
        all-EXECUTED one the guard explicitly intercepts."""
        shapes = (
            ("EXECUTED",),
            ("EXECUTED", "NOT-EXECUTED"),
            ("EXECUTED", "EXECUTED", "NOT-EXECUTED"),
            ("EXECUTED", "INDETERMINATE"),
            ("NOT-EXECUTED",),
            ("INDETERMINATE",),
            ("INDETERMINATE", "INDETERMINATE", "INDETERMINATE"),
        )
        for shape in shapes:
            with self.subTest(shape=shape):
                line = probe.verdict_line(runs(*shape), 1500)
                self.assertNotIn(
                    "reliable across cold spawns",
                    line,
                    f"{len(shape)} runs must not claim reliability",
                )


class ByteShapeMatchesTheRustContract(unittest.TestCase):
    """The probe measures the same bytes production sends, or it measures nothing.

    Mirrors `cc_session::slash_command_bytes` (`src-tauri/src/cc_session/mod.rs`), which
    strips trailing CR/LF then appends exactly one CR. ⚠️ CR (0x0d), never LF: in raw
    mode CR is Enter, while `\\n` only triggers autocomplete typeahead.
    """

    def test_appends_exactly_one_cr(self):
        self.assertEqual(probe.slash_command_bytes("/status"), b"/status\r")

    def test_does_not_double_terminate(self):
        for supplied in ("/status\r", "/status\n", "/status\r\n"):
            with self.subTest(supplied=supplied):
                self.assertEqual(probe.slash_command_bytes(supplied), b"/status\r")

    def test_never_emits_lf(self):
        for cmd in ("/status", "/status\n", "/session-restore\r\n"):
            with self.subTest(cmd=cmd):
                self.assertNotIn(b"\n", probe.slash_command_bytes(cmd))


class TeardownIsPidScoped(unittest.TestCase):
    """⚠️ A safety invariant, not a style rule.

    On 2026-07-13 a blanket name/port kill during a verify-self run killed the operator's
    live application — the dev and prod builds share the process name `claudesk`. This
    probe spawns real `claude` processes, so a future edit reaching for `pkill` would be
    reintroducing that incident. Asserted mechanically because a comment cannot fail.
    """

    def test_no_blanket_kill_primitives_in_the_harness(self):
        here = Path(__file__).resolve().parent
        for name in ("probe.py", "probe.sh"):
            src = (here / name).read_text()
            for banned in ("pkill", "killall", "fuser"):
                with self.subTest(file=name, banned=banned):
                    self.assertNotIn(
                        banned,
                        src,
                        f"{name} must never kill by name/port — kills are os.kill(pid) "
                        f"on our own pty.fork() child only",
                    )


if __name__ == "__main__":
    unittest.main(verbosity=2)
