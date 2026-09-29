import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// M16 WP2 — `mediaKind.ts` is the ONLY place that lists media extensions. PaneTabs' doc-store
// gate, the viewer's dispatch and the card must never disagree about which files skip the text
// load, and they cannot if a single function decides. A second list (a `[".png", ".jpg"]`
// literal, or a `{ png: …, jpg: … }` map) anywhere else in `src/` fails this test.
//
// A file is flagged when it names TWO OR MORE distinct media extensions as a quoted literal
// (`"png"`, `'.jpg'`) or an object key (`png:`). One is allowed: `"opus"` is also a Claude model
// alias (`src/cc/modelOverride.ts`), and a lone name is not a list.
// ⚠️ `svg` and `pdf` are NOT in the detected set: they are also `MediaKind` VALUES, so every
// `case "pdf":` over a kind would read as an extension. Leaving them out loses only a list made
// of those two alone; any real extension list names at least one of the others.

const EXTENSIONS = [
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "heic",
  "mp4",
  "mov",
  "webm",
  "mkv",
  "mp3",
  "m4a",
  "aac",
  "wav",
  "flac",
  "ogg",
  "opus",
];
const ALT = EXTENSIONS.join("|");
const QUOTED = new RegExp(`["'\`]\\.?(${ALT})["'\`]`, "gi");
const KEY = new RegExp(`(?:^|[\\s{,])(${ALT})\\s*:(?!:)`, "gim");

/** The distinct media extensions `src` names as a literal or an object key. */
export function mediaExtensionsNamedIn(src: string): Set<string> {
  const found = new Set<string>();
  for (const re of [QUOTED, KEY]) {
    for (const m of src.matchAll(re)) found.add(m[1].toLowerCase());
  }
  return found;
}

const ROOT = join(process.cwd(), "src");
const OWNER = join("components", "workspace", "editor", "mediaKind.ts");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const p = join(dir, entry);
    if (statSync(p).isDirectory())
      return entry === "__tests__" ? [] : sourceFiles(p);
    return /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [p] : [];
  });
}

describe("mediaKind.ts is the only media-extension list", () => {
  it("the detector sees both forms (positive control on the owner and on literals)", () => {
    const owner = readFileSync(join(ROOT, OWNER), "utf8");
    expect(mediaExtensionsNamedIn(owner).size).toBe(EXTENSIONS.length);
    expect(
      [...mediaExtensionsNamedIn('const X = [".png", ".jpg"];')].sort(),
    ).toEqual(["jpg", "png"]);
    expect(
      [...mediaExtensionsNamedIn("const M = { mp4: 1, mov: 2 };")].sort(),
    ).toEqual(["mov", "mp4"]);
    // Not a key: a TS namespace path, a URL scheme, a word in prose.
    expect(mediaExtensionsNamedIn("a::png; https://x; the png file").size).toBe(
      0,
    );
  });

  it("no other source file names two or more media extensions", () => {
    const files = sourceFiles(ROOT);
    expect(files.length).toBeGreaterThan(100);
    const offenders = files
      .filter((f) => !f.endsWith(OWNER))
      .map(
        (f) =>
          [
            f.slice(ROOT.length + 1),
            [...mediaExtensionsNamedIn(readFileSync(f, "utf8"))],
          ] as const,
      )
      .filter(([, exts]) => exts.length >= 2)
      .map(([f, exts]) => `${f}: ${exts.join(", ")}`);
    expect(offenders).toEqual([]);
  });
});
