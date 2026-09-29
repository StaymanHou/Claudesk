// M16 WP1 PROBE (throwaway) — media in the real WKWebView over the asset protocol.
//
// Mounted on `?mediaprobe` (optionally `&root=<abs fixtures dir>`). Adds the fixtures dir to the
// asset scope at runtime (`media_probe_allow`, dev-only), then runs the format matrix, the
// confinement + SVG-script checks, requestVideoFrameCallback, fullscreen and the PDF frames, and
// publishes everything on `window.__mediaProbe` for the MCP bridge to read. Elements stay mounted
// so a screenshot can judge what rendered. Delete with the rest of the probe at WP2.

import { useEffect, useRef, useState } from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";

const DEFAULT_ROOT =
  "/Users/stayman/Personal/projects/claudesk/tmp/scratch/media-probe/fixtures";
const LOAD_TIMEOUT_MS = 10_000;

type Kind = "image" | "video" | "audio";

interface Row {
  file: string;
  kind: Kind;
  loaded: boolean;
  error: number | string | null;
  hang: boolean;
  w: number | null;
  h: number | null;
  duration: number | null;
  seekTarget: number | null;
  seekOk: boolean | null;
  seekLandedAt: number | null;
  frameAfterSeek: boolean | null;
  canPlayType: string | null;
}

const IMAGES = [
  "image.png",
  "image.jpg",
  "image.gif",
  "image.webp",
  "image.heic",
  "image.svg",
  "script.svg",
  "not-media.bin",
  "escape-link.png",
  ".hidden/hidden.png",
];
const VIDEOS: Array<[string, string]> = [
  ["h264.mp4", 'video/mp4; codecs="avc1.640028"'],
  ["hevc.mp4", 'video/mp4; codecs="hvc1"'],
  ["prores.mov", "video/quicktime"],
  ["vp9.webm", 'video/webm; codecs="vp9"'],
  ["h264.mkv", "video/x-matroska"],
  ["large.mp4", "video/mp4"],
  ["pilot-psalms-v1.mp4", "video/mp4"],
];
const AUDIOS: Array<[string, string]> = [
  ["audio.mp3", "audio/mpeg"],
  ["audio.m4a", "audio/mp4"],
  ["audio.wav", "audio/wav"],
  ["audio.flac", "audio/flac"],
  ["audio.ogg", 'audio/ogg; codecs="vorbis"'],
  ["audio-opus.ogg", 'audio/ogg; codecs="opus"'],
];

declare global {
  interface Window {
    __mediaProbe?: unknown;
    __svgScriptRan?: boolean;
  }
}

const blankRow = (file: string, kind: Kind): Row => ({
  file,
  kind,
  loaded: false,
  error: null,
  hang: false,
  w: null,
  h: null,
  duration: null,
  seekTarget: null,
  seekOk: null,
  seekLandedAt: null,
  frameAfterSeek: null,
  canPlayType: null,
});

function waitFor(
  el: EventTarget,
  ok: string[],
  fail: string[],
  ms: number,
): Promise<"ok" | "fail" | "timeout"> {
  return new Promise((resolve) => {
    const done = (r: "ok" | "fail" | "timeout") => {
      clearTimeout(t);
      ok.forEach((e) => el.removeEventListener(e, onOk));
      fail.forEach((e) => el.removeEventListener(e, onFail));
      resolve(r);
    };
    const onOk = () => done("ok");
    const onFail = () => done("fail");
    const t = setTimeout(() => done("timeout"), ms);
    ok.forEach((e) => el.addEventListener(e, onOk));
    fail.forEach((e) => el.addEventListener(e, onFail));
  });
}

async function probeImage(
  root: string,
  file: string,
  host: HTMLElement,
): Promise<Row> {
  const row = blankRow(file, "image");
  const img = document.createElement("img");
  img.dataset.probe = file;
  img.style.maxWidth = "160px";
  img.style.maxHeight = "120px";
  img.title = file;
  host.appendChild(img);
  img.src = convertFileSrc(`${root}/${file}`);
  const r = await waitFor(img, ["load"], ["error"], LOAD_TIMEOUT_MS);
  row.hang = r === "timeout";
  row.loaded = r === "ok" && img.naturalWidth > 0;
  row.error = r === "fail" ? "img error event" : null;
  row.w = img.naturalWidth || null;
  row.h = img.naturalHeight || null;
  return row;
}

async function probeMedia(
  root: string,
  file: string,
  mime: string,
  kind: "video" | "audio",
  host: HTMLElement,
): Promise<Row> {
  const row = blankRow(file, kind);
  const el = document.createElement(kind);
  el.dataset.probe = file;
  el.controls = true;
  el.muted = true;
  el.preload = "metadata";
  if (kind === "video") (el as HTMLVideoElement).width = 240;
  row.canPlayType = el.canPlayType(mime) || "(empty)";
  host.appendChild(el);
  el.src = convertFileSrc(`${root}/${file}`);
  const r = await waitFor(el, ["loadedmetadata"], ["error"], LOAD_TIMEOUT_MS);
  row.hang = r === "timeout";
  row.loaded = r === "ok";
  row.error = el.error
    ? el.error.code
    : r === "fail"
      ? "error event, no MediaError"
      : null;
  row.duration = Number.isFinite(el.duration) ? el.duration : null;
  if (el instanceof HTMLVideoElement) {
    row.w = el.videoWidth || null;
    row.h = el.videoHeight || null;
  }
  if (row.loaded && row.duration) {
    // Far-ahead seek: past any first buffered chunk on the large fixtures.
    const target = row.duration > 600 ? 400 : Math.floor(row.duration * 0.6);
    row.seekTarget = target;
    el.currentTime = target;
    const s = await waitFor(el, ["seeked"], ["error"], LOAD_TIMEOUT_MS);
    row.seekOk = s === "ok";
    row.seekLandedAt = el.currentTime;
    row.frameAfterSeek = el.readyState >= 2;
  }
  return row;
}

async function probeRange(url: string) {
  try {
    const res = await fetch(url, { headers: { Range: "bytes=0-99" } });
    const body = await res.arrayBuffer();
    return {
      status: res.status,
      contentRange: res.headers.get("content-range"),
      acceptRanges: res.headers.get("accept-ranges"),
      contentType: res.headers.get("content-type"),
      bytes: body.byteLength,
    };
  } catch (e) {
    return { error: String(e) };
  }
}

async function probeRvfc(root: string, file: string, host: HTMLElement) {
  const v = document.createElement("video");
  v.muted = true;
  v.playsInline = true;
  v.width = 240;
  v.dataset.probe = `rvfc:${file}`;
  host.appendChild(v);
  const present = typeof v.requestVideoFrameCallback === "function";
  v.src = convertFileSrc(`${root}/${file}`);
  await waitFor(v, ["loadedmetadata"], ["error"], LOAD_TIMEOUT_MS);
  let playError: string | null = null;
  try {
    await v.play();
  } catch (e) {
    playError = String(e);
  }
  if (!present || playError) {
    v.pause();
    return { file, present, playError, fpsEstimate: null, samples: 0 };
  }
  const times: number[] = [];
  await new Promise<void>((resolve) => {
    const t = setTimeout(resolve, 5000);
    const cb: VideoFrameRequestCallback = (_now, meta) => {
      times.push(meta.mediaTime);
      if (times.length >= 40) {
        clearTimeout(t);
        resolve();
      } else v.requestVideoFrameCallback(cb);
    };
    v.requestVideoFrameCallback(cb);
  });
  v.pause();
  const deltas = times
    .slice(1)
    .map((t, i) => t - times[i])
    .filter((d) => d > 0)
    .sort((a, b) => a - b);
  const median = deltas.length ? deltas[Math.floor(deltas.length / 2)] : null;
  return {
    file,
    present,
    playError,
    samples: times.length,
    medianDelta: median,
    fpsEstimate: median ? Math.round((1 / median) * 1000) / 1000 : null,
  };
}

async function probeFullscreen(host: HTMLElement) {
  const v = host.querySelector<HTMLVideoElement>(
    'video[data-probe="h264.mp4"]',
  );
  const d = document as Document & { webkitFullscreenEnabled?: boolean };
  const out: Record<string, unknown> = {
    fullscreenEnabled: document.fullscreenEnabled ?? null,
    webkitFullscreenEnabled: d.webkitFullscreenEnabled ?? null,
    hasRequestFullscreen: !!v && typeof v.requestFullscreen === "function",
    hasWebkitEnterFullscreen:
      !!v &&
      typeof (v as unknown as { webkitEnterFullscreen?: unknown })
        .webkitEnterFullscreen === "function",
  };
  if (v && typeof v.requestFullscreen === "function") {
    try {
      await v.requestFullscreen();
      out.scriptedRequest = "resolved";
      await document.exitFullscreen().catch(() => undefined);
    } catch (e) {
      out.scriptedRequest = `rejected: ${String(e)}`;
    }
  }
  return out;
}

async function runProbe(root: string, host: HTMLElement) {
  const errors: string[] = [];
  const onError = (e: ErrorEvent) => errors.push(e.message || String(e.error));
  window.addEventListener("error", onError);
  // Self-test the tap so an empty `errors` list is evidence, not silence.
  window.dispatchEvent(
    new ErrorEvent("error", { message: "__tap_selftest__" }),
  );
  const tapWorks = errors.includes("__tap_selftest__");
  errors.length = 0;

  const svgMessages: string[] = [];
  window.addEventListener("message", (e) => {
    if (e.data === "svg-script-ran") svgMessages.push("message");
  });

  let allow: string;
  try {
    await invoke("media_probe_allow", { root });
    allow = "ok";
  } catch (e) {
    allow = `error: ${String(e)}`;
  }

  const images = await Promise.all(
    IMAGES.map((f) => probeImage(root, f, host)),
  );
  // Out-of-root by ABSOLUTE path (sibling of the scope root).
  const outsideAbs = root.replace(/\/fixtures$/, "") + "-outside/outside.png";
  const outside = await probeImage(
    outsideAbs.replace(/\/outside\.png$/, ""),
    "outside.png",
    host,
  );
  outside.file = `ABS:${outsideAbs}`;

  const svgImgRan = window.__svgScriptRan === true || svgMessages.length > 0;
  // Positive control: the same SVG in an <object> IS a script-running context.
  const obj = document.createElement("object");
  obj.type = "image/svg+xml";
  obj.data = convertFileSrc(`${root}/script.svg`);
  obj.width = "200";
  obj.height = "120";
  obj.dataset.probe = "svg-object-control";
  host.appendChild(obj);
  await new Promise((r) => setTimeout(r, 1500));
  const svgObjectRan = window.__svgScriptRan === true || svgMessages.length > 0;

  const media: Row[] = [];
  for (const [f, mime] of VIDEOS)
    media.push(await probeMedia(root, f, mime, "video", host));
  for (const [f, mime] of AUDIOS)
    media.push(await probeMedia(root, f, mime, "audio", host));

  const range = {
    h264: await probeRange(convertFileSrc(`${root}/h264.mp4`)),
    large: await probeRange(convertFileSrc(`${root}/large.mp4`)),
  };
  const rvfc = [
    await probeRvfc(root, "h264.mp4", host),
    await probeRvfc(root, "pilot-psalms-v1.mp4", host),
  ];
  const fullscreen = await probeFullscreen(host);

  const pdfUrl = convertFileSrc(`${root}/doc.pdf`);
  for (const tag of ["iframe", "embed"] as const) {
    const el = document.createElement(tag);
    el.setAttribute("src", pdfUrl);
    if (tag === "embed") el.setAttribute("type", "application/pdf");
    el.style.width = "360px";
    el.style.height = "260px";
    el.style.border = "2px solid #d97757";
    el.id = `pdf-${tag}`;
    host.appendChild(el);
  }

  window.__mediaProbe = {
    origin: window.location.origin,
    root,
    allow,
    sampleUrl: convertFileSrc(`${root}/image.png`),
    tapWorks,
    rows: [...images, outside, ...media],
    svg: {
      imgRan: svgImgRan,
      objectControlRan: svgObjectRan,
      messages: svgMessages.length,
    },
    range,
    rvfc,
    fullscreen,
    pdf: { url: pdfUrl, note: "judge #pdf-iframe / #pdf-embed by screenshot" },
    errors,
    done: true,
  };
}

export default function MediaProbeApp() {
  const host = useRef<HTMLDivElement>(null);
  const started = useRef(false);
  const [status, setStatus] = useState("running…");
  useEffect(() => {
    // StrictMode double-mount: run exactly once per page load.
    if (started.current || !host.current) return;
    started.current = true;
    const root =
      new URLSearchParams(window.location.search).get("root") ?? DEFAULT_ROOT;
    runProbe(root, host.current)
      .then(() => setStatus("done — read window.__mediaProbe"))
      .catch((e) => setStatus(`probe crashed: ${String(e)}`));
  }, []);
  return (
    <div
      style={{
        padding: 12,
        background: "#1e1e1e",
        color: "#ccc",
        minHeight: "100vh",
      }}
    >
      <div id="media-probe-status">M16 WP1 media probe — {status}</div>
      <div
        ref={host}
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          alignItems: "flex-start",
          marginTop: 8,
        }}
      />
    </div>
  );
}
