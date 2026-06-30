import { afterEach, describe, expect, it, vi } from "vitest";
import { openFinder, type Invoker } from "../finderLaunch";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("openFinder", () => {
  it("invokes finder_open with the project path", async () => {
    const calls: Array<[string, Record<string, unknown>]> = [];
    const invoker: Invoker = (cmd, args) => {
      calls.push([cmd, args]);
      return Promise.resolve();
    };
    await openFinder("/Users/x/proj", invoker);
    expect(calls).toEqual([["finder_open", { projectPath: "/Users/x/proj" }]]);
  });

  it("surfaces a rejection (console.error) instead of throwing", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const invoker: Invoker = () => Promise.reject(new Error("open failed"));
    await expect(openFinder("/p", invoker)).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalledWith(
      "[finder] open failed:",
      expect.any(Error),
    );
  });
});
