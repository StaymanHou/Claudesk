import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// Every command the frontend `invoke`s must be registered in `lib.rs`'s `generate_handler!`.
//
// ⚠️ Why this exists: the binding is stringly-typed. An unregistered command fails only at RUNTIME
// ("command not found"), and every `mockIPC` test answers whatever name it is asked, so the whole
// unit gate stays green (memory `tauri-command-removal-needs-invoke-sweep`). Added at F-b Phase 5
// codify, when four new commands shipped and only a live run proved they were wired.
//
// Scope: literal `invoke("name")` / `invoke<T>("name")` calls in non-test source. A command name
// built at runtime is invisible to this guard.

const ROOT = process.cwd();

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const p = join(dir, entry);
    if (statSync(p).isDirectory())
      return entry === "__tests__" ? [] : sourceFiles(p);
    return /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [p] : [];
  });
}

function registeredCommands(): Set<string> {
  const lib = readFileSync(join(ROOT, "src-tauri", "src", "lib.rs"), "utf8");
  const start = lib.indexOf("generate_handler![");
  const block = lib
    .slice(start, lib.indexOf("])", start))
    .replace(/\/\/.*$/gm, "");
  const names = block
    .slice("generate_handler![".length)
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => s.split("::").pop()!);
  return new Set(names);
}

function invokedCommands(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const f of sourceFiles(join(ROOT, "src"))) {
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(/\binvoke(?:<[^>]*>)?\(\s*"([a-z0-9_]+)"/g)) {
      out.set(m[1], [...(out.get(m[1]) ?? []), f.slice(ROOT.length + 1)]);
    }
  }
  return out;
}

describe("frontend invoke() names vs lib.rs generate_handler!", () => {
  const registered = registeredCommands();
  const invoked = invokedCommands();

  it("reads both sides (positive control: the F-b Phase 5 commands are seen on BOTH)", () => {
    for (const name of [
      "profile_create",
      "profile_delete",
      "profile_dir_status",
      "profile_wizard_defaults",
      "quit_now", // registered bare, without a module path
    ]) {
      expect(registered.has(name), `registered: ${name}`).toBe(true);
      expect(invoked.has(name), `invoked: ${name}`).toBe(true);
    }
    expect(registered.size).toBeGreaterThan(50);
    expect(invoked.size).toBeGreaterThan(50);
  });

  it("every invoked command is registered", () => {
    const missing = [...invoked.entries()]
      .filter(([name]) => !registered.has(name))
      .map(([name, files]) => `${name} (${files.join(", ")})`);
    expect(missing).toEqual([]);
  });
});
