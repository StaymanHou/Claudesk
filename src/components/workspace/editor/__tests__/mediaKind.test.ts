import { describe, expect, it } from "vitest";
import {
  basenameOf,
  extensionOf,
  MEDIA_EXTENSIONS,
  mediaKind,
} from "../mediaKind";

describe("mediaKind — the WP1-measured table", () => {
  it.each([
    ["shot.png", "image"],
    ["a/b/photo.jpg", "image"],
    ["photo.jpeg", "image"],
    ["anim.gif", "image"],
    ["x.webp", "image"],
    ["IMG_0001.heic", "image"],
    ["diagram.svg", "svg"],
    ["spec.pdf", "pdf"],
    ["render.mp4", "video"],
    ["clip.mov", "video"],
    ["clip.webm", "video"],
    // Classified video although WebKit cannot play it: it must skip the text load and reach
    // the card via the element's error event.
    ["clip.mkv", "video"],
    ["a.mp3", "audio"],
    ["a.m4a", "audio"],
    ["a.aac", "audio"],
    ["a.wav", "audio"],
    ["a.flac", "audio"],
    ["a.ogg", "audio"],
    ["a.opus", "audio"],
  ])("%s → %s", (path, kind) => {
    expect(mediaKind(path)).toBe(kind);
  });

  it("is case-insensitive on the extension", () => {
    expect(mediaKind("SHOT.PNG")).toBe("image");
    expect(mediaKind("Render.Mp4")).toBe("video");
  });

  it.each([
    "main.ts",
    "Cargo.toml",
    "README",
    "notes.md",
    // A dotfile has no extension, even when its name spells one.
    ".png",
    "dir.png/readme",
    // Not measured by WP1 (A-9): falls to the text path.
    "icon.bmp",
    "logo.avif",
  ])("%s → null (text path)", (path) => {
    expect(mediaKind(path)).toBeNull();
  });

  it("dot-DIRECTORY media is still media (the .playwright-mcp screenshots)", () => {
    expect(mediaKind(".playwright-mcp/page-1.png")).toBe("image");
  });

  it("the table is exactly the WP1 set", () => {
    expect([...MEDIA_EXTENSIONS].sort()).toEqual([
      "aac",
      "flac",
      "gif",
      "heic",
      "jpeg",
      "jpg",
      "m4a",
      "mkv",
      "mov",
      "mp3",
      "mp4",
      "ogg",
      "opus",
      "pdf",
      "png",
      "svg",
      "wav",
      "webm",
      "webp",
    ]);
  });
});

describe("path helpers", () => {
  it("basenameOf / extensionOf", () => {
    expect(basenameOf("a/b/c.PNG")).toBe("c.PNG");
    expect(basenameOf("a/b/")).toBe("b");
    expect(extensionOf("a/b/c.PNG")).toBe("png");
    expect(extensionOf("a.tar.gz")).toBe("gz");
    expect(extensionOf("Makefile")).toBe("");
  });
});
