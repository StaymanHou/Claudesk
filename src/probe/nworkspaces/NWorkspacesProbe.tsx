// M4 WP1 probe — N-workspace mount-cost with the FULL M2 stack.
// THROWAWAY probe code (mounted via ?nwsprobe&n=8&visible=1). DEV-only.
//
// Unlike the M1 `src/probe/cm6/NMountProbe.tsx` (which mounts raw CM6 EditorViews +
// MergeViews in ISOLATION), this probe mounts N copies of the REAL, shipped
// `Workspace` component tree — XtermPane (left CC terminal) + RightPanelHost
// (EditorSplit/CM6 + DiffPanel + second TerminalPane + FileTree). That is the
// actual M4 production load the cost envelope must hold against: the WBS §WP1
// question is "<300MB RAM / <20% active CPU at N≈8 with the full M2 stack mounted."
//
// WHY A BESPOKE MULTI-SEED PATH (not the app's openWorkspace seam): the shipped
// `src/state/workspace.ts` openWorkspace REPLACES (Phase-1 N=1 clamp), so the
// normal `?ws=`/`window.__seedWorkspace` seam can only ever mount ONE workspace.
// Lifting that clamp is WP2's job — and WP2 is DOWNSTREAM of this probe. So we
// build the WorkspaceList array directly with `makeWorkspace` here, mounting N
// real Workspace subtrees side-by-side WITHOUT touching any shipped reducer. No
// production code carries an N>1 change before WP2 plans it deliberately.
//
// LAYOUT mirrors the production CenterStage: every workspace is rendered (all stay
// mounted), exactly `visible` of them shown, the rest display:none (the
// "all workspaces stay mounted" rule). The first one is the active center stage.
//
// TERMINAL BACKING (P1.2): each Workspace's XtermPane spawns `cc_spawn` (real CC).
// At N=8 that is 8 real `claude` processes — the honest worst case. If standing up
// 8 live CC sessions proves impractical at measure-time, the `term=shell` param
// swaps every pane to `term_spawn` (a plain login shell: identical xterm + PTY +
// RightPanelHost mount cost, no CC-auth dependency). The editor+diff mount cost —
// the NEW unknown vs the WP4 terminals-only probe — is independent of which process
// backs the terminal. The substitution + its caveat get recorded in the outcome doc.

import { useMemo } from "react";
import {
  makeWorkspace,
  type Workspace as WorkspaceModel,
} from "../../state/workspace";
import { ProbeWorkspace } from "./ProbeWorkspace";

const params = new URLSearchParams(window.location.search);
const N = Number(params.get("n") ?? "8");
const N_VISIBLE = Number(params.get("visible") ?? "1");
// `cc` (default) → real Claude Code per workspace; `shell` → plain login shell
// (term_spawn) — same mount cost, no CC auth. See header note.
const TERM_BACKING: "cc" | "shell" =
  params.get("term") === "shell" ? "shell" : "cc";
// Seed each workspace at a real, openable directory so the editor file-tree, diff,
// and CC `cd` all have a valid cwd. Defaults to the operator's home; override with
// &root=/abs/path (the probe seeds N workspaces ALL at this one path — fine for a
// cost probe, where what matters is N full mounts, not N distinct repos).
const ROOT = params.get("root") ?? "/Users/stayman/Personal/projects/claudesk";

export default function NWorkspacesProbe() {
  // Build the WorkspaceList array directly — N real workspace records, bypassing
  // the shipped N=1-clamp openWorkspace reducer (see header).
  const workspaces = useMemo<WorkspaceModel[]>(
    () => Array.from({ length: N }, () => makeWorkspace(ROOT)),
    [],
  );

  return (
    <div style={{ background: "#111", color: "#eee", minHeight: "100vh" }}>
      <div
        style={{
          font: "12px ui-monospace, monospace",
          padding: "6px 10px",
          borderBottom: "1px solid #333",
        }}
        data-testid="nwsprobe-banner"
      >
        N-workspace cost probe · N={N} full-M2-stack workspaces · {N_VISIBLE}{" "}
        visible, {N - N_VISIBLE} display:none · terminal={TERM_BACKING} · root=
        {ROOT}
      </div>
      {/* Mirror the production CenterStage: render EVERY workspace, toggle
          visibility — all stay mounted. */}
      <div className="center-stage" data-testid="center-stage">
        {workspaces.map((ws, i) => (
          <ProbeWorkspace
            key={ws.id}
            workspace={ws}
            visible={i < N_VISIBLE}
            termBacking={TERM_BACKING}
          />
        ))}
      </div>
    </div>
  );
}
