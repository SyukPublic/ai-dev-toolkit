import type { WorkflowCase } from "../../../src/index.js";

/**
 * Systemic ("workflow") tier — asserts the ASSEMBLED on-disk harness (the workspace-template
 * CLAUDE.md + the plugins' skills/agents copied into `.claude/`, loaded via
 * settingSources:["project"]) behaves as documented. Organized by scenario, not by a single
 * artifact, because these behaviors are cross-cutting. See src/workspace.ts for how the
 * workspace is assembled from plugins/*.
 *
 * Budget: 4 Claude sessions total.
 *   - 2 × trace     → 1 session each                      = 2
 *   - 1 × activation pair (positive + near-miss negative) = 2
 *
 * `trace` folds several assertions into ONE session (cheaper, coarser) and stops early once its
 * evidence is in — so a dispatch-bearing trace never waits out the nested subagent's full run.
 *
 * Runtime prerequisites: the plugins that ship `architecture-reviewer` (architecture-review)
 * and `engineering-insights` (sdd-engineering) must exist under plugins/ — the workspace
 * assembly copies them in. Typecheck does not require them.
 */
export const cases: WorkflowCase[] = [
  // --- trace (1 session): CLAUDE.md "Read when" routing + subagent dispatch, together ----------
  {
    kind: "trace",
    // The endpoint must NOT already exist in the workspace, or the model reviews the existing
    // code inline instead of planning-then-dispatching. GET /orders/:id/export is genuinely
    // absent from workspace-template/server/src/modules/orders/routes.ts.
    name: "API-route task reads api-guidelines AND pulls the architecture-reviewer",
    prompt:
      "I plan to add a NEW, not-yet-implemented endpoint GET /orders/:id/export (returns the " +
      "order as markdown). First, check this repo's API conventions. Then you MUST dispatch the " +
      "architecture-reviewer subagent to assess my plan against the layer contracts — do not " +
      "review it yourself and do not explore the whole module on your own: right after the " +
      "conventions, delegate; leave the detailed code study to the subagent.",
    expectFilesRead: ["docs/api-guidelines.md"],
    expectSubagents: ["architecture-reviewer"],
    // 12, not 8: observed dispatch fails are typically the TURN CAP hitting before the Agent
    // call — the model spends 8+ turns Reading routes/service/docs and never reaches the spawn.
    // The prompt cue above pushes the spawn earlier; the higher cap absorbs explorers.
    maxTurns: 12,
  },

  // --- trace (1 session): CLAUDE.md "Hit unexpected behavior" routing → gotchas ----------------
  // A single-session trace reliably checks the routing rule: in the assembled workspace, the
  // discovery prompt reads docs/gotchas.md. (A contrast case with an empty-tmpdir control can
  // still reach the workspace by absolute path, which makes the negative flaky — trace is the
  // stable form of the same check.)
  {
    kind: "trace",
    name: "CLAUDE.md routes an unexpected-behavior lookup to docs/gotchas.md",
    prompt:
      "I hit unexpected behavior in this project — something works differently from what I " +
      "expected. According to this repo's guidance, where might this already be documented? " +
      "Read that file.",
    expectFilesRead: ["docs/gotchas.md"],
    maxTurns: 5,
  },

  // --- activation pair (2 sessions): positive + near-miss negative -----------------------------
  {
    kind: "activation",
    name: "engineering-insights activates on a genuine discovery",
    prompt:
      "Just figured out why the vector-similarity query returned zero rows — the column " +
      "dimension no longer matched after we changed the embedding model. I want to record this " +
      "so we don't trip over it again.",
    skill: "engineering-insights",
    shouldActivate: true,
    // Positive activation is model-dependent (a small model sometimes does the work inline
    // instead of invoking the Skill tool) — treat as indicative, not blocking. See
    // WorkflowCase.indicative.
    indicative: true,
    maxTurns: 4,
  },
  {
    kind: "activation",
    name: "near-miss negative — explaining the same topic must NOT record an insight",
    prompt:
      "Explain how vector column dimensions work and why a dimension mismatch makes a " +
      "similarity query return zero rows.",
    skill: "engineering-insights",
    shouldActivate: false,
    maxTurns: 4,
  },
];
