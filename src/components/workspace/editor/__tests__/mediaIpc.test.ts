import { describe, expect, it, vi } from "vitest";
import prefixes from "../readErrorPrefixes.json";
import {
  classifyReadError,
  openInDefaultApp,
  statMedia,
  type Invoker,
} from "../mediaIpc";

// The exact strings the Rust `EditorFsError` Display impl produces (see editor_fs/mod.rs
// `routed_error_messages_start_with_the_shared_prefixes`, which pins the same JSON).
const notUtf8 =
  "file is not valid UTF-8 text: /p/a.bin (binary: NUL byte in the first 8192 bytes)";
const tooLarge =
  "file is too large to open as text: /p/log.txt (70000000 bytes; limit 67108864)";

describe("classifyReadError", () => {
  it("routes the two card errors by the shared prefixes", () => {
    expect(notUtf8.startsWith(prefixes.notUtf8)).toBe(true);
    expect(tooLarge.startsWith(prefixes.tooLarge)).toBe(true);
    expect(classifyReadError(notUtf8)).toBe("not-utf8");
    expect(classifyReadError(tooLarge)).toBe("too-large");
  });

  it("leaves every other error on the editor's error state", () => {
    for (const msg of [
      "path ../x is outside the workspace root /p",
      "root /tmp is not a known project",
      "file I/O error: No such file or directory (os error 2)",
      // A prefix that merely OCCURS later in the message is not a match.
      `file I/O error: ${prefixes.notUtf8}`,
    ]) {
      expect(classifyReadError(msg)).toBe("other");
    }
  });

  it("accepts a non-string rejection", () => {
    expect(classifyReadError(new Error("boom"))).toBe("other");
    expect(classifyReadError(undefined)).toBe("other");
  });
});

describe("media IPC wrappers", () => {
  it("statMedia passes root + path and returns the backend's stat", async () => {
    const stat = { path: "/p/a.png", size: 3, mtime_ms: 1, pdf_magic: false };
    const invoker = vi.fn<Invoker>().mockResolvedValue(stat);
    await expect(statMedia("/p", "a.png", invoker)).resolves.toBe(stat);
    expect(invoker).toHaveBeenCalledWith("stat_media", {
      root: "/p",
      path: "a.png",
    });
  });

  it("openInDefaultApp calls the command and surfaces a rejection instead of throwing", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const invoker = vi.fn<Invoker>().mockRejectedValue("outside the workspace");
    await expect(
      openInDefaultApp("/p", "../x.png", invoker),
    ).resolves.toBeUndefined();
    expect(invoker).toHaveBeenCalledWith("open_in_default_app", {
      root: "/p",
      path: "../x.png",
    });
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});
