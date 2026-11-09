// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { waitForElement } from "../waitForElement";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("waitForElement", () => {
  it("finds an element that appears AFTER the call", async () => {
    setTimeout(() => {
      const el = document.createElement("input");
      el.dataset.testid = "late";
      document.body.appendChild(el);
    }, 50);
    // Positive control: it is not there yet, so a single query would have returned null.
    expect(document.querySelector('[data-testid="late"]')).toBeNull();
    const el = await waitForElement('[data-testid="late"]');
    expect(el.tagName).toBe("INPUT");
    el.remove();
  });

  it("rejects with the selector named when nothing appears", async () => {
    await expect(waitForElement('[data-testid="never"]', 60)).rejects.toThrow(
      /\[data-testid="never"\] did not appear within 60 ms/,
    );
  });
});
