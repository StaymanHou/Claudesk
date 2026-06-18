---
name: CC TUI requires CR (\r) not LF (\n) for slash commands
description: Raw-mode CC PTY interaction — /cmd byte-injection must end in \r (0x0d) to execute; \n only triggers autocomplete typeahead. Used by WP7 PtyCcSession trait.
type: project
---

CC's TUI runs in raw mode, so the terminal's normal CR→NL translation is disabled. The Enter key in raw mode is `\r` (CR, byte `0x0d`), not `\n` (LF, byte `0x0a`).

**Rule:** every slash-command byte-injection from Claudesk to a CC PTY MUST end in `\r`. Writing `/cmd\n` will only show CC's autocomplete dropdown — the command never runs. The autocomplete is a typeahead UI side-effect of typing.

**Examples (from `src-tauri/examples/cc_pty_probe.rs`, the WP2 probe harness):**

| Byte sequence               | Behavior                                                  |
| --------------------------- | --------------------------------------------------------- |
| `b"/help\n"`                | autocomplete dropdown appears; `/help` not executed       |
| `b"/help\r"`                | `/help` executes; CC prints keyboard shortcuts + doc link |
| `b"/exit\n"`                | typed as text; CC does not exit                           |
| `b"/exit\r"`                | clean exit code 0 within ~3s (cleanest WP7 shutdown path) |
| `&[0x04, 0x04]` (Ctrl+D x2) | clean exit code 0 (fallback)                              |

**WP7 implications:**

- `CcSession::send_slash_command(cmd)` writes `format!("{cmd}\r").as_bytes()` to the PTY.
- `CcSession::shutdown()` should prefer `/exit\r` over Ctrl+D x2 — one deterministic write, no grace window.
- Reference code shape: `src-tauri/examples/cc_pty_probe.rs::run_exit_via` with `&[b"/exit\r"]`.

**Backlog:** SURFACE-2026-06-16-CC-SLASH-COMMANDS-NEED-CR-NOT-LF (high priority, gates WP7).
