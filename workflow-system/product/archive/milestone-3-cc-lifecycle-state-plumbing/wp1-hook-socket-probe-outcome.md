---
shape: probe-outcome
milestone: 3
wp: 1
date: 2026-06-22
verdict: GO
---

# WP1 Probe Outcome — Hook → Claudesk AF_UNIX socket → parse wire + `settings.json` coexistence

**Verdict: GO.** The end-to-end status wire works on real macOS. A hook script fired by a real
`claude` connects to a Claudesk-owned `AF_UNIX` socket and delivers a single parseable JSON line
per event; `cwd` + `session_id` are present on every event; registering our hook alongside
`claude-time`'s breaks neither; per-call hook latency is ~15 ms (sub-perceptible) and the hook
exits 0 even when no listener is running (Claudesk-down resilience). Build WP2/WP3 as planned.

## Harness

Two throwaway artifacts kept in-tree under `src-tauri/examples/` (probe deliverables, not
production code — the real hook lands in WP2, the real listener in WP3):

- **`examples/hook_socket_probe.rs`** — binds `std::os::unix::net::UnixListener` at a socket path
  (arg or `$TMPDIR/claudesk-hook-probe.sock`), removes a stale socket file first, accepts the
  newline-delimited JSON stream, parses each line to a typed `HookEvent` via `serde`, prints a
  verbatim field dump + a receive timestamp. `#[serde(flatten)] extra` captures any unmodeled
  field so contract surprises surface instead of being dropped.
  Run: `cargo run --example hook_socket_probe -- /path/to.sock`
- **`examples/hook_socket_probe.pl`** — the hook script. Mirrors `claude-time/hook.pl` discipline:
  reads the event JSON on stdin, re-emits a compact `{hook_event_name, session_id, cwd, sent_ms,
  prompt?, message?}` line to the socket at `$CLAUDESK_HOOK_SOCK`, exits 0 unconditionally. Uses
  only macOS-bundled stdlib (`JSON::PP`, `IO::Socket::UNIX`, `Time::HiRes`).

**Isolation discipline (never mutated real state):** the real `~/.claude/settings.json` was never
touched. Live runs used `claude --print --settings <scratch-layer.json>` to LAYER our hook on top
of the real config (preserving auth), and `CLAUDE_TIME_DIR=<scratch>` to redirect claude-time's DB.
Confirmed post-hoc that the real `~/.claude-time` dir mtime predates the probe — isolation held.

> Note on `CLAUDE_CONFIG_DIR`: a fully separate scratch config dir DOES isolate `settings.json`,
> but it does NOT inherit auth — `claude --print` under it bailed with "Not logged in". The
> `--settings <file>` layer flag is the correct lever: scratch hooks + real auth. (Recorded so WP2
> doesn't re-discover this.)

## Observed event payloads (verbatim, from real `claude`)

### `UserPromptSubmit` — OBSERVED (live, `claude --print`)
```json
{"hook_event_name":"UserPromptSubmit","session_id":"cdf522c4-30a5-4d2a-92aa-af823773422d","cwd":"/Users/stayman/Personal/projects/claudesk/src-tauri","prompt":"Reply with exactly the word: pong"}
```
(`prompt` is the full user prompt text. `sent_ms` in the captured line is our hook's own
send-timestamp addition, not a CC field.)

### `Stop` — OBSERVED (live, `claude --print`)
```json
{"hook_event_name":"Stop","session_id":"10ace7be-6c6c-4081-aa17-7eaac5cc42f5","cwd":"/Users/stayman/Personal/projects/claudesk/src-tauri"}
```
(Same `session_id` as the matching `UserPromptSubmit`. No `prompt`/`message`.)

### `Notification` — INFERENCE-GRADE (documented reference + offline-verified, NOT live-captured)
Expected shape (carries a `message` field), proven parseable by our hook+parser with a
representative payload:
```json
{"hook_event_name":"Notification","session_id":"…","cwd":"…","message":"Claude needs your permission"}
```
**Source of this shape:** `_ref/claude-customization/tools/claude-time/hook.pl` lines 88–94 —
a first-hand working tap that reads `$payload->{message}` for `Notification` (truncating to 200
chars). Our offline test piped exactly this shape through `hook_socket_probe.pl` →
`hook_socket_probe.rs` and it parsed cleanly (`message` populated, `cwd`+`session_id` present).
**Why not live-captured:** `Notification` does not fire in headless `--print` mode, and triggering
it via an `expect`-driven interactive TUI was timing-flaky (the CC raw-mode TUI + `expect` send
timing only reliably produced `UserPromptSubmit` in the windows tried; same fragility the WP2 probe
documented re CR-vs-LF). This is the one residual observation gap — SURFACED for live confirmation
during WP2/WP6 interactive testing (cheap once Claudesk is driving a real interactive session).

## Coexistence with `claude-time` — PROVEN

A single real `claude --print` run with BOTH hooks registered produced, from one event stream:
- **our socket** captured `UserPromptSubmit` + `Stop`, and
- **claude-time's (scratch) DB** captured the full lifecycle `SessionStart / UserPromptSubmit /
  Stop / SessionEnd`.

Both hooks ran on every shared event; neither errored; CC's output ("pong" / "ack") was produced
normally and CC exited 0. The real `~/.claude/settings.json` already carries the multi-entry array
shape this relies on — its `Notification` event has TWO independent matcher-group entries
(`notify-telegram.sh` + `claude-time-hook.pl`) firing today, so the additive-array model is not
just possible but already in production use on this machine. WP2's registration is therefore an
array MERGE (append a Claudesk entry), never an overwrite.

### Working `settings.json` array shape (per event)
```json
"UserPromptSubmit": [
  { "hooks": [
      { "type": "command", "command": "<claude-time hook.pl>" },
      { "type": "command", "command": "<claudesk hook>" }
  ] }
]
```
Two `command` entries can live in one matcher group's `hooks` array; alternatively each can be its
own matcher-group object in the event's top-level array (the real config uses both forms). Either
is additive. WP2 should append a NEW matcher-group object keyed/detectable by a stable Claudesk
marker (the script path) so install is idempotent and uninstall removes only our entry.

## Latency — sub-perceptible

| Scenario | 20-call total | per-call avg |
|---|---|---|
| Listener up (connect + write + exit) | 312 ms | **~15.6 ms** |
| No listener (Claudesk down) | 259 ms | ~12.9 ms |

Dominated by Perl interpreter cold-start (matches `hook.pl`'s documented ~15 ms ceiling); the
socket connect+write adds only ~3 ms. **With no listener the hook still `exit 0`** — a down
Claudesk never blocks or breaks CC. Sub-perceptible against a human-interactive turn.

## Decisions for WP2 / WP3

1. **GO on the socket wire.** `AF_UNIX` `SOCK_STREAM` + newline-delimited JSON is confirmed
   end-to-end. No need for a named pipe or any other IPC.
2. **Listener design: blocking `std::os::unix::net::UnixListener` on a dedicated thread — NOT
   `tokio`.** Rationale: the receive path is trivial (accept → `BufReader::lines()` → `serde` parse
   → channel-send), the event rate is human-interactive (a handful/sec at most across all
   workspaces), and the probe's blocking listener handled real `claude` traffic with zero tuning.
   Adding a `tokio` runtime to the Tauri core just for this socket would be unjustified weight.
   WP3 binds on launch, runs the accept-loop on a dedicated `std::thread`, and delivers parsed
   `HookEvent`s into the core via an `mpsc` channel (the seam WP4's broadcaster consumes). Keep the
   parse function pure/separate from the IO loop (testable over the verbatim payloads above).
3. **Hook script language: Perl** (`/usr/bin/perl`, bundled on macOS), reusing the `hook.pl`
   pattern. ~15 ms is fine; a POSIX-sh + `nc` variant would need `nc -U` (BSD nc on macOS supports
   `-U`) but Perl's `IO::Socket::UNIX` is cleaner and already proven here. WP2 decides final, but
   Perl is the recommended default.
4. **`HookEvent` serde struct** (WP3): `{ hook_event_name: String, session_id: String, cwd: String,
   prompt: Option<String>, message: Option<String> }`, all `#[serde(default)]`-tolerant. The hook's
   `sent_ms` is optional telemetry — model it as `Option<u128>` or drop it; not load-bearing for
   state. Skip-and-continue on a parse error (never panic the accept-loop) — verified in the probe.
5. **State mapping (WP4) is unblocked:** `UserPromptSubmit` → Running, `Stop` → Idle, `Notification`
   → AwaitingInput. `cwd` reliably identifies the project dir on every observed event, so the
   cwd→workspace mapping (WP4) has a dependable key (canonicalize per the M2 WP11 path-keying
   lesson). `session_id` is a stable per-session UUID consistent across an event pair — usable as a
   secondary key if cwd collisions ever matter.
6. **Bonus context:** claude-time also emits `SessionStart` / `SessionEnd`. Not needed for the
   idle/running/awaiting state machine, but available if WP4+ ever wants explicit session
   open/close signals instead of inferring from first/last event.

## Residual unknown (one, low-risk)

- **Live `Notification` payload not first-hand observed** (inference-grade via the claude-time
  reference + our offline parse test). Risk is low — the field (`message`) is documented by a
  working hook and parses cleanly — but it should be confirmed live during WP2/WP6 interactive
  testing. SURFACED to backlog.
