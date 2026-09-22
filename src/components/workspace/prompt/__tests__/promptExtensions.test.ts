import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { undo, redo } from "@codemirror/commands";
import { language } from "@codemirror/language";
import { javascript } from "@codemirror/lang-javascript";
import { promptExtensions } from "../promptExtensions";
import { DEFAULT_PROMPT_FONT_PX } from "../promptFontZoom";
// Vite ?raw imports for the theme-prop regression guard at the foot of this file — the
// repo convention for source-text assertions (same trick as terminalSlotGuard.test.ts).
import panelSource from "../PromptPanel.tsx?raw";
import extensionsSource from "../promptExtensions.ts?raw";

// ═══════════════════════════════════════════════════════════════════════════════
// These tests drive a REAL `EditorState` built from the real extension set, rather than
// inspecting the returned array's shape. That choice is deliberate:
//
//   - An array-shape assertion ("length is 8", "contains N entries") is the
//     length-vs-identity trap that produced three of four holes in WP2
//     (`docs/lessons/source-text-guards.md` entry 15). It passes while the set is wrong.
//   - A source-text guard over `promptExtensions.ts` could only encode shapes someone
//     already thought of, and would be satisfiable by the module's own comments
//     (`[[raw-guard-identifier-satisfied-by-own-comments]]`).
//
// `EditorState.create()` + transactions work headlessly under vitest with NO jsdom —
// established by probe before these were written. So the code under test is simply RUN
// (`[[extract-for-import-when-a-raw-guard-cant-express-the-property]]`).
//
// ⚠️ SCOPE LIMIT, STATED HONESTLY. This project configures no DOM environment, so
// `new EditorView(...)` throws `document is not defined`. Every property below is
// therefore asserted at the STATE level. The purely RENDER-level exclusions — that no
// `.cm-gutters` / `.cm-lineNumbers` element is produced — cannot be observed here and are
// NOT faked with a proxy signal: an extension-count comparison would be exactly the
// count-not-identity assertion this header rejects. Those live in Phase 2's verify-self
// Browser outcomes, against the real WKWebView. Do not "strengthen" this file by adding a
// count-based gutter check.

function makeState(doc = ""): EditorState {
  return EditorState.create({
    doc,
    extensions: promptExtensions({
      fontSize: DEFAULT_PROMPT_FONT_PX,
      onFontSizeChange: () => {},
    }),
  });
}

/** The classes CM6 puts on `.cm-content` via the contentAttributes facet. */
function contentClasses(state: EditorState): string {
  return state
    .facet(EditorView.contentAttributes)
    .map((a) => (a as { class?: string }).class ?? "")
    .join(" ");
}

describe("promptExtensions — what is deliberately IN", () => {
  it("builds a usable EditorState (non-vacuity for every test below)", () => {
    // If the set threw or produced an unusable state, every other assertion in this file
    // would be testing nothing. Pinned first so a broken set fails loudly.
    expect(makeState("hello world").doc.toString()).toBe("hello world");
  });

  it("supports undo AND redo — the pair, not just undo", () => {
    // ⚠️ Both directions asserted against the document's EXACT TEXT, not its length. A
    // length assertion passes for a redo that restores the WRONG content, and "a
    // dictation that cannot be re-done after an over-eager undo" is precisely the data
    // loss this feature exists to prevent — so the weaker assertion would miss the thing
    // that actually matters.
    //
    // Driven through a headless transaction dispatcher rather than an EditorView, since
    // `undo`/`redo` only need `{state, dispatch}`.
    let state = makeState("");
    const target = {
      get state() {
        return state;
      },
      dispatch: (tr: { state: EditorState }) => {
        state = tr.state;
      },
    };

    state = state.update({ changes: { from: 0, insert: "first" } }).state;
    state = state.update({
      changes: { from: state.doc.length, insert: " second" },
    }).state;
    expect(state.doc.toString()).toBe("first second");

    undo(target);
    expect(
      state.doc.toString(),
      "undo must change the document — if history() were missing this is a no-op",
    ).not.toBe("first second");

    redo(target);
    expect(
      state.doc.toString(),
      "redo must restore the exact text undo removed",
    ).toBe("first second");
  });

  it("enables soft line wrapping (a REQUIREMENT for prose, not a preference)", () => {
    // `EditorView.lineWrapping` contributes `class: "cm-lineWrapping"` to the content
    // attributes — readable from the state, no view needed.
    expect(contentClasses(makeState())).toContain("cm-lineWrapping");
  });

  it("POSITIVE CONTROL: a set WITHOUT wrapping does not carry that class", () => {
    // Without this, the assertion above could pass against a probe that reports the class
    // unconditionally — `[[guard-predicate-completeness-vs-mutation-landing]]`.
    const bare = EditorState.create({ doc: "x" });
    expect(contentClasses(bare)).not.toContain("cm-lineWrapping");
  });
});

describe("promptExtensions — what is deliberately OUT", () => {
  it("applies no language mode — nothing to syntax-highlight", () => {
    // A code language on a prose buffer would highlight quotes and braces in dictated
    // English. Read off the real facet rather than from the absence of an import.
    expect(makeState("const x = 1;").facet(language)).toBeNull();
  });

  it("POSITIVE CONTROL: the language probe DOES see a language when one is present", () => {
    // Proves `facet(language) === null` above is a real exclusion and not a probe that
    // can never detect a language at all.
    const withLang = EditorState.create({
      doc: "const x = 1;",
      extensions: [javascript()],
    });
    expect(
      withLang.facet(language),
      "the probe itself is broken if it cannot see a real language",
    ).not.toBeNull();
  });
});

describe("promptExtensions — identity, not count", () => {
  it("returns a fresh array each call (a new identity = a full CM6 reconfigure)", () => {
    // Callers must memoize. Pinned so nobody 'optimizes' this into a module-level
    // singleton, which would silently break the live font-size reconfigure.
    const a = promptExtensions({ fontSize: 14, onFontSizeChange: () => {} });
    const b = promptExtensions({ fontSize: 14, onFontSizeChange: () => {} });
    expect(a).not.toBe(b);
  });

  it("accepts any in-range seed without throwing (the seed's EFFECT is verify-self's)", () => {
    // ⚠️ THIS TEST DELIBERATELY CLAIMS LESS THAN IT LOOKS LIKE IT COULD.
    //
    // A draft of it asserted "the seeded font size reaches the view, two seeds differ".
    // That assertion cannot be made honestly here: the size lives in a CM6 StyleModule
    // that is only materialised when a view MOUNTS, and a probe confirmed it is not
    // reachable from `EditorState` at all (no px value appears anywhere in the resolved
    // config for either seed). The draft's remaining assertions — `small !== large` and
    // two identical theme classes — were both trivially true and would have passed with
    // `fontSize` dropped on the floor entirely. That is a guard reporting green while
    // checking nothing, so it was removed rather than kept for the coverage optics.
    //
    // What IS honest at this level: the seed is accepted at both bounds and does not
    // throw. That the rendered text actually changes size is a Phase 2 verify-self
    // Browser outcome (computed `font-size` before/after ⌘= / ⌘- / ⌘0), where a real
    // view exists to observe.
    expect(() =>
      promptExtensions({ fontSize: 8, onFontSizeChange: () => {} }),
    ).not.toThrow();
    expect(() =>
      promptExtensions({ fontSize: 32, onFontSizeChange: () => {} }),
    ).not.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 2 verify-self REGRESSION GUARD — the dark theme must reach CodeMirror via its
// `theme` PROP, not through `extensions`.
//
// The defect this pins actually shipped into the running app and was caught by reading
// computed styles: the panel rendered with a WHITE background (`rgb(255,255,255)`) while
// the Editor panel beside it was `rgb(30,30,30)`. Cause: `@uiw/react-codemirror` defaults
// `theme` to `"light"` when the prop is omitted and wraps the view in `.cm-theme-light`,
// whose rules beat an equivalent dark theme passed through `extensions`.
//
// ⚠️ Why a SOURCE-TEXT guard here rather than a behavioural one: the bug lives in JSX
// props, and this project configures no DOM environment, so the component cannot be
// rendered under vitest. The live assertion (computed background === the editor's) is a
// Phase 2 verify-self Browser outcome; this guard exists so the prop cannot be quietly
// deleted between verify runs.
describe("PromptPanel wires the dark theme through the `theme` prop", () => {
  it("passes `theme={editorDarkTheme}` to CodeMirror", () => {
    // Comments stripped first: this file's own prose and the panel's explanatory comment
    // both name `editorDarkTheme`, and an unstripped haystack would match those instead —
    // the guard would then pass exactly when the prop was deleted
    // (`[[raw-guard-identifier-satisfied-by-own-comments]]`).
    const src = panelSource
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");

    expect(
      src,
      "the dark theme must be passed as the `theme` PROP — in `extensions` it loses to " +
        "@uiw's default light theme and the panel renders white",
    ).toContain("theme={editorDarkTheme}");
  });

  it("does NOT also put the theme in the extension set (it would apply twice)", () => {
    const extSrc = extensionsSource
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(extSrc).not.toContain("editorDarkTheme");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 2 verify-codify — `basicSetup={false}` is the single line enforcing F-a decision 5.
//
// ⚠️ WHY THIS NEEDS ITS OWN GUARD. Every "what is deliberately OUT" test above asserts over
// the EXTENSION SET, and the set would be entirely unchanged by this regression: flipping
// `basicSetup` back to its default re-adds line numbers, a fold gutter, bracket matching,
// autocompletion and the full code keymap through @uiw's OWN wiring, not through
// `promptExtensions`. So the state-level tests stay green while the rendered surface
// becomes a code editor again. Same shape as the theme-prop defect: a JSX prop that no
// automated gate in this project can see.
//
// The live assertion (0 `.cm-gutters` in the panel, with the Editor as positive control)
// is a verify-self Browser outcome; this guard exists so the prop cannot be quietly
// changed between verify runs.
describe("PromptPanel opts out of basicSetup (F-a decision 5)", () => {
  it("passes `basicSetup={false}` to CodeMirror", () => {
    // Comments stripped: this file's prose and the panel's own explanatory comment both
    // name `basicSetup`, so an unstripped haystack would match those and pass exactly
    // when the prop was deleted (`[[raw-guard-identifier-satisfied-by-own-comments]]`).
    const src = panelSource
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");

    expect(
      src,
      "without `basicSetup={false}` @uiw re-adds line numbers, bracket matching, " +
        "autocompletion and the code keymap — the exact set this prose surface excludes",
    ).toContain("basicSetup={false}");
  });
});
