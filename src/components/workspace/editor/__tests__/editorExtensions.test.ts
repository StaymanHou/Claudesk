import { describe, it, expect, vi } from "vitest";
import { EditorState, EditorSelection } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import { language } from "@codemirror/language";
import { buildEditorExtensions } from "../editorExtensions";

// The builder returns opaque CM6 Extension objects, so we verify it the way CM6
// itself consumes them: feed the array into EditorState.create and assert the
// resulting state's observable configuration (facets + keymap bindings). No live
// EditorView / DOM — this stays a pure unit test (repo posture: pure → vitest).

function makeState(opts?: {
  openPath?: string;
  onSave?: () => void;
  fontSize?: number;
  onFontSizeChange?: (px: number) => void;
  languageOverrideId?: string | null;
}) {
  return EditorState.create({
    doc: "hello world\nhello again\n",
    extensions: buildEditorExtensions({
      openPath: opts?.openPath ?? "main.ts",
      onSave: opts?.onSave ?? (() => {}),
      fontSize: opts?.fontSize ?? 13,
      onFontSizeChange: opts?.onFontSizeChange ?? (() => {}),
      languageOverrideId: opts?.languageOverrideId ?? null,
    }),
  });
}

describe("buildEditorExtensions", () => {
  it("enables multiple selections", () => {
    const state = makeState();
    // allowMultipleSelections is a facet; when on, the state accepts a multi-range
    // selection without collapsing it to one range.
    const multi = state.update({
      selection: EditorSelection.create([
        EditorSelection.range(0, 5),
        EditorSelection.range(12, 17),
      ]),
    }).state;
    expect(multi.selection.ranges.length).toBe(2);
    expect(state.facet(EditorState.allowMultipleSelections)).toBe(true);
  });

  it("registers a Mod-s binding that invokes the save callback", () => {
    const onSave = vi.fn();
    const state = makeState({ onSave });
    // Pull every keymap binding the config installed and find Mod-s.
    const bindings = state.facet(keymap).flat();
    const saveBinding = bindings.find((b) => b.key === "Mod-s");
    expect(saveBinding).toBeDefined();
    // Invoking its run() should call onSave and report handled (true).
    // The command signature takes an EditorView; our handler ignores it.
    const handled = saveBinding!.run!({} as never);
    expect(handled).toBe(true);
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("registers the Mod-d select-next-occurrence binding", () => {
    const state = makeState();
    const bindings = state.facet(keymap).flat();
    const modD = bindings.find((b) => b.key === "Mod-d");
    expect(modD).toBeDefined();
    expect(typeof modD!.run).toBe("function");
  });

  it("binds the font-zoom chords (Mod-=, Mod-+, Mod--, Mod-0)", () => {
    const state = makeState();
    const keys = new Set(
      state
        .facet(keymap)
        .flat()
        .map((b) => b.key),
    );
    expect(keys.has("Mod-=")).toBe(true);
    expect(keys.has("Mod-+")).toBe(true);
    expect(keys.has("Mod--")).toBe(true);
    expect(keys.has("Mod-0")).toBe(true);
  });

  it("includes the search keymap (find chord present)", () => {
    const state = makeState();
    const bindings = state.facet(keymap).flat();
    // @codemirror/search binds Mod-f to open the search panel.
    const findBinding = bindings.find((b) => b.key === "Mod-f");
    expect(findBinding).toBeDefined();
  });

  it("binds Mod-r to open the find/replace panel (operator's replace chord)", () => {
    const state = makeState();
    const bindings = state.facet(keymap).flat();
    const replaceBinding = bindings.find((b) => b.key === "Mod-r");
    expect(replaceBinding).toBeDefined();
    expect(typeof replaceBinding!.run).toBe("function");
  });

  it("applies the language mode by file extension (no throw for known/unknown)", () => {
    // A TS file builds without error; an unknown extension falls back to plaintext.
    expect(() => makeState({ openPath: "main.ts" })).not.toThrow();
    expect(() => makeState({ openPath: "notes.unknownext" })).not.toThrow();
    expect(() => makeState({ openPath: "" })).not.toThrow();
  });

  it("accepts a palette language override without throwing (WP3b)", () => {
    // A .md file forced to Rust via the palette override builds cleanly; so does
    // an unknown override id (falls back to plaintext).
    expect(() =>
      makeState({ openPath: "notes.md", languageOverrideId: "rust" }),
    ).not.toThrow();
    expect(() =>
      makeState({ openPath: "main.ts", languageOverrideId: "plaintext" }),
    ).not.toThrow();
    expect(() =>
      makeState({ openPath: "x.rs", languageOverrideId: "totally-unknown" }),
    ).not.toThrow();
  });

  // WP3b codify — the language facet must actually reflect the active mode. This
  // is the regression class that scared verify-human (a .md file showing no
  // markdown highlighting): the language extension being silently absent. We
  // assert the resolved `language` facet is populated for a known mode and
  // tracks the override, rather than only asserting "doesn't throw".
  describe("language facet reflects extension default vs palette override", () => {
    const langName = (s: ReturnType<typeof makeState>) =>
      s.facet(language)?.name ?? null;

    it("a .md file with no override resolves the markdown language", () => {
      expect(langName(makeState({ openPath: "notes.md" }))).toBe("markdown");
    });

    it("a .rs file with no override resolves the rust language", () => {
      expect(langName(makeState({ openPath: "lib.rs" }))).toBe("rust");
    });

    it("an override forces that language regardless of the file extension", () => {
      // .md file, but the palette forced Rust → the facet must be rust.
      expect(
        langName(
          makeState({ openPath: "notes.md", languageOverrideId: "rust" }),
        ),
      ).toBe("rust");
    });

    it("an unknown extension with no override has no language (plaintext)", () => {
      expect(langName(makeState({ openPath: "notes.txt" }))).toBe(null);
    });
  });

  it("returns a non-empty extension array", () => {
    const ext = buildEditorExtensions({
      openPath: "x.rs",
      onSave: () => {},
      fontSize: 13,
      onFontSizeChange: () => {},
      languageOverrideId: null,
    });
    expect(Array.isArray(ext)).toBe(true);
    expect(ext.length).toBeGreaterThan(0);
  });
});
