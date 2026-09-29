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

  it("audio/video under 4 GiB → the card, and NO <video> element is built", async () => {
    await mount();
    await open("clip.mp4");
    const card = activeBody().querySelector<HTMLElement>(
      '[data-testid="media-card"]',
    );
    expect(card?.dataset.reason).toBe("player-pending");
    expect(host!.querySelector("video, audio")).toBeNull();
    expect(readFileCalls()).toEqual([]);
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
    await open("clip.mp4");
    const btn = activeBody().querySelector<HTMLButtonElement>(
      '[data-testid="media-card-open"]',
    )!;
    await act(async () => btn.click());
    expect(
      calls.filter((c) => c.cmd === "open_in_default_app").map((c) => c.args),
    ).toEqual([{ root: ROOT, path: "clip.mp4" }]);
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
