---
name: vitest-console-log-silent-on-passing-tests
description: In this repo's Vitest 4.1.9 runs, console.log/console.warn from a PASSING test print nothing, while process.stderr.write does — a silent console probe is not evidence the code never ran. Instrument with stderr or a recorded value.
metadata:
  type: feedback
---

In claudesk's Vitest (4.1.9) runs, `console.log` and `console.warn` from test code print **nothing**
when the test passes. `process.stderr.write(...)` **does** print. There is no `silent` /
`onConsoleLog` setting in `vite.config.ts` or `package.json`; it is the runner's behavior here.

Verified 2026-11-04 with a minimal throwaway spec (`tmp/scratch/zzConsoleProbe.test.ts`, deleted)
that called all three: only the `stderr` line appeared in the output.

**Why:** at paydown 2026-11-04 WP3 a `console.log` probe inside the live harness's stub
`relaunch()` read as "never called", which pointed the timer-leak diagnosis at the wrong cause.
The same probe written with `process.stderr.write` showed the relaunch firing (`ws-1:1`).

**How to apply:** when instrumenting test or app code under Vitest to answer "did this run?",
write to `process.stderr`, or record into a value the test asserts on. Never read an empty console
as a negative. This is the same "a quiet instrument is not a negative" family as
[[read-logs-console-captures-nothing]] (the Tauri MCP bridge) and
[[jsdom-listener-throw-is-silent-in-vitest]] (a swallowed listener throw); positive-control any
probe before trusting its silence.
