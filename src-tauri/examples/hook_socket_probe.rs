// WP1 probe harness — CC hook → Claudesk-owned AF_UNIX socket → parse wire.
//
// Usage (run from src-tauri/):
//   cargo run --example hook_socket_probe                 # listen at $TMPDIR/claudesk-hook-probe.sock
//   cargo run --example hook_socket_probe -- /path/x.sock # listen at an explicit socket path
//
// Pairs with examples/hook_socket_probe.pl (the hook script) registered via a
// `claude --settings <scratch.json>` layer (never the real ~/.claude/settings.json).
// This binary binds an AF_UNIX SocketListener,
// accepts the stream of newline-delimited JSON lines a CC hook writes, parses each
// to a typed HookEvent (serde), and prints a verbatim field dump + a per-line
// receive timestamp so we can eyeball latency and confirm cwd/session_id presence.
//
// Probe deliverable, not production code. The real listener lands in WP3.

use serde::Deserialize;
use std::io::{BufRead, BufReader};
use std::os::unix::net::UnixListener;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

// The three M3 events all carry these; `prompt`/`message` are event-specific and
// optional. `#[serde(default)]` tolerates their absence so one struct parses all.
#[derive(Debug, Deserialize)]
struct HookEvent {
    #[serde(default)]
    hook_event_name: String,
    #[serde(default)]
    session_id: String,
    #[serde(default)]
    cwd: String,
    #[serde(default)]
    prompt: Option<String>,
    #[serde(default)]
    message: Option<String>,
    // Capture anything else the wire carries that we didn't model, so the probe
    // surfaces contract surprises instead of silently dropping them.
    #[serde(flatten)]
    extra: serde_json::Map<String, serde_json::Value>,
}

fn now_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let sock_path = std::env::args()
        .nth(1)
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            let mut p = std::env::temp_dir();
            p.push("claudesk-hook-probe.sock");
            p
        });

    // Remove a stale socket file from a prior run (bind fails on EADDRINUSE otherwise).
    let _ = std::fs::remove_file(&sock_path);

    let listener = UnixListener::bind(&sock_path)?;
    eprintln!("[probe] listening at {}", sock_path.display());
    eprintln!("[probe] point the hook script at this path; Ctrl-C to stop.");

    let mut line_no: u64 = 0;
    for conn in listener.incoming() {
        let stream = match conn {
            Ok(s) => s,
            Err(e) => {
                eprintln!("[probe] accept error: {e}");
                continue;
            }
        };
        let reader = BufReader::new(stream);
        for line in reader.lines() {
            let recv_ms = now_ms();
            let raw = match line {
                Ok(l) => l,
                Err(e) => {
                    eprintln!("[probe] read error: {e}");
                    continue;
                }
            };
            if raw.trim().is_empty() {
                continue;
            }
            line_no += 1;
            println!("\n=== line #{line_no} @ {recv_ms} ms ===");
            println!("[raw] {raw}");
            match serde_json::from_str::<HookEvent>(&raw) {
                Ok(ev) => {
                    println!(
                        "[parsed] event={:?} session_id={:?} cwd={:?}",
                        ev.hook_event_name, ev.session_id, ev.cwd
                    );
                    if let Some(p) = &ev.prompt {
                        println!("[parsed] prompt.len={} prompt={:?}", p.len(), p);
                    }
                    if let Some(m) = &ev.message {
                        println!("[parsed] message={:?}", m);
                    }
                    if !ev.extra.is_empty() {
                        println!("[parsed] EXTRA (unmodeled) fields: {:?}", ev.extra);
                    }
                    let cwd_ok = !ev.cwd.is_empty();
                    let sid_ok = !ev.session_id.is_empty();
                    println!("[check] cwd_present={cwd_ok} session_id_present={sid_ok}");
                }
                Err(e) => {
                    println!("[parse-error] {e} (skip-and-continue; never panic the loop)");
                }
            }
        }
    }
    Ok(())
}
