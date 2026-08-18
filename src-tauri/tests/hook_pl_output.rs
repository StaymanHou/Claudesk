//! End-to-end behavioral tests for `resources/claudesk-hook.pl` (M9 WP2).
//!
//! The unit tests in `hook_socket::tests` prove the Rust *parser* accepts the wire
//! shape; these prove the Perl *producer* actually emits it. They drive the real
//! hook script as a subprocess — the way Claude Code invokes it (event JSON on
//! stdin, `CLAUDESK_HOOK_SOCK` in the env) — and assert the JSON line it writes to
//! the socket. This codifies the M9 WP2 field-extraction + the **privacy invariant**
//! (prompt LENGTH only, never the prompt text) as a regression guard: verify-self
//! confirmed these via a one-off `perl -c` + grep, but nothing ran the hook until now.
//!
//! Why an integration test (not a `#[cfg(test)]` unit test): the behavior under test
//! is a separate process reading stdin and writing a socket — only reachable
//! end-to-end. Mirrors claude-time's `test/test_hook.sh`, ported to Rust so it runs
//! under the project's `cargo test` with no new harness. Skips cleanly if `perl` is
//! absent (it is bundled on macOS, the only supported platform).

use std::io::{BufRead, BufReader, Write};
use std::os::unix::net::UnixListener;
use std::path::PathBuf;
use std::process::{Command, ExitStatus, Stdio};
use std::thread;

/// Absolute path to the deployed hook script in the repo.
fn hook_path() -> PathBuf {
    // CARGO_MANIFEST_DIR = <repo>/src-tauri
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources/claudesk-hook.pl")
}

fn perl_available() -> bool {
    Command::new("perl")
        .arg("--version")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

/// Run the hook with `payload` on stdin and `CLAUDESK_HOOK_SOCK` pointed at a
/// freshly-bound temp socket; return the single JSON line the hook wrote (or `None`
/// if it wrote nothing — e.g. the no-op paths). The listener accepts one connection
/// on a background thread and reads the first line.
fn run_hook_capture_line(payload: &str) -> Option<String> {
    run_hook_capture_line_with_mode(payload, None)
}

/// [`run_hook_capture_line`] with control of `CLAUDESK_DRIVE_MODE` (M12 WP4b), so the
/// telemetry line can be asserted **with the signal active** — proving the two concerns
/// are independent in the socket direction too, not just the stdout one.
///
/// ⚠️ `None` REMOVES the var. Claudesk sets it on its own CC spawns, so a test run from
/// inside a Claudesk workspace would otherwise inherit it and assert against a different
/// arm than the one it names.
fn run_hook_capture_line_with_mode(payload: &str, drive_mode: Option<&str>) -> Option<String> {
    let dir = tempfile::TempDir::new().unwrap();
    let sock_path = dir.path().join("hook.sock");
    let listener = UnixListener::bind(&sock_path).unwrap();

    // Accept + read one line on a background thread so the hook's blocking write
    // returns. The hook connects, writes one line, closes.
    let reader = thread::spawn(move || {
        // One connection expected. A short accept timeout via nonblocking would
        // complicate this; instead the caller only invokes with payloads that DO
        // connect, and the test's overall wall-clock is bounded by the join below.
        if let Ok((stream, _)) = listener.accept() {
            let mut br = BufReader::new(stream);
            let mut line = String::new();
            if br.read_line(&mut line).unwrap_or(0) > 0 {
                return Some(line.trim_end().to_string());
            }
        }
        None
    });

    let mut cmd = Command::new("perl");
    cmd.arg(hook_path())
        .env("CLAUDESK_HOOK_SOCK", &sock_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    match drive_mode {
        Some(m) => {
            cmd.env("CLAUDESK_DRIVE_MODE", m);
        }
        None => {
            cmd.env_remove("CLAUDESK_DRIVE_MODE");
        }
    }
    let mut child = cmd.spawn().expect("spawn perl hook");
    child
        .stdin
        .take()
        .unwrap()
        .write_all(payload.as_bytes())
        .unwrap();
    let status = child.wait().expect("hook exits");
    // The hook MUST always exit 0 (never block CC), regardless of socket state.
    assert!(status.success(), "hook must exit 0 unconditionally");

    // The hook connects + writes synchronously before we `wait()` above, so the
    // reader thread has its line by now and the join returns promptly.
    reader.join().unwrap_or(None)
}

/// Parse a captured JSON line into a serde_json::Value for field assertions.
fn as_json(line: &str) -> serde_json::Value {
    serde_json::from_str(line).expect("hook must emit valid JSON")
}

/// Run the hook with `payload` on stdin and **no listening socket**, capturing its
/// exit status and stdout. Returns `(ExitStatus, stdout_bytes)`.
///
/// ## Why this helper exists alongside [`run_hook_capture_line`] (M12 WP4a)
/// `run_hook_capture_line` asserts the never-block-CC exit-0 contract at line 80 —
/// but it can only be called with a payload that **successfully connects to a
/// socket**, because its reader thread blocks on `accept()`. So the exit-0 assertion
/// was reachable on the **happy path only**: the abuse arms that actually threaten
/// the contract (no socket, malformed JSON, empty stdin) could never reach it, since
/// that helper would hang waiting for a connection the hook never makes.
///
/// This helper closes that gap by never binding a socket and never accepting, so the
/// degraded paths are drivable. It also captures **stdout**, which nothing previously
/// asserted — relevant now because M12 WP4b will make this script emit a
/// `UserPromptSubmit` `additionalContext` line on stdout, and a malformed emission
/// must never reach CC as partial JSON.
fn run_hook_degraded(payload: &str, sock_env: Option<&str>) -> (ExitStatus, Vec<u8>) {
    run_hook_env(payload, sock_env, None)
}

/// [`run_hook_degraded`] plus control of `CLAUDESK_DRIVE_MODE` (M12 WP4b).
///
/// ⚠️ **Both vars are REMOVED, not set-empty, when `None`.** The script distinguishes
/// absent from empty for the socket var, and the drive-mode allowlist treats them alike
/// only by construction — a test that set `CLAUDESK_DRIVE_MODE=""` would exercise a
/// different arm than a plain-CLI user's genuinely-absent var. Removing also stops an
/// ambient export in the developer's own shell from silently changing what these assert
/// — and since Claudesk itself sets this var on CC spawns, an agent running these tests
/// from inside a Claudesk workspace **has it exported**. Inheriting it would make the
/// inert-arm tests pass for the wrong reason.
fn run_hook_env(
    payload: &str,
    sock_env: Option<&str>,
    drive_mode: Option<&str>,
) -> (ExitStatus, Vec<u8>) {
    let mut cmd = Command::new("perl");
    cmd.arg(hook_path())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    match sock_env {
        Some(p) => {
            cmd.env("CLAUDESK_HOOK_SOCK", p);
        }
        // Deliberately REMOVE the var rather than setting it empty — the script's
        // early exit distinguishes these, and the test inherits the ambient
        // environment otherwise (a developer with the var exported would silently
        // change what this test exercises).
        None => {
            cmd.env_remove("CLAUDESK_HOOK_SOCK");
        }
    }
    match drive_mode {
        Some(m) => {
            cmd.env("CLAUDESK_DRIVE_MODE", m);
        }
        None => {
            cmd.env_remove("CLAUDESK_DRIVE_MODE");
        }
    }
    let mut child = cmd.spawn().expect("spawn perl hook");
    child
        .stdin
        .take()
        .unwrap()
        .write_all(payload.as_bytes())
        .unwrap();
    let out = child.wait_with_output().expect("hook exits");
    // ⚠️ Returns the full `ExitStatus`, not a bare `bool` — changed at code review. The
    // failure this helper exists to catch is "exits **255** with a Perl error", and a bool
    // discards exactly the number that makes the assertion message actionable.
    (out.status, out.stdout)
}

/// The never-block-CC contract on the DEGRADED paths — the ones that actually
/// threaten it. Each arm must exit 0 and emit no partial JSON on stdout.
///
/// ⚠️ **M12 WP4a measured that this property rests on ONE construct: the `eval {}` at
/// `claudesk-hook.pl:58` that wraps `decode_json`.** Remove it and malformed stdin exits
/// **2** with a Perl error on stderr — a wedged CC turn. **There is no second guard
/// behind it**: the script's only other `eval`s are `:120` (socket open) and `:138` (the
/// write-failure log), neither of which wraps the decode. Do not "simplify" `:58` away.
///
/// ⚠️ **This comment previously claimed the opposite** — that an "outer guard" made `:58`
/// redundant. That was the finding from WP4a's *scratchpad fixture*, which really did wrap
/// its whole signal block in an outer `eval`; it was pasted onto the real script, where it
/// is false and inverted. Corrected at code review. The mutation this test was built from
/// says it plainly: removing `:58` alone makes **this test fail**.
#[test]
fn never_blocks_cc_on_degraded_inputs() {
    if !perl_available() {
        return;
    }
    let valid =
        r#"{"hook_event_name":"UserPromptSubmit","session_id":"s","cwd":"/p","prompt":"hi"}"#;
    let cases: [(&str, &str, Option<&str>); 6] = [
        ("socket var absent", valid, None),
        (
            "socket path does not exist",
            valid,
            Some("/nonexistent/nope.sock"),
        ),
        ("empty stdin", "", None),
        (
            "truncated JSON",
            r#"{"hook_event_name":"UserPrompt"#,
            Some("/nonexistent/nope.sock"),
        ),
        (
            "non-JSON garbage",
            "}}not json{{",
            Some("/nonexistent/nope.sock"),
        ),
        // A JSON array parses fine but is not the HASH the script requires — the
        // `ref($payload) eq 'HASH'` guard is what handles it.
        (
            "JSON array not object",
            "[1,2,3]",
            Some("/nonexistent/nope.sock"),
        ),
    ];
    for (label, payload, sock) in cases {
        let (status, stdout) = run_hook_degraded(payload, sock);
        assert!(
            status.success(),
            "hook must exit 0 on degraded input ({label}) — got {:?}. A non-zero exit here \
             wedges the user's CC turn; see this test's doc comment for the one guard that \
             prevents it.",
            status.code()
        );
        // stdout must be either empty or ONE complete valid JSON object — never a
        // partial fragment. Today the script writes nothing to stdout at all; WP4b
        // adds the drive-mode emission, and this assertion is what keeps a malformed
        // emission from reaching CC.
        if !stdout.is_empty() {
            serde_json::from_slice::<serde_json::Value>(&stdout).unwrap_or_else(|e| {
                panic!("stdout must be valid JSON if non-empty ({label}): {e}")
            });
        }
    }
}

/// `Notification` forwards `notification_type` — the field the broadcaster gates
/// AwaitingInput on (QoL-WP2). Previously uncovered: a regression here would silently
/// turn an informational `idle_prompt` nudge into a blue awaiting-input dot, or drop a
/// genuine `permission_prompt`, with no failing test.
#[test]
fn notification_forwards_notification_type() {
    if !perl_available() {
        return;
    }
    let payload = r#"{"hook_event_name":"Notification","session_id":"s","cwd":"/p","message":"m","notification_type":"permission_prompt"}"#;
    let v = as_json(&run_hook_capture_line(payload).expect("line"));
    assert_eq!(v["notification_type"].as_str(), Some("permission_prompt"));
    assert_eq!(v["message"].as_str(), Some("m"));
}

#[test]
fn user_prompt_submit_emits_length_not_text() {
    if !perl_available() {
        eprintln!("perl not available — skipping hook output test");
        return;
    }
    let secret = "SUPER SECRET PROMPT that must never appear in a time-analytics field";
    let payload = format!(
        r#"{{"hook_event_name":"UserPromptSubmit","session_id":"s","cwd":"/p","prompt":"{secret}"}}"#
    );
    let line = run_hook_capture_line(&payload).expect("hook writes a line");
    let v = as_json(&line);

    // The M9 WP2 privacy invariant: prompt_length_chars carries the LENGTH...
    assert_eq!(
        v["prompt_length_chars"].as_u64(),
        Some(secret.chars().count() as u64),
        "prompt_length_chars must equal the prompt's char length"
    );
    // ...and the raw prompt text appears ONLY in the status snippet field `prompt`
    // (pre-existing/allowed), NEVER duplicated into a time-analytics field. Assert no
    // OTHER field carries the secret text.
    assert_eq!(
        v["prompt"].as_str(),
        Some(secret),
        "prompt (status snippet) still forwarded verbatim"
    );
    for (key, val) in v.as_object().unwrap() {
        if key == "prompt" {
            continue; // the one allowed carrier (status snippet)
        }
        if let Some(s) = val.as_str() {
            // Compare against the ACTUAL prompt value, not a coincidental literal substring
            // ("SECRET") — a real prompt need not contain that word, and keying on it would let
            // a leak of a differently-worded prompt slip past (the privacy check must hold for
            // ANY prompt text, not just this fixture's).
            assert!(
                !s.contains(secret),
                "field {key} must not contain the prompt text (privacy leak)"
            );
        }
    }
}

#[test]
fn pre_tool_use_emits_tool_name_and_id() {
    if !perl_available() {
        return;
    }
    let payload = r#"{"hook_event_name":"PreToolUse","session_id":"s","cwd":"/p","tool_name":"Edit","tool_use_id":"tu_42"}"#;
    let v = as_json(&run_hook_capture_line(payload).expect("line"));
    assert_eq!(v["hook_event_name"].as_str(), Some("PreToolUse"));
    assert_eq!(v["tool_name"].as_str(), Some("Edit"));
    assert_eq!(v["tool_use_id"].as_str(), Some("tu_42"));
    // Not a UserPromptSubmit → no prompt_length_chars.
    assert!(v.get("prompt_length_chars").is_none());
}

#[test]
fn subagent_start_maps_subagent_type_to_agent_type() {
    if !perl_available() {
        return;
    }
    // CC sends `subagent_type`; the hook forwards it as `agent_type`.
    let payload = r#"{"hook_event_name":"SubagentStart","session_id":"s","cwd":"/p","subagent_type":"Explore"}"#;
    let v = as_json(&run_hook_capture_line(payload).expect("line"));
    assert_eq!(v["hook_event_name"].as_str(), Some("SubagentStart"));
    assert_eq!(
        v["agent_type"].as_str(),
        Some("Explore"),
        "subagent_type must be forwarded as agent_type"
    );
    // The source field (CC's key) must NOT be echoed under its own name.
    assert!(v.get("subagent_type").is_none());
}

#[test]
fn session_start_emits_source() {
    if !perl_available() {
        return;
    }
    let payload =
        r#"{"hook_event_name":"SessionStart","session_id":"s","cwd":"/p","source":"startup"}"#;
    let v = as_json(&run_hook_capture_line(payload).expect("line"));
    assert_eq!(v["hook_event_name"].as_str(), Some("SessionStart"));
    assert_eq!(v["source"].as_str(), Some("startup"));
}

#[test]
fn session_end_emits_reason() {
    // M9 WP6.5: the hook forwards SessionEnd's `reason` (prompt_input_exit / other) so the
    // session-end model can honor SessionEnd as an authoritative end (reason persisted for
    // debugging). Mirrors session_start_emits_source.
    if !perl_available() {
        return;
    }
    let payload = r#"{"hook_event_name":"SessionEnd","session_id":"s","cwd":"/p","reason":"prompt_input_exit"}"#;
    let v = as_json(&run_hook_capture_line(payload).expect("line"));
    assert_eq!(v["hook_event_name"].as_str(), Some("SessionEnd"));
    assert_eq!(v["reason"].as_str(), Some("prompt_input_exit"));
}

#[test]
fn status_event_shape_is_unchanged() {
    if !perl_available() {
        return;
    }
    // A plain Stop must emit exactly the M3 status fields + timestamp, and NONE of
    // the M9 time-analytics fields (they're event-specific and absent here). This is
    // the "status path unchanged" invariant at the hook-output level.
    let payload = r#"{"hook_event_name":"Stop","session_id":"s10","cwd":"/proj"}"#;
    let v = as_json(&run_hook_capture_line(payload).expect("line"));
    assert_eq!(v["hook_event_name"].as_str(), Some("Stop"));
    assert_eq!(v["session_id"].as_str(), Some("s10"));
    assert_eq!(v["cwd"].as_str(), Some("/proj"));
    assert!(v["timestamp"].is_number(), "timestamp always present");
    for absent in [
        "prompt_length_chars",
        "tool_use_id",
        "tool_name",
        "agent_type",
        "source",
        "prompt",
        "message",
    ] {
        assert!(
            v.get(absent).is_none(),
            "Stop must not carry {absent} (event-specific field)"
        );
    }
}

// ===========================================================================
// M12 WP4b Phase 3 — the drive-mode signal on stdout.
//
// The script gained a SECOND, independent concern: telemetry still goes OUT to the
// socket, and a `UserPromptSubmit` `additionalContext` line now comes back on stdout
// so the real `/session-restore` can skip its mode menu. The hook channel is
// BIDIRECTIONAL as of M12 — `arch.md`'s "one-directional CC→Claudesk" describes the
// pre-M12 shape (corrected in WP4d.3).
// ===========================================================================

/// The exact sentence from WP4a Verdict (d), operator-approved. Transcribed here as a
/// literal rather than built from a format string shared with the script, so a drift in
/// either one shows up as a test failure instead of two mirrors agreeing with each other.
///
/// ⚠️ **This duplication is DELIBERATE and must not be "deduplicated"** (filed as a violation
/// of the repo's rationale-duplication rule 2026-08-18 and refuted at paydown WP3). Sharing the
/// literal with the script is precisely what would destroy this test's only value: the two
/// copies existing independently is the mechanism that detects the script drifting. It is the
/// same independent-transcription discipline `config_store::DriveMode`'s wire strings use —
/// transcribed from `transitions.md` rather than round-tripped through our own serializer,
/// which would prove symmetry rather than correctness. **The duplication rule governs
/// RATIONALE PROSE, not a test's independently-transcribed expected value.**
fn expected_context(mode: &str) -> String {
    format!("Claudesk reports the drive mode for this workspace as {mode}.")
}

/// Parse the hook's stdout as the `hookSpecificOutput` envelope, asserting the nesting.
fn signal_context(stdout: &[u8]) -> Option<String> {
    let text = String::from_utf8(stdout.to_vec()).expect("stdout is utf-8");
    if text.trim().is_empty() {
        return None;
    }
    let v: serde_json::Value = serde_json::from_str(text.trim()).unwrap_or_else(|e| {
        panic!("stdout must be valid JSON or byte-empty — got {text:?} ({e})");
    });
    // ⚠️ `additionalContext` MUST nest under `hookSpecificOutput` WITH `hookEventName`.
    // A top-level `additionalContext` is REJECTED by CC at runtime (proven live, WP4a),
    // so a regression that flattened this would be silently inert in production while
    // still "emitting something" — which is why the nesting is asserted, not just the text.
    assert_eq!(
        v["hookSpecificOutput"]["hookEventName"].as_str(),
        Some("UserPromptSubmit"),
        "additionalContext must nest under hookSpecificOutput alongside hookEventName"
    );
    assert!(
        v.get("additionalContext").is_none(),
        "additionalContext must NOT also appear at top level (rejected at runtime)"
    );
    Some(
        v["hookSpecificOutput"]["additionalContext"]
            .as_str()
            .expect("additionalContext is a string")
            .to_string(),
    )
}

const UPS_PAYLOAD: &str =
    r#"{"hook_event_name":"UserPromptSubmit","session_id":"s","cwd":"/p","prompt":"hi"}"#;

#[test]
fn emits_the_drive_mode_signal_for_every_known_mode() {
    if !perl_available() {
        return;
    }
    // All four `transitions.md:165` wire values. ⚠️ Two of these (`stepping`, `fsd`) are
    // NOT what `DriveMode` serialized to before WP4b Phase 1 — building on the old values
    // would have shipped a silent no-op for modes 1 and 4.
    for mode in ["stepping", "orchestrated", "autopilot", "fsd"] {
        let (status, stdout) = run_hook_env(UPS_PAYLOAD, None, Some(mode));
        assert!(status.success(), "hook must exit 0 for mode {mode}");
        assert_eq!(
            signal_context(&stdout),
            Some(expected_context(mode)),
            "mode {mode} must emit its own wire value in the sentence"
        );
    }
}

#[test]
fn emits_when_the_socket_var_is_absent() {
    if !perl_available() {
        return;
    }
    // ⚠️ THE CONSTRAINT-3 REGRESSION TEST. The signal and the telemetry are INDEPENDENT:
    // before WP4b the script did `exit 0 if $sock_path eq ''` ABOVE the stdin drain, so an
    // emission appended below it would be dead whenever Claudesk is not listening. Moving
    // that early exit back up is an easy "tidy-up" that this test is the only thing
    // standing against — and it would present as "the signal silently stopped working",
    // never as a crash.
    let (status, stdout) = run_hook_env(UPS_PAYLOAD, None, Some("autopilot"));
    assert!(status.success());
    assert_eq!(
        signal_context(&stdout),
        Some(expected_context("autopilot")),
        "the signal must NOT depend on CLAUDESK_HOOK_SOCK being set"
    );

    // Same with the socket var set but pointing at nothing that listens (Claudesk down).
    let (status, stdout) = run_hook_env(UPS_PAYLOAD, Some("/nonexistent/nope.sock"), Some("fsd"));
    assert!(status.success());
    assert_eq!(signal_context(&stdout), Some(expected_context("fsd")));
}

#[test]
fn an_unknown_or_absent_mode_emits_nothing_never_a_default() {
    if !perl_available() {
        return;
    }
    // ⚠️ "Present and non-empty" would admit every one of these. The allowlist is an
    // EXACT match on four literals, so anything else is byte-empty — never a line naming
    // a default. There is no coherent upstream default to copy: `session-restore`
    // contradicts ITSELF (SKILL.md:42 orchestrated vs :59 labelling autopilot "(default)"),
    // so any default here would be Claudesk inventing workflow policy.
    let cases: [(&str, Option<&str>); 9] = [
        ("var absent entirely", None),
        ("empty string", Some("")),
        // The pre-WP4b WRONG serde values — the exact strings a partial revert produces.
        ("old wire value full-autopilot", Some("full-autopilot")),
        ("old wire value step-by-step", Some("step-by-step")),
        ("unknown word", Some("banana")),
        ("wrong case", Some("AUTOPILOT")),
        ("trailing space", Some("autopilot ")),
        ("shell metacharacters", Some("; rm -rf /")),
        // A prefix/substring of a known mode must not match loosely.
        ("prefix of a known mode", Some("auto")),
    ];
    for (label, mode) in cases {
        let (status, stdout) = run_hook_env(UPS_PAYLOAD, None, mode);
        assert!(status.success(), "[{label}] must exit 0");
        assert!(
            stdout.is_empty(),
            "[{label}] must emit BYTE-EMPTY stdout, never a default — got {:?}",
            String::from_utf8_lossy(&stdout)
        );
    }
}

#[test]
fn only_user_prompt_submit_emits_the_signal() {
    if !perl_available() {
        return;
    }
    // The measured 1-of-10 blast radius. This script is registered for all 10 CLAUDESK_
    // EVENTS on both identities, so an emission that forgot to filter by event would put
    // the sentence into the model's context on every tool call — many times per turn.
    for event in [
        "Stop",
        "Notification",
        "PostToolUse",
        "PreToolUse",
        "PostToolUseFailure",
        "SubagentStart",
        "SubagentStop",
        "SessionStart",
        "SessionEnd",
    ] {
        let payload = format!(r#"{{"hook_event_name":"{event}","session_id":"s","cwd":"/p"}}"#);
        let (status, stdout) = run_hook_env(&payload, None, Some("autopilot"));
        assert!(status.success(), "[{event}] must exit 0");
        assert!(
            stdout.is_empty(),
            "[{event}] must be byte-silent on stdout — only UserPromptSubmit signals. Got {:?}",
            String::from_utf8_lossy(&stdout)
        );
    }
}

#[test]
fn the_signal_never_blocks_cc_on_degraded_input() {
    if !perl_available() {
        return;
    }
    // The never-block-CC contract, re-asserted with the drive-mode var SET — the arm the
    // pre-WP4b suite could not cover, since the var did not exist. A malformed emission
    // must never reach CC as partial JSON, and a decode failure must still exit 0.
    for (label, payload) in [
        ("empty stdin", ""),
        ("truncated JSON", r#"{"hook_event_name":"UserPrompt"#),
        ("non-JSON garbage", "not json at all"),
        ("JSON array, not object", "[]"),
        ("JSON null", "null"),
        (
            "event name missing",
            r#"{"session_id":"s","cwd":"/p","prompt":"hi"}"#,
        ),
    ] {
        let (status, stdout) = run_hook_env(payload, None, Some("autopilot"));
        assert!(
            status.success(),
            "[{label}] must exit 0 even with the drive-mode var set — got {status:?}"
        );
        assert!(
            stdout.is_empty(),
            "[{label}] must emit no partial JSON — got {:?}",
            String::from_utf8_lossy(&stdout)
        );
    }
}

#[test]
fn telemetry_is_unchanged_by_the_signal() {
    if !perl_available() {
        return;
    }
    // ⚠️ The two concerns must be INDEPENDENT in both directions. The tests above prove a
    // dead socket does not suppress the signal; this proves the signal does not disturb
    // the telemetry line — including the M9 privacy invariant (prompt LENGTH only).
    // Asserted with the var SET, which no pre-WP4b test could do.
    let line = run_hook_capture_line_with_mode(
        r#"{"hook_event_name":"UserPromptSubmit","session_id":"s7","cwd":"/proj","prompt":"hello"}"#,
        Some("autopilot"),
    )
    .expect("telemetry line still written");
    let v = as_json(&line);
    assert_eq!(v["hook_event_name"].as_str(), Some("UserPromptSubmit"));
    assert_eq!(v["session_id"].as_str(), Some("s7"));
    assert_eq!(v["cwd"].as_str(), Some("/proj"));
    assert_eq!(v["prompt_length_chars"].as_i64(), Some(5));
    // PRIVACY: the telemetry line must not gain the drive mode, and must not start
    // carrying prompt text just because a second concern now reads the same payload.
    assert!(
        v.get("drive_mode").is_none() && v.get("CLAUDESK_DRIVE_MODE").is_none(),
        "the drive mode is a SIGNAL to CC, not telemetry to Claudesk: {v}"
    );
}

/// P3.5 — the CONSUMING SURFACE's accepted shape, corroborated against the official docs.
///
/// ⚠️ **Why this is separate from the emission tests above.** Those prove the script emits
/// *well-formed JSON*. This proves it emits the **one shape Claude Code actually accepts** —
/// and the two are genuinely separable: WP4a measured live that a top-level
/// `additionalContext` emits perfectly well and is **rejected at runtime**. A synthetic
/// `perl` run cannot tell those apart, which is why the phase's other outcomes could all
/// pass on an inert implementation.
///
/// ⚠️ **AND MALFORMED STDOUT IS NOT MERELY IGNORED — IT CAN HARD-CRASH THE SESSION.**
/// Per Claude Code's hooks reference plus anthropics/claude-code#57483, a
/// `hookSpecificOutput` that is not an Object raises an unhandled `TypeError`
/// (`"additionalContext" in q.hookSpecificOutput`) that terminates the session and loses
/// in-flight work. So the never-block-CC invariant this repo already guards on **exit
/// codes** has a second, previously-unguarded axis: **stdout shape**. This test pins it.
///
/// The safety property, stated exactly: **stdout is ALWAYS either byte-empty, or exactly one
/// JSON object whose `hookSpecificOutput` is an object carrying the right `hookEventName`.**
/// There is no third outcome — which is what makes the allowlist load-bearing for crash
/// safety, not just for context hygiene: a value that would interpolate badly never reaches
/// `encode_json` at all.
#[test]
fn stdout_is_always_empty_or_exactly_one_cc_accepted_object() {
    if !perl_available() {
        return;
    }
    // Values chosen to attack the SHAPE, not just the allowlist: JSON-injection attempts,
    // embedded newlines (which would split one line into two), quotes, and a lone brace.
    let hostile = [
        "autopilot",
        "stepping",
        "orchestrated",
        "fsd",
        "",
        "banana",
        r#"{"injected":1}"#,
        r#""; DROP--"#,
        "a\nb",
        "tab\there",
        "{",
        r#"autopilot","additionalContext":"pwned"#,
    ];
    for mode in hostile {
        let (status, stdout) = run_hook_env(UPS_PAYLOAD, None, Some(mode));
        assert!(status.success(), "[{mode:?}] must exit 0");
        if stdout.is_empty() {
            continue; // byte-empty is always safe
        }
        let text = String::from_utf8(stdout).expect("stdout is utf-8");
        // Exactly ONE line — an embedded newline that split the emission would make CC
        // parse a fragment.
        assert_eq!(
            text.lines().count(),
            1,
            "[{mode:?}] stdout must be exactly one line, got {text:?}"
        );
        let v: serde_json::Value = serde_json::from_str(text.trim())
            .unwrap_or_else(|e| panic!("[{mode:?}] emitted MALFORMED JSON ({e}): {text:?}"));
        // ⚠️ `.is_object()` is the specific assertion issue #57483 is about — a
        // non-Object here is the hard-crash shape, not a cosmetic deviation.
        assert!(
            v["hookSpecificOutput"].is_object(),
            "[{mode:?}] hookSpecificOutput MUST be an object — a non-object raises an \
             unhandled TypeError in CC and terminates the session (claude-code#57483)"
        );
        assert_eq!(
            v["hookSpecificOutput"]["hookEventName"].as_str(),
            Some("UserPromptSubmit"),
            "[{mode:?}] hookEventName is required and must match the event exactly"
        );
        assert!(
            v["hookSpecificOutput"]["additionalContext"].is_string(),
            "[{mode:?}] additionalContext must be a string"
        );
        // Only the four allowlisted modes may reach here at all.
        assert!(
            ["autopilot", "stepping", "orchestrated", "fsd"].contains(&mode),
            "[{mode:?}] emitted output but is NOT an allowlisted mode — the allowlist is \
             what keeps hostile values away from encode_json"
        );
    }
}

/// The hook must be **silent on stderr** too — not just correct on stdout (M12 WP4b P4.1).
///
/// ⚠️ **Found by a mutant that produced NO test failure.** Deleting the `// ''` fallback on
/// `$ENV{CLAUDESK_DRIVE_MODE}` leaves stdout byte-empty and every other test green, because
/// inertness for an absent var actually comes from the `%KNOWN` allowlist (an undef key is
/// falsy), not from the fallback. What the fallback really prevents is a `use warnings`
/// diagnostic — *"Use of uninitialized value $mode in hash element"* — printed to **stderr**
/// on every single turn of every CC session with the gate off. That is the overwhelmingly
/// common case: one line of noise per prompt for every user who does not run the workflow
/// layer.
///
/// It was invisible because **every other helper in this file sets `.stderr(Stdio::null())`**,
/// so the suite structurally cannot see stderr. A defensive construct with no test defending
/// it is one "tidy-up" away from deletion — this is that test.
///
/// Not a never-block-CC violation (exit stays 0, stdout stays clean), so it is asserted
/// separately from `never_blocks_cc_on_degraded_inputs` rather than folded into it.
#[test]
fn the_hook_never_writes_to_stderr() {
    if !perl_available() {
        return;
    }
    let cases: [(&str, Option<&str>); 5] = [
        ("var absent — the gate-OFF path, i.e. most sessions", None),
        ("empty string", Some("")),
        ("unrecognized value", Some("banana")),
        ("allowlisted value", Some("autopilot")),
        ("old pre-WP4b wire value", Some("full-autopilot")),
    ];
    for (label, mode) in cases {
        let mut cmd = Command::new("perl");
        cmd.arg(hook_path())
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped()) // ⚠️ piped, NOT null — the whole point of this test
            .env_remove("CLAUDESK_HOOK_SOCK");
        match mode {
            Some(m) => {
                cmd.env("CLAUDESK_DRIVE_MODE", m);
            }
            None => {
                cmd.env_remove("CLAUDESK_DRIVE_MODE");
            }
        }
        let mut child = cmd.spawn().expect("spawn perl hook");
        child
            .stdin
            .take()
            .unwrap()
            .write_all(UPS_PAYLOAD.as_bytes())
            .unwrap();
        let out = child.wait_with_output().expect("hook exits");
        assert!(out.status.success(), "[{label}] must exit 0");
        assert!(
            out.stderr.is_empty(),
            "[{label}] the hook wrote to stderr: {:?}. Every CC turn invokes this script, so a \
             `use warnings` diagnostic here is one line of noise per prompt — most often for \
             users with the gate OFF, who get no benefit from this feature at all.",
            String::from_utf8_lossy(&out.stderr)
        );
    }
}
