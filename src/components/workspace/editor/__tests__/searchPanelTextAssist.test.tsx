// @vitest-environment jsdom
// M16.5 WP6 — CodeMirror's find/replace bar carries NO_TEXT_ASSIST (operator report: it
// autocorrected like the old picker filter). The panel is built by `@codemirror/search`, not
// by our JSX, so WP5's population guard over `<input>` source cannot see it. These open the
// REAL panel on each surface's REAL extension set and read the rendered attributes.
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { openSearchPanel } from "@codemirror/search";
import { buildEditorExtensions } from "../editorExtensions";
import { promptExtensions } from "../../prompt/promptExtensions";
import { SyntheticView } from "../SyntheticView";
import {
  NO_TEXT_ASSIST_ATTRS,
  searchPanelNoTextAssist,
} from "../searchPanelTextAssist";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??=
  NoopResizeObserver;
// jsdom has no layout; CM6 measures text ranges through these.
Range.prototype.getClientRects ??= () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect ??= () =>
  ({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: 0,
    height: 0,
  }) as DOMRect;

const views: EditorView[] = [];
let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(async () => {
  views.splice(0).forEach((v) => v.destroy());
  await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

function mount(extensions: Extension[]): EditorView {
  const parent = document.createElement("div");
  document.body.appendChild(parent);
  const view = new EditorView({
    state: EditorState.create({ doc: "const x = 1;\n", extensions }),
    parent,
  });
  views.push(view);
  return view;
}

/** The panel's typed-text fields, after opening it. */
function textFields(view: EditorView): HTMLInputElement[] {
  openSearchPanel(view);
  return [
    ...view.dom.querySelectorAll<HTMLInputElement>(".cm-search input"),
  ].filter((i) => i.type !== "checkbox");
}

function expectNoAssist(
  fields: HTMLInputElement[],
  names: string[] = ["replace", "search"],
) {
  // Identity, not count: the fields CM6 renders (a read-only view has no `replace`).
  expect(fields.map((f) => f.name).sort()).toEqual(names);
  for (const f of fields) {
    expect(f.getAttribute("spellcheck"), f.name).toBe("false");
    expect(f.getAttribute("autocorrect"), f.name).toBe("off");
    expect(f.getAttribute("autocapitalize"), f.name).toBe("off");
    expect(f.getAttribute("autocomplete"), f.name).toBe("off");
  }
}

describe("CodeMirror's find/replace fields carry NO_TEXT_ASSIST (M16.5 WP6)", () => {
  it("derives exactly the four attributes from NO_TEXT_ASSIST", () => {
    expect(Object.fromEntries(NO_TEXT_ASSIST_ATTRS)).toEqual({
      spellcheck: "false",
      autocorrect: "off",
      autocapitalize: "off",
      autocomplete: "off",
    });
  });

  it("the file editor", () => {
    const view = mount(
      buildEditorExtensions({
        openPath: "main.ts",
        onSave: () => {},
        fontSize: 13,
        onFontSizeChange: () => {},
        languageOverrideId: null,
        lineWrap: false,
        onWrapChange: () => {},
      }),
    );
    expectNoAssist(textFields(view));
  });

  it("the Prompt panel — find fields only; the draft's own attributes are untouched", () => {
    const opts = { fontSize: 13, onFontSizeChange: () => {} };
    const view = mount(promptExtensions(opts));
    expectNoAssist(textFields(view));
    // The same set WITHOUT this extension renders an identical draft: it touches only the
    // find panel, never the prose surface.
    const bare = mount(
      promptExtensions(opts).filter((e) => e !== searchPanelNoTextAssist),
    );
    const attrs = (v: EditorView) =>
      ["spellcheck", "autocorrect", "autocapitalize", "autocomplete"].map((a) =>
        v.contentDOM.getAttribute(a),
      );
    expect(attrs(view)).toEqual(attrs(bare));
  });

  it("the Find Results tab (SyntheticView, find panel via basicSetup; read-only, so no replace field)", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => root!.render(<SyntheticView content={"a\nb"} />));
    const view = EditorView.findFromDOM(host.querySelector(".cm-editor")!)!;
    expect(view).not.toBeNull();
    let fields: HTMLInputElement[] = [];
    await act(async () => {
      fields = textFields(view);
    });
    expectNoAssist(fields, ["search"]);
  });
});
