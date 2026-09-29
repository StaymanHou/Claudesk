// M16 WP2 — the pure half of the editor tab's media viewer: which view a file gets, the
// load state machine, and the zoom and size arithmetic. No React, no IPC, so all of it is
// unit-testable (the editorLoad.ts posture); MediaView.tsx drives it. (Named mediaDisplay,
// not mediaView: macOS's case-insensitive FS would collide it with MediaView.tsx.)

import type { MediaKind } from "./mediaKind";
import type { MediaStat } from "./mediaIpc";

/**
 * WebKit will not load `<video>`/`<audio>` of 4 GiB or more over ANY custom URL scheme (M16 WP1:
 * the 4.86 GB `scripture-reading` render fails with MEDIA_ERR 4 in ~60 ms; a 4.04 GB file plays).
 * Ruled R-4a: such files get the info card, decided from the stat BEFORE any element is built.
 */
export const MEDIA_ELEMENT_LIMIT_BYTES = 4 * 1024 ** 3;

/** Why the info card is shown instead of a viewer. */
export type CardReason =
  /** A media element fired `error` (WP1: every failure is a fast event, never a hang). */
  | "unrenderable"
  /** `read_file` refused a binary (NUL sniff / invalid UTF-8) that is not classified media. */
  | "not-utf8"
  /** `read_file` refused a text file over its size cap. */
  | "too-large"
  /** Audio/video at or over {@link MEDIA_ELEMENT_LIMIT_BYTES}. */
  | "over-media-limit"
  /** Audio/video under the limit: the review player arrives in M16 WP3. */
  | "player-pending"
  /** A `.pdf` whose bytes do not start with `%PDF-`. */
  | "not-a-pdf"
  /** A real PDF: the in-tab PDF view arrives in this feature's Phase 3. */
  | "pdf-pending";

/** The one-line explanation the card shows for each reason. */
export const CARD_REASON_TEXT: Readonly<Record<CardReason, string>> = {
  unrenderable: "Claudesk can't display this file.",
  "not-utf8": "This is a binary file, so it can't be opened as text.",
  "too-large": "This file is too large to open in the editor.",
  "over-media-limit":
    "This file is larger than 4 GiB, the most the built-in player can load.",
  "player-pending": "The built-in player for audio and video is coming soon.",
  "not-a-pdf": "This file has a .pdf name but isn't a PDF.",
  "pdf-pending": "The built-in PDF view is coming soon.",
};

/** What a stat'ed media file shows. */
export type MediaDisplay =
  | { kind: "image" }
  | { kind: "svg" }
  | { kind: "card"; reason: CardReason };

/** Decide the display for a classified file from its stat. Pure; the ONE place the 4 GiB cap
 *  and the PDF magic gate are applied. */
export function displayFor(kind: MediaKind, stat: MediaStat): MediaDisplay {
  switch (kind) {
    case "image":
      return { kind: "image" };
    case "svg":
      return { kind: "svg" };
    case "pdf":
      return {
        kind: "card",
        reason: stat.pdf_magic ? "pdf-pending" : "not-a-pdf",
      };
    case "video":
    case "audio":
      return {
        kind: "card",
        reason:
          stat.size >= MEDIA_ELEMENT_LIMIT_BYTES
            ? "over-media-limit"
            : "player-pending",
      };
  }
}

export type MediaState =
  | { status: "loading" }
  | { status: "ready"; stat: MediaStat; display: MediaDisplay }
  /** `stat_media` itself failed (outside the root, missing, a directory). */
  | { status: "failed"; message: string };

export type MediaEvent =
  | { type: "stat-ok"; kind: MediaKind; stat: MediaStat }
  | { type: "stat-fail"; message: string }
  /** The rendering element fired `error`. */
  | { type: "render-error" };

export const initialMediaState: MediaState = { status: "loading" };

export function mediaReducer(state: MediaState, event: MediaEvent): MediaState {
  switch (event.type) {
    case "stat-ok":
      return {
        status: "ready",
        stat: event.stat,
        display: displayFor(event.kind, event.stat),
      };
    case "stat-fail":
      return { status: "failed", message: event.message };
    case "render-error":
      // Only a live viewer can fail to render; a card or a failed stat has no element.
      return state.status === "ready" && state.display.kind !== "card"
        ? { ...state, display: { kind: "card", reason: "unrenderable" } }
        : state;
  }
}

/** A byte count as Finder shows it (decimal units, one decimal place above bytes). */
export function formatBytes(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = -1;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

// ---- Zoom -------------------------------------------------------------------------------

/** `fit` scales the image to the pane; `scale` is a fixed CSS-pixel ratio (1 = 1:1). */
export type ZoomState = { mode: "fit" } | { mode: "scale"; scale: number };

export type ZoomAction = "in" | "out" | "reset" | "actual";

export const ZOOM_STEP = 1.25;
export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 16;

/**
 * The next zoom state. `fitScale` is the ratio `fit` currently renders at (rendered width /
 * natural width), so stepping from `fit` continues from what is on screen rather than from 1:1.
 * `reset` returns to `fit` (⌘0), `actual` is 1:1.
 */
export function nextZoom(
  state: ZoomState,
  action: ZoomAction,
  fitScale: number,
): ZoomState {
  if (action === "reset") return { mode: "fit" };
  if (action === "actual") return { mode: "scale", scale: 1 };
  const current = state.mode === "fit" ? fitScale : state.scale;
  const stepped = action === "in" ? current * ZOOM_STEP : current / ZOOM_STEP;
  return {
    mode: "scale",
    scale: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, stepped)),
  };
}
