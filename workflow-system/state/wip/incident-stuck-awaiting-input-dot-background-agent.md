---
workflow: incident
state: reported
created: 2026-08-06
severity: TBD
---

# Incident: AwaitingInput dot stays lit after a background agent finishes

**Workflow:** incident
**State:** reported
**Created:** 2026-08-06 15:2x
**Severity:** TBD (not yet triaged)
**Status:** Reported — awaiting `/incident-triage`

## Summary

A workspace's status dot goes **blue (AwaitingInput)** when a CC **background agent** needs input,
and **nothing ever clears it** when that agent finishes. The dot stays blue until an unrelated
foreground event (the operator's next `UserPromptSubmit`) happens to move it.

Reproduced live 2026-08-06 by the operator while using CC's multi-agent background-session feature:
a background agent finished its turn and the dot stayed blue.

⚠️ **The dot is HONEST at the moment it lights.** This is not a false positive — a background agent
genuinely was awaiting input (the operator's screenshot shows CC's own background view reading
`1 awaiting input · 0 working · 5 completed`, with `testing ping pong` awaiting). The defect is
**staleness**: there is no clearing edge for this case.

## Initial Observations

**Captured in the hook channel** (`~/Library/Application Support/com.claudesk.app/status-channel.log`),
the whole sequence, unedited:

```
1786042860266 STATUS event=Stop         cwd=…/claudesk mapped=idle            resolved=ws-3 outcome=emitted
1786042861885 STATUS event=Notification cwd=…/claudesk mapped=awaiting_input   resolved=ws-3 outcome=emitted   ← dot lights
1786042874017 STATUS event=SubagentStop cwd=…/claudesk mapped=none             resolved=ws-3 outcome=dropped   ← agent finishes, DROPPED
1786043024869 STATUS event=UserPromptSubmit cwd=…/claudesk mapped=running      resolved=ws-3 outcome=emitted   ← finally cleared, incidentally
```

- `Notification` → `awaiting_input` at `…861885` lights the dot (correctly).
- `SubagentStop` at `…874017` — **12s later**, the agent's turn genuinely ending — is
  `mapped=none`, `outcome=dropped`. It changes nothing.
- The dot then sat blue for **~150 seconds**, cleared only by the operator's next prompt at
  `…3024869`. Nothing about that clearing was related to the agent finishing.

## Why there is no clearing edge (the mechanism)

`event_to_state` (`src-tauri/src/status_broadcaster/mod.rs:121`) maps exactly four events to states;
`SubagentStop` falls through to `_ => None`.

The documented clearing rule (CLAUDE.md, QoL-WP2) is: **`PostToolUse` is the answer-resume signal** —
answering an `AskUserQuestion`/permission prompt fires `PostToolUse`, clearing a stuck AwaitingInput.
That model **assumes the input-needed and the answer occur in the same foreground session**.

A background agent breaks the pairing: nothing the operator does in the foreground fires
`PostToolUse` for a *background* agent, and the one event that marks that agent's turn ending —
`SubagentStop` — is deliberately status-neutral. **So for this shape there is no clearing edge at
all.**

⚠️ **The `SubagentStop → None` mapping is DELIBERATE and test-pinned, not an oversight.**
`m9_time_analytics_events_are_status_neutral` (`mod.rs:449`) pins six events (`PreToolUse`,
`PostToolUseFailure`, `SubagentStart`, `SubagentStop`, `SessionStart`, `SessionEnd`) to `None`, with
an explicit stated invariant: they were registered at M9 WP2 *purely* to feed `time_store`, and
"a PreToolUse arriving now can NEVER flip a dot." **Any fix that simply maps `SubagentStop → Idle`
contradicts that invariant and fails that test.** The test is correct for what it was written to
protect; the M9 WP2 design simply predates multi-agent background sessions.

## Secondary observation (UX, may be the same root)

The operator's report: *"It's not an option box for me to select from."* A blue dot conventionally
means "go answer the prompt in this pane" — but here the thing awaiting input lives in CC's
**background-agent view**, not the foreground TUI. So the surface reports something true about a
place the operator cannot act on from where the dot points. Whether the dot *should* represent
background-agent state at all is the product question underneath this incident.

## Scope / impact (pre-triage, do not treat as settled)

- **Not a crash, no data loss, no process-lifecycle effect.** Status-surface correctness only.
- Affects all three status surfaces equally by construction (filmstrip, PiP, menu-bar tray all fold
  the same `workspace-status` broadcast), so a stuck dot also holds the **menu-bar alarm glyph** lit —
  the ambient alarm is the surface where a false-positive is most costly, since it is the one visible
  when Claudesk is not focused.
- Frequency scales with background-agent use, which is new operator behavior and likely to increase.

## Open questions for triage

1. **What should the dot mean with N background agents?** Two candidate shapes, and this is a product
   decision, not a mapping tweak:
   - (a) map `SubagentStop` → clear — cheapest, but contradicts the M9 WP2 pinned invariant above and
     is wrong when *multiple* agents are outstanding (one finishing does not mean none await input);
   - (b) track background-agent state **separately** from the session dot — more work, but it is the
     only shape that can express "2 of 5 agents awaiting."
   Initial lean is **(b)**, on the grounds that (a) cannot represent the multi-agent case it exists to
   serve; explicitly **not decided here**.
2. **Is the correlation even sound?** `SubagentStop` carries the *parent session's* cwd, so all
   background agents of one workspace resolve to the same `ws-N`. Counting outstanding agents needs a
   per-agent identifier — confirm one exists on the hook payload before designing (b).
   ⚠️ Per `[[cc-hook-capture-beats-docs]]`, settle this with a **live hook capture**, not from docs.
3. **Severity.** No correctness/data impact, but it degrades the ambient alarm that is the whole point
   of M7's menu-bar surface.

## Relationship to the other thing reported today

⚠️ **This is a SEPARATE finding from the freeze that opened the session** (Claudesk froze ~48s after
an × close on the claudesk workspace, 14:47:56→14:48:44, force quit from the Dock; macOS declined to
spindump — `not sampling due to conditions 0x400000000` — so no stack exists). The freeze **was NOT
reproduced**; this stuck-dot finding was reproduced while attempting it. They share no evidence and
should not be conflated. If the freeze recurs: `sample <pid> 5 -f ~/Desktop/claudesk-freeze.txt`
**while still frozen**, before force quitting.

Ruled out for the freeze by static reading (recorded so it is not re-walked): the `cc_kill`
SIGHUP→SIGKILL sequence (every step bounded, ~1.1s cap), `workspace_deregister`'s AppKit work (tray
`forget_workspace` + PiP reconcile, both main-thread-safe and both after the last logged line), and
the synchronous `dirtyDocCount()` dirty probe at `App.tsx:501`. The deregister **succeeded** and was
the last thing logged, so the block is after it, in frontend teardown. Unusual property of that close:
the workspace was `awaiting_input`, so it took the **confirm-dialog** branch, not the immediate one.

**Update 2026-08-10 (operator):** the freeze has **not recurred** in the ~3 days since the report,
**with frequent use**. That is a one-off so far, which lowers its urgency but does **not** close it —
no root cause was ever found and no stack was ever captured, so there is nothing to say it is fixed.
Keep the capture instruction above live: if it recurs, `sample <pid> 5` **while still frozen**.

## Reproduction

Not yet reduced to deterministic steps. Observed shape:

1. Open a workspace; run a CC session that spawns **background agents** (multi-agent feature).
2. Let a background agent reach an awaiting-input state → dot goes blue (correct).
3. Let that agent finish its turn → `SubagentStop` fires, **dot stays blue**.
4. Dot clears only on the next unrelated foreground `UserPromptSubmit`.

Evidence for the observed instance is in `status-channel.log` at the epochs quoted above (the file
rotates — copy the lines out before they age out if they are still needed at triage).

## Next state

`/incident-triage` — assess severity and decide investigate vs. fast-close.
