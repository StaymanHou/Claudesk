// M10 WP2 — minimal TEMPORARY update trigger.
//
// A tiny always-mounted corner widget that drives the production update flow:
// "Check for updates" → invoke("updater_check"); if a newer version exists, a bare
// inline confirm (version + "Update & relaunch?") → invoke("updater_apply")
// (download → minisign-verify → install → self-clear quarantine → relaunch).
//
// This is a THROWAWAY trigger. WP4 replaces it with the polished user-control UX —
// a non-modal update notification, an app-menu "Check for updates…" item, skip-this-
// version, disable-notifications, a real cancel/confirm dialog + progress bar. It is
// deliberately self-contained (inline styles, its own confirm state — NOT the shared
// ConfirmModal) so WP4 can delete this one file cleanly. It is NOT DEV-gated: the flow
// must be reachable in the release build (the only tier that reproduces Gatekeeper),
// so WP6 can drive the real installed-build end-to-end verify.

import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface UpdateCheckResult {
  current_version: string;
  available_version: string | null;
  status: string;
}

type Phase = "idle" | "checking" | "confirm" | "applying";

export function UpdaterTrigger() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [status, setStatus] = useState<string>("idle");
  const [available, setAvailable] = useState<string | null>(null);

  const onCheck = async () => {
    setPhase("checking");
    setStatus("checking…");
    try {
      const r = await invoke<UpdateCheckResult>("updater_check");
      setStatus(r.status);
      if (r.available_version) {
        setAvailable(r.available_version);
        setPhase("confirm");
      } else {
        setAvailable(null);
        setPhase("idle");
      }
    } catch (e) {
      setStatus(`check error: ${String(e)}`);
      setPhase("idle");
    }
  };

  const onConfirm = async () => {
    setPhase("applying");
    setStatus("downloading + installing…");
    try {
      // On success the process relaunches and this never resolves; any resolve/reject
      // means the flow returned early (no update / a failure stage). Cancel is simply
      // NOT calling this — the running app is untouched until install() extracts+replaces.
      const r = await invoke<string>("updater_apply");
      setStatus(`returned without relaunch: ${r}`);
      setPhase("idle");
    } catch (e) {
      setStatus(`update error: ${String(e)}`);
      setPhase("idle");
    }
  };

  const onCancel = () => {
    // Cancel before install: the running app is untouched.
    setAvailable(null);
    setPhase("idle");
    setStatus("update canceled (app unchanged)");
  };

  return (
    <div
      data-testid="updater-trigger"
      style={{
        position: "fixed",
        bottom: 8,
        right: 8,
        zIndex: 99999,
        background: "#1c1c22",
        border: "1px solid #3a3a44",
        borderRadius: 6,
        padding: "8px 10px",
        font: "11px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace",
        color: "#d8d8e0",
        maxWidth: 320,
        boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 4, color: "#8ab4f8" }}>
        Claudesk updater
      </div>

      {phase === "confirm" && available ? (
        <div data-testid="updater-confirm" style={{ marginBottom: 6 }}>
          <div style={{ marginBottom: 4 }}>
            Update available: <strong>{available}</strong>. Update &amp; relaunch?
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              type="button"
              data-testid="updater-confirm-apply"
              onClick={onConfirm}
              style={{ ...btnStyle, borderColor: "#5b8def", color: "#cfe0ff" }}
            >
              Update &amp; relaunch
            </button>
            <button
              type="button"
              data-testid="updater-confirm-cancel"
              onClick={onCancel}
              style={btnStyle}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
          <button
            type="button"
            data-testid="updater-check"
            onClick={onCheck}
            disabled={phase === "checking" || phase === "applying"}
            style={btnStyle}
          >
            Check for updates
          </button>
        </div>
      )}

      <div
        data-testid="updater-status"
        style={{ wordBreak: "break-word", opacity: 0.9 }}
      >
        {status}
      </div>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  background: "#2a2a33",
  border: "1px solid #454550",
  borderRadius: 4,
  color: "#e0e0e8",
  padding: "3px 8px",
  cursor: "pointer",
  font: "inherit",
};
