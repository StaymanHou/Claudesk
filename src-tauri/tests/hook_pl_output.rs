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
use std::process::{Command, Stdio};
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

    let mut child = Command::new("perl")
        .arg(hook_path())
        .env("CLAUDESK_HOOK_SOCK", &sock_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .expect("spawn perl hook");
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
            assert!(
                !s.contains("SECRET"),
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
    let payload = r#"{"hook_event_name":"SessionStart","session_id":"s","cwd":"/p","source":"startup"}"#;
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
