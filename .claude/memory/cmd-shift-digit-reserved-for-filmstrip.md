---
name: cmd-shift-digit-reserved-for-filmstrip
description: ⌘⇧+digit is reserved for future workspace/filmstrip switching in Claudesk; do not claim it for editor features
metadata: 
  node_type: memory
  type: project
  originSessionId: 06eb0e92-995a-43e1-b0c0-36f23abdd066
---

`⌘⇧1`..`⌘⇧9` (Cmd+Shift+digit) is RESERVED for switching workspaces via the filmstrip — a later-milestone product feature (multi-workspace center-stage switching), not yet built.

**Why:** Operator directive 2026-06-21 (during WP12 Phase-2 verify-human). When the filmstrip lands, ⌘⇧+digit will jump to the Nth workspace tile — analogous to how browsers/Sublime use ⌘+digit for tabs.

**How to apply:** Do NOT bind `⌘⇧+digit` to any editor/right-panel feature. WP12's editor tab-switch chord deliberately uses **bare ⌘+digit** (`tabSwitchChord.ts` → `tabSwitchIndex`), which is disjoint from the reserved ⌘⇧+digit. The reservation is documented in the chord-ownership map in `src/components/workspace/editor/paletteCommands.ts`. Any future WP that wants a digit chord must check this reservation first.
