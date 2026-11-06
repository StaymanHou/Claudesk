// M16 WP3 — the pure half of the review player: which frame rate a video has, which frame is
// on screen, where a frame-step seeks, how a time reads as a timecode, and how the webview's
// codec strings read to a person. No React, no DOM, so all of it is unit-testable (the
// mediaDisplay.ts posture); MediaPlayer.tsx drives it.
//
// ⚠️ ONE module for the fps value and every time↔frame conversion. Frame-step and the
// timecode both read it, so they cannot disagree about which frame is showing (spec AC-12).
//
// Measured in the real WKWebView (WIP → Research, 2026-10-20):
// - `videoTracks[i].configuration.framerate` gives the rate with no playback, but with float
//   noise (24.000000384, 23.976022720…), hence `snapFps`.
// - Seeking to a frame's START is unreliable in WebKit: forward never advances, backward
//   double-steps. Seeking to the frame's MIDPOINT landed 30/30 on every fixture.

/** Frame rates a real file is likely to have. 23.976 / 29.97 / 59.94 are the NTSC rates. */
export const COMMON_FPS: readonly number[] = [
  24000 / 1001,
  24,
  25,
  30000 / 1001,
  30,
  48000 / 1001,
  48,
  50,
  60000 / 1001,
  60,
];

/** Snap tolerance (relative) for a track's own `framerate`: float noise only. 23.976 and 24
 *  are 0.1% apart, so this must stay well under that. */
export const TRACK_FPS_TOLERANCE = 0.0005;
/** The step used when no frame rate is known. A guard, never a claim about the file. */
export const FALLBACK_FPS = 30;

/**
 * A measured frame rate, snapped to the nearest {@link COMMON_FPS} entry when within
 * `tolerance` (relative). An unusual but plausible rate is kept as measured; a missing,
 * zero or absurd one is `null`.
 */
export function snapFps(
  raw: number | null | undefined,
  tolerance: number = TRACK_FPS_TOLERANCE,
): number | null {
  if (raw === null || raw === undefined || !Number.isFinite(raw)) return null;
  if (raw <= 0 || raw > 1000) return null;
  let best: number | null = null;
  for (const rate of COMMON_FPS) {
    const off = Math.abs(raw - rate) / rate;
    if (
      off <= tolerance &&
      (best === null || off < Math.abs(raw - best) / best)
    )
      best = rate;
  }
  return best ?? raw;
}

/** Tolerance, in frames, for reading a time as a frame index. Covers a presented frame's
 *  timestamp sitting a hair below its frame (float noise, VP9's ms rounding) without pulling
 *  a frame MIDPOINT (where frame-step seeks) into the next frame. */
const FRAME_EPSILON = 0.05;

/**
 * The index of the frame showing at `time`. Works for both a presented frame's timestamp (rVFC
 * `mediaTime`, i.e. the frame's start) and a frame-step's midpoint `currentTime`.
 */
export function frameIndexAt(time: number, fps: number): number {
  return Math.max(0, Math.floor(time * fps + FRAME_EPSILON));
}

/** Where to seek to show frame `index`: its midpoint, the one target WebKit lands reliably. */
export function seekTargetFor(index: number, fps: number): number {
  return (index + 0.5) / fps;
}

/** The index of the last frame of a `duration`-second video. */
export function lastFrameIndex(duration: number, fps: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  return Math.max(0, Math.ceil(duration * fps - FRAME_EPSILON) - 1);
}

/** The frame a step of `dir` frames from `index` lands on, clamped to the video. */
export function stepFrameIndex(
  index: number,
  dir: number,
  lastIndex: number,
): number {
  return Math.min(lastIndex, Math.max(0, index + dir));
}

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

/**
 * Frame `index` as `hh:mm:ss.ff`. Frames are counted at the NOMINAL integer rate (24 for
 * 23.976), which is how editing tools label non-drop timecode, so `.ff` always runs
 * 00…(nominal−1) and names the frame exactly.
 */
export function formatFrameTimecode(index: number, fps: number): string {
  const nominal = Math.max(1, Math.round(fps));
  const frames = index % nominal;
  const total = Math.floor(index / nominal);
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(frames)}`;
}

/** `seconds` as `hh:mm:ss.mmm` — audio, and video whose frame rate is unknown. */
export function formatClockTimecode(seconds: number): string {
  const ms = Math.max(
    0,
    Math.round((Number.isFinite(seconds) ? seconds : 0) * 1000),
  );
  const total = Math.floor(ms / 1000);
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(ms % 1000, 3)}`;
}

/**
 * The strip's `current / total` readout. With a frame rate it is frame-accurate: `current` is
 * the frame at `time`, `total` is the frame COUNT (so a 480-frame 24 fps file reads
 * `00:00:20.00`). Without one it falls back to the clock form rather than invent frames.
 */
export function formatTimecodePair(
  time: number,
  duration: number,
  fps: number | null,
): string {
  if (fps === null)
    return `${formatClockTimecode(time)} / ${formatClockTimecode(duration)}`;
  const frameCount = lastFrameIndex(duration, fps) + 1;
  return `${formatFrameTimecode(frameIndexAt(time, fps), fps)} / ${formatFrameTimecode(frameCount, fps)}`;
}

/** A duration for the readout, as `m:ss` or `h:mm:ss`. */
export function formatDuration(seconds: number): string {
  const total = Math.round(Number.isFinite(seconds) ? seconds : 0);
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** A frame rate for the readout: `24 fps`, `23.976 fps`. */
export function formatFps(fps: number): string {
  return `${Number.isInteger(fps) ? fps : fps.toFixed(3)} fps`;
}

/**
 * A codec string from `*Tracks[i].configuration.codec` (RFC 6381) as a person reads it.
 * WebKit gives `""` for some codecs (ProRes, MP3), which is `null`: the readout omits the
 * field rather than show a blank. Only the families MEASURED in WKWebView are mapped; any
 * other string is shown raw (an Opus or FLAC codec name reads fine as it is), never guessed.
 */
export function codecLabel(codec: string | null | undefined): string | null {
  const c = (codec ?? "").trim();
  if (c === "") return null;
  const [family, oti] = c.toLowerCase().split(".");
  switch (family) {
    case "avc1":
    case "avc3":
      return "H.264";
    case "hvc1":
    case "hev1":
      return "HEVC";
    case "vp09":
      return "VP9";
    case "mp4a":
      // mp4a.40.x is AAC (2 = LC, 5 = HE, 29 = HEv2).
      return oti === "40" ? "AAC" : c;
    default:
      return c;
  }
}

/** An audio track's format for the readout: `44.1 kHz · stereo`. Unknown parts are dropped. */
export function audioFormatLabel(
  sampleRate: number | null | undefined,
  channels: number | null | undefined,
): string | null {
  const parts: string[] = [];
  if (sampleRate && sampleRate > 0) {
    const khz = sampleRate / 1000;
    parts.push(`${Number.isInteger(khz) ? khz : khz.toFixed(1)} kHz`);
  }
  if (channels && channels > 0)
    parts.push(
      channels === 1 ? "mono" : channels === 2 ? "stereo" : `${channels} ch`,
    );
  return parts.length > 0 ? parts.join(" · ") : null;
}

// ---- Track info -------------------------------------------------------------------------

/** WebKit's `VideoTrackConfiguration` / `AudioTrackConfiguration` (Safari-only, so not in
 *  TypeScript's DOM lib). Only the fields the readout uses. */
export interface TrackConfiguration {
  codec?: string;
  framerate?: number;
  sampleRate?: number;
  numberOfChannels?: number;
}

/** A media element as far as track info goes: structural, so a test can pass a plain object. */
export interface TrackSource {
  videoTracks?: ArrayLike<{ configuration?: TrackConfiguration | null }>;
  audioTracks?: ArrayLike<{ configuration?: TrackConfiguration | null }>;
}

/** What the readout and the clock need from a loaded element's tracks. */
export interface MediaInfo {
  /** Snapped frame rate of the first video track; null for audio or an unknown rate. */
  fps: number | null;
  /** `H.264`, `H.264 / AAC`, `AAC`…; null when the webview names no codec. */
  codec: string | null;
  /** `44.1 kHz · stereo` for the first audio track; null when it has none. */
  audioFormat: string | null;
}

/**
 * Read the element's track configurations. ⚠️ Call it at `loadeddata`, not `loadedmetadata`:
 * for mp4/mov WebKit's track lists are still EMPTY at `loadedmetadata` (measured; webm has
 * them earlier), so an early read would report no codec and no frame rate.
 */
export function mediaInfoOf(el: TrackSource): MediaInfo {
  const video = el.videoTracks?.[0]?.configuration ?? null;
  const audio = el.audioTracks?.[0]?.configuration ?? null;
  const codecs = [codecLabel(video?.codec), codecLabel(audio?.codec)].filter(
    (c): c is string => c !== null,
  );
  return {
    // The track's own rate, snapped; `null` means unknown, and callers step by FALLBACK_FPS and
    // show the clock timecode. ⚠️ Deliberately NO seek-based probe behind it: VP9's ms-rounded
    // timestamps read 24 fps as 23.81 (nearer 23.976), and no file measured in WKWebView lacked
    // a track framerate.
    fps: snapFps(video?.framerate),
    codec: codecs.length > 0 ? codecs.join(" / ") : null,
    audioFormat: audio
      ? audioFormatLabel(audio.sampleRate, audio.numberOfChannels)
      : null,
  };
}

// ---- Reload ----------------------------------------------------------------------------

/** Where a player was when its file changed on disk, carried to the reloaded element. */
export interface Playhead {
  time: number;
  paused: boolean;
  rate: number;
  loop: boolean;
}

/**
 * The time to resume at after a reload (spec AC-14): the old playhead when the NEW file is at
 * least that long, otherwise the start — a shorter render has no frame at the old time.
 */
export function restoreTime(oldTime: number, newDuration: number): number {
  if (!Number.isFinite(oldTime) || oldTime <= 0) return 0;
  return Number.isFinite(newDuration) && newDuration >= oldTime ? oldTime : 0;
}

// ---- Visibility -------------------------------------------------------------------------

/** The geometry `isHiddenInApp` reads: a DOMRect's edges and size. */
export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

/**
 * Whether a player is hidden INSIDE the app (spec AC-17), from its element's rect and the
 * viewport. Every way Claudesk hides one shows up here:
 * - a `display:none` right half, panel slot or editor tab → a zero-size rect
 * - a workspace off center stage is pushed to `left:-99999px` → a rect wholly off-viewport
 *
 * A covered or minimized WINDOW changes neither, so it is never "hidden" here (AC-18).
 */
export function isHiddenInApp(
  rect: Box,
  viewport: { width: number; height: number },
): boolean {
  if (rect.width <= 0 || rect.height <= 0) return true;
  return (
    rect.right <= 0 ||
    rect.bottom <= 0 ||
    rect.left >= viewport.width ||
    rect.top >= viewport.height
  );
}
