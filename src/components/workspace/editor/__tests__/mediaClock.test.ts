import { describe, expect, it } from "vitest";
import {
  audioFormatLabel,
  codecLabel,
  FALLBACK_FPS,
  formatClockTimecode,
  formatDuration,
  formatFps,
  formatFrameTimecode,
  formatTimecodePair,
  frameIndexAt,
  isHiddenInApp,
  lastFrameIndex,
  mediaInfoOf,
  restoreTime,
  seekTargetFor,
  snapFps,
  stepFrameIndex,
} from "../mediaClock";

const NTSC_24 = 24000 / 1001;
const NTSC_30 = 30000 / 1001;

describe("snapFps", () => {
  it("snaps the webview's float noise to the real rate (values measured in WKWebView)", () => {
    expect(snapFps(24.000000384000007)).toBe(24);
    expect(snapFps(23.976022720336914)).toBe(NTSC_24);
    expect(snapFps(29.97)).toBe(NTSC_30);
    expect(snapFps(30)).toBe(30);
    expect(snapFps(59.94)).toBe(60000 / 1001);
  });

  it("keeps an unusual but plausible rate as measured", () => {
    expect(snapFps(47)).toBe(47);
    expect(snapFps(12.5)).toBe(12.5);
  });

  it("rejects missing, zero and absurd rates", () => {
    for (const raw of [null, undefined, 0, -24, Number.NaN, Infinity, 5000])
      expect(snapFps(raw)).toBeNull();
  });

  it("a 23.976 file is never snapped to 24 (they are 0.1% apart)", () => {
    expect(snapFps(NTSC_24)).not.toBe(24);
    expect(snapFps(24)).not.toBe(NTSC_24);
  });
});

describe("snapFps on a track's framerate (mediaInfoOf's fps)", () => {
  it("mediaInfoOf snaps the first video track's own framerate", () => {
    const fpsOf = (framerate: number) =>
      mediaInfoOf({ videoTracks: [{ configuration: { framerate } }] }).fps;
    expect(fpsOf(23.976022720336914)).toBe(NTSC_24);
    expect(fpsOf(24.000000384)).toBe(24);
    expect(fpsOf(0)).toBeNull();
  });

  it("is null when the track gives no rate — the caller steps by the guard, shows no frames", () => {
    expect(snapFps(0)).toBeNull();
    expect(snapFps(undefined)).toBeNull();
    expect(FALLBACK_FPS).toBe(30);
  });

  it("does not snap a VP9 two-seek reading (1/0.042 s): why there is no seek probe", () => {
    // Two paused seeks on a 24 fps VP9 file measure 0.042 s (ms-rounded timestamps). That is
    // nearer 23.976 than 24, so any snap would be confidently wrong; snapFps keeps it raw.
    expect(snapFps(1 / 0.042)).toBeCloseTo(23.8095, 3);
  });
});

describe("frame arithmetic", () => {
  it("a frame's start timestamp reads as that frame, at every rate", () => {
    for (const fps of [24, 25, 30, NTSC_24, NTSC_30, 60]) {
      for (const n of [0, 1, 37, 100, 479]) {
        expect(frameIndexAt(n / fps, fps)).toBe(n);
      }
    }
  });

  it("a frame-step midpoint reads as that frame, not the next", () => {
    for (const fps of [24, 30, NTSC_24, 60]) {
      for (const n of [0, 1, 100, 479]) {
        expect(frameIndexAt(seekTargetFor(n, fps), fps)).toBe(n);
      }
    }
  });

  it("a VP9 ms-rounded timestamp reads as the right frame (0.958 s is frame 23 at 24 fps)", () => {
    expect(frameIndexAt(0.958, 24)).toBe(23);
    expect(frameIndexAt(1, 24)).toBe(24);
  });

  it("the seek target is the frame MIDPOINT, not its start", () => {
    expect(seekTargetFor(100, 24)).toBe(100.5 / 24);
    expect(seekTargetFor(0, 30)).toBe(0.5 / 30);
  });

  it("the last frame index matches the files' real frame counts (ffprobe nb_frames)", () => {
    expect(lastFrameIndex(20, 24)).toBe(479); // bc24.mp4: 480 frames
    expect(lastFrameIndex(20, 30)).toBe(599); // bc30.mp4: 600 frames
    expect(lastFrameIndex(20.02, NTSC_24)).toBe(479); // bc23976.mp4: 480 frames
    expect(lastFrameIndex(19.999, 24)).toBe(479); // bc24.webm (ms duration)
    expect(lastFrameIndex(0, 24)).toBe(0);
    expect(lastFrameIndex(Number.NaN, 24)).toBe(0);
  });

  it("a step is clamped to the video", () => {
    expect(stepFrameIndex(0, -1, 479)).toBe(0);
    expect(stepFrameIndex(479, 1, 479)).toBe(479);
    expect(stepFrameIndex(100, 1, 479)).toBe(101);
    expect(stepFrameIndex(100, -1, 479)).toBe(99);
  });
});

describe("timecodes", () => {
  it("a frame index reads as hh:mm:ss.ff", () => {
    expect(formatFrameTimecode(0, 24)).toBe("00:00:00.00");
    expect(formatFrameTimecode(37, 24)).toBe("00:00:01.13");
    expect(formatFrameTimecode(480, 24)).toBe("00:00:20.00");
    expect(formatFrameTimecode(24 * 3725 + 5, 24)).toBe("01:02:05.05");
  });

  it("23.976 counts frames at the nominal 24 (non-drop), so .ff never reaches 24", () => {
    expect(formatFrameTimecode(23, NTSC_24)).toBe("00:00:00.23");
    expect(formatFrameTimecode(24, NTSC_24)).toBe("00:00:01.00");
  });

  it("the clock form is hh:mm:ss.mmm", () => {
    expect(formatClockTimecode(0)).toBe("00:00:00.000");
    expect(formatClockTimecode(29.97532879818594)).toBe("00:00:29.975");
    expect(formatClockTimecode(3725.5)).toBe("01:02:05.500");
    expect(formatClockTimecode(Number.NaN)).toBe("00:00:00.000");
  });

  it("the pair is frame-accurate with a rate: current frame / frame count", () => {
    expect(formatTimecodePair(0, 20, 24)).toBe("00:00:00.00 / 00:00:20.00");
    expect(formatTimecodePair(seekTargetFor(7, 24), 20, 24)).toBe(
      "00:00:00.07 / 00:00:20.00",
    );
    expect(formatTimecodePair(0, 20.02, NTSC_24)).toBe(
      "00:00:00.00 / 00:00:20.00",
    );
  });

  it("the pair never invents frames without a rate", () => {
    expect(formatTimecodePair(1.5, 29.975, null)).toBe(
      "00:00:01.500 / 00:00:29.975",
    );
  });

  it("the timecode and frame-step read ONE fps source: a stepped frame is the .ff it shows", () => {
    for (const fps of [24, 30, NTSC_24]) {
      let index = 0;
      for (let i = 0; i < 10; i++) index = stepFrameIndex(index, 1, 479);
      const time = seekTargetFor(index, fps);
      const shown = formatTimecodePair(time, 20, fps).split(" / ")[0];
      expect(shown).toBe(formatFrameTimecode(10, fps));
      expect(shown.endsWith(".10")).toBe(true);
    }
  });
});

describe("readout labels", () => {
  it("durations and rates", () => {
    expect(formatDuration(20)).toBe("0:20");
    expect(formatDuration(660)).toBe("11:00");
    expect(formatDuration(8106)).toBe("2:15:06");
    expect(formatFps(24)).toBe("24 fps");
    expect(formatFps(NTSC_24)).toBe("23.976 fps");
  });

  it("codec strings measured in WKWebView read as people name them", () => {
    expect(codecLabel("avc1.64001E")).toBe("H.264");
    expect(codecLabel("avc1.42C01F")).toBe("H.264");
    expect(codecLabel("hvc1.1.6.L90.90")).toBe("HEVC");
    expect(codecLabel("vp09")).toBe("VP9");
    expect(codecLabel("mp4a.40.2")).toBe("AAC");
  });

  it("an empty codec (ProRes, MP3 in WebKit) is null, so the field is omitted", () => {
    expect(codecLabel("")).toBeNull();
    expect(codecLabel(null)).toBeNull();
    expect(codecLabel(undefined)).toBeNull();
  });

  it("an unmapped codec is shown raw rather than guessed", () => {
    expect(codecLabel("apch")).toBe("apch");
    expect(codecLabel("mp4a.6B")).toBe("mp4a.6B");
    expect(codecLabel("opus")).toBe("opus");
  });

  it("audio format", () => {
    expect(audioFormatLabel(44100, 1)).toBe("44.1 kHz · mono");
    expect(audioFormatLabel(48000, 2)).toBe("48 kHz · stereo");
    expect(audioFormatLabel(48000, 6)).toBe("48 kHz · 6 ch");
    expect(audioFormatLabel(0, 0)).toBeNull();
    expect(audioFormatLabel(undefined, 2)).toBe("stereo");
  });
});

describe("restoreTime (reload keeps the playhead)", () => {
  it("keeps the old time when the new file is at least that long, boundary included", () => {
    expect(restoreTime(6, 20)).toBe(6);
    expect(restoreTime(6, 6)).toBe(6);
  });

  it("goes to the start when the new file is shorter", () => {
    expect(restoreTime(6, 2)).toBe(0);
    expect(restoreTime(6, 5.999)).toBe(0);
  });

  it("an unknown new duration or a missing old time is the start", () => {
    expect(restoreTime(6, Number.NaN)).toBe(0);
    expect(restoreTime(Number.NaN, 20)).toBe(0);
    expect(restoreTime(0, 20)).toBe(0);
  });
});

describe("isHiddenInApp", () => {
  const vp = { width: 1400, height: 800 };
  const box = (left: number, top: number, width: number, height: number) => ({
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
  });

  it("a player on screen is not hidden, even partly clipped", () => {
    expect(isHiddenInApp(box(980, 160, 420, 560), vp)).toBe(false);
    expect(isHiddenInApp(box(-100, 160, 420, 560), vp)).toBe(false);
  });

  it("a display:none ancestor (zero rect: collapsed half, other panel, other tab) is hidden", () => {
    expect(isHiddenInApp(box(0, 0, 0, 0), vp)).toBe(true);
  });

  it("a zero-SIZE box still inside the viewport (a stage squeezed to 0 high) is hidden", () => {
    // A display:none rect sits at (0,0), which the edge rules would also catch; this one does
    // not, so only the zero-size rule can see it.
    expect(isHiddenInApp(box(980, 300, 420, 0), vp)).toBe(true);
    expect(isHiddenInApp(box(980, 300, 0, 560), vp)).toBe(true);
  });

  it("a workspace pushed off center stage (left:-99999px) is hidden", () => {
    expect(isHiddenInApp(box(-99999 + 980, 160, 420, 560), vp)).toBe(true);
  });

  it("wholly past any edge is hidden", () => {
    expect(isHiddenInApp(box(1400, 160, 420, 560), vp)).toBe(true);
    expect(isHiddenInApp(box(980, 800, 420, 560), vp)).toBe(true);
    expect(isHiddenInApp(box(980, -600, 420, 560), vp)).toBe(true);
  });
});
