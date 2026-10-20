import { describe, expect, it } from "vitest";
import type { MediaStat } from "../mediaIpc";
import {
  CARD_REASON_TEXT,
  displayFor,
  formatBytes,
  initialMediaState,
  MAX_ZOOM,
  MEDIA_ELEMENT_LIMIT_BYTES,
  mediaReducer,
  MIN_ZOOM,
  nextZoom,
  ZOOM_STEP,
  type MediaState,
} from "../mediaDisplay";

const stat = (over: Partial<MediaStat> = {}): MediaStat => ({
  path: "/p/a",
  size: 1000,
  mtime_ms: 1,
  pdf_magic: false,
  ...over,
});

describe("displayFor", () => {
  it("image and svg get their viewers", () => {
    expect(displayFor("image", stat())).toEqual({ kind: "image" });
    expect(displayFor("svg", stat())).toEqual({ kind: "svg" });
  });

  it("the 4 GiB cap is applied at exactly the limit, for audio AND video (R-4a)", () => {
    for (const kind of ["video", "audio"] as const) {
      expect(
        displayFor(kind, stat({ size: MEDIA_ELEMENT_LIMIT_BYTES - 1 })),
      ).toEqual({ kind: "player", media: kind });
      expect(
        displayFor(kind, stat({ size: MEDIA_ELEMENT_LIMIT_BYTES })),
      ).toEqual({
        kind: "card",
        reason: "over-media-limit",
      });
    }
    // The real scripture-reading render.
    expect(displayFor("video", stat({ size: 4_865_095_788 }))).toEqual({
      kind: "card",
      reason: "over-media-limit",
    });
    expect(MEDIA_ELEMENT_LIMIT_BYTES).toBe(4294967296);
  });

  it("a PDF is gated on its magic bytes, not its name", () => {
    expect(displayFor("pdf", stat({ pdf_magic: false }))).toEqual({
      kind: "card",
      reason: "not-a-pdf",
    });
    expect(displayFor("pdf", stat({ pdf_magic: true }))).toEqual({
      kind: "pdf",
    });
  });

  it("pdf_magic never promotes a non-PDF kind to the PDF view", () => {
    for (const kind of ["image", "svg", "video", "audio"] as const) {
      expect(displayFor(kind, stat({ pdf_magic: true })).kind).not.toBe("pdf");
    }
  });

  it("every card reason has user-facing text", () => {
    for (const text of Object.values(CARD_REASON_TEXT)) {
      expect(text.length).toBeGreaterThan(10);
    }
  });
});

describe("mediaReducer", () => {
  it("render-error on a live PLAYER → the unrenderable card (the mkv path)", () => {
    const player = mediaReducer(initialMediaState, {
      type: "stat-ok",
      kind: "video",
      stat: stat(),
    });
    expect(player.status === "ready" && player.display).toEqual({
      kind: "player",
      media: "video",
    });
    const failed = mediaReducer(player, { type: "render-error" });
    expect(failed.status === "ready" && failed.display).toEqual({
      kind: "card",
      reason: "unrenderable",
    });
  });

  const ready = mediaReducer(initialMediaState, {
    type: "stat-ok",
    kind: "image",
    stat: stat({ size: 7 }),
  });

  it("stat-ok → ready with the stat and its display", () => {
    expect(ready).toEqual({
      status: "ready",
      stat: stat({ size: 7 }),
      display: { kind: "image" },
    });
  });

  it("stat-fail → failed with the backend's message", () => {
    expect(
      mediaReducer(initialMediaState, {
        type: "stat-fail",
        message: "outside",
      }),
    ).toEqual({ status: "failed", message: "outside" });
  });

  it("render-error turns a live viewer into the unrenderable card, keeping the stat", () => {
    expect(mediaReducer(ready, { type: "render-error" })).toEqual({
      status: "ready",
      stat: stat({ size: 7 }),
      display: { kind: "card", reason: "unrenderable" },
    });
  });

  it("a re-stat that finds the SAME file keeps the state object (no re-render, no re-fetch)", () => {
    const again = mediaReducer(ready, {
      type: "stat-ok",
      kind: "image",
      stat: stat({ size: 7 }),
    });
    expect(again).toBe(ready);
  });

  it("a file that RETURNS unchanged after the missing card clears it (mv out and back, cp -p)", () => {
    // SURFACE-2026-09-29-QUALITY-MEDIA-MISSING-CARD-STICKS-WHEN-FILE-RETURNS-UNCHANGED: `mv`
    // and `cp -p` keep the mtime, so the returning stat is IDENTICAL to the one the missing card
    // kept. The same-stat short-circuit must not apply to a card a stat FAILURE set.
    const gone = mediaReducer(ready, { type: "stat-fail", message: "gone" });
    expect(gone.status === "ready" && gone.display).toEqual({
      kind: "card",
      reason: "missing",
    });
    const back = mediaReducer(gone, {
      type: "stat-ok",
      kind: "image",
      stat: stat({ size: 7 }),
    });
    expect(back.status === "ready" && back.display).toEqual({ kind: "image" });
  });

  it("...and the same for a video: it comes back as the PLAYER, not the card", () => {
    const player = mediaReducer(initialMediaState, {
      type: "stat-ok",
      kind: "video",
      stat: stat(),
    });
    const gone = mediaReducer(player, { type: "stat-fail", message: "gone" });
    const back = mediaReducer(gone, {
      type: "stat-ok",
      kind: "video",
      stat: stat(),
    });
    expect(back.status === "ready" && back.display).toEqual({
      kind: "player",
      media: "video",
    });
  });

  it("an UNRENDERABLE card is still kept on a same-stat re-stat (retrying identical bytes cannot help)", () => {
    const failed = mediaReducer(ready, { type: "render-error" });
    expect(
      mediaReducer(failed, {
        type: "stat-ok",
        kind: "image",
        stat: stat({ size: 7 }),
      }),
    ).toBe(failed);
  });

  it("a re-stat that finds a CHANGED file replaces the stat and retries a failed render", () => {
    const failed = mediaReducer(ready, { type: "render-error" });
    const changed = mediaReducer(failed, {
      type: "stat-ok",
      kind: "image",
      stat: stat({ size: 7, mtime_ms: 2 }),
    });
    expect(changed).toEqual({
      status: "ready",
      stat: stat({ size: 7, mtime_ms: 2 }),
      display: { kind: "image" },
    });
  });

  it("a re-stat FAILING on a showing file → the missing card, keeping the last stat (A-8)", () => {
    expect(mediaReducer(ready, { type: "stat-fail", message: "gone" })).toEqual(
      {
        status: "ready",
        stat: stat({ size: 7 }),
        display: { kind: "card", reason: "missing" },
      },
    );
  });

  it("render-error is a no-op for a card, a failure or a load in flight", () => {
    const card: MediaState = mediaReducer(initialMediaState, {
      type: "stat-ok",
      kind: "video",
      stat: stat({ size: MEDIA_ELEMENT_LIMIT_BYTES }),
    });
    expect(card.status === "ready" && card.display.kind).toBe("card");
    const failed: MediaState = { status: "failed", message: "x" };
    for (const s of [card, failed, initialMediaState]) {
      expect(mediaReducer(s, { type: "render-error" })).toBe(s);
    }
  });
});

describe("formatBytes", () => {
  it.each([
    [0, "0 B"],
    [999, "999 B"],
    [1000, "1.0 KB"],
    [33942, "33.9 KB"],
    [4_865_095_788, "4.9 GB"],
  ])("%d → %s", (n, text) => {
    expect(formatBytes(n)).toBe(text);
  });
});

describe("nextZoom", () => {
  it("stepping from fit continues from the on-screen scale, not 1:1", () => {
    expect(nextZoom({ mode: "fit" }, "in", 0.4)).toEqual({
      mode: "scale",
      scale: 0.4 * ZOOM_STEP,
    });
    expect(nextZoom({ mode: "fit" }, "out", 0.4)).toEqual({
      mode: "scale",
      scale: 0.4 / ZOOM_STEP,
    });
  });

  it("stepping from a scale ignores the fit scale", () => {
    expect(nextZoom({ mode: "scale", scale: 2 }, "in", 0.1)).toEqual({
      mode: "scale",
      scale: 2 * ZOOM_STEP,
    });
  });

  it("reset returns to fit and actual is 1:1", () => {
    expect(nextZoom({ mode: "scale", scale: 3 }, "reset", 1)).toEqual({
      mode: "fit",
    });
    expect(nextZoom({ mode: "fit" }, "actual", 0.2)).toEqual({
      mode: "scale",
      scale: 1,
    });
  });

  it("clamps at both ends", () => {
    expect(nextZoom({ mode: "scale", scale: MAX_ZOOM }, "in", 1)).toEqual({
      mode: "scale",
      scale: MAX_ZOOM,
    });
    expect(nextZoom({ mode: "scale", scale: MIN_ZOOM }, "out", 1)).toEqual({
      mode: "scale",
      scale: MIN_ZOOM,
    });
  });
});
