// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  clearMocks,
  mockConvertFileSrc,
  mockIPC,
  mockWindows,
} from "@tauri-apps/api/mocks";
import { MediaView } from "../MediaView";
import { MEDIA_EXTENSIONS, mediaKind } from "../mediaKind";
import mediaViewSrc from "../MediaView.tsx?raw";
import mediaCardSrc from "../MediaCard.tsx?raw";

// M16 WP2 Phase 3 — no media path reaches a SCRIPT-CAPABLE element except a real PDF.
//
// The app ships `"csp": null`, so an element that runs a file's script runs it with the whole
// webview's reach. WP1 measured that the same SVG runs its script inside `<object>` and not
// inside `<img>`, and Tauri's asset handler serves an unrecognized extension as `text/html`
// (an HTML file named `x.pdf` would run as a page in an iframe). So:
//   - `<object>` / `<embed>` never appear in any media view;
//   - `<iframe>` appears ONLY for kind "pdf" AND `pdf_magic: true` (the backend's `%PDF-` sniff).
// This is asserted on the RENDERED DOM of the real component, for every extension `mediaKind`
// classifies, in both magic states — the population comes from the classifier, so a kind added
// later is covered without editing this file.

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const SCRIPT_CAPABLE = "iframe, object, embed, frame, portal";
let root: Root | null = null;
let host: HTMLDivElement | null = null;

async function render(path: string, pdfMagic: boolean) {
  mockWindows("main");
  mockConvertFileSrc("macos");
  mockIPC((cmd) => {
    if (cmd === "stat_media")
      return {
        path: `/p/${path}`,
        size: 1000,
        mtime_ms: 1,
        pdf_magic: pdfMagic,
      };
    return null;
  });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<MediaView root="/p" path={path} kind={mediaKind(path)!} />);
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
  return host;
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  clearMocks();
});

describe("no media path reaches a script-capable element except a real PDF", () => {
  const cases = MEDIA_EXTENSIONS.flatMap((ext) =>
    [true, false].map((magic) => [ext, magic] as const),
  );

  it("covers every classified extension (population is derived, not listed)", () => {
    expect(cases.length).toBe(MEDIA_EXTENSIONS.length * 2);
    expect(MEDIA_EXTENSIONS).toContain("pdf");
    expect(MEDIA_EXTENSIONS).toContain("svg");
  });

  it.each(cases)("file.%s with pdf_magic=%s", async (ext, magic) => {
    const dom = await render(`file.${ext}`, magic);
    // The view settled into SOMETHING (not stuck loading), so an empty result is meaningful.
    expect(dom.querySelector('[data-testid="media-loading"]')).toBeNull();
    const found = [...dom.querySelectorAll(SCRIPT_CAPABLE)].map((e) =>
      e.tagName.toLowerCase(),
    );
    if (ext === "pdf" && magic) {
      expect(found).toEqual(["iframe"]);
      expect(dom.querySelector('[data-testid="media-pdf"]')).not.toBeNull();
    } else {
      expect(found).toEqual([]);
    }
  });

  it("SVG is an <img>, never an object/embed, even with pdf_magic set", async () => {
    const dom = await render("x.svg", true);
    expect(dom.querySelector('[data-testid="media-svg"] img')).not.toBeNull();
    expect(dom.querySelector(SCRIPT_CAPABLE)).toBeNull();
  });

  it("the PDF <iframe> carries NO sandbox attribute (any sandbox blanks WebKit's PDF viewer)", async () => {
    // Measured 2026-11-06 in dev and a debug bundle: "", allow-same-origin, allow-scripts and
    // allow-scripts+allow-same-origin all load and render blank. jsdom cannot see that, so
    // adding one would ship an empty PDF view with every other gate green.
    const dom = await render("doc.pdf", true);
    const frame = dom.querySelector('[data-testid="media-pdf"] iframe');
    expect(frame).not.toBeNull();
    expect(frame!.hasAttribute("sandbox")).toBe(false);
  });
});

describe("source: the media modules name no other script-capable element", () => {
  const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");

  it("<object> / <embed> appear nowhere; <iframe> exactly once, inside PdfView", () => {
    for (const [name, src] of [
      ["MediaView", mediaViewSrc],
      ["MediaCard", mediaCardSrc],
    ] as const) {
      const code = strip(src);
      expect(code.length, name).toBeGreaterThan(500);
      expect(code, name).not.toMatch(/<(object|embed|frame|portal)\b/);
    }
    const code = strip(mediaViewSrc);
    expect(code.match(/<iframe\b/g)).toHaveLength(1);
    const pdfView = code.slice(
      code.indexOf("function PdfView("),
      code.indexOf("function SvgView("),
    );
    expect(pdfView).toMatch(/<iframe\b/);
  });
});
