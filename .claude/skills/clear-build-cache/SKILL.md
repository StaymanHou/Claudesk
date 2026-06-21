---
name: clear-build-cache
description: Reclaim disk by clearing Cargo's incremental compilation cache under src-tauri/target. Use when the user asks to clear the build cache, shrink the target folder, or free up disk space from Rust/Tauri builds.
---

# Clear build cache

Cargo's `incremental/` directories under `src-tauri/target` are pure cache that
only ever grows — they're safe to delete anytime. Deleting them reclaims disk at
the cost of one slower next build (the rest of `target/` stays warm). This is the
cheap reclaim; it does NOT touch `deps/`, `build/`, or release artifacts.

## Steps

1. Report the size about to be reclaimed:
   ```bash
   du -sh src-tauri/target/debug/incremental src-tauri/target/release/incremental 2>/dev/null
   ```
2. Delete the incremental caches:
   ```bash
   rm -rf src-tauri/target/debug/incremental src-tauri/target/release/incremental
   ```
3. Report the new total so the user sees the result:
   ```bash
   du -sh src-tauri/target 2>/dev/null
   ```

## Notes

- Run from the project root (`/Users/stayman/Personal/projects/claudesk`).
- The `2>/dev/null` guards are intentional — either incremental dir may be absent
  (e.g. no release build has run), and that is not an error.
- This is the lightweight option. For a deeper reclaim, mention to the user:
  - `cargo clean` (in `src-tauri/`) — removes the entire `target/` (~all of it);
    next build is a full cold rebuild.
  - `cargo sweep --time 7` (needs `cargo install cargo-sweep`) — prunes only
    stale dependency-version artifacts not touched in N days, keeping the current
    working set warm. Good for the gradual stale-`deps/` buildup that `incremental`
    clearing doesn't address.
- Do not delete `deps/`, `build/`, or release artifacts as part of this skill —
  that's what `cargo clean` is for and it's a heavier, explicit choice.
