// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { clearMocks, mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { ProjectPicker } from "../picker/ProjectPicker";
import { NO_TEXT_ASSIST } from "../noTextAssist";

// M16.5 WP5 (5.1) — no WebKit text assistance on inputs that hold names, not prose
// (SURFACE-2026-10-19-PICKER-FILTER-AUTOCORRECT-HIJACKS-THE-ROW-CLICK). A pending autocorrect
// on the picker filter was committed on the row's mousedown, rewrote the filter, unmounted
// the row and lost the click.

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  clearMocks();
});

describe("the picker filter — rendered (the consuming surface)", () => {
  it("carries all four attributes that turn off spellcheck AND autocorrect", async () => {
    mockWindows("main");
    mockIPC(
      (cmd) => {
        switch (cmd) {
          case "prune_missing_projects":
            return [];
          case "list_projects":
            return [{ project_path: "/tmp/scratch/eos", display_name: "eos" }];
          case "picker_announce_actions":
            return {};
          case "profiles_list":
            return [];
          default:
            return null;
        }
      },
      { shouldMockEvents: true },
    );
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root!.render(<ProjectPicker onOpen={() => {}} />);
      await new Promise((r) => setTimeout(r, 25));
    });

    const filter = host.querySelector('[data-testid="picker-filter"]');
    expect(filter, "the picker filter must render").not.toBeNull();
    // ⚠️ `spellcheck` alone does NOT stop WebKit's autocorrect, which is its own attribute.
    expect(filter!.getAttribute("spellcheck")).toBe("false");
    expect(filter!.getAttribute("autocorrect")).toBe("off");
    expect(filter!.getAttribute("autocapitalize")).toBe("off");
    expect(filter!.getAttribute("autocomplete")).toBe("off");
  });
});

describe("every free-text <input> spreads NO_TEXT_ASSIST (population guard)", () => {
  // Inputs that cannot hold typed text get no text assistance anyway, so they are exempt.
  const NON_TEXT_TYPES = new Set([
    "checkbox",
    "radio",
    "date",
    "range",
    "color",
    "file",
    "number",
    "hidden",
  ]);

  function tsxFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) {
        return name === "__tests__" || name === "probe" ? [] : tsxFiles(p);
      }
      return p.endsWith(".tsx") ? [p] : [];
    });
  }

  // Each `<input …/>` JSX element in shipped source, by file. The tag ends at its `/>`
  // (an arrow `=>` inside a prop would defeat a `[^>]*` match).
  const inputs = tsxFiles(join(process.cwd(), "src")).flatMap((file) =>
    [...readFileSync(file, "utf8").matchAll(/<input\b[\s\S]*?\/>/g)].map(
      (m) => ({ file, tag: m[0] }),
    ),
  );
  const textInputs = inputs.filter(({ tag }) => {
    const type = /\btype="([a-z]+)"/.exec(tag)?.[1];
    return type === undefined || !NON_TEXT_TYPES.has(type);
  });

  it("finds the inputs it claims to check (positive control)", () => {
    // 12 free-text inputs carried the spread when this guard was written. A selector that
    // silently matched nothing would make the arm below pass vacuously.
    expect(textInputs.length).toBeGreaterThanOrEqual(12);
    expect(textInputs.some(({ tag }) => tag.includes("picker-filter"))).toBe(
      true,
    );
  });

  it("each one spreads the shared constant", () => {
    const missing = textInputs
      .filter(({ tag }) => !tag.includes("{...NO_TEXT_ASSIST}"))
      .map(({ file, tag }) => `${file}: ${tag.slice(0, 80)}`);
    expect(
      missing,
      "a name/filter/path input without NO_TEXT_ASSIST gets WebKit autocorrect (see 5.1); " +
        "if this input really holds prose, exempt it here with a reason",
    ).toEqual([]);
  });

  it("the constant turns off all four, not just spellcheck", () => {
    expect(NO_TEXT_ASSIST).toEqual({
      spellCheck: false,
      autoCorrect: "off",
      autoCapitalize: "off",
      autoComplete: "off",
    });
  });
});
