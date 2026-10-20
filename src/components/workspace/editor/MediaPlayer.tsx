// M16 WP3 — the review player: the body of an editor `"file"` tab holding audio or video under
// the 4 GiB cap (`displayFor` → `{ kind: "player" }`). MediaView renders it; the transport,
// the root confinement and the disk-change reload are WP2's and are not repeated here.
//
// Layout: the same top `.media-toolbar` readout as the image viewer (file info), the native
// element with its own controls, and a Claudesk strip below it (timecode; review controls).
//
// The arithmetic (frame rate, frame index, timecode, codec names) lives in mediaClock.ts, ONE
// module, so the timecode and frame-step cannot disagree about which frame is showing.

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from "react";
import { assetUrlFor, type MediaStat } from "./mediaIpc";
import { extensionOf } from "./mediaKind";
import { formatBytes } from "./mediaDisplay";
import {
  FALLBACK_FPS,
  formatDuration,
  formatFps,
  formatTimecodePair,
  frameIndexAt,
  isHiddenInApp,
  lastFrameIndex,
  mediaInfoOf,
  restoreTime,
  seekTargetFor,
  stepFrameIndex,
  type MediaInfo,
  type Playhead,
  type TrackSource,
} from "./mediaClock";
import { frameStepForChord } from "./frameStepChord";
import { isPlayPauseChord } from "./playPauseChord";

/** The speed presets (spec Q2): four directly-selectable rates, not a slider
 *  (`explicit-selectable-mode-over-inferred-mode`). */
export const PLAYBACK_RATES: readonly number[] = [0.5, 1, 1.5, 2];

interface MediaPlayerProps {
  stat: MediaStat;
  path: string;
  media: "video" | "audio";
  /** The element fired `error` (WP1: a fast event, never a hang) → the info card. */
  onRenderError: () => void;
  /**
   * Where the player last was, OWNED BY MediaView so it outlives this component: a regenerate
   * can pass through the `missing` or `unrenderable` card (which unmounts the player) before
   * the new file loads, and the playhead must survive that (spec AC-15). Written as the element
   * plays/pauses/seeks; applied to every freshly loaded element.
   */
  playheadRef: RefObject<Playhead | null>;
}

/** What the readout knows once the element has loaded. */
interface Loaded extends MediaInfo {
  duration: number;
  width: number;
  height: number;
}

export function MediaPlayer({
  stat,
  path,
  media,
  onRenderError,
  playheadRef,
}: MediaPlayerProps) {
  const elRef = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  // The time the strip shows. For video it is the PRESENTED frame's timestamp (rVFC
  // `mediaTime`), not `currentTime`: after a frame-step seek `currentTime` is the frame's
  // midpoint, and the timecode must name the frame on screen.
  const [time, setTime] = useState(0);
  // The frame a step has REQUESTED but WebKit has not presented yet. Without it, two quick
  // presses would both compute from the same presented frame and the second step would be lost.
  // Cleared when a frame presents (or, with no rVFC, when a seek completes).
  const pendingFrameRef = useRef<number | null>(null);
  // Mirrors of the element's own state, updated from its events / our own writes. The element
  // is the authority: the native controls can change the rate behind our back.
  const [rate, setRate] = useState(1);
  const [loop, setLoop] = useState(false);
  const src = assetUrlFor(stat);
  // False from the moment a new element mounts until its `loadeddata` has applied the stored
  // playhead. Until then the element reports time 0 (and a half-written file may report
  // anything), and recording that would overwrite the place the operator is to come back to.
  const armedRef = useRef(false);

  /** Copy the element's position into the MediaView-owned playhead. */
  const record = useCallback(() => {
    const el = elRef.current;
    if (!armedRef.current || !el || el.error || el.readyState < 1) return;
    playheadRef.current = {
      time: el.currentTime,
      paused: el.paused,
      rate: el.playbackRate,
      loop: el.loop,
    };
  }, [playheadRef]);

  const onLoadedData = useCallback(() => {
    const el = elRef.current;
    if (!el) return;
    setLoaded({
      ...mediaInfoOf(el as unknown as TrackSource),
      duration: el.duration,
      width: media === "video" ? (el as HTMLVideoElement).videoWidth : 0,
      height: media === "video" ? (el as HTMLVideoElement).videoHeight : 0,
    });
    // A reload (the file changed on disk): resume where the operator was, at the same speed
    // and loop setting, playing only if it was playing (spec AC-14).
    const back = playheadRef.current;
    if (back) {
      const at = restoreTime(back.time, el.duration);
      el.currentTime = at;
      el.playbackRate = back.rate;
      el.loop = back.loop;
      setRate(back.rate);
      setLoop(back.loop);
      if (!back.paused) void el.play()?.catch(() => {});
    }
    setTime(el.currentTime);
    armedRef.current = true;
    record();
  }, [media, playheadRef, record]);

  // A new element (a regenerated file gets a new `?v=` URL, so a new keyed element) is unarmed
  // until it loads.
  useLayoutEffect(() => {
    armedRef.current = false;
  }, [src]);

  /**
   * Pause when hidden INSIDE the app; never resume on return (spec A-4). Checked on every
   * `timeupdate` (≤ 250 ms apart while playing — and only playing matters) from the element's
   * geometry: a zero rect (a `display:none` half / panel / tab) or one wholly off-viewport (a
   * workspace off center stage). ⚠️ NOT an IntersectionObserver: WebKit delivers its callbacks
   * on throttled rendering updates, so the pause came 97 ms to 3.4 s late or not at all
   * (measured, P3 verify-self). ⚠️ And NOT `visibilitychange`: a covered window keeps playing
   * (AC-18), which geometry cannot see by construction.
   */
  const pauseIfHidden = useCallback(() => {
    const el = elRef.current;
    if (!el || el.paused) return;
    if (
      isHiddenInApp(el.getBoundingClientRect(), {
        width: window.innerWidth,
        height: window.innerHeight,
      })
    )
      el.pause();
  }, []);

  // Video: follow every presented frame. Audio (no frames): follow `timeupdate` / `seeked`.
  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    if (media === "video" && "requestVideoFrameCallback" in el) {
      const video = el as HTMLVideoElement;
      let id = 0;
      const onFrame: VideoFrameRequestCallback = (_now, meta) => {
        pendingFrameRef.current = null;
        setTime(meta.mediaTime);
        id = video.requestVideoFrameCallback(onFrame);
      };
      id = video.requestVideoFrameCallback(onFrame);
      return () => video.cancelVideoFrameCallback(id);
    }
    const onTime = () => {
      pendingFrameRef.current = null;
      setTime(el.currentTime);
    };
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("seeked", onTime);
    return () => {
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("seeked", onTime);
    };
  }, [media, src]);

  /**
   * Step one frame (video) or one second (audio) while PAUSED. Returns whether it acted, so
   * the key handler only swallows a keystroke it used (A-10: inert while playing).
   */
  const step = (dir: -1 | 1): boolean => {
    const el = elRef.current;
    if (!el || !loaded || !el.paused) return false;
    if (media === "audio") {
      el.currentTime = Math.min(
        loaded.duration,
        Math.max(0, el.currentTime + dir),
      );
      return true;
    }
    // Unknown rate: step by the guard (operator decision A, P1.verify-human.3).
    const fps = loaded.fps ?? FALLBACK_FPS;
    const current = pendingFrameRef.current ?? frameIndexAt(time, fps);
    const next = stepFrameIndex(
      current,
      dir,
      lastFrameIndex(loaded.duration, fps),
    );
    pendingFrameRef.current = next;
    // The frame's MIDPOINT: a seek to its start lands on the previous frame in WebKit
    // (measured: forward never advanced, backward double-stepped).
    el.currentTime = seekTargetFor(next, fps);
    return true;
  };

  const togglePlay = () => {
    const el = elRef.current;
    if (!el) return;
    if (el.paused) void el.play()?.catch(() => {});
    else el.pause();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const dir = frameStepForChord(e);
    if (dir !== null) {
      if (step(dir)) {
        e.preventDefault();
        e.stopPropagation();
      }
      return;
    }
    // Space on a focused strip button must still press that button.
    if (isPlayPauseChord(e) && !(e.target instanceof HTMLButtonElement)) {
      e.preventDefault();
      e.stopPropagation();
      togglePlay();
    }
  };

  const setPlaybackRate = (r: number) => {
    const el = elRef.current;
    if (el) el.playbackRate = r; // `ratechange` updates the mirror
  };

  const toggleLoop = () => {
    const el = elRef.current;
    if (!el) return;
    el.loop = !el.loop;
    setLoop(el.loop);
    record();
  };

  const readout = [
    loaded && media === "video" && loaded.width > 0
      ? `${loaded.width} × ${loaded.height}`
      : null,
    loaded ? formatDuration(loaded.duration) : null,
    formatBytes(stat.size),
    loaded?.codec ?? null,
    media === "video" && loaded
      ? loaded.fps !== null
        ? formatFps(loaded.fps)
        : "fps unknown"
      : null,
    media === "audio" ? (loaded?.audioFormat ?? null) : null,
    extensionOf(path).toUpperCase(),
    path,
  ]
    .filter(Boolean)
    .join(" · ");

  const fps = media === "video" ? (loaded?.fps ?? null) : null;
  const timecode = loaded
    ? formatTimecodePair(time, loaded.duration, fps)
    : null;

  const elementProps = {
    ref: elRef,
    src,
    controls: true,
    // ⚠️ "auto", not "metadata": with "metadata" WebKit never reaches `loadeddata`, paints
    // black on open and after a paused seek, and (for mp4) never populates the track lists the
    // readout and the frame rate come from (measured, WIP → Research OQ-1/OQ-2).
    preload: "auto" as const,
    onLoadedData,
    onRateChange: () => {
      setRate(elRef.current?.playbackRate ?? 1);
      record();
    },
    onTimeUpdate: () => {
      pauseIfHidden();
      record();
    },
    onSeeked: record,
    onPlay: record,
    onPause: record,
    onError: onRenderError,
  };

  return (
    // Focusable so the review keys reach it, and ONLY it: a keydown from CodeMirror, the CC pane
    // or a terminal never bubbles through this element, so the bare `,` / `.` / Space cannot
    // fire there. Clicking the element or a strip button focuses inside it.
    <div
      className="media-view media-player"
      data-testid={`media-${media}`}
      tabIndex={0}
      onKeyDown={onKeyDown}
    >
      <div className="media-toolbar">
        <span className="media-readout" data-testid="media-readout">
          {readout}
        </span>
      </div>
      <div className="media-player-stage">
        {media === "video" ? (
          // Keyed on the asset URL: a regenerated file (new mtime → new `?v=`) is a fresh
          // element, not a `src` swap on a live one.
          <video key={src} className="media-player-video" {...elementProps} />
        ) : (
          <audio key={src} className="media-player-audio" {...elementProps} />
        )}
      </div>
      <div className="media-player-strip" data-testid="media-player-strip">
        {media === "video" && (
          <span className="media-zoom-controls">
            <button
              type="button"
              className="media-zoom-btn"
              data-testid="media-step-prev"
              onClick={() => step(-1)}
              title="Previous frame (,)"
              aria-label="Previous frame"
            >
              ‹
            </button>
            <button
              type="button"
              className="media-zoom-btn"
              data-testid="media-step-next"
              onClick={() => step(1)}
              title="Next frame (.)"
              aria-label="Next frame"
            >
              ›
            </button>
          </span>
        )}
        <span className="media-timecode" data-testid="media-timecode">
          {timecode ?? "—"}
        </span>
        <span className="media-player-strip-spacer" />
        <span
          className="media-zoom-controls"
          role="group"
          aria-label="Playback speed"
        >
          {PLAYBACK_RATES.map((r) => (
            <button
              key={r}
              type="button"
              className={`media-zoom-btn${rate === r ? " is-active" : ""}`}
              data-testid={`media-rate-${r}`}
              aria-pressed={rate === r}
              onClick={() => setPlaybackRate(r)}
              title={`Play at ${r}×`}
            >
              {r}×
            </button>
          ))}
        </span>
        <button
          type="button"
          className={`media-zoom-btn${loop ? " is-active" : ""}`}
          data-testid="media-loop"
          aria-pressed={loop}
          onClick={toggleLoop}
          title={loop ? "Stop looping" : "Loop the whole file"}
        >
          Loop
        </button>
      </div>
    </div>
  );
}
