//! M16 WP1 PROBE (throwaway): add one directory to the asset-protocol scope at runtime so the
//! `?mediaprobe` page can load fixtures through `convertFileSrc`.
//!
//! ⚠️ DEV-ONLY by construction: the scope mutation compiles only under `debug_assertions`, so a
//! release build answers every call with an error and cannot widen the scope. WP2 replaces this
//! with a root-validated registration; delete this module then.

#[tauri::command]
pub fn media_probe_allow(app: tauri::AppHandle, root: String) -> Result<(), String> {
    allow(&app, &root)
}

#[cfg(debug_assertions)]
fn allow(app: &tauri::AppHandle, root: &str) -> Result<(), String> {
    use tauri::Manager;
    app.asset_protocol_scope()
        .allow_directory(root, true)
        .map_err(|e| e.to_string())
}

#[cfg(not(debug_assertions))]
fn allow(_app: &tauri::AppHandle, _root: &str) -> Result<(), String> {
    Err("media_probe_allow is a dev-only probe command".into())
}

/// PROBE discriminator (debug only): a hand-rolled `mprobe://` scheme that serves a file's byte
/// ranges with u64 arithmetic and logs every request, to tell whether the ≥4 GiB failure lives in
/// Tauri's asset handler or in custom-scheme media loading generally. Path = absolute file path.
#[cfg(debug_assertions)]
pub fn mprobe_response(request: &tauri::http::Request<Vec<u8>>) -> tauri::http::Response<Vec<u8>> {
    use std::io::{Read, Seek, SeekFrom};
    use tauri::http::{header, Response, StatusCode};
    let path = percent_decode(request.uri().path());
    let range = request
        .headers()
        .get(header::RANGE)
        .and_then(|v| v.to_str().ok())
        .map(str::to_owned);
    eprintln!("[mprobe] {} {} range={:?}", request.method(), path, range);
    let err = |s: StatusCode| {
        Response::builder()
            .status(s)
            .body(Vec::new())
            .unwrap_or_default()
    };
    let Ok(mut f) = std::fs::File::open(&path) else {
        return err(StatusCode::NOT_FOUND);
    };
    let Ok(len) = f.metadata().map(|m| m.len()) else {
        return err(StatusCode::INTERNAL_SERVER_ERROR);
    };
    const CHUNK: u64 = 2 * 1024 * 1024;
    let (start, end) = match range.as_deref().and_then(|r| r.strip_prefix("bytes=")) {
        Some(spec) => {
            let (a, b) = spec.split_once('-').unwrap_or((spec, ""));
            let start: u64 = a.parse().unwrap_or(0);
            let end: u64 = b
                .parse()
                .unwrap_or(start + CHUNK - 1)
                .min(len.saturating_sub(1))
                .min(start + CHUNK - 1);
            (start, end)
        }
        None => (0, len.saturating_sub(1).min(CHUNK - 1)),
    };
    let mut buf = vec![0u8; (end - start + 1) as usize];
    if f.seek(SeekFrom::Start(start)).is_err() || f.read_exact(&mut buf).is_err() {
        return err(StatusCode::RANGE_NOT_SATISFIABLE);
    }
    eprintln!("[mprobe]   -> 206 bytes {start}-{end}/{len}");
    Response::builder()
        .status(StatusCode::PARTIAL_CONTENT)
        .header(header::CONTENT_TYPE, "video/mp4")
        .header(header::ACCEPT_RANGES, "bytes")
        .header(header::CONTENT_RANGE, format!("bytes {start}-{end}/{len}"))
        .header(header::CONTENT_LENGTH, buf.len().to_string())
        .header("Access-Control-Allow-Origin", "*")
        .body(buf)
        .unwrap_or_default()
}

#[cfg(debug_assertions)]
fn percent_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            if let Ok(v) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                out.push(v);
                i += 3;
                continue;
            }
        }
        out.push(b[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}
