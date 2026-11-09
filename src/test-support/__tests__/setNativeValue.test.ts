// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { setNativeValue } from "../setNativeValue";

describe("setNativeValue", () => {
  it.each([
    ["input", "input"],
    ["textarea", "input"],
  ] as const)(
    "sets a <%s>'s value and dispatches a bubbling %s",
    (tag, event) => {
      const el = document.createElement(tag);
      document.body.appendChild(el);
      const seen: string[] = [];
      document.body.addEventListener(event, (e) =>
        seen.push((e.target as HTMLInputElement).value),
      );
      setNativeValue(el, "typed");
      expect(el.value).toBe("typed");
      expect(seen).toEqual(["typed"]);
      el.remove();
    },
  );

  it("sets a <select>'s value and dispatches change, not input", () => {
    const select = document.createElement("select");
    for (const v of ["a", "b"]) {
      const o = document.createElement("option");
      o.value = v;
      select.appendChild(o);
    }
    document.body.appendChild(select);
    const events: string[] = [];
    for (const t of ["input", "change"])
      select.addEventListener(t, () => events.push(t));
    setNativeValue(select, "b");
    expect(select.value).toBe("b");
    expect(events).toEqual(["change"]);
    select.remove();
  });

  it("⚠️ a wrong element gets a named error, where the old idiom threw the flake's message", () => {
    const textarea = document.createElement("textarea");
    const globalInputSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!;
    // Positive control: the old idiom on a non-<input> throws the exact message the flake did.
    expect(() => globalInputSetter.call(textarea, "x")).toThrow(
      /'set value' called on an object that is not a valid instance of HTMLInputElement/,
    );
    // The new helper picks the setter by tag, so a textarea is simply set.
    setNativeValue(textarea, "x");
    expect(textarea.value).toBe("x");
  });

  it("sets a control that belongs to another document's window", () => {
    const foreign = new JSDOM("<input>").window.document.querySelector(
      "input",
    )!;
    setNativeValue(foreign, "x");
    expect(foreign.value).toBe("x");
  });

  it("names the wrong element instead of failing inside the setter", () => {
    expect(() => setNativeValue(document.createElement("div"), "x")).toThrow(
      /<div> is not an input, textarea or select/,
    );
    expect(() => setNativeValue(null, "x")).toThrow(/the query found nothing/);
  });
});
