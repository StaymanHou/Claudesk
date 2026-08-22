---
name: derived-state-is-not-a-proxy-for-its-event
description: A consumer needing "event X arrived" must match EVERY state X can map to — and when a closed enum gains a member, sweep consumers of every sibling literal, not the semantically nearest one. Shipped a CRITICAL; the failure mode is a silent hang.
metadata:
  type: project
---

Two halves of one shipped CRITICAL (M13.5 WP2, caught only at code-quality review).

## 1. A derived state is not a proxy for the event that produced it

`recycleSession.ts`'s completion machine needs *"a `Stop` hook event arrived"*, but the wire carries
only the **derived** state, so it matched `event.payload.state === "idle"` with the comment
*"`Stop` is what the backend maps to `idle`"*. True when written — and it made the mapping's
**current output** the contract.

WP2 gave `Stop` a second mapping (`background_work`, when a turn ends with a backgrounded job still
running). That `Stop` became **invisible** to the machine: `awaiting-stop` hangs to its 180s timeout,
`awaiting-fresh-write` never raises `no-fresh-write`. ⚠️ And it is the **likely** case, not an edge
one — Recycle runs `/session-handoff`, which may well have a job outstanding.

**The rule:** where a consumer needs the *event*, pin it to the mapping's **full output set**, not to
whichever state the mapping happens to produce today. Here that is enforceable across the language
boundary — a test reads the Rust `Stop` arm of `event_to_state`, extracts its `WorkspaceState::*`
variants, converts them to wire literals via the serde `snake_case` rule, and asserts the TS listener
covers each (with a non-vacuity floor, since a regex that matched the arm but extracted nothing would
pass trivially). Same shape as the `SESSION_MD_REL` mirror in the same test file.

## 2. Adding a member to a closed enum: sweep EVERY sibling literal

⚠️ **The method error, and the transferable half.** I did sweep for consumers — and reported it as a
strength — but I grepped **`awaiting_input` consumers**, because the new state felt semantically
nearest to that one. That predicate is **structurally incapable** of finding a site keyed on
`"idle"`. I widened one literal's meaning and swept for a different literal's consumers.

**The rule:** when adding a member to a closed enum/union, grep consumers of **every sibling
literal** — the ones whose *meaning* changed are not necessarily the ones you'd associate with the
new member. For this repo that means all five: `"idle"`, `"running"`, `"awaiting_input"`,
`"background_work"`, `"unknown"`.

```bash
# The sweep that would have caught it — every literal, not the nearest one
grep -rn '"idle"\|"running"\|"awaiting_input"\|"unknown"\|"background_work"' src \
  | grep -v __tests__ | grep -vE '\.css:' | grep -E '===|!==|includes\(|case '
```

Done properly it returns exactly **two** real `WireWorkspaceState` consumers — `recycleSession.ts`
(this bug) and `confirmDialog.ts` — because everything else routes through `statusPresentation` /
`isActiveState`. The other `"idle"` hits are unrelated types (`fetchLatch`, `DiffPanel.kind`, a
wizard `step`), which is exactly why the sweep must be read rather than counted.

**Prefer making the sweep unnecessary.** Both sides of this now have compile-time exhaustiveness:
`tray::aggregate_alarm` uses an exhaustive `match` instead of `states.contains(&…)`, and
`statusPresentation` has `const exhaustive: never = state` after its switch — so a 6th member fails
`tsc` rather than silently rendering as a grey "Unknown" dot. ⚠️ Note the TS fix is **not** "delete
`default:`": the state crosses an IPC boundary from a separate process, so an undeclared string
genuinely can arrive and the runtime fallback is independently required. The `never` binding buys
compile-time coverage *without* giving that up.

⚠️ **The failure mode in both halves is SILENCE** — a hang and a wrong colour, no exception, no red
test. Neither was caught by the gate (Rust 873 / frontend 2140 all green); the code-quality review
found it.

Related: [[workspace-status-map-collapses-consecutive-events]] — closest neighbour, same file and
same subscription, and worth distinguishing: that memory's rule ("per-event consumers must read the
RAW stream, not the map") was **already followed** here — `recycleSession` does `listen()` directly.
Reading the raw stream is necessary and **not sufficient**; you must also match the right *states* on
it. [[widened-selector-must-be-strict-superset]] is the file-selection analogue (diff the old and new
candidate sets when a predicate's shape changes). `CLAUDE.md` → "extracting a pure state machine
proves the MACHINE, not its CALLER" is the funnel-side companion: that one is about *guarding* the
funnel, this one about *finding* the callers.
