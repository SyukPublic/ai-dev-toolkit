import type { SkillCase } from "../../../../src/index.js";
import { fixtureReader } from "../../../../src/index.js";

const fx = fixtureReader(import.meta.url);

// Content tier: only SKILL.md is injected (this skill keeps examples.md and references.md as flat
// root files, which the loader deliberately does not inject), no tools.
//
// proposed-structure.md is a layout review with the skill's catalogued anti-patterns planted in a
// shape a team would actually propose, plus items that are CORRECT and must not be "fixed":
//
//   PLANTED                                        SKILL RULE
//   root components/ + hooks/ for 40 screens       feature-based over type-based at this size
//   1400-line utils.ts, 900-line constants.ts      split by domain, never one global dump
//   refreshOrdersCache() living in utils           utils/ holds PURE functions only
//   buildInvoiceLineItems() living in utils        that is a project-specific HELPER, not a util
//   index.ts re-exporting each feature             barrel files break tree-shaking, risk cycles
//   invoices importing from '../orders'            no cross-feature imports
//   '../../../utils'                               path aliases, not deep relative chains
//   zustand store mirroring GET /api/orders        server state does not belong in a client store
//
//   CORRECT, MUST NOT BE FLAGGED                   WHY
//   formatCurrency / groupBy in shared utils       generic, pure, project-agnostic — the definition
//
// formatCurrency and groupBy carry the discriminating weight in the first case: a model told
// "this utils.ts is a problem" tends to condemn the whole file, when two of its four exports are
// exactly what a shared utils module is for.

const REVIEW_TASK = `The proposal is provided inline — treat it as already read and answer directly in your reply (do not ask for tool access or more files). For anything already placed correctly, say so briefly rather than inventing a problem with it.`;

export const qualityCases: SkillCase[] = [
  {
    name: "layout review: feature-based structure, barrels, cross-feature imports and aliases",
    kind: "quality",
    prompt: `A teammate proposed this structure for a dashboard app we are starting. We expect roughly 40 screens. Review it before we commit to it.

${REVIEW_TASK}

${fx("proposed-structure.md")}`,
    grounding: [["feature", "Feature"]],
    practices: [
      "recommends organising by feature/domain rather than the root-level type-based `components/` and `hooks/` folders, and ties the reasoning to scale — at around 40 screens, working on one feature would force edits across many directories",
      "flags the `index.ts` barrel files that re-export each feature's contents, giving a concrete reason such as broken tree-shaking, slower bundling, or circular-import hazards, and recommends importing directly from the source file",
      "flags `InvoicePage.tsx` importing `orderHelpers` from `../orders` as a cross-feature import, and says features must be composed at the application/page level instead of reaching into each other's internals",
      "flags the deep relative import `'../../../utils'` and recommends configuring path aliases instead",
      "flags the 1400-line `utils.ts` and 900-line `constants.ts` as single global dumps that should be split by domain",
    ],
    threshold: 0.7,
    maxTurns: 4,
  },
  {
    name: "placement review: separates pure utils from project helpers and side effects",
    kind: "quality",
    prompt: `Review specifically what is inside \`src/utils.ts\` in the proposal below. For each export, say whether it belongs there, and if not, where it should go and why.

${REVIEW_TASK}

${fx("proposed-structure.md")}`,
    practices: [
      "keeps `formatCurrency` and `groupBy` in a shared utils module, identifying them as generic, pure, project-agnostic functions — it does not relocate them",
      "moves `refreshOrdersCache` out of utils because it performs side effects (a network call and a localStorage write), and places it in a data-access/API layer, a service, or a hook",
      "moves `buildInvoiceLineItems` out of utils on the grounds that it encodes project-specific domain knowledge (discount tiers, tax rules) — it is a feature-local helper, not a generic utility",
      "articulates the distinction it is applying: utils are generic and pure, helpers are project-specific glue tied to the domain",
    ],
    threshold: 0.7,
    maxTurns: 4,
  },
  {
    name: "state placement: refuses to mirror server data into a client store",
    kind: "quality",
    prompt: `In the proposal below, the orders feature keeps a Zustand store holding the orders fetched from \`GET /api/orders\`, so that any component can read them without prop drilling. We are about to do the same for invoices, and to add the current status filter and page number to the same store.

Is that the right place for each of these? Answer directly and concretely.

${fx("proposed-structure.md")}`,
    grounding: [["server state", "server-state", "server cache", "server-cache"]],
    practices: [
      "rejects mirroring the fetched orders into the Zustand store, distinguishing server state from client state and pointing to a server-cache library (TanStack Query, SWR, or equivalent) as the right home for query results",
      "declines to extend the same pattern to invoices for the same reason, rather than treating it as a reasonable next step",
      "routes the status filter and page number to the URL's search params rather than into the client store",
      "recommends wrapping the data access in an intent-revealing per-feature hook (something like `useOrders`) so components depend on that API rather than on raw fetch or store plumbing",
    ],
    threshold: 0.7,
    maxTurns: 4,
  },
];
