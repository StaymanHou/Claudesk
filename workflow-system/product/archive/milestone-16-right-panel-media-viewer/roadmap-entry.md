---
shape: archived-roadmap-entry
archived: 2026-10-20
source: workflow-system/product/roadmap.md → Next → Milestone 16 (verbatim, as of the cycle close)
---

### Milestone 16: Right-panel media viewer — ✅ all 3 WPs shipped (WP3 2026-10-20, `b450287`); cycle close pending `/product-finalize`

**Goal:** The right-panel editor shows images and plays audio and video, so the files that matter in
a non-coding (media-production) workspace can be opened in-app. F-b's isolated profiles triggered
this. It belongs to the lite-IDE core (tier 1), so it is **not** behind `workflow_features_enabled`.
Full measured state and open questions: `SURFACE-2026-09-25-RIGHT-PANEL-MEDIA-VIEWER`.

⚠️ **Operator ruling (2026-09-29, early grill): the viewer's depth follows the workspace.**
Software projects mostly *glance*; media projects (a video-production pipeline) *review*. So a
review-grade player is in scope for media workspaces, and the viewer is not uniform across
workspaces. The spec settles what selects the depth and what "review" includes. See the backlog entry.

**Shape (revised at decomposition, 2026-09-29):** one probe and two build WPs in `wbs.md`, not a
single feature. The grill ran on 2026-09-29, and its rulings are recorded there:
- depth is chosen by **file type**
- the review scope is set
- media opens in the **existing editor file tab**, with no new tab kind
- a codec and transport probe comes before any UI work

**Progress (2026-09-29):** ✅ WP1 probe (GO, 4 GiB cap) · ✅ WP2 media in the editor tab (images, SVG, gated PDF, the info card, Open in default app, reload on disk change) · WP3 review player next.

**Exit Criteria:** see `wbs.md` → "Exit criteria (M16)".

