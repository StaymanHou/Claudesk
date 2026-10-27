---
from: /Users/stayman/Personal/projects/claudesk
kind: feature-request
date: 2026-10-26
summary: Ask the skills to emit the TRANSITION token in one canonical form (a bare last line), so a quoted token can never be read as a verdict
---

# Emit `TRANSITION:` in one canonical form

## What happened

Claudesk's workflow supervisor reads the turn's final assistant message for a `TRANSITION: <id>`
token and, on an AUTO edge, fires the next skill. Until now it took the last `TRANSITION:`
anywhere in that message. On 2026-09-28 a turn whose final message *quoted* a token
(`The "Built / TRANSITION: F8" reply was the literal text you asked for`) re-fired
`/feature-verify-auto`. Verify-human checklists, analysis turns and stall post-mortems quote
tokens routinely (`I'm still not emitting \`TRANSITION: F13\``, `I'd stopped on \`TRANSITION: F8\``).

## What Claudesk did on its side (M16.5 WP3 3.1)

The reader now accepts a token only where it OPENS a sentence or clause (line start, or after
`.` `!` `?` `:` `;` `,` `(` `→` `—` `->`), and never inside a double-quoted span or inside a code
span that holds other text. It was measured against the local transcript corpus:

| Window | Token-bearing turns | Read the same | Now withheld | Different edge | Newly fired |
|---|---|---|---|---|---|
| 2026-10-05 → 10-26 | 478 | 471 | 7 | 0 | 0 |
| everything (since June) | 8,347 | 8,257 | 86 | 4 | 0 |

In the recent window, 5 of the 7 withheld turns are quotes (correct), and 2 are real verdicts
written mid-sentence: `…, so TRANSITION: F30.` and `…, so this is TRANSITION: F19, which leads
into reflection.` A withheld verdict is the safe direction (the operator nudges), but it is a miss.

⚠️ A stricter "the token must start its line" rule was measured first and refuted: it withheld
132 of 477 recent real verdicts, because skills now usually end a sentence with the token
(`Approved. **TRANSITION: F13**`).

## The ask

Have the skills emit the token in **one canonical form**: a bare `TRANSITION: <id>` as the
**final line** of the turn, with nothing after it on that line and no wrapping (no backticks,
no bold), plus optional explanatory prose ABOVE it. For example:

```
Phase 1 is built and the gate is green.

TRANSITION: F8
```

This is the Phase 3d regex contract's emitted side. Claudesk's reader will keep accepting the
current forms, so nothing breaks while the skills move over. Once the canonical form is the
norm, the two "so TRANSITION: X" misses go away, and the reader can later be tightened to the
canonical form alone.

## What "done" looks like

- The `## Emit Transition` / "Transition" instructions in the skills (and `CLAUDE.snippet.md`, if
  it carries the convention) say "the final line, bare".
- Optionally, a `check-structure.sh` pin that every skill's emit instruction says so.

No reply is needed unless you want to discuss the form. Claudesk's side is being built in M16.5 WP3.
Evidence: `claudesk/src/state/workflowMachine/transitionToken.ts` (`extractEmittedTransitionId`)
and `claudesk/tooling/adjudicator-probe/tokenSplit.probe.ts` (the replay).
