---
name: node-strip-types-fails-on-extensionless-runtime-imports
description: `node --experimental-strip-types` fails on a TS module with extensionless RUNTIME imports but works when the sibling imports are all `import type` — so the same project convention appears to work then break. Use a throwaway vitest spec instead; `vite-node` is NOT installed here.
metadata:
  type: project
---

Hit repeatedly while probing `src/state/workflowMachine/` (M15 WP2).

## The asymmetry

This project imports siblings extensionlessly (`from "./edges"`) — the convention across
every `src/state/*.ts`. Node's ESM resolver requires the extension, so `node
--experimental-strip-types` **fails on such a module**:

```
ERR_MODULE_NOT_FOUND  .../src/state/workflowMachine/edges
```

⚠️ **But it succeeds on a module whose sibling imports are all `import type`** — those lines
are **erased before Node's resolver ever sees them**. So the runner worked on `edges.ts` and
`policy.ts` (type-only siblings) and then failed on `lookup.ts` (a runtime `import
{ edgeById, EDGES }`).

⚠️ **The failure presents as a broken MODULE, not a wrong runner** — which is why a verify-self
subagent and I each spent time on it independently. The module is fine; the convention is
fine; the runner is the wrong tool.

## What to use instead

A throwaway vitest spec in `tmp/scratch/` (gitignored) — it uses the project resolver, so
extensionless imports just work:

```ts
import { resolvePolicy } from "../../src/state/workflowMachine/lookup";
```

⚠️ **`./node_modules/.bin/vite-node` is NOT installed in this repo** — only `vite` and
`vitest`. An instruction naming `vite-node` will fail with exit 127.

⚠️ **Vitest swallows `console.log`** by default. To see a value, assert it into a failure
message (`expect(JSON.stringify(out)).toBe("SHOW")`) and read the `Received:` line, or write
to a file.

⚠️ **A scratch spec placed under `src/` trips the funnel guard** (`workflowMachineFunnel.test.ts`
pins the importer population) — that is the guard working, not a defect. Use `tmp/scratch/`.
