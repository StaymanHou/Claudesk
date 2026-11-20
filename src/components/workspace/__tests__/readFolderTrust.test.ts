import { describe, expect, it, vi, beforeEach } from "vitest";

// paydown-2026-11-08 WP5 — the IPC wrapper behind the auto-resume trust term. Default D4: any
// doubt withholds, so every failure must RESOLVE `false` rather than reject (an unhandled
// rejection inside the fire timer would vanish, and the fire would neither run nor say why).

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

const {
  fireAutoResume,
  readFolderTrust,
  readBypassCleared,
  refreshRemoteBypass,
} = await import("../autoResumeFire");

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
  it("reads folder_trusted, then bypass_dialog_cleared, then types through cc_inject", async () => {
    invokeMock.mockImplementation((cmd: string) =>
      Promise.resolve(
        cmd === "folder_trusted" || cmd === "bypass_dialog_cleared"
          ? true
          : undefined,
      ),
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
      "bypass_dialog_cleared",
      "cc_inject",
    ]);
    expect(invokeMock.mock.calls[1][1]).toEqual({
      projectPath: "/u/proj",
      ptySessionId: "pty-9",
    });
    expect(invokeMock.mock.calls[2][1]).toMatchObject({ sessionId: "pty-9" });
  });

  it("an untrusted folder reaches no cc_inject at all", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    invokeMock.mockResolvedValue(false);
    const fired = await fireAutoResume({
      action: { kind: "inject", command: "/session-restore" },
      sessionId: "pty-9",
      projectPath: "/u/proj",
      isCancelled: () => false,
    });
    expect(fired).toBe(false);
    expect(invokeMock.mock.calls.map((c) => c[0])).toEqual([
      "folder_trusted",
      "bypass_dialog_cleared",
    ]);
    expect(warn.mock.calls[0]?.[0]).toContain("/session-restore withheld");
    warn.mockRestore();
  });
});

// M18 WP2 — the bypass-warning read, the same D4 contract as the trust read.
describe("readBypassCleared", () => {
  it("asks the backend about THIS project under THIS session", async () => {
    invokeMock.mockResolvedValue(true);
    await readBypassCleared("/u/proj", "pty-3");
    expect(invokeMock).toHaveBeenCalledWith("bypass_dialog_cleared", {
      projectPath: "/u/proj",
      ptySessionId: "pty-3",
    });
  });

  it("resolves true only for a boolean true", async () => {
    invokeMock.mockResolvedValue(true);
    expect(await readBypassCleared("/u/proj", "pty-3")).toBe(true);
    for (const v of [false, "true", 1, null, undefined]) {
      invokeMock.mockResolvedValue(v);
      expect(await readBypassCleared("/u/proj", "pty-3"), String(v)).toBe(
        false,
      );
    }
  });

  it("resolves false, never rejects, when the IPC fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    invokeMock.mockRejectedValue(new Error("command not found"));
    await expect(readBypassCleared("/u/proj", "pty-3")).resolves.toBe(false);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("a trusted folder whose bypass warning is NOT accepted reaches no cc_inject", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    invokeMock.mockImplementation((cmd: string) =>
      Promise.resolve(cmd === "folder_trusted"),
    );
    const fired = await fireAutoResume({
      action: { kind: "inject", command: "/session-restore" },
      sessionId: "pty-9",
      projectPath: "/u/proj",
      isCancelled: () => false,
    });
    expect(fired).toBe(false);
    expect(invokeMock.mock.calls.map((c) => c[0])).toEqual([
      "folder_trusted",
      "bypass_dialog_cleared",
    ]);
    warn.mockRestore();
  });
});

// M18 WP6 — Recycle's re-read of a REMOTE row's bypass answer before it decides
// (`SURFACE-2026-11-18-QUALITY-REMOTE-BYPASS-ANSWER-STALE-ACROSS-RECYCLE`). A local key must cost
// nothing, and no failure may reject: Recycle awaits it on the restore path.
describe("refreshRemoteBypass", () => {
  const REMOTE = "ssh://me@mini-host/Users/me/p";

  it("makes NO IPC for a local key", async () => {
    await refreshRemoteBypass("/u/proj");
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("asks the host about THIS remote row", async () => {
    invokeMock.mockResolvedValue(true);
    await refreshRemoteBypass(REMOTE);
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith("remote_bypass_refresh", {
      projectPath: REMOTE,
    });
  });

  it("resolves — never rejects — when the IPC fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    invokeMock.mockRejectedValue(new Error("link down"));
    await expect(refreshRemoteBypass(REMOTE)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
