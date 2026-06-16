---
name: Observable Outcomes — execution evidence, not just typing evidence
description: feature-plan discipline in Claudesk. Outcomes that test command execution must require BOTH the typing-side evidence AND the execution-side evidence (output body, exit code, state change). "Marker appears in output" is too weak for execution checks.
type: project
---

When writing Observable Outcomes for `feature-plan` in this project, distinguish *visibility/UI* checks from *execution* checks:

- **Visibility/UI check:** "marker M appears in output stream within Ns" is fine. Examples: a banner renders, an autocomplete shows up, a UI element appears.
- **Execution check:** the same wording is too weak. A command can produce a marker via typeahead/autocomplete without executing. Require BOTH the typing-side evidence AND the execution-side evidence: command's actual body output, an exit code, a state change in a file, an HTTP response shape.

**The failure mode this prevents:** in WP2, the P1.4 outcome was "captured PTY output contains a substring unambiguously identifying CC's /help response." Both `/help\n` (autocomplete dropdown — doesn't execute) AND `/help\r` (actual execution) satisfy that outcome literally — the autocomplete dropdown contains `/help`. The verify-self subagent passed against the dropdown without noticing the command never ran. The wrong finding shipped and would have broken WP7 if not caught by gut-check post-finalize.

**Outcome-wording template for execution checks:**

```
CLI: <command-invocation> → within Ns of injection, the captured output contains
  (a) the typing marker M, AND
  (b) one of:
      - the command's body output (e.g., "<expected substring>")
      - an exit-status side-effect (e.g., child.try_wait() returns Some(ExitStatus { code: 0, .. }))
      - a state-change side-effect (e.g., file <path> is created/modified)
```

**Applies to:** every Claudesk feature-plan that exercises a CC slash-command, a CLI invocation, a UI action with a side-effect, or any "input → command runs → effect" flow.

**Reference incident:** WP2 P1.4 (corrected by follow-up probe and revised in `workflow/archive/wp2-cc-pty-probe.md` § Findings — revised).
