---
name: PTY-byte-injection probes — mirror PTY output to stdout by default
description: Project-wide pattern for PTY probe harnesses in Claudesk (WP2, WP4, WP7, future workspace-process work). Reader thread must mirror PTY output to an observable surface by default; opt-out to silent byte-counting only when needed.
type: project
---

When writing a PTY probe harness or debug script that drives a subprocess via `portable-pty` (or any direct-PTY library), the reader thread that drains the master end MUST mirror captured bytes to an observable surface (stdout by default) — never silently byte-count.

**Why:** silent drain threads hide the symptoms that diagnose failures. In the WP2 follow-up debug cycle, `run_exit_via`'s silent byte-counting drain forced 90 minutes of blind hypothesis testing because the operator couldn't see what CC's TUI was doing in response to injected bytes. A 3-line change to `out.write_all(&buf[..n])` revealed the answer in 18 seconds.

**Pattern:**

```rust
let mut reader = master.try_clone_reader()?;
let drain = thread::spawn(move || {
    let mut buf = [0u8; 4096];
    let mut total = 0usize;
    let stdout = std::io::stdout();
    while let Ok(n) = reader.read(&mut buf) {
        if n == 0 { break; }
        total += n;
        let mut out = stdout.lock();
        let _ = out.write_all(&buf[..n]);  // <-- the load-bearing line
        let _ = out.flush();
    }
    total
});
```

**When to opt out:** only when the harness is invoked by automated verify-self assertions and producing the full byte stream would overwhelm the assertion log. In that case, write to a file path and grep the file. NEVER count-only.

**Applies to:** WP4 (thumbnail probe), WP7 (PtyCcSession debug harnesses), any future Claudesk subprocess probe.

**Reference:** `src-tauri/examples/cc_pty_probe.rs::run_exit_via` (post-revision shape) is the canonical example.
