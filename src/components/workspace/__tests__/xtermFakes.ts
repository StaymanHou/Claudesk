// The ONE fake of what jsdom cannot run under the real `XtermPane`: xterm.js and its addons (they
// measure cells and paint), `ResizeObserver`, and `requestAnimationFrame` where jsdom lacks it.
//
// ⚠️ `vi.mock` is hoisted above imports, so the `vi.mock` CALLS stay in each test file; only the
// factories live here, loaded with a dynamic import inside the factory:
//
//   vi.mock("@xterm/xterm", async () => (await import("./xtermFakes")).xtermModule());
//   vi.mock("@xterm/addon-fit", async () => (await import("./xtermFakes")).fitAddonModule());
//   vi.mock("@xterm/addon-serialize", async () =>
//     (await import("./xtermFakes")).serializeAddonModule());
//
// ⚠️ This module imports NOTHING from the app (and nothing from `@xterm/*`): it is loaded from
// inside the `@xterm/xterm` mock factory, so an app import here would re-enter the module being
// mocked. That is why it is not part of `liveWorkspace.tsx`, which imports the real `Workspace`.
//
// A new `Terminal` API that `XtermPane` starts calling is added HERE, once.

/** What one constructed fake `Terminal` saw: its options, its OSC handlers, every write. */
export interface TerminalRecord {
  options: Record<string, unknown>;
  osc: Map<number, (data: string) => boolean | Promise<boolean>>;
  writes: unknown[];
}

/** Every fake `Terminal` constructed so far, in order. Clear it in `afterEach` if you read it. */
export const createdTerminals: TerminalRecord[] = [];

class FakeTerminal {
  options: Record<string, unknown>;
  rows = 24;
  cols = 80;
  buffer = { active: { length: 0, baseY: 0, viewportY: 0 } };
  private rec: TerminalRecord;
  constructor(options: Record<string, unknown> = {}) {
    this.options = { ...options };
    this.rec = { options: { ...options }, osc: new Map(), writes: [] };
    createdTerminals.push(this.rec);
  }
  parser = {
    registerOscHandler: (
      ident: number,
      cb: (data: string) => boolean | Promise<boolean>,
    ) => {
      this.rec.osc.set(ident, cb);
      return { dispose() {} };
    },
  };
  loadAddon() {}
  open() {}
  focus() {}
  write(data: unknown) {
    this.rec.writes.push(data);
  }
  dispose() {}
  scrollToLine() {}
  registerMarker() {
    return undefined;
  }
  onData() {
    return { dispose() {} };
  }
}

export function xtermModule() {
  return { Terminal: FakeTerminal };
}

export function fitAddonModule() {
  return {
    FitAddon: class {
      fit() {}
      proposeDimensions() {
        return { cols: 80, rows: 24 };
      }
    },
  };
}

export function serializeAddonModule() {
  return {
    SerializeAddon: class {
      serializeAsHTML() {
        return "";
      }
    },
  };
}

class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

/** Install the jsdom gaps the pane needs. Idempotent (`??=`): a real implementation wins. */
export function installPaneShims() {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??=
    NoopResizeObserver;
  globalThis.requestAnimationFrame ??= (cb: FrameRequestCallback) =>
    setTimeout(() => cb(0), 0) as unknown as number;
  globalThis.cancelAnimationFrame ??= (id: number) => clearTimeout(id);
}
