// Scene 6 ("The New Bandwidth") — "1+1 mode" demo. NEW scenario file, sibling
// to WP4's timeline.pip.js and to Scene 6's earlier A4 fork
// (timeline.pip.scene6.js, the 2x2 "four of me" grid) — does NOT edit or reuse
// either of those files' narratives. This is a script beat added in a later
// revision pass, local VO (audio/vo_scene6.words.json):
//
//   136.38s "But it's not always four of the same me. Some days it's one plus
//            one instead. One software project holding steady in the
//            background, while one slot stays open for something I've
//            genuinely never touched. Exploring. Learning. Just thinking out
//            loud with an agent about a brand new idea."
//   ~155s   "Deeper on one. Wider on the other. Running side by side."
//   163.1s  next beat begins ("While AI works, I work...")
//
// Visual concept (verbatim operator intent): ONE thing — new, unfamiliar,
// exploratory work needing ~90% of attention — fills the main/large view,
// while a SEPARATE, already-familiar coding task runs quietly in a small
// corner PiP that's only glanced at, never actively worked in. A different
// shape from A3 (4 things all needing active engagement) and A4 (four
// equal-weight panes, a pure observational grid): here the whole point is the
// ASYMMETRY — deep/active on one, wide/glanceable-only on the other — and
// critically, the PiP task must never ping for attention. It is monitored,
// not attended.
//
// Mechanism: WP4's ORIGINAL timeline.pip.js (untouched) already models this
// shape almost exactly — a large backdrop with a small corner-pinned PiP,
// content driven continuously by backdropAt()/busyAt() against the raw
// capture time t (not keyframe-stepped), so both halves keep animating
// smoothly across the whole capture window without needing beat-by-beat
// keyframes. Reused here as-is: same shell.js, same shell.css, same
// backdropAt.js/busyAt.js. Only the CONTENT changes:
//   - backdrop: swapped from WP4's faux Slack work-chat to a chat/brainstorm
//     scratchpad with an agent about a brand-new, never-touched idea —
//     tentative, conversational, NO code/diff/tool-call styling at all (see
//     shell.pip.oneplusone.html for the accompanying warm-violet retint that
//     reinforces "a different kind of space" beyond just different copy).
//   - PiP: WP4 had TWO mirror cells; this scenario has exactly ONE — a
//     familiar project (hugo-blog, recurring cast member from the
//     filmstrip/A3/A4 demos) ticking along at a deliberately CALM, low
//     token-rate cadence. status is 'running' for the ENTIRE clip — it NEVER
//     flips to 'awaiting' and never gets the blue-ring "needs you" ping. That
//     omission is the whole point of this beat: unlike A3/A4's "something
//     needs you" narratives, this background task does not need active
//     attention.
//
// A SINGLE keyframe (t=0) is sufficient — unlike the A3/A4 forks, nothing here
// is a discrete beat-to-beat narrative (no clicks, no promotions, no
// awaiting-then-resolved arc). Both halves are pure continuous ticks
// (backdropAt's progressive message reveal + typed draft, busyAt's spinner/
// token-counter/stream-reveal), so one keyframe describing the whole scene
// plus time-stamped message/typing/busy specs produces ~13s of continuous,
// non-repeating motion — a better fit than a freeze-hold for this beat's
// longer on-screen window per the brief.
//
// No cursor[] / no keycaps[] — nothing is clicked or key-pressed in this
// scenario (the backdrop's own typed-draft mechanic already sells "actively
// engaged here"; adding a mouse pointer clicking UI chrome would undercut the
// calm "just thinking out loud" register the VO asks for).
//
// Classic <script> (NOT a module — file:// blocks ES-module imports in
// Chromium, the capture path). `window.TIMELINE = window.TIMELINE || {...}`
// fallback form so capture.mjs's --timeline injection (addInitScript, runs
// before shell.js) wins; opening the shell standalone still paints this.
//
// String fields (backdrop messages/input, mirror.lines[].text,
// busy.stream[].text) are injected via innerHTML by shell.js —
// author-controlled dev input only, not real project data (see
// timeline.filmstrip.js's header comment for the same note).

(function () {
  // ---- the single background PiP mirror: hugo-blog, calm/quiet cadence ----
  // Deliberately slow tokensPerSec + long streamEach vs. A3/A4's cast (whose
  // fastest pane, catan-companion, runs tokensPerSec 2600) — this project is
  // "holding steady in the background," not being actively driven. Words
  // rotate and tokens keep ticking for the WHOLE clip (no endT) so it never
  // goes visibly idle/finished, but at a pace that reads as ambient, not
  // urgent. status stays 'running' throughout — never 'awaiting'.
  function quietHugoMirror() {
    return {
      lines: [
        {
          cls: "prompt",
          text: "❯ add reading-time estimate to the post layout",
        },
        { cls: "dim", text: "  ⎿ watching for changes" },
      ],
      busy: {
        startT: 0,
        words: ["Watching", "Building", "Checking"],
        tokensStart: 4200,
        tokensPerSec: 90,
        streamFrom: 1.4,
        streamEach: 2.8,
        stream: [
          { cls: "dim", text: "  ⎿ rebuilding…" },
          { cls: "ok", text: "  ⎿ site built in 290ms" },
          { cls: "dim", text: "  ⎿ watching for changes" },
        ],
      },
    };
  }

  window.TIMELINE = window.TIMELINE || {
    region: "pip", // stays 'pip' the whole clip — no region-switch mechanic

    // ---- the exploratory/learning main view: a chat/brainstorm scratchpad
    // with an agent about a brand-new idea the operator has never touched.
    // Deliberately NOT code-shaped — no prompt/diff/tool-call styling, plain
    // conversational sentences only — so it reads as genuinely different in
    // kind from the PiP's familiar coding session, not "more Claudesk work."
    backdropTitle: "sketchpad — old voicemails into ambient music?",
    backdropLive: {
      messages: [
        { at: 0, author: "agent", text: "blank canvas — what's the itch?" },
        {
          at: 0,
          author: "you",
          text: "old voicemails turned into ambient music, maybe? not sure yet",
        },
        {
          at: 4.6,
          author: "you",
          text: "let's just pitch-shift one memo and hear how it feels",
        },
        { at: 5.8, author: "agent", text: "on it — sampling now, one sec" },
        {
          at: 9.6,
          author: "agent",
          text: "here's the pitch curve — it swings a lot, want to smooth it?",
        },
      ],
      typing: [
        {
          startT: 1.6,
          text: "let's just pitch-shift one memo and hear how it feels",
          sendAt: 4.6,
        },
        // this second draft is still mid-type when the clip ends — deliberate:
        // the exploration keeps going past the edge of the capture window,
        // reinforcing "still thinking out loud," not a beat that resolves.
        { startT: 10.6, text: "yeah — smooth it out", sendAt: 13.6 },
      ],
    },

    pipPos: { right: "28px", bottom: "28px" },

    keyframes: [
      {
        // The only keyframe — see header note on why one suffices here.
        t: 0,
        pip: [
          { name: "hugo-blog", status: "running", mirror: quietHugoMirror() },
        ],
      },
    ],
    // No cursor[]/keycaps[] — see header note.
  };
})();
