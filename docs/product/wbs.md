---
stage: wbs
state: complete
milestone: Milestone 8 — Demo assets (filmstrip & PiP value showcase)
updated: 2026-06-29
---

# WBS — Milestone 8: Demo assets (filmstrip & PiP value showcase)

> **Scope: Milestone 8 only.** Per the WBS just-in-time rule, this decomposes only the immediate next milestone. Future milestones (M9 time-analytics, M10 docs-viewer, M11 auto-resume, M12 skill-orch, M13 polish) stay tracked in `roadmap.md` and are decomposed JIT when reached.
>
> **⚠️ THIS WBS IS PROVISIONAL BELOW WP1 — subject to change after the WP1 probe.** M8 is unusual: its output is *marketing/communication assets* (GIF and/or video), not working software, and it is **agent-produced end-to-end** (Claude Code drives capture/render/embed on the real installed `.app`; the operator verifies at checkpoints). **WP1 is a genuine feasibility probe** — agent-driven screen capture of a native macOS app, and agent-choreographed staging of a believable multi-project scenario, are BOTH unproven here. WP1's outcome (GO/NO-GO, chosen format, capture toolchain, what the agent can vs. can't stage) **redefines WP2–WP4**: their tasks, sizes, and even existence depend on what WP1 establishes. Treat WP2–WP4 as the *intended* shape, to be re-decomposed at WP1 close. *(`SURFACE-2026-06-29-DEMO-ASSETS-FILMSTRIP-AND-PIP`; roadmap Revision 2026-06-29b.)*

## Milestone goal (from roadmap)

Two short demo recordings that *show*, not tell, the two hardest-to-explain value props of the shipped multi-workspace UX — both of which serve the vision's **Core Principle 6** (status visibility scales beyond the foreground) and the *attention-is-the-scarce-resource* thesis (memory `[[claudesk-philosophy]]`):

- **(a) Filmstrip** — multitasking ~4 CC-driven projects at once; the operator's attention moving between them as their status dots change; a tile click promoting a project to center stage. *In-window* status visibility.
- **(b) PiP** — staying in deep/mentally-intensive work (or watching YouTube) in another app while an always-on-top PiP keeps CC's progress monitorable in the corner; a dot flipping to awaiting-input as the monitorable signal. *Out-of-window* status visibility.

Assets are for the README, the GitHub release pages, and the M13 open-source launch.

## Design-priors consult

Read `docs/product/design-priors.md` (3 priors, all about UI surfaces / modes / config). **None fires on M8's WP boundaries** — M8 builds no UI surface, ships no setting, infers no mode. The over-infer guard (rule 5) applies: the recorded priors are about *product-design* tradeoffs in the app, not about how to decompose a demo-asset milestone. WP decomposition here follows common sense (rule 1). The relevant *thesis* anchor is `[[claudesk-philosophy]]` (attention is scarce) — which is the demos' subject matter, not a decomposition lean.

---

## Work Packages

### WP1: Probe — agent capture/render pipeline + format decision + scenario-stageability
**Type:** probe
**Milestone:** M8 (FIRST — gates WP2–WP4; nothing final is produced before this closes)
**Dependencies:** none (the features to demo — M4 filmstrip, M5 PiP — already shipped + released in v0.2.0–v0.2.3)
**Size:** M
**Learning objective:** Can a Claude Code agent, by itself, (1) capture the screen / a window region of the real installed Claudesk `.app` to video on macOS, (2) render that capture to a README-embeddable deliverable, and (3) drive/choreograph a believable multi-project demo scenario — and what is the right **format** (GIF vs MP4 vs both) given what the pipeline can actually produce and what GitHub README embedding supports? Where the agent *can't* fully self-drive (e.g. starting a real screen recording may need a one-time macOS Screen-Recording permission, or the "watch YouTube" backdrop needs operator setup), document the exact operator-assist seam.
**Timebox:** half-day
**Success criterion:** A written probe-outcome section (appended to this WBS under "## Probe outcomes — WP1") recording: **(a) GO/NO-GO** on agent-driven capture; **(b) the chosen format** (+ why) with a target dimensions / length / file-size budget for README inline embedding; **(c) the capture toolchain** (tool, how a timed recording is started + stopped, how the agent triggers it); **(d) the render toolchain** (e.g. ffmpeg palettegen/paletteuse for GIF, or gifski, or ffmpeg H.264 for MP4) proven on at least one throwaway sample clip; **(e) the staging verdict** — can the agent choreograph the 4-project filmstrip scenario + the PiP-over-another-app scenario via the MCP bridge / scripted IPC alone, or which beats need operator assist; **(f)** the asset repo path + how GitHub renders it (inline `<img>`/`![]()` for GIF vs. uploaded-attachment MP4). The probe MAY produce a rough sample asset as proof — but the polished WP2/WP3 deliverables are NOT produced here.
**Tasks:**
- [ ] 1.1 Inventory the available capture/render tooling on this host and what each can do: `screencapture -v` (built-in, but interactive/permission-gated?), `ffmpeg` + `avfoundation` device list (`ffmpeg -f avfoundation -list_devices true -i ""`), whether `gifski` is worth `brew install`. Note the macOS **Screen Recording permission** requirement and whether a Finder/Dock-launched capture (vs. a terminal-launched one) changes the permission prompt — this is the M8 analogue of the installed-build PATH gotcha.
- [ ] 1.2 Prove a minimal end-to-end capture→render on a throwaway clip: start a timed screen/region capture programmatically, stop it, render to BOTH a sample GIF and a sample MP4, and eyeball file size + legibility at README-ish width (~800–1000px). Record the size/quality tradeoff. (This is the GO/NO-GO core.)
- [ ] 1.3 Decide the format(s) and the budget. GitHub README inline-autoplay favors GIF (no controls, loops) but GIFs balloon at high fidelity + long length; MP4 is higher-fidelity but embeds as an uploaded attachment, not an arbitrary repo path. Weigh the two demos separately (a 10–15s filmstrip loop vs. a longer PiP "I'm doing other work" sequence may want different formats). Record the decision + rationale.
- [ ] 1.4 Probe scenario-stageability via the MCP bridge: open ~4 scratch workspaces, drive them to *different* statuses (one AwaitingInput, others Running/Idle) so the filmstrip dots differ, and confirm the agent can both *capture that frame* and *trigger a visible status transition* mid-recording. Reuse the M5/M6 bridge teardown discipline (`lsof -ti tcp:1420 tcp:9223 | xargs -r kill -9` + `driver_session{stop}`). Note any beat the agent can't stage (e.g. raw xterm typing is low-fidelity per the CLAUDE.md bridge caveat — so status transitions must be IPC/click-driven, not typed).
- [ ] 1.5 Probe the PiP-over-another-app scenario specifically: confirm the PiP NSPanel stays always-on-top + visible over a *different* foreground app during capture, and decide whether the "deep work / YouTube" backdrop can be agent-staged (open a window, play a local video) or needs operator assist. The blur-driven auto-summon (M5 WP5) is the behavior that makes this demo work — confirm it fires under capture.
- [ ] 1.6 Need a 4th scratch repo: `tmp/scratch/` has scratch-a/b/c; create a `scratch-d` (its own git repo + baseline commit) so the filmstrip demo can show ~4 distinct projects. (`tmp/` is gitignored — fine for a staging fixture.)
- [ ] 1.7 Write the "## Probe outcomes — WP1" section (success criterion above) and **re-decompose WP2–WP4 in this WBS** to match what the probe established (format, per-demo tasks, operator-assist seams). This task IS the back-loop that makes WP2–WP4 real.

**WP1 → WP2 rationale:** Pure learning-sequence ordering — WP1 resolves the two riskiest unknowns (can the agent capture at all; can it stage the scenario) before any effort goes into a polished take. If WP1 is NO-GO on full self-drive, the milestone reshapes (operator records to a script the agent writes, then the agent renders/embeds) rather than wasting takes against a dead end. This mirrors the project's standing probe-first discipline (M1 thumbnail probe, M4 N-cost probe, M5 WP1 nspanel probe).

---

> **WP2–WP4 are PROVISIONAL — re-decomposed at WP1 close (task 1.7).** The shape below is the *intent*; sizes/tasks/format assume a GO on agent-driven GIF+MP4 capture and full agent staging. Adjust after the probe.

### WP2: Filmstrip demo asset
**Description:** Produce the polished filmstrip demo — ~4 CC-driven projects open as workspaces, the filmstrip roster with live ~1fps mirrors + differing status dots, attention shifting as a project flips to AwaitingInput, and a tile click promoting it to center stage. The narrative beat: *"4 projects in flight, one glance tells you which needs you, one click jumps there."* Staged on the scratch repos (a–d).
**Milestone:** M8
**Dependencies:** WP1 (format + capture toolchain + staging verdict)
**Size:** M *(provisional)*
**Tasks:**
- [ ] 2.1 Stage the 4-workspace scenario per WP1's proven recipe; arrange the filmstrip so the dots differ (≥1 AwaitingInput, others Running/Idle).
- [ ] 2.2 Capture the choreographed sequence: establishing glance over the roster → a dot flips to AwaitingInput → click that tile → it promotes to center stage. Keep it short (WP1's length budget).
- [ ] 2.3 Render to the WP1-chosen format(s) within the size budget; iterate on legibility (text crispness at README width is the usual GIF failure mode).
- [ ] 2.4 Operator-verify checkpoint: does it legibly convey the parallel-project-attention value? Re-take if the operator's feedback needs it.

### WP3: PiP demo asset
**Description:** Produce the polished PiP demo — the PiP panel pinned always-on-top while the operator works in another app (deep-focus work / YouTube), CC progress visible in the corner, a status dot flipping to AwaitingInput as the monitorable signal. The narrative beat: *"Do your other work — CC stays watchable in the corner and pings you the moment it needs you."*
**Milestone:** M8
**Dependencies:** WP1 (esp. the PiP-over-another-app + backdrop-staging verdict from task 1.5)
**Size:** M *(provisional — higher staging risk than WP2; the "another app" backdrop is the unproven part)*
**Tasks:**
- [ ] 3.1 Stage the backdrop per WP1's verdict (agent-opened window / local video, or operator-assisted) with the PiP pinned (`On` or auto-summoned via blur).
- [ ] 3.2 Capture: operator-focus is on the other app, PiP visible in the corner, CC running → a dot flips to AwaitingInput (the "it needs you now" moment).
- [ ] 3.3 Render to the WP1-chosen format(s) within budget; iterate on legibility.
- [ ] 3.4 Operator-verify checkpoint: does it legibly convey the monitor-while-elsewhere value? Re-take if needed.

### WP4: Embed + place
**Description:** Commit the final assets to the repo (path per WP1) and embed them in `README.md`; make them available for the GitHub release page + the M13 open-source launch. The README currently has an Install + Develop section (271 lines) — the demos belong near the top, illustrating the pitch.
**Milestone:** M8
**Dependencies:** WP2, WP3
**Size:** S *(provisional)*
**Tasks:**
- [ ] 4.1 Commit the assets at the WP1-decided path (watch repo bloat — large binaries in git history are forever; if the size budget is high, note whether release-page-upload-only beats in-repo).
- [ ] 4.2 Embed in README near the top with a one-line caption each (filmstrip = parallel-project attention; PiP = monitor-while-elsewhere). Confirm GitHub actually renders them inline (the WP1 format decision drives this).
- [ ] 4.3 Milestone-exit verify: both assets render correctly on GitHub (push + view the rendered README); operator final-approves. Mark the M8 exit criteria met.

---

## Dependency Map

```
WP1 (probe: capture/render + format + staging)  ← FIRST, gates everything
  ├──> WP2 (filmstrip demo)  ─┐
  └──> WP3 (PiP demo)        ─┤
                              └──> WP4 (embed + place in README/release)
```

- **Critical path:** WP1 → (WP2 ‖ WP3) → WP4.
- **Parallel track:** WP2 and WP3 are independent once WP1 lands — they share the capture toolchain but stage different scenarios, so they can be produced in either order (or interleaved). WP3 carries the higher staging risk (the "another app" backdrop), so if WP1 flags it, do WP2 first to bank one win.
- **No 3rd-party API / SDK** in the build sense — the only "external" dependency is the macOS capture stack (`screencapture`/`ffmpeg avfoundation`) + the Screen-Recording permission, which WP1 (the probe) exists to de-risk. No orchestration/async layer.

## Notes

- **Why a probe-first WBS for a "just record some GIFs" task:** the operator's explicit decision is that the agent produces these end-to-end. Agent-driven screen capture of a native macOS app (permission-gated, possibly interactive) and agent-choreographed staging of a 4-project + PiP-over-another-app scenario are real unknowns — exactly the kind the project's probe-first discipline exists for. Calling WP1 a probe (not a formality) is the operator's framing, carried verbatim.
- **Operator-assist seam is expected, not a failure.** A NO-GO on *full* self-drive (e.g. the macOS Screen-Recording permission needs a one-time human grant, or the YouTube backdrop is easier operator-staged) does not sink the milestone — it reshapes WP2–WP4 to "agent writes the precise shot-list + scenario, operator does the minimal manual beat, agent renders + embeds." WP1 documents exactly where that seam falls.
- **Verification posture:** these assets are visual + subjective, so the verify tier is **operator-judgment at each demo's checkpoint** (WP2.4 / WP3.4) + a GitHub-renders-correctly check at WP4.3. There is no `cargo test` / `vitest` slice — M8 ships no code (except possibly a throwaway capture helper script, which is not production code). This is the rare milestone where the agent-GREEN slice is "the sample clip rendered and is legible," not a test suite.
- **CLAUDE.md bridge caveats carry in:** raw xterm typing is low-fidelity over the MCP bridge, so status transitions for the demos must be IPC/click-driven; and the bridge teardown port-cleanup (`lsof -ti tcp:1420 tcp:9223 | xargs -r kill -9`) is the default after any staging session.

## Architecture check

No architectural gaps. M8 adds no production code, no new module, no new dependency to the shipped app (a capture helper, if any, is a throwaway dev script). The features being demonstrated (M4 filmstrip, M5 PiP) are already built, released, and documented in `arch.md`. **No `/product-arch` back-loop needed** → WBS complete → `/product-context` next (or proceed straight to `/feature-*` / `/session-start` to execute WP1, since M8 introduces no new architecture to context-load).
