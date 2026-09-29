// M16 WP2 — the ONE classifier for "is this editor file tab media, and which kind".
//
// ⚠️ Every consumer calls `mediaKind`. No other module keeps its own list of media
// extensions: PaneTabs' doc-store gate, the viewer's dispatch and the info card all read
// this, so they cannot disagree about which files skip the text load. A guard
// (`mediaKindIsTheOnlyExtensionList.test.ts`) fails if a second list appears in `src/`.
//
// The table is WP1's measured matrix (`wbs.md` → Probe outcomes), not "what Safari plays":
// - image: png jpg/jpeg gif webp heic — all rendered in the real WKWebView.
// - video: mp4 mov webm play; **mkv is classified video but does NOT play** (MEDIA_ERR 4).
//   It is still media, so it skips the text load and reaches the card through the element's
//   fast `error` event rather than a doomed `read_file`.
// - audio: mp3 m4a aac wav flac ogg opus — all played.
// - svg, pdf: their own kinds (SVG renders only via <img>; PDF is gated on its magic bytes).
// Extensions WP1 did not measure (bmp, ico, avif, heif, tiff) are deliberately absent until a
// live check renders them (spec assumption A-9); they fall to the text path, whose NUL sniff
// routes them to the card.

export type MediaKind = "image" | "svg" | "pdf" | "video" | "audio";

const KIND_BY_EXTENSION: Readonly<Record<string, MediaKind>> = {
  png: "image",
  jpg: "image",
  jpeg: "image",
  gif: "image",
  webp: "image",
  heic: "image",
  svg: "svg",
  pdf: "pdf",
  mp4: "video",
  mov: "video",
  webm: "video",
  mkv: "video",
  mp3: "audio",
  m4a: "audio",
  aac: "audio",
  wav: "audio",
  flac: "audio",
  ogg: "audio",
  opus: "audio",
};

/** The last path segment (the file name). */
export function basenameOf(path: string): string {
  const trimmed = path.replace(/\/+$/, "");
  return trimmed.slice(trimmed.lastIndexOf("/") + 1) || path;
}

/** The file's extension, lower-cased, without the dot; "" when it has none. A leading-dot
 *  name with no other dot (`.png`, a dotfile) has no extension. */
export function extensionOf(path: string): string {
  const base = basenameOf(path);
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
}

/** The media kind of `path` by extension (case-insensitive), or `null` for a text file. */
export function mediaKind(path: string): MediaKind | null {
  return KIND_BY_EXTENSION[extensionOf(path)] ?? null;
}

/** Every extension this module classifies. Exported for the table test only. */
export const MEDIA_EXTENSIONS: readonly string[] =
  Object.keys(KIND_BY_EXTENSION);
