// WP2 probe harness — Claude Code under host-driven PTY byte-injection.
//
// Usage (run from src-tauri/):
//   cargo run --example cc_pty_probe                   # interactive (eyeball ANSI, auth, resize)
//   cargo run --example cc_pty_probe -- inject         # write `/help\n`, collect 5s, dump
//   cargo run --example cc_pty_probe -- ctrl-d         # send 0x04 once, await exit
//   cargo run --example cc_pty_probe -- ctrl-c         # send 0x03 once, await exit
//   cargo run --example cc_pty_probe -- ctrl-d-twice   # send 0x04 twice, await exit
//   cargo run --example cc_pty_probe -- ctrl-c-twice   # send 0x03 twice, await exit
//   cargo run --example cc_pty_probe -- slash-exit     # send "/exit\n", await exit
//   cargo run --example cc_pty_probe -- resize         # cycle resize, dump output
//
// Probe deliverable, not production code. portable-pty lives in [dev-dependencies] only.

use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::io::{Read, Write};
use std::sync::mpsc;
use std::thread;
use std::time::{Duration, Instant};

const CC_CMD: &str = "claude";
const CC_ARGS: &[&str] = &["--dangerously-skip-permissions"];

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mode = std::env::args()
        .nth(1)
        .unwrap_or_else(|| "interactive".to_string());
    match mode.as_str() {
        "interactive" => run_interactive(),
        "inject" => run_inject(),
        "ctrl-d" => run_exit_via(&[&[0x04]], "Ctrl+D"),
        "ctrl-c" => run_exit_via(&[&[0x03]], "Ctrl+C"),
        "ctrl-d-twice" => run_exit_via(&[&[0x04], &[0x04]], "Ctrl+D x2"),
        "ctrl-c-twice" => run_exit_via(&[&[0x03], &[0x03]], "Ctrl+C x2"),
        "slash-exit" => run_exit_via(&[b"/exit\n"], "/exit"),
        "resize" => run_resize(),
        other => {
            eprintln!("unknown mode: {other}");
            eprintln!(
                "modes: interactive | inject | ctrl-d | ctrl-c | ctrl-d-twice | ctrl-c-twice | slash-exit | resize"
            );
            std::process::exit(2);
        }
    }
}

type CcPty = (
    Box<dyn portable_pty::MasterPty + Send>,
    Box<dyn portable_pty::Child + Send + Sync>,
);

fn open_cc(size: PtySize) -> Result<CcPty, Box<dyn std::error::Error>> {
    let pty_system = native_pty_system();
    let pair = pty_system.openpty(size)?;
    let mut cmd = CommandBuilder::new(CC_CMD);
    for a in CC_ARGS {
        cmd.arg(a);
    }
    // Inherit cwd so claude lands in the same project context.
    if let Ok(cwd) = std::env::current_dir() {
        cmd.cwd(cwd);
    }
    let child = pair.slave.spawn_command(cmd)?;
    // Drop the slave handle now that the child owns it (per portable-pty docs).
    drop(pair.slave);
    Ok((pair.master, child))
}

fn run_interactive() -> Result<(), Box<dyn std::error::Error>> {
    let (master, mut child) = open_cc(PtySize {
        rows: 40,
        cols: 120,
        pixel_width: 0,
        pixel_height: 0,
    })?;

    // PTY -> stdout
    let mut reader = master.try_clone_reader()?;
    let pty_to_stdout = thread::spawn(move || {
        let mut buf = [0u8; 4096];
        let stdout = std::io::stdout();
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let mut out = stdout.lock();
                    let _ = out.write_all(&buf[..n]);
                    let _ = out.flush();
                }
                Err(_) => break,
            }
        }
    });

    // stdin -> PTY
    let mut writer = master.take_writer()?;
    let stdin_to_pty = thread::spawn(move || {
        let stdin = std::io::stdin();
        let mut buf = [0u8; 1024];
        loop {
            let mut handle = stdin.lock();
            match handle.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    if writer.write_all(&buf[..n]).is_err() {
                        break;
                    }
                    let _ = writer.flush();
                }
                Err(_) => break,
            }
        }
    });

    let status = child.wait()?;
    eprintln!("\n[probe] child exited: {status:?}");
    drop(pty_to_stdout);
    drop(stdin_to_pty);
    Ok(())
}

fn run_inject() -> Result<(), Box<dyn std::error::Error>> {
    let (master, mut child) = open_cc(PtySize {
        rows: 40,
        cols: 120,
        pixel_width: 0,
        pixel_height: 0,
    })?;

    // Capture output to a channel for a fixed window.
    let mut reader = master.try_clone_reader()?;
    let (tx, rx) = mpsc::channel::<Vec<u8>>();
    let _reader_thread = thread::spawn(move || {
        let mut buf = [0u8; 4096];
        while let Ok(n) = reader.read(&mut buf) {
            if n == 0 {
                break;
            }
            if tx.send(buf[..n].to_vec()).is_err() {
                break;
            }
        }
    });

    // Let CC settle, then inject /help.
    thread::sleep(Duration::from_millis(1500));
    let mut writer = master.take_writer()?;
    writer.write_all(b"/help\n")?;
    writer.flush()?;
    eprintln!("[probe] wrote /help\\n");

    // Collect for 5s.
    let deadline = Instant::now() + Duration::from_secs(5);
    let mut captured: Vec<u8> = Vec::new();
    while Instant::now() < deadline {
        let remaining = deadline.saturating_duration_since(Instant::now());
        match rx.recv_timeout(remaining) {
            Ok(chunk) => captured.extend_from_slice(&chunk),
            Err(mpsc::RecvTimeoutError::Timeout) => break,
            Err(mpsc::RecvTimeoutError::Disconnected) => break,
        }
    }

    eprintln!("[probe] captured {} bytes after inject", captured.len());
    // Print raw output so the human/agent can grep for the help marker.
    std::io::stdout().write_all(&captured)?;
    println!();

    // Clean up: CC requires Ctrl+D twice to exit (single Ctrl+D is ignored; finding from P1.5).
    let _ = writer.write_all(&[0x04]);
    let _ = writer.flush();
    thread::sleep(Duration::from_millis(300));
    let _ = writer.write_all(&[0x04]);
    let _ = writer.flush();
    drop(writer);
    let _ = child.wait();
    Ok(())
}

fn run_exit_via(keystrokes: &[&[u8]], label: &str) -> Result<(), Box<dyn std::error::Error>> {
    let (master, mut child) = open_cc(PtySize {
        rows: 24,
        cols: 80,
        pixel_width: 0,
        pixel_height: 0,
    })?;

    let mut reader = master.try_clone_reader()?;
    let drain = thread::spawn(move || {
        let mut buf = [0u8; 4096];
        let mut total = 0usize;
        while let Ok(n) = reader.read(&mut buf) {
            if n == 0 {
                break;
            }
            total += n;
        }
        total
    });

    // Let CC come up.
    thread::sleep(Duration::from_secs(2));
    let mut writer = master.take_writer()?;
    for (i, bytes) in keystrokes.iter().enumerate() {
        if i > 0 {
            thread::sleep(Duration::from_millis(500));
        }
        eprintln!(
            "[probe] sending exit keystroke #{} ({label}, {} bytes)",
            i + 1,
            bytes.len()
        );
        writer.write_all(bytes)?;
        writer.flush()?;
    }
    drop(writer);

    // Wait up to 5s for exit by polling try_wait.
    let deadline = Instant::now() + Duration::from_secs(5);
    let mut status_opt = None;
    while Instant::now() < deadline {
        match child.try_wait()? {
            Some(s) => {
                status_opt = Some(s);
                break;
            }
            None => thread::sleep(Duration::from_millis(100)),
        }
    }

    match status_opt {
        Some(s) => {
            eprintln!("[probe] child exited within 5s of {label}: {s:?}");
            let bytes = drain.join().unwrap_or(0);
            eprintln!("[probe] drained {bytes} bytes from PTY");
            Ok(())
        }
        None => {
            let _ = child.kill();
            let _ = child.wait();
            eprintln!("[probe] FAILED: child did not exit within 5s of {label} — killed");
            std::process::exit(1);
        }
    }
}

fn run_resize() -> Result<(), Box<dyn std::error::Error>> {
    let (master, mut child) = open_cc(PtySize {
        rows: 24,
        cols: 80,
        pixel_width: 0,
        pixel_height: 0,
    })?;

    let mut reader = master.try_clone_reader()?;
    let (tx, rx) = mpsc::channel::<Vec<u8>>();
    let _reader_thread = thread::spawn(move || {
        let mut buf = [0u8; 4096];
        while let Ok(n) = reader.read(&mut buf) {
            if n == 0 {
                break;
            }
            if tx.send(buf[..n].to_vec()).is_err() {
                break;
            }
        }
    });

    // Settle.
    thread::sleep(Duration::from_millis(1500));
    eprintln!("[probe] resize 24x80 -> 40x120");
    master.resize(PtySize {
        rows: 40,
        cols: 120,
        pixel_width: 0,
        pixel_height: 0,
    })?;
    thread::sleep(Duration::from_millis(500));

    eprintln!("[probe] resize 40x120 -> 24x80");
    master.resize(PtySize {
        rows: 24,
        cols: 80,
        pixel_width: 0,
        pixel_height: 0,
    })?;
    thread::sleep(Duration::from_millis(500));

    let size = master.get_size()?;
    eprintln!("[probe] master.get_size() after resize cycle: {size:?}");

    // Collect output emitted during the resize cycle.
    let deadline = Instant::now() + Duration::from_millis(500);
    let mut captured: Vec<u8> = Vec::new();
    while Instant::now() < deadline {
        let remaining = deadline.saturating_duration_since(Instant::now());
        match rx.recv_timeout(remaining) {
            Ok(chunk) => captured.extend_from_slice(&chunk),
            Err(_) => break,
        }
    }
    eprintln!(
        "[probe] captured {} bytes during resize cycle",
        captured.len()
    );
    std::io::stdout().write_all(&captured)?;
    println!();

    // Clean up: CC requires Ctrl+D twice to exit (single Ctrl+D is ignored; finding from P1.5).
    let mut writer = master.take_writer()?;
    let _ = writer.write_all(&[0x04]);
    let _ = writer.flush();
    thread::sleep(Duration::from_millis(300));
    let _ = writer.write_all(&[0x04]);
    let _ = writer.flush();
    drop(writer);
    let _ = child.wait();
    Ok(())
}
