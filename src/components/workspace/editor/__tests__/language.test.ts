import { describe, it, expect } from "vitest";
import {
  extensionOf,
  languageForExtension,
  languageForPath,
  languageForId,
  SYNTAX_MODES,
} from "../language";

describe("extensionOf", () => {
  it("extracts a simple extension", () => {
    expect(extensionOf("main.ts")).toBe("ts");
    expect(extensionOf("App.tsx")).toBe("tsx");
    expect(extensionOf("lib.rs")).toBe("rs");
  });

  it("lowercases the extension", () => {
    expect(extensionOf("README.MD")).toBe("md");
    expect(extensionOf("Component.JSX")).toBe("jsx");
  });

  it("uses only the final dot segment", () => {
    expect(extensionOf("archive.tar.gz")).toBe("gz");
    expect(extensionOf("my.component.test.ts")).toBe("ts");
  });

  it("strips directory portions", () => {
    expect(extensionOf("/abs/path/to/file.rs")).toBe("rs");
    expect(extensionOf("src/components/Foo.tsx")).toBe("tsx");
    expect(extensionOf("C:\\win\\path\\x.js")).toBe("js");
  });

  it("returns empty for no extension", () => {
    expect(extensionOf("Makefile")).toBe("");
    expect(extensionOf("/a/b/LICENSE")).toBe("");
  });

  it("treats a leading-dot dotfile as having no extension", () => {
    expect(extensionOf(".gitignore")).toBe("");
    expect(extensionOf("/repo/.prettierrc")).toBe("");
  });

  it("handles an empty string", () => {
    expect(extensionOf("")).toBe("");
  });
});

describe("languageForExtension", () => {
  // The returned Extension objects are opaque; we assert known languages produce
  // a non-empty extension and unknown ones produce the empty plaintext extension.
  const known = [
    "js",
    "cjs",
    "mjs",
    "jsx",
    "ts",
    "cts",
    "mts",
    "tsx",
    "rs",
    "md",
    "markdown",
    "mdx",
  ];
  it.each(known)("returns a non-empty extension for .%s", (ext) => {
    const result = languageForExtension(ext);
    // js/ts variants return a single LanguageSupport (truthy object); rust/markdown too.
    expect(result).toBeTruthy();
    expect(Array.isArray(result) && result.length === 0).toBe(false);
  });

  it("returns the empty plaintext extension for unknown types", () => {
    expect(languageForExtension("txt")).toEqual([]);
    expect(languageForExtension("json")).toEqual([]);
    expect(languageForExtension("")).toEqual([]);
  });

  it("is case-insensitive", () => {
    expect(languageForExtension("TS")).toBeTruthy();
    expect(Array.isArray(languageForExtension("TS"))).toBe(false);
  });
});

describe("languageForPath", () => {
  it("derives the language from a full path", () => {
    expect(languageForPath("src/lib.rs")).toBeTruthy();
    expect(languageForPath("/x/y/notes.txt")).toEqual([]);
  });
});

// WP3b — the palette syntax-selection targets.
describe("SYNTAX_MODES + languageForId", () => {
  it("offers exactly the supported modes, in order", () => {
    expect(SYNTAX_MODES.map((m) => m.id)).toEqual([
      "javascript",
      "jsx",
      "typescript",
      "tsx",
      "rust",
      "markdown",
      "plaintext",
    ]);
  });

  it("every mode has a human label", () => {
    for (const m of SYNTAX_MODES) {
      expect(typeof m.label).toBe("string");
      expect(m.label.length).toBeGreaterThan(0);
    }
  });

  it("returns a non-empty language extension for every non-plaintext mode id", () => {
    for (const m of SYNTAX_MODES) {
      const result = languageForId(m.id);
      if (m.id === "plaintext") {
        expect(result).toEqual([]);
      } else {
        expect(result).toBeTruthy();
        expect(Array.isArray(result) && result.length === 0).toBe(false);
      }
    }
  });

  it("falls back to plaintext ([]) for an unknown id", () => {
    expect(languageForId("totally-unknown")).toEqual([]);
    expect(languageForId("")).toEqual([]);
  });
});
