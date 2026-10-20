// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  clearMocks,
  mockConvertFileSrc,
  mockIPC,
  mockWindows,
} from "@tauri-apps/api/mocks";
import { EditorSplit, type EditorSplitHandle } from "../EditorSplit";
import prefixes from "../readErrorPrefixes.json";

// M16 WP2 Phase 2 — a media file opened into an ordinary editor tab, on a LIVE mount of the
// real EditorSplit → PaneTabs → MediaView / EditorPanel chain, IPC answered by `mockIPC`.
//
// The load-bearing assertion is an IDENTITY one: opening an image issues ZERO `read_file`
// calls (not "fewer", not "a tab opened"). That is what the PaneTabs doc-store gate buys; with
// the gate removed, EditorSplit's load-once effect reads the whole file. A text file opened
// through the same path DOES issue `read_file` (the positive control), so a mock that silently
// answered nothing could not pass this.

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const ROOT = "/p";
const SIZES: Record<string, number> = {
  "shots/a.png": 33942,
  "clip.mp4": 336_000_000,
  "voice.m4a": 265_610,
  "render.mp4": 4_865_095_788,
  "doc.pdf": 38362,
  "fake.pdf": 30,
  "diagram.svg": 120,
};
const MTIMES: Record<string, number> = {};
const GONE = new Set<string>();
const calls: { cmd: string; args: Record<string, unknown> }[] = [];
let root: Root | null = null;
let host: HTMLDivElement | null = null;
const split = createRef<EditorSplitHandle>();

async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 30));
  });
}

async function mount() {
  calls.length = 0;
  mockWindows("main");
  mockConvertFileSrc("macos");
  mockIPC(
    (cmd, payload) => {
      const args = (payload ?? {}) as Record<string, unknown>;
      calls.push({ cmd, args });
      const path = String(args.path ?? "");
      if (cmd === "stat_media") {
        if (!(path in SIZES) || GONE.has(path))
          throw `file I/O error: ${path}: No such file`;
        return {
          path: `${ROOT}/${path}`,
          size: SIZES[path],
          mtime_ms: MTIMES[path] ?? 1790000000000.4,
          pdf_magic: path === "doc.pdf",
        };
      }
      if (cmd === "stat_file") return { mtime_ms: 1, size: 1 };
      if (cmd === "read_file") {
        if (path === "main.ts") return "const x = 1;\n";
        if (path === "diagram.svg")
          return '<svg xmlns="http://www.w3.org/2000/svg"/>\n';
        if (path === "bin.dat")
          throw `${prefixes.notUtf8} ${ROOT}/bin.dat (binary: NUL byte in the first 8192 bytes)`;
        if (path === "huge.log")
          throw `${prefixes.tooLarge} ${ROOT}/huge.log (70000000 bytes; limit 67108864)`;
        throw `path ${path} is outside the workspace root ${ROOT}`;
      }
      return null;
    },
    { shouldMockEvents: true },
  );
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <EditorSplit
        ref={split}
        projectPath={ROOT}
        active={true}
        highlightTarget={null}
      />,
    );
  });
  await settle();
}

async function open(path: string) {
  await act(async () => {
    split.current!.openFile(path);
  });
  // Lazy chunks (MediaView / EditorPanel) + the stat round trip.
  await settle();
  await settle();
}

/** The visible tab body (all tabs stay mounted; only the active one is display:flex). */
function activeBody(): HTMLElement {
  const bodies = [...host!.querySelectorAll<HTMLElement>(".editor-tab-body")];
  const visible = bodies.filter((b) => b.style.display === "flex");
  expect(visible).toHaveLength(1);
  return visible[0];
}

/** Stand in for WebKit loading a media element: jsdom loads nothing, so set what the
 *  element would report (instance properties shadow the prototype getters) and fire
 *  `loadeddata`, where the player reads its tracks. */
function loadElement(
  el: HTMLMediaElement,
  props: Record<string, unknown>,
): void {
  for (const [k, v] of Object.entries(props))
    Object.defineProperty(el, k, { value: v, configurable: true });
  act(() => {
    el.dispatchEvent(new Event("loadeddata"));
  });
}

const readFileCalls = () => calls.filter((c) => c.cmd === "read_file");

afterEach(() => {
  for (const k of Object.keys(MTIMES)) delete MTIMES[k];
  GONE.clear();
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  clearMocks();
});

describe("a media file in an ordinary editor tab", () => {
  it("an image issues ZERO read_file calls and renders from the canonical asset URL", async () => {
    await mount();
    await open("shots/a.png");
    expect(readFileCalls()).toEqual([]);
    expect(calls.filter((c) => c.cmd === "stat_media")[0]?.args).toEqual({
      root: ROOT,
      path: "shots/a.png",
    });
    const body = activeBody();
    expect(body.querySelector('[data-testid="media-image"]')).not.toBeNull();
    const img = body.querySelector<HTMLImageElement>("img.media-img")!;
    // Built from the stat's CANONICAL path (/p/shots/a.png), cache-busted by the mtime.
    expect(img.getAttribute("src")).toBe(
      `asset://localhost/${encodeURIComponent(`${ROOT}/shots/a.png`)}?v=1790000000000`,
    );
    expect(body.querySelector('[data-testid="editor-panel"]')).toBeNull();
  });

  it("positive control: a text file through the same path DOES read_file", async () => {
    await mount();
    await open("shots/a.png");
    await open("main.ts");
    expect(readFileCalls().map((c) => c.args.path)).toEqual(["main.ts"]);
  });

  it("video under 4 GiB → the player: <video controls preload=auto>, no autoplay, canonical URL", async () => {
    await mount();
    await open("clip.mp4");
    const body = activeBody();
    expect(body.querySelector('[data-testid="media-card"]')).toBeNull();
    const video = body.querySelector<HTMLVideoElement>("video")!;
    expect(video).not.toBeNull();
    expect(video.controls).toBe(true);
    // "auto", not "metadata": with "metadata" WebKit paints black and never fills the tracks.
    expect(video.getAttribute("preload")).toBe("auto");
    expect(video.autoplay).toBe(false);
    expect(video.getAttribute("src")).toBe(
      `asset://localhost/${encodeURIComponent(`${ROOT}/clip.mp4`)}?v=1790000000000`,
    );
    expect(readFileCalls()).toEqual([]);
    // Before the element loads, the readout carries only what the stat knows.
    expect(
      body.querySelector('[data-testid="media-readout"]')!.textContent,
    ).toBe("336.0 MB · MP4 · clip.mp4");
  });

  it("at loadeddata the readout and timecode come from the element's tracks", async () => {
    await mount();
    await open("clip.mp4");
    const body = activeBody();
    const video = body.querySelector<HTMLVideoElement>("video")!;
    loadElement(video, {
      duration: 660,
      videoWidth: 1280,
      videoHeight: 720,
      videoTracks: [{ configuration: { codec: "avc1.42C01F", framerate: 30 } }],
      audioTracks: [
        {
          configuration: {
            codec: "mp4a.40.2",
            sampleRate: 44100,
            numberOfChannels: 1,
          },
        },
      ],
    });
    await settle();
    expect(
      body.querySelector('[data-testid="media-readout"]')!.textContent,
    ).toBe(
      "1280 × 720 · 11:00 · 336.0 MB · H.264 / AAC · 30 fps · MP4 · clip.mp4",
    );
    expect(
      body.querySelector('[data-testid="media-timecode"]')!.textContent,
    ).toBe("00:00:00.00 / 00:11:00.00");
  });

  it("a codec the webview leaves empty (ProRes) is OMITTED from the readout, not shown blank", async () => {
    await mount();
    await open("clip.mp4");
    const body = activeBody();
    loadElement(body.querySelector<HTMLVideoElement>("video")!, {
      duration: 10,
      videoWidth: 1280,
      videoHeight: 720,
      videoTracks: [{ configuration: { codec: "", framerate: 24 } }],
      audioTracks: [],
    });
    await settle();
    expect(
      body.querySelector('[data-testid="media-readout"]')!.textContent,
    ).toBe("1280 × 720 · 0:10 · 336.0 MB · 24 fps · MP4 · clip.mp4");
  });

  it("a video with no frame rate says so and shows the clock timecode, never invented frames", async () => {
    await mount();
    await open("clip.mp4");
    const body = activeBody();
    loadElement(body.querySelector<HTMLVideoElement>("video")!, {
      duration: 12.5,
      videoWidth: 640,
      videoHeight: 360,
      videoTracks: [{ configuration: { codec: "avc1.64001E", framerate: 0 } }],
      audioTracks: [],
    });
    await settle();
    expect(
      body.querySelector('[data-testid="media-readout"]')!.textContent,
    ).toBe(
      "640 × 360 · 0:13 · 336.0 MB · H.264 · fps unknown · MP4 · clip.mp4",
    );
    expect(
      body.querySelector('[data-testid="media-timecode"]')!.textContent,
    ).toBe("00:00:00.000 / 00:00:12.500");
  });

  it("audio → <audio controls preload=auto>, the ms timecode, and NO frame controls", async () => {
    await mount();
    await open("voice.m4a");
    const body = activeBody();
    expect(body.querySelector("video")).toBeNull();
    const audio = body.querySelector<HTMLAudioElement>("audio")!;
    expect(audio.controls).toBe(true);
    expect(audio.getAttribute("preload")).toBe("auto");
    loadElement(audio, {
      duration: 29.97532879818594,
      audioTracks: [
        {
          configuration: {
            codec: "mp4a.40.2",
            sampleRate: 44100,
            numberOfChannels: 1,
          },
        },
      ],
    });
    await settle();
    expect(
      body.querySelector('[data-testid="media-readout"]')!.textContent,
    ).toBe("0:30 · 265.6 KB · AAC · 44.1 kHz · mono · M4A · voice.m4a");
    expect(
      body.querySelector('[data-testid="media-timecode"]')!.textContent,
    ).toBe("00:00:00.000 / 00:00:29.975");
    expect(body.querySelector('[data-testid^="media-step"]')).toBeNull();
  });

  it("the video timecode names the PRESENTED frame (rVFC mediaTime), not currentTime", async () => {
    // jsdom has no requestVideoFrameCallback; stand in for WebKit's, capturing the callback so
    // the test can present a frame. After a frame-step seek `currentTime` is the frame's
    // MIDPOINT, so a timecode read from it would still be right — the discriminating input is
    // a currentTime that sits in a DIFFERENT frame from the presented one.
    const callbacks: VideoFrameRequestCallback[] = [];
    const proto = HTMLVideoElement.prototype as unknown as Record<
      string,
      unknown
    >;
    proto.requestVideoFrameCallback = (cb: VideoFrameRequestCallback) =>
      callbacks.push(cb);
    proto.cancelVideoFrameCallback = () => {};
    try {
      await mount();
      await open("clip.mp4");
      const body = activeBody();
      const video = body.querySelector<HTMLVideoElement>("video")!;
      loadElement(video, {
        duration: 20,
        videoWidth: 704,
        videoHeight: 360,
        currentTime: 0,
        videoTracks: [
          { configuration: { codec: "avc1.64001E", framerate: 24 } },
        ],
        audioTracks: [],
      });
      await settle();
      Object.defineProperty(video, "currentTime", {
        value: 5,
        configurable: true,
      });
      act(() => {
        callbacks[callbacks.length - 1](0, {
          mediaTime: 37 / 24,
        } as VideoFrameCallbackMetadata);
      });
      expect(
        body.querySelector('[data-testid="media-timecode"]')!.textContent,
      ).toBe("00:00:01.13 / 00:00:20.00");
    } finally {
      // Unmount while the stub still exists: the player's cleanup cancels its frame callback.
      act(() => root?.unmount());
      root = null;
      delete proto.requestVideoFrameCallback;
      delete proto.cancelVideoFrameCallback;
    }
  });

  it("a player whose element fails to load → the unrenderable card (the mkv path)", async () => {
    await mount();
    await open("clip.mp4");
    const video = activeBody().querySelector<HTMLVideoElement>("video")!;
    await act(async () => {
      video.dispatchEvent(new Event("error"));
    });
    expect(
      activeBody().querySelector<HTMLElement>('[data-testid="media-card"]')
        ?.dataset.reason,
    ).toBe("unrenderable");
  });

  it("a 4.86 GB render → the over-limit card with its size, no <video>", async () => {
    await mount();
    await open("render.mp4");
    const card = activeBody().querySelector<HTMLElement>(
      '[data-testid="media-card"]',
    )!;
    expect(card.dataset.reason).toBe("over-media-limit");
    expect(
      card.querySelector('[data-testid="media-card-meta"]')!.textContent,
    ).toBe("4.9 GB · MP4");
    expect(host!.querySelector("video, audio")).toBeNull();
  });

  it("a .pdf that is not a PDF → the not-a-pdf card, and no iframe", async () => {
    await mount();
    await open("fake.pdf");
    expect(
      activeBody().querySelector<HTMLElement>('[data-testid="media-card"]')
        ?.dataset.reason,
    ).toBe("not-a-pdf");
    expect(host!.querySelector("iframe, object, embed")).toBeNull();
  });

  it("a missing media file → the editor error state with the backend's message", async () => {
    await mount();
    await open("gone.png");
    const err = activeBody().querySelector('[data-testid="editor-error"]');
    expect(err?.textContent).toContain("No such file");
  });

  it("the card's button opens the file in its default app via the backend", async () => {
    await mount();
    await open("render.mp4");
    const btn = activeBody().querySelector<HTMLButtonElement>(
      '[data-testid="media-card-open"]',
    )!;
    await act(async () => btn.click());
    expect(
      calls.filter((c) => c.cmd === "open_in_default_app").map((c) => c.args),
    ).toEqual([{ root: ROOT, path: "render.mp4" }]);
  });
});

describe("read_file refusals route to the card; other errors keep the error state", () => {
  it("a binary (not-utf8) → the card, with the size fetched by stat", async () => {
    SIZES["bin.dat"] = 2048;
    await mount();
    await open("bin.dat");
    const card = activeBody().querySelector<HTMLElement>(
      '[data-testid="media-card"]',
    );
    expect(card?.dataset.reason).toBe("not-utf8");
    expect(
      card!.querySelector('[data-testid="media-card-meta"]')!.textContent,
    ).toBe("2.0 KB · DAT");
    expect(
      activeBody().querySelector('[data-testid="editor-error"]'),
    ).toBeNull();
  });

  it("a file over the read cap → the too-large card", async () => {
    await mount();
    await open("huge.log");
    expect(
      activeBody().querySelector<HTMLElement>('[data-testid="media-card"]')
        ?.dataset.reason,
    ).toBe("too-large");
  });

  it("an outside-the-root refusal keeps editor-error (NOT the card)", async () => {
    await mount();
    await open("../secret.txt");
    const body = activeBody();
    expect(body.querySelector('[data-testid="media-card"]')).toBeNull();
    expect(
      body.querySelector('[data-testid="editor-error"]')?.textContent,
    ).toContain("outside the workspace root");
  });
});

describe("image zoom chords (the viewer's own handler)", () => {
  it("⌘= / ⌘0 zoom the IMAGE and leave the editor font setting alone", async () => {
    localStorage.setItem("claudesk.editor.fontSize", "11");
    await mount();
    await open("shots/a.png");
    const view = activeBody().querySelector<HTMLElement>(
      '[data-testid="media-image"]',
    )!;
    const level = () =>
      activeBody().querySelector('[data-testid="media-zoom-level"]')!
        .textContent;
    expect(level()).toBe("fit");
    const press = async (key: string) => {
      const ev = new KeyboardEvent("keydown", {
        key,
        metaKey: true,
        bubbles: true,
        cancelable: true,
      });
      await act(async () => {
        view.dispatchEvent(ev);
      });
      return ev.defaultPrevented;
    };
    view.focus();
    // jsdom lays nothing out, so the fit scale reads as 1 and one step is exactly 125%.
    expect(await press("=")).toBe(true);
    expect(level()).toBe("125%");
    expect(await press("-")).toBe(true);
    expect(level()).toBe("100%");
    expect(await press("0")).toBe(true);
    expect(level()).toBe("fit");
    // A key that is not a zoom chord is left for the rest of the app.
    expect(await press("r")).toBe(false);
    expect(localStorage.getItem("claudesk.editor.fontSize")).toBe("11");
  });
});

describe("PDF, SVG and reload (Phase 3)", () => {
  it("a real PDF renders in exactly ONE iframe on the canonical asset URL", async () => {
    await mount();
    await open("doc.pdf");
    const body = activeBody();
    expect(body.querySelector('[data-testid="media-pdf"]')).not.toBeNull();
    const frames = host!.querySelectorAll("iframe");
    expect(frames).toHaveLength(1);
    expect(frames[0].getAttribute("src")).toBe(
      `asset://localhost/${encodeURIComponent(`${ROOT}/doc.pdf`)}?v=1790000000000`,
    );
    expect(host!.querySelector("object, embed")).toBeNull();
    expect(readFileCalls()).toEqual([]);
  });

  it("an SVG renders via <img>, and the Text toggle shows its source read-only and back", async () => {
    await mount();
    await open("diagram.svg");
    let body = activeBody();
    expect(
      body.querySelector('[data-testid="media-svg"] img.media-img'),
    ).not.toBeNull();
    expect(readFileCalls()).toEqual([]);
    const toggle = () =>
      activeBody().querySelector<HTMLButtonElement>(
        '[data-testid="media-svg-text-toggle"]',
      )!;
    await act(async () => toggle().click());
    await settle();
    await settle();
    body = activeBody();
    expect(readFileCalls().map((c) => c.args)).toEqual([
      { root: ROOT, path: "diagram.svg" },
    ]);
    expect(body.querySelector('[data-testid="media-svg-text"]')).not.toBeNull();
    expect(body.querySelector("img")).toBeNull();
    expect(toggle().getAttribute("aria-pressed")).toBe("true");
    await act(async () => toggle().click());
    expect(
      activeBody().querySelector('[data-testid="media-svg"] img.media-img'),
    ).not.toBeNull();
  });

  it("a disk change re-stats an open image and cache-busts its URL with the new mtime", async () => {
    await mount();
    await open("shots/a.png");
    const stats = () => calls.filter((c) => c.cmd === "stat_media").length;
    const before = stats();
    // A change to a path NOT open as media re-stats nothing.
    await act(async () => split.current!.checkDiskForPaths(["README.md"]));
    await settle();
    expect(stats()).toBe(before);
    MTIMES["shots/a.png"] = 1790000009999;
    await act(async () => split.current!.checkDiskForPaths(["shots/a.png"]));
    await settle();
    expect(stats()).toBe(before + 1);
    expect(
      activeBody().querySelector("img.media-img")!.getAttribute("src"),
    ).toBe(
      `asset://localhost/${encodeURIComponent(`${ROOT}/shots/a.png`)}?v=1790000009999`,
    );
  });

  it("a media file deleted on disk keeps its tab and shows the missing card (A-8)", async () => {
    await mount();
    await open("shots/a.png");
    GONE.add("shots/a.png");
    await act(async () => split.current!.checkDiskForPaths(["shots/a.png"]));
    await settle();
    expect(host!.querySelectorAll('[data-testid="editor-tab"]')).toHaveLength(
      1,
    );
    const card = activeBody().querySelector<HTMLElement>(
      '[data-testid="media-card"]',
    );
    expect(card?.dataset.reason).toBe("missing");
    // It comes back when the file does.
    GONE.delete("shots/a.png");
    MTIMES["shots/a.png"] = 1790000020000;
    await act(async () => split.current!.checkDiskForPaths(["shots/a.png"]));
    await settle();
    expect(activeBody().querySelector("img.media-img")).not.toBeNull();
  });
});

describe("review controls (M16 WP3 Phase 2)", () => {
  /** Open a 24 fps video, loaded, with `currentTime` recorded on every write. */
  async function openVideo(opts: { paused?: boolean } = {}) {
    await mount();
    await open("clip.mp4");
    const body = activeBody();
    const video = body.querySelector<HTMLVideoElement>("video")!;
    const writes: number[] = [];
    let t = 0;
    Object.defineProperty(video, "currentTime", {
      configurable: true,
      get: () => t,
      set: (v: number) => {
        writes.push(v);
        t = v;
      },
    });
    loadElement(video, {
      duration: 20,
      videoWidth: 704,
      videoHeight: 360,
      paused: opts.paused ?? true,
      videoTracks: [{ configuration: { codec: "avc1.64001E", framerate: 24 } }],
      audioTracks: [],
    });
    await settle();
    const player = body.querySelector<HTMLElement>(
      '[data-testid="media-video"]',
    )!;
    return { body, video, player, writes };
  }

  const key = (target: HTMLElement, k: string) =>
    act(() => {
      target.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: k,
          bubbles: true,
          cancelable: true,
        }),
      );
    });

  // ⚠️ Expected times are LITERALS (frame n's midpoint = (n + 0.5) / 24), never
  // `seekTargetFor(...)`: computing the expectation with the function under test made the
  // midpoint mutant (`index / fps`) pass here, because both sides mutated together.
  it(". while paused seeks to the MIDPOINT of the next frame (identity on the value)", async () => {
    const { player, writes } = await openVideo();
    key(player, ".");
    expect(writes).toEqual([1.5 / 24]);
  });

  it("two quick presses step TWO frames, before WebKit has presented the first", async () => {
    const { player, writes } = await openVideo();
    key(player, ".");
    key(player, ".");
    expect(writes).toEqual([1.5 / 24, 2.5 / 24]);
  });

  it(", at frame 0 stays on frame 0 (clamped, never a negative seek)", async () => {
    const { player, writes } = await openVideo();
    key(player, ",");
    expect(writes).toEqual([0.5 / 24]);
  });

  it(". at the LAST frame stays on the last frame (clamped to the video)", async () => {
    await mount();
    await open("clip.mp4");
    const body = activeBody();
    const video = body.querySelector<HTMLVideoElement>("video")!;
    const writes: number[] = [];
    // Parked on frame 479 of a 20 s, 24 fps (480-frame) file before it loads.
    let t = 479.5 / 24;
    Object.defineProperty(video, "currentTime", {
      configurable: true,
      get: () => t,
      set: (v: number) => {
        writes.push(v);
        t = v;
      },
    });
    loadElement(video, {
      duration: 20,
      videoWidth: 704,
      videoHeight: 360,
      paused: true,
      videoTracks: [{ configuration: { codec: "avc1.64001E", framerate: 24 } }],
      audioTracks: [],
    });
    await settle();
    key(body.querySelector<HTMLElement>('[data-testid="media-video"]')!, ".");
    expect(writes).toEqual([479.5 / 24]);
  });

  it("with NO frame rate, a step uses the 1/30 s guard (operator decision A)", async () => {
    await mount();
    await open("clip.mp4");
    const body = activeBody();
    const video = body.querySelector<HTMLVideoElement>("video")!;
    const writes: number[] = [];
    let t = 0;
    Object.defineProperty(video, "currentTime", {
      configurable: true,
      get: () => t,
      set: (v: number) => {
        writes.push(v);
        t = v;
      },
    });
    loadElement(video, {
      duration: 20,
      videoWidth: 704,
      videoHeight: 360,
      paused: true,
      videoTracks: [{ configuration: { codec: "avc1.64001E", framerate: 0 } }],
      audioTracks: [],
    });
    await settle();
    key(body.querySelector<HTMLElement>('[data-testid="media-video"]')!, ".");
    expect(writes).toEqual([1.5 / 30]);
  });

  it("while PLAYING the keys do nothing and are not swallowed (A-10)", async () => {
    const { player, writes } = await openVideo({ paused: false });
    const ev = new KeyboardEvent("keydown", {
      key: ".",
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      player.dispatchEvent(ev);
    });
    expect(writes).toEqual([]);
    expect(ev.defaultPrevented).toBe(false);
  });

  it("the strip's frame buttons step exactly like the keys", async () => {
    const { body, writes } = await openVideo();
    await act(async () =>
      body
        .querySelector<HTMLButtonElement>('[data-testid="media-step-next"]')!
        .click(),
    );
    await act(async () =>
      body
        .querySelector<HTMLButtonElement>('[data-testid="media-step-next"]')!
        .click(),
    );
    await act(async () =>
      body
        .querySelector<HTMLButtonElement>('[data-testid="media-step-prev"]')!
        .click(),
    );
    expect(writes).toEqual([1.5 / 24, 2.5 / 24, 1.5 / 24]);
    expect(
      body
        .querySelector('[data-testid="media-step-next"]')!
        .getAttribute("title"),
    ).toContain(".");
    expect(
      body
        .querySelector('[data-testid="media-step-prev"]')!
        .getAttribute("title"),
    ).toContain(",");
  });

  it("a keydown that bubbles from OUTSIDE the player never reaches it", async () => {
    const { body, writes } = await openVideo();
    // The tab strip is a sibling of the player, not inside it.
    key(body.parentElement!, ".");
    expect(writes).toEqual([]);
  });

  it("Space toggles play/pause on the player, but presses a focused strip button instead", async () => {
    const { body, video, player } = await openVideo();
    let plays = 0;
    let pauses = 0;
    video.play = () => {
      plays += 1;
      return Promise.resolve();
    };
    video.pause = () => {
      pauses += 1;
    };
    key(player, " ");
    expect([plays, pauses]).toEqual([1, 0]);
    key(body.querySelector<HTMLElement>('[data-testid="media-loop"]')!, " ");
    expect([plays, pauses]).toEqual([1, 0]);
  });

  it("speed presets set the element's rate; the selected state follows the ELEMENT", async () => {
    const { body, video } = await openVideo();
    const pressed = () =>
      [...body.querySelectorAll<HTMLElement>('[data-testid^="media-rate-"]')]
        .filter((b) => b.getAttribute("aria-pressed") === "true")
        .map((b) => b.dataset.testid);
    expect(pressed()).toEqual(["media-rate-1"]);
    await act(async () =>
      body
        .querySelector<HTMLButtonElement>('[data-testid="media-rate-2"]')!
        .click(),
    );
    expect(video.playbackRate).toBe(2);
    await act(async () => video.dispatchEvent(new Event("ratechange")));
    expect(pressed()).toEqual(["media-rate-2"]);
    // The native controls change the rate behind the strip's back.
    video.playbackRate = 0.5;
    await act(async () => video.dispatchEvent(new Event("ratechange")));
    expect(pressed()).toEqual(["media-rate-0.5"]);
  });

  it("the loop toggle sets the element's loop and shows it", async () => {
    const { body, video } = await openVideo();
    const btn = () =>
      body.querySelector<HTMLButtonElement>('[data-testid="media-loop"]')!;
    expect([video.loop, btn().getAttribute("aria-pressed")]).toEqual([
      false,
      "false",
    ]);
    await act(async () => btn().click());
    expect([video.loop, btn().getAttribute("aria-pressed")]).toEqual([
      true,
      "true",
    ]);
    await act(async () => btn().click());
    expect([video.loop, btn().getAttribute("aria-pressed")]).toEqual([
      false,
      "false",
    ]);
  });

  it("audio steps ±1 s, and has no frame buttons", async () => {
    await mount();
    await open("voice.m4a");
    const body = activeBody();
    const audio = body.querySelector<HTMLAudioElement>("audio")!;
    let t = 10;
    const writes: number[] = [];
    Object.defineProperty(audio, "currentTime", {
      configurable: true,
      get: () => t,
      set: (v: number) => {
        writes.push(v);
        t = v;
      },
    });
    loadElement(audio, { duration: 29.975, paused: true, audioTracks: [] });
    await settle();
    const player = body.querySelector<HTMLElement>(
      '[data-testid="media-audio"]',
    )!;
    key(player, ".");
    key(player, ",");
    key(player, ",");
    expect(writes).toEqual([11, 10, 9]);
    expect(body.querySelector('[data-testid^="media-step"]')).toBeNull();
  });
});

describe("reload keeps the playhead; pause when hidden (M16 WP3 Phase 3)", () => {
  interface Fake {
    el: HTMLVideoElement;
    state: { t: number; paused: boolean; duration: number };
    writes: number[];
    plays: number;
    pauses: number;
  }

  /** Give the CURRENT <video> a controllable state, then fire `loadeddata` (WebKit's load). */
  function fakeLoad(duration: number, start = 0): Fake {
    const el = activeBody().querySelector<HTMLVideoElement>("video")!;
    const f: Fake = {
      el,
      state: { t: start, paused: true, duration },
      writes: [],
      plays: 0,
      pauses: 0,
    };
    Object.defineProperty(el, "currentTime", {
      configurable: true,
      get: () => f.state.t,
      set: (v: number) => {
        f.writes.push(v);
        f.state.t = v;
      },
    });
    Object.defineProperty(el, "paused", {
      configurable: true,
      get: () => f.state.paused,
    });
    Object.defineProperty(el, "readyState", {
      configurable: true,
      get: () => 4,
    });
    el.play = () => {
      f.plays += 1;
      f.state.paused = false;
      return Promise.resolve();
    };
    el.pause = () => {
      f.pauses += 1;
      f.state.paused = true;
    };
    // jsdom lays nothing out (every rect is 0×0, which the player reads as HIDDEN), so put the
    // element on screen; the visibility tests move it.
    placeAt(el, 600, 704);
    loadElement(el, {
      duration,
      videoWidth: 704,
      videoHeight: 360,
      videoTracks: [{ configuration: { codec: "avc1.64001E", framerate: 24 } }],
      audioTracks: [],
    });
    return f;
  }

  /** The operator was at `t`, playing or not, at `rate`, looping or not. */
  function playAt(
    f: Fake,
    t: number,
    playing: boolean,
    rate = 1,
    loop = false,
  ) {
    f.state.t = t;
    f.state.paused = !playing;
    f.el.playbackRate = rate;
    f.el.loop = loop;
    act(() => {
      f.el.dispatchEvent(new Event("timeupdate"));
    });
  }

  async function regenerate(mtime: number) {
    MTIMES["clip.mp4"] = mtime;
    await act(async () => split.current!.checkDiskForPaths(["clip.mp4"]));
    await settle();
  }

  it("a regenerated file resumes at the SAME time, playing, at the same speed and loop (AC-14)", async () => {
    await mount();
    await open("clip.mp4");
    const first = fakeLoad(20);
    playAt(first, 6, true, 1.5, true);
    await regenerate(1790000005000);
    const second = fakeLoad(20);
    expect(second.el).not.toBe(first.el); // a fresh element for the new URL
    expect(second.writes).toEqual([6]); // identity: not "it reloaded", the time itself
    expect(second.el.playbackRate).toBe(1.5);
    expect(second.el.loop).toBe(true);
    expect(second.plays).toBe(1);
    const body = activeBody();
    expect(
      body
        .querySelector('[data-testid="media-rate-1.5"]')!
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      body
        .querySelector('[data-testid="media-loop"]')!
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("a PAUSED player stays paused after the reload", async () => {
    await mount();
    await open("clip.mp4");
    const first = fakeLoad(20);
    playAt(first, 6, false);
    await regenerate(1790000005000);
    const second = fakeLoad(20);
    expect(second.writes).toEqual([6]);
    expect(second.plays).toBe(0);
  });

  it("a SHORTER new file starts from 0 (it has no frame at the old time)", async () => {
    await mount();
    await open("clip.mp4");
    const first = fakeLoad(20);
    playAt(first, 6, false);
    await regenerate(1790000005000);
    const second = fakeLoad(2);
    expect(second.writes).toEqual([0]);
  });

  it("the playhead survives the file going MISSING and coming back unchanged (AC-15 + AC-16)", async () => {
    await mount();
    await open("clip.mp4");
    const first = fakeLoad(20);
    playAt(first, 6, false);
    GONE.add("clip.mp4");
    await act(async () => split.current!.checkDiskForPaths(["clip.mp4"]));
    await settle();
    expect(
      activeBody().querySelector<HTMLElement>('[data-testid="media-card"]')
        ?.dataset.reason,
    ).toBe("missing");
    expect(activeBody().querySelector("video")).toBeNull();
    // Restored with the SAME mtime (`mv` back, `cp -p`): the reducer must not keep the card.
    GONE.delete("clip.mp4");
    await act(async () => split.current!.checkDiskForPaths(["clip.mp4"]));
    await settle();
    const back = fakeLoad(20);
    expect(back.writes).toEqual([6]);
  });

  it("the playhead survives an UNPLAYABLE intermediate write (the unrenderable card) (AC-15)", async () => {
    await mount();
    await open("clip.mp4");
    const first = fakeLoad(20);
    playAt(first, 6, true, 1.5);
    // A render mid-write: the new element fails to load → the info card, player unmounted.
    await regenerate(1790000005000);
    const broken = activeBody().querySelector<HTMLVideoElement>("video")!;
    await act(async () => {
      broken.dispatchEvent(new Event("error"));
    });
    expect(
      activeBody().querySelector<HTMLElement>('[data-testid="media-card"]')
        ?.dataset.reason,
    ).toBe("unrenderable");
    // The finished render lands.
    await regenerate(1790000009000);
    const done = fakeLoad(20);
    expect(done.writes).toEqual([6]);
    expect(done.el.playbackRate).toBe(1.5);
    expect(done.plays).toBe(1);
  });

  it("a new element's events BEFORE it loads do not overwrite the stored playhead", async () => {
    await mount();
    await open("clip.mp4");
    const first = fakeLoad(20);
    playAt(first, 6, false);
    await regenerate(1790000005000);
    const fresh = activeBody().querySelector<HTMLVideoElement>("video")!;
    // WebKit reports a not-yet-loaded element at time 0.
    act(() => {
      fresh.dispatchEvent(new Event("timeupdate"));
      fresh.dispatchEvent(new Event("pause"));
    });
    const second = fakeLoad(20);
    expect(second.writes).toEqual([6]);
  });

  /** Place the element: a DOMRect-shaped box, as WebKit's layout would report it. */
  function placeAt(el: HTMLElement, left: number, width: number, height = 360) {
    el.getBoundingClientRect = () =>
      ({
        left,
        top: 100,
        width,
        height,
        right: left + width,
        bottom: 100 + height,
        x: left,
        y: 100,
        toJSON: () => ({}),
      }) as DOMRect;
  }

  const tick = (f: Fake) =>
    act(() => {
      f.el.dispatchEvent(new Event("timeupdate"));
    });

  it("hidden by display:none (zero rect) → paused at the next timeupdate; shown → NOT resumed (A-4)", async () => {
    await mount();
    await open("clip.mp4");
    const f = fakeLoad(20);
    placeAt(f.el, 600, 704);
    playAt(f, 3, true);
    expect(f.pauses).toBe(0); // on screen: playing on
    placeAt(f.el, 0, 0); // a display:none ancestor
    tick(f);
    expect([f.pauses, f.state.paused]).toEqual([1, true]);
    placeAt(f.el, 600, 704);
    tick(f);
    expect([f.plays, f.state.paused]).toEqual([0, true]);
  });

  it("a workspace pushed off center stage (left:-99999px) → paused", async () => {
    await mount();
    await open("clip.mp4");
    const f = fakeLoad(20);
    placeAt(f.el, 600, 704);
    playAt(f, 3, true);
    placeAt(f.el, -99999 + 600, 704);
    tick(f);
    expect([f.pauses, f.state.paused]).toEqual([1, true]);
  });

  it("a covered or minimized WINDOW (visibilitychange) does NOT pause it (AC-18)", async () => {
    await mount();
    await open("clip.mp4");
    const f = fakeLoad(20);
    placeAt(f.el, 600, 704);
    playAt(f, 3, true);
    const vs = Object.getOwnPropertyDescriptor(
      Document.prototype,
      "visibilityState",
    );
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
    try {
      act(() => {
        document.dispatchEvent(new Event("visibilitychange"));
      });
      expect([f.pauses, f.state.paused]).toEqual([0, false]);
    } finally {
      delete (document as unknown as Record<string, unknown>).visibilityState;
      if (vs) expect(document.visibilityState).toBeDefined();
    }
  });
});
