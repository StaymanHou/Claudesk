import { describe, expect, it, vi, beforeEach } from "vitest";

// paydown-2026-11-08 WP5 — the IPC wrapper behind the auto-resume trust term. Default D4: any
// doubt withholds, so every failure must RESOLVE `false` rather than reject (an unhandled
// rejection inside the fire timer would vanish, and the fire would neither run nor say why).

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

const { fireAutoResume, readFolderTrust } = await import("../autoResumeFire");

beforeEach(() => {
  invokeMock.mockReset();
});

describe("readFolderTrust", () => {
  it("asks the backend about THIS project under THIS session's live profile", async () => {
    invokeMock.mockResolvedValue(true);
    await readFolderTrust("/u/proj", "pty-3");
    expect(invokeMock).toHaveBeenCalledWith("folder_trusted", {
      projectPath: "/u/proj",
      ptySessionId: "pty-3",
    });
  });

  it("resolves true only for a boolean true", async () => {
    invokeMock.mockResolvedValue(true);
    expect(await readFolderTrust("/u/proj", "pty-3")).toBe(true);
    for (const v of [false, "true", 1, null, undefined]) {
      invokeMock.mockResolvedValue(v);
      expect(await readFolderTrust("/u/proj", "pty-3"), String(v)).toBe(false);
    }
  });

  it("resolves false — never rejects — when the IPC fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    invokeMock.mockRejectedValue(new Error("command folder_trusted not found"));
    await expect(readFolderTrust("/u/proj", "pty-3")).resolves.toBe(false);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("fireAutoResume's DEFAULT seams are the real ones", () => {
  // `XtermPane` passes neither `readTrust` nor `inject`, so these defaults ARE production.
  it("reads folder_trusted, then types through cc_input", async () => {
    invokeMock.mockImplementation((cmd: string) =>
      Promise.resolve(cmd === "folder_trusted" ? true : undefined),
    );
    const fired = await fireAutoResume({
      action: { kind: "inject", command: "/session-restore" },
      sessionId: "pty-9",
      projectPath: "/u/proj",
      isCancelled: () => false,
    });
    expect(fired).toBe(true);
    expect(invokeMock.mock.calls.map((c) => c[0])).toEqual([
      "folder_trusted",
      "cc_input",
    ]);
    expect(invokeMock.mock.calls[1][1]).toMatchObject({ sessionId: "pty-9" });
  });

  it("an untrusted folder reaches no cc_input at all", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    invokeMock.mockResolvedValue(false);
    const fired = await fireAutoResume({
      action: { kind: "inject", command: "/session-restore" },
      sessionId: "pty-9",
      projectPath: "/u/proj",
      isCancelled: () => false,
    });
    expect(fired).toBe(false);
    expect(invokeMock.mock.calls.map((c) => c[0])).toEqual(["folder_trusted"]);
    expect(warn.mock.calls[0]?.[0]).toContain("/session-restore withheld");
    warn.mockRestore();
  });
});
