---
name: Read tool --help before designing a CLI test matrix
description: Five seconds of --help reading collapses redundant matrix rows and surfaces native flags upstream research may have missed
type: feedback
---

Before designing a probe matrix for any CLI tool, run `<tool> --help` (or `<tool> -h`, `<tool> help`, equivalent) first. Read the actual flag list. Only then write the matrix.

**Why:** On 2026-06-16, the WP3 Sublime CLI probe matrix was designed from the WP3 description's flag list (`--new-window`, `--background`, `open -a`, `--project`). The matrix was built and executed against both `subl` and `smerge` before I read `subl --help` / `smerge --help`. Both tools natively support a clean `-b/--background` flag (per `--help`) that gives focus-control without needing macOS's `open -a -g` quirk. Reading `--help` first would have:

1. Collapsed several matrix rows that ended up being redundant or inference-only.
2. Rewritten the WP8 hand-off contract's focus-policy section before any cold-launching disturbed user state.
3. Saved roughly half the probe's execution time.

The cost of `--help` first is five seconds. The cost of skipping it is sometimes the entire test matrix has to be revised mid-run.

**How to apply:**

- Whenever a probe / verify-self / test / spike begins with "let's test these CLI invocations…", the first command run is `<tool> --help` (or equivalent for the tool's ecosystem — `man <tool>`, `<tool> --help`, `<tool> help <subcommand>`, GitHub README, etc.). Read it before writing the matrix.
- If the tool is unfamiliar, prefer `<tool> --help | head -50` so the relevant flag table lands in conversation context as a citable reference.
- This applies to any CLI-shape probe — not just Sublime tools. Generalizable across rust-cli, npm packages, system utilities, etc.
- The five-second cost is non-negotiable; do not skip it because "the docs already say what the flags are." Docs are aspirational; `--help` is what the binary actually accepts.
