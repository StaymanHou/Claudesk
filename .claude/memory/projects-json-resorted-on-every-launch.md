---
name: projects-json-resorted-on-every-launch
description: The picker's mount-time prune rewrites projects.json in recency order every launch, so a shasum check spanning a launch is invalid; compare row sets.
metadata:
  type: project
---

Every Claudesk launch (dev or prod) rewrites `projects.json` even when nothing changed. The picker mount calls `prune_missing_projects`. Its `update_projects` funnel **always writes**, and `read_projects` sorts by recency, so the file comes back in recency order. If it wasn't already in that order, its bytes change while its rows don't. `remove` behaves the same way.

**Why:** In M17 WP2 Phase 2 verify-self (2026-11-16), a "failed add writes nothing (shasum unchanged)" check spanned a dev-app launch. The shasum changed (2ffd1b… → 387ece…), and it looked as if the failed add had written. The row set was identical; the launch-time prune had re-sorted the file. The code comment on `prune_missing` claims the content stays "identical", which is wrong (logged as `SURFACE-2026-11-16-PRUNE-COMMENT-CLAIMS-UNCHANGED-FILE-BUT-IT-RE-SORTS`).

**How to apply:**
- When verifying "this action did not write `projects.json`", take the baseline shasum **after** the app has launched and the picker has mounted, immediately before the action.
- Or compare the **set of rows** (`json.dumps(row, sort_keys=True)` per row, sorted) against the backup instead of the bytes.
- Restoring a pre-launch backup with `cp` and checking its shasum is still valid. Only a before/after comparison that spans a launch is unsafe.

Related: [[verify-the-mutation-landed]], [[invalid-probe-and-real-hole-look-identical]].
