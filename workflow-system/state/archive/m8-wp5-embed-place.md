# Feature: M8 WP5 — Embed + place the demo GIFs (milestone exit)

**Workflow:** feature
**State:** Completed 2026-06-29
**Created:** 2026-06-29
**drive_mode:** autopilot

## Problem Statement
M8's two demo assets — `filmstrip.gif` (parallel-project attention) and `pip.gif` (monitor-while-elsewhere) — are rendered and operator-approved but live only in the gitignored `tooling/demo/out/` dir, so they are not in the repo and not visible to anyone reading the README or a GitHub release page. WP5 (the M8 milestone-exit WP) commits both GIFs to a tracked path (`docs/demo/`), embeds them near the top of `README.md` with a one-line caption each, then **pushes** the accumulated M8 work and verifies on github.com that both GIFs render inline + autoplay-loop in the rendered README. This is the last WP of M8 — completing it meets the M8 exit criteria. (No app code changes; demo-tooling under `tooling/demo/` is dev-only and already shipped in WP2–WP4.)

## Work Tree

- [x] Phase 1: Commit assets + embed in README  <!-- status: done — all impl + verify nodes complete -->
  <!-- (header checkbox ticked; impl + all 4 verify leaves below are [x]) -->
  **Observable outcomes:**
  - CLI: `git ls-files docs/demo/` lists `docs/demo/filmstrip.gif` and `docs/demo/pip.gif` (both tracked, not ignored); `git check-ignore docs/demo/filmstrip.gif` exits non-zero (not ignored).
  - CLI: both committed GIFs are < 3 MB (`wc -c < docs/demo/filmstrip.gif` and `pip.gif` each well under 3145728 bytes — known ~334KB / ~367KB).
  - CLI: `grep -c 'docs/demo/filmstrip.gif' README.md` ≥ 1 AND `grep -c 'docs/demo/pip.gif' README.md` ≥ 1 (both embedded via relative path).
  - CLI: each embed has an adjacent one-line caption; `grep -i 'filmstrip' README.md` and `grep -i 'picture-in-picture\|PiP' README.md` both match near the embeds.
  - Browser: (deferred to Phase 2 — GitHub-rendered README is the real render surface; local Markdown preview is not authoritative for inline-GIF autoplay.)
  - [x] P1.1 Create `docs/demo/` and copy both rendered GIFs from `tooling/demo/out/` (`filmstrip.gif`, `pip.gif`) into it; confirm both are tracked + under budget.  <!-- status: done — docs/demo/{filmstrip,pip}.gif copied; check-ignore exit 1 (tracked); 334KB / 367KB, both < 3MB -->
  - [x] P1.2 Embed both GIFs near the top of `README.md` (before Install, illustrating the pitch) via relative `![]()`/`<img>`, each with a one-line caption (filmstrip = "N projects in flight, one glance shows which needs you, one click jumps there"; PiP = "stay in your other work — CC stays watchable in the corner and pings you the moment it needs you").  <!-- status: done — <p align=center><img width=720> blocks at README L9–20, before ## Install (L29); 1 ref each; captions present -->
  - [x] verify-auto  <!-- status: done — assets tracked + <3MB + valid GIF89a (animated); README img srcs resolve; HTML balanced (2 <p>/2 <img>) -->
  - [x] verify-self  <!-- status: done — no integration boundary (isolated new GIF assets + README docs edit, no code in any consumed file). Static slice all-PASS: not-ignored + git-addable (dry-run adds both), <3MB, valid GIF89a animated, both README relative refs resolve, captions present, placed before ## Install. git ls-files empty (untracked-not-yet-staged) — staging happens at ship/Phase 2; the trackable fact holds. Browser inline-render+autoplay-loop is the github.com surface — DEFERRED to Phase 2 (WP5.3 operator-judgment); no dev URL / live app surface exists for a Playwright runner here (per CLAUDE.md verify-self posture). -->
  - [x] verify-human  <!-- status: done — AUTO-SKIPPED (F11) per drive_mode=autopilot; no integration boundary (isolated new GIF assets + README docs edit), verify-self all-PASS, no outcome cites a Phase-1-touched consuming surface. The real operator render-check lands at Phase 2 / WP5.3 (github.com), which pauses in autopilot. -->
  - [x] verify-codify  <!-- status: done — added tooling/demo/readme-assets.nodetest.mjs (4 tests: README refs both GIFs; each ref resolves; each < 3MB; each is animated GIF89a). Full tooling/demo suite 72/72 pass (was 68). Guards the broken/oversized front-page-image regression. -->

- [x] Phase 2: Push + verify rendered README on github.com (milestone exit)  <!-- status: done — all impl + verify nodes [x]; operator approved render (M8 exit met) -->
  **Observable outcomes:**
  - CLI: `git push` succeeds; `git rev-parse origin/main` equals local `HEAD` after push (all M8 commits + this WP's commit are on origin/main).
  - Browser: the rendered README at `https://github.com/StaymanHou/Claudesk` shows BOTH GIFs inline near the top, animating (autoplay-loop — GitHub serves committed GIFs as animated `<img>`), with their captions.
  - Operator: final-approves the rendered README (genuine operator-judgment checkpoint — milestone exit). Mark M8 exit criteria met.
  - [x] P2.1 Stage + commit the WP5 change (assets + README) per the workflow's ship discipline; then push the full local backlog of M8 commits to origin/main.  <!-- status: done — commit f7b1310 (docs/demo/{filmstrip,pip}.gif + README embeds + codify test); pushed 1c62e7b..f7b1310; origin/main == HEAD == f7b1310 (all 10 M8 commits on GitHub). WIP file deferred to finalize. -->
  - [ ] P2.2 Open the rendered README on github.com, confirm both GIFs render inline + autoplay-loop; operator final-approves; mark M8 exit criteria met.  <!-- status: NOT-STARTED — operator-judgment checkpoint at verify-human -->
  - **Relevance check (before Phase 2):**
    - Requester still needs this: yes — operator explicitly asked "wp5 + finish M8 + push"
    - Requirements unchanged: yes — embed + push + render-verify, as planned
    - Solution still feasible: yes — assets committed + pushed; github.com render is the verify surface
    - No superior alternative discovered: yes
    - **Verdict:** proceed
  - [x] verify-auto  <!-- status: done — push landed: origin/main == HEAD == f7b1310; 0 unpushed; all 10 M8 commits reachable on remote; committed README refs both GIFs (1 each); both GIFs in pushed tree as blobs (334KB/367KB). -->
  - [x] verify-self  <!-- status: done — no integration boundary (push of doc/asset files). GitHub serves BOTH GIFs at the README's resolved <img src> URL (raw.githubusercontent.com/.../main/docs/demo/{filmstrip,pip}.gif): HTTP 200, content-type image/gif, byte-identical to committed blobs (sha256 match), valid GIF89a (animated). This de-risks the operator render check — only the subjective inline-placement/legibility/caption judgment + final-approve remains, DEFERRED to P2.2/verify-human (the milestone-exit operator checkpoint). -->
  - [x] verify-human  <!-- status: done — operator approved render 2026-06-29: both GIFs render inline + autoplay-loop on github.com, M8 exit criteria MET. Operator then requested additional WP5 README work (back-loop to build, see Phase 3) — NOT a rejection of the render. -->
    - [x] P2.verify-human.1 Open https://github.com/StaymanHou/Claudesk — BOTH GIFs render inline near the top (above Install), animating/autoplay-loop.  <!-- status: done — operator "all good" -->
    - [x] P2.verify-human.2 Captions read well + placement looks right; the two demos are legible/compelling.  <!-- status: done -->
    - [x] P2.verify-human.3 Final-approve → M8 exit criteria met.  <!-- status: done — "all good" -->
  - [ ] verify-codify  <!-- status: NOT-STARTED -->

- [x] Phase 3: README top-of-file restructure + 2 new philosophy bullets  <!-- status: done — all impl + verify nodes [x] -->  <!-- (was: operator-requested at P2 verify-human after approving the render) -->
  **Operator ask (2026-06-29, post-render-approval):**
  1. Reorganize the README top: **(1st)** a punchy one-liner delivering the *value / "aha"* to the target audience; **(then)** the two demos, each as a *problem-line → feature-line → demo-immediately-underneath* block; **(only after)** the original README content (current opening paragraph + Status + Install + …).
  2. Add **2 new philosophy bullets**: (a) UX designed with the **single-monitor / laptop** scenario in mind; (b) **local dev env over cloud dev env**.
  **Observable outcomes:**
  - CLI: README opens with the value one-liner (before the old `A macOS-only…` paragraph); the two demo `<img>` each sit immediately under a problem-line + feature-line; the old opening paragraph + Status block now appear AFTER the demo section. `grep -n` confirms ordering: value-liner line# < filmstrip img line# < pip img line# < old `## Install` line#.
  - CLI: `grep -c 'docs/demo/filmstrip.gif' README.md` == 1 AND `grep -c 'docs/demo/pip.gif' README.md` == 1 (no duplicate embeds introduced by the move).
  - CLI: the Philosophy section gains 2 new bullets — `grep -i 'single.monitor\|laptop' README.md` and `grep -i 'local.*dev env\|cloud' README.md` both match within the Philosophy section.
  - CLI: `tooling/demo` suite still 72/72 (the readme-assets codify test still passes after the restructure).
  - Browser: (operator re-checks rendered github.com after the next push — folded into P3 verify-human.)
  - [x] P3.1 Restructure README top: value one-liner → demo blocks (problem/feature/gif) → then original content.  <!-- status: done — h3 value/aha one-liner + short lede; two problem→feature→<img> blocks (hr-separated); then the original `A macOS-only…` paragraph + Status + Install follow. Each <img> moved out of its old <p>+caption block into the new feature block (caption text folded into the feature line). One-liner finalized 2026-06-29 (commit c34925a) to operator-selected "Many Claude Code projects. One window. Zero hunting." (chosen from a brainstormed candidate set). -->
  - **Note (verify-self CDN lag):** raw.githubusercontent.com caches ~5 min, so a raw re-fetch can lag a fresh push; the authoritative check is the github API blob at the pushed SHA (`/contents/README.md?ref=<sha>` with `Accept: vnd.github.raw`) — confirmed the new one-liner at c34925a. The rendered repo page reads the API/blob layer, not the raw CDN, so it shows the latest.
  - [x] P3.2 Add the 2 philosophy bullets (single-monitor/laptop; local-over-cloud dev env).  <!-- status: done — "Designed for a single screen — the laptop scenario" + "Local dev environment, not cloud", inserted after "Wrap the official tools" before the vision.md pointer. -->
  - [x] verify-auto  <!-- status: done — ordering value-liner(L3)<filmstrip(L22)<pip(L34)<old para(L39)<Install(L55); embeds 1 each (no dup from move); both philosophy bullets present; problem/feature lines above each gif; readme-assets codify test still 72/72. -->
  - [x] verify-self  <!-- status: done — pushed f7b1310..157242d. Re-fetched README from github main: byte-identical to committed (sha256 match), all 5 structural markers present (value one-liner, both gif refs, both philosophy bullets); both GIFs still served HTTP 200 image/gif. Subjective render legibility → operator at verify-human. -->
  - [x] verify-human  <!-- status: done — operator approved restructured README + finalized one-liner ("good", 2026-06-29). Design-prior capture: operator chose to SKIP (no priors written for the 2 philosophy bullets). -->
  - [x] verify-codify  <!-- status: done — no NEW codifiable behavior (prose restructure); the existing readme-assets.nodetest.mjs guard (both GIFs ref'd/exist/<3MB/animated) survived the restructure: 72/72. -->

## Current Node
- **Path:** Feature > finalize (ship + review-quality complete)
- **Active scope:** All phases [x]; shipped (c34925a, pushed); review-quality done (0C/0M/2 MINOR auto-backlogged). Operator approved render (M8 exit criteria MET). Ready for finalize → then /product-finalize for M8 cycle-close.
- **Blocked:** none
- **Unvisited:** ship, review-quality, finalize (then /product-finalize for M8 cycle-close — archives wbs.md + the m8-wp1 probe record).
- **Design-prior capture:** operator chose to SKIP (no priors written). Resolved.
- **Open discoveries:** README "Status" block (L9–17) is stale — says "Milestones 1–4 shipped" and lists the OLD roadmap (M5 PiP/M6 menu-bar/M7 auto-resume/M8 skill-orch/M9 polish); reality is M1–M7 shipped + released v0.2.3, resequenced roadmap (M8 demo / M9 time-analytics / M10 docs-viewer / …). Out of WP5 scope; logged for a future README-freshen task or `/product-finalize`.

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow/backlog.md -->
- [SURFACED-2026-06-29] README Status block — stale milestone summary + old roadmap list (see Current Node note). Not WP5 scope; candidate for a README-freshen task.
- Quality-findings fold-in candidates (low, dev-only `tooling/demo/`): m8-wp2/wp3/wp4 MINOR batches in `workflow/backlog-quality-findings.md`. WP5 touches the README + asset placement, NOT the harness JS, so these are NOT naturally folded here — leave for a `/feature-refactor`. (The WP2 smoke-timeline "one-system" naming recast is the only one with thematic pull, but it's harness JS, not README.)

## Code-Quality Review — M8 WP5 (Embed + place the demo GIFs)

*(feature-review-quality on ship commit c34925a; Mode 3 autopilot auto-backlog. 0 CRITICAL / 0 MAJOR / 2 MINOR.)*

### Strengths
- Codify guard derives its asset list from the README itself (`matchAll(/docs\/demo\/[\w.-]+\.gif/g)`) rather than hardcoding paths — auto-covers any future embed, catches the real front-page-image regression.
- Test failure messages are specific (echo offending path, byte count vs budget, magic bytes found).
- `.nodetest.mjs` naming correct + self-documenting (kept out of the app's vitest glob), wired into `tooling/demo`'s test script, runs (72/72).
- 3 MB budget pinned to a named constant with a WBS-sourced rationale comment.
- Clean, accessible problem→feature→demo README structure (centered `<p>`, `width=720`, descriptive `alt`).

### Issues
**CRITICAL** — (none)
**MAJOR** — (none)
**MINOR**
- [tooling/demo/readme-assets.nodetest.mjs:65] Test named "...real **animated** GIF" but only checks the GIF8[79]a magic — a single-frame GIF89a would pass. Assets are genuinely animated (no live bug); either rename to "...real GIF (GIF8[79]a magic)" or assert >1 frame. — *A test whose name promises more than it checks gives false confidence.*
- [README.md:45-53] The restructure placed the new pitch+demos above an unchanged stale "Status" block (claims "Milestones 1–4 shipped", lists the superseded roadmap; reality M1–M7 released v0.2.3) — now the first thing under the polished top. Operator-acknowledged + logged (out-of-WP-scope). — *Undercuts the WP's front-page goal; worth keeping the freshen task visible in the backlog.*

### Assessment
Well-built, appropriately-scoped documentation/marketing work that accrues no debt. No app code changed; the one executable artifact is a useful, correctly-isolated, passing dev-only codify guard. The single substantive nit is the test-name-vs-teeth gap (low-severity, assets are in fact animated). The stale Status block is a real readability gap on the now-prominent front page, but consciously deferred + logged — the right call for a milestone-exit WP.

### If you disagree
Dismiss any finding by marking the line `[DISMISSED]` in this section before finalize archives the WIP.

## Retrospect
- **What changed in our understanding:** The plan scoped WP5 as a mechanical 2-phase "commit + embed, push + verify" task. In practice the operator turned the render-approval checkpoint into a content-design pass — a README *restructure* (value-one-liner → problem/feature/demo blocks) + 2 new philosophy bullets + a brainstorm-and-pick on the one-liner itself. The asset/embed work was indeed trivial; the *messaging* was where the real iteration lived. Adding Phase 3 (a back-loop extension) kept it inside WP5 rather than spinning a new feature — the right call for "same surface, operator-requested polish."
- **Assumptions that held:** Assets were well under budget (334KB/367KB vs 3MB); GitHub serves committed GIFs as animated `image/gif` and renders them inline (verified via the API-blob + raw-CDN fetch, not just a local preview); `docs/demo/` as the committed home (the `tooling/demo/.gitignore` already pointed there). The codify-guard idea (README-derived asset list) survived the restructure unchanged.
- **Assumptions that were wrong:** Minor — assumed `git ls-files docs/demo/` would list the assets at verify-self time, but they're untracked until ship stages them (the plan outcome conflated "trackable" with "tracked"). Resolved by checking git-addability instead. Also hit the `raw.githubusercontent.com` ~5-min CDN cache lag on re-verify — the authoritative check is the github *API* blob at the pushed SHA, not the raw CDN.
- **Approach delta:** Plan was 2 phases; actual was 3 (Phase 3 = operator-requested README restructure + philosophy bullets, added as a verify-human back-loop). Push happened across 3 commits (assets+embed, restructure, one-liner) rather than 1, because the operator iterated on messaging after each render. Design-prior capture was *proposed* (2 candidates) but operator *declined* — captured as a resolved decision, not written.
