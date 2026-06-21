import { afterEach, describe, expect, it, vi } from "vitest";
import { openSublime, openSublimeMerge, type Invoker } from "../sublimeLaunch";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("openSublime", () => {
  it("invokes sublime_open with the project path", async () => {
    const calls: Array<[string, Record<string, unknown>]> = [];
    const invoker: Invoker = (cmd, args) => {
      calls.push([cmd, args]);
      return Promise.resolve();
    };
    await openSublime("/Users/x/proj", invoker);
    expect(calls).toEqual([["sublime_open", { projectPath: "/Users/x/proj" }]]);
  });

  it("surfaces a rejection (console.error) instead of throwing", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const invoker: Invoker = () => Promise.reject(new Error("subl not found"));
    await expect(openSublime("/p", invoker)).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalledWith(
      "[sublime] open failed:",
      expect.any(Error),
    );
  });
});

describe("openSublimeMerge", () => {
  it("invokes smerge_open with the project path", async () => {
    const calls: Array<[string, Record<string, unknown>]> = [];
    const invoker: Invoker = (cmd, args) => {
      calls.push([cmd, args]);
      return Promise.resolve();
    };
    await openSublimeMerge("/Users/x/proj", invoker);
    expect(calls).toEqual([["smerge_open", { projectPath: "/Users/x/proj" }]]);
  });

  it("surfaces a rejection (console.error) instead of throwing", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const invoker: Invoker = () =>
      Promise.reject(new Error("smerge not found"));
    await expect(openSublimeMerge("/p", invoker)).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalledWith(
      "[smerge] open failed:",
      expect.any(Error),
    );
  });
});
