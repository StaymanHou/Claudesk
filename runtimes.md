---
shape: runtime-registry
updated: 2026-06-19
---

# Runtime Registry

<!--
Timeout policy: `**Use timeout:**` is the larger of the formula value
(ceil(observed * 1.5 + 60) * 1000) and a 120000 ms safety floor. For sub-40s
commands the formula yields < 120000, so these entries clamp UP to 120000 — a
deliberate floor, not a recording error. The floor guards against spurious
kills on a cold/contended run where a fast command runs much slower than its
recorded best case. Long commands (tauri dev/build) exceed the floor and use
the formula's value (clamped to the Bash tool's 600000 ms max).
-->

## pnpm install

- **Last:** 3s (2026-06-16)
- **Use timeout:** 120000
- **History:**
  - 3s — 2026-06-16

## pnpm tauri dev

- **Last:** 29s (2026-06-16, first compile from clean target/)
- **Use timeout:** 600000
- **History:**
  - 29s — 2026-06-16 (first compile; incremental rebuilds will be faster)

## pnpm tauri build

- **Last:** 40s (2026-06-16, release profile from clean target/)
- **Use timeout:** 600000
- **History:**
  - 40s — 2026-06-16

## pnpm test

- **Last:** 1s (2026-06-16)
- **Use timeout:** 120000
- **History:**
  - 1s — 2026-06-16

## pnpm lint

- **Last:** 1s (2026-06-16)
- **Use timeout:** 120000
- **History:**
  - 1s — 2026-06-16

## cargo test

- **Last:** 6s (2026-06-19, warm rebuild for WP9 error-handling edits; 35 tests pass)
- **Use timeout:** 120000
- **History:**
  - 6s — 2026-06-19 (warm rebuild, WP9 P1.1/P1.3: +6 tests → 35 pass; test run itself ~0s)
  - 8s — 2026-06-19 (cold build of WP8 global-shortcut dep tree: 31 tests pass; test run itself ~0s)
  - 11s — 2026-06-19 (cold build of WP7 cc_session dep tree; test run itself ~0s warm)
  - 17s — 2026-06-18 (cold; new dep tree from WP6 — incremental runs are ~2s)
  - 2s — 2026-06-16
