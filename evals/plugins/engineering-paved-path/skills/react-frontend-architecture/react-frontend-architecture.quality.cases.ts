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
//   InvoiceRow's '../../../../utils'               path aliases, not deep relative chains
//   zustand store mirroring GET /api/orders        server state does not belong in a client store
//
//   CORRECT, MUST NOT BE FLAGGED                   WHY
//   formatCurrency / groupBy in shared utils       generic, pure, project-agnostic — the definition
//   InvoicePage's './components/table/InvoiceRow'  a direct same-feature import; nothing to fix
//   InvoicePage's '../../utils'                    two levels is not a "deep relative chain"
//
// formatCurrency and groupBy carry the discriminating weight in the first case: a model told
// "this utils.ts is a problem" tends to condemn the whole file, when two of its four exports are
// exactly what a shared utils module is for.
//
// THE PATH-ALIAS LEAD MOVED OUT OF THE LAYOUT CASE (2026-08-07), and two fixture defects came
// out with it. The layout case used to carry a fifth practice, "flags the deep relative import
// `'../../../utils'` and recommends configuring path aliases instead". It measured 1/7 while the
// case itself read 7/7 — the four other practices are 7/7 each, so a 5-practice case at
// threshold 0.7 absorbed it without a trace. Diagnosis, from the recorded outputs rather than
// from the rate:
//
//   * 6 of the 7 rows carry EMPTY judge evidence, and grep over those outputs finds zero
//     occurrences of "alias", "tsconfig" or a relative chain. The subject was never raised.
//   * The answers self-impose a budget — 20260805T200249 opens "This structure has **three
//     critical issues**" — and they spend it on the leads the case's other four practices name.
//     The one that gets dropped is the one SKILL.md:65 itself labels "(MEDIUM)" while the others
//     rank higher, i.e. the practice punished the model for applying the skill's own priority
//     ordering. Attention budget, the same mechanism as workflow-retro's output-bloat lead
//     (0/5 → 5/5 once it got a prompt of its own) and the retracted aria-label "gap".
//   * FIXTURE DEFECT, independent of that: the planted chain read `'../../../utils'` from
//     `src/features/invoices/InvoicePage.tsx`, which climbs ABOVE `src/` and resolves to nothing.
//     It was a broken path, not a deep one, and a model that checks is entitled to read it as a
//     typo. The chain now lives in `components/table/InvoiceRow.tsx`, where `'../../../../utils'`
//     genuinely resolves to `src/utils` and matches SKILL.md:113's own Don't example. InvoicePage
//     keeps a correct two-level `'../../utils'`, which is a control: two levels is not deep.
//
// PREDICTION, recorded BEFORE the re-measure (the rule is: a fixture edit is only legitimate when
// the opposite outcome would be reported as an artifact defect). Given a prompt about nothing but
// import paths, the alias rule should fire ≥4/5. If it still reads ≤1/5 with the chain unmissable
// and the prompt asking for nothing else, the miss belongs to `react-frontend-architecture`
// SKILL.md and IS a genuine artifact finding for engineering-paved-path.
//
// The layout case is RENAMED with the lead removed ("and aliases" dropped), which resets its
// lifetime pooling: the ledger keys on `file > test name`, so its 7 rows stop matching. Recorded
// here because a silent rename reads as a data gap later — both cases are re-measured at n=5 in
// the same series so the calibration queue stays at 0.
//
// OUTCOME — `rfa-import-split`, haiku, 2 × 5, all 10 rows recorded. The prediction's FIRST branch
// landed, so there is no artifact finding here:
//
//   | case                                    | result                                          |
//   | import hygiene (new)                    | 5/5 — the alias lead 1/7 → 5/5 on BOTH practices |
//   | layout review (renamed, lead removed)   | 5/5, all four practices 5/5                     |
//
// One turn, ~28 s, ~3.4k output tokens per run in both cases: the split cost nothing in budget and
// the answers stopped competing for the same attention. The one sub-threshold practice the series
// surfaced (the barrel control, 3/5) is diagnosed and removed at its site below — read that note
// before writing another negative practice anywhere in this repo.

const REVIEW_TASK = `The proposal is provided inline — treat it as already read and answer directly in your reply (do not ask for tool access or more files). For anything already placed correctly, say so briefly rather than inventing a problem with it.`;

export const qualityCases: SkillCase[] = [
  {
    name: "layout review: feature-based structure, barrels, cross-feature imports and global dumps",
    kind: "quality",
    prompt: `A teammate proposed this structure for a dashboard app we are starting. We expect roughly 40 screens. Review it before we commit to it.

${REVIEW_TASK}

${fx("proposed-structure.md")}`,
    grounding: [["feature", "Feature"]],
    practices: [
      "recommends organising by feature/domain rather than the root-level type-based `components/` and `hooks/` folders, and ties the reasoning to scale — at around 40 screens, working on one feature would force edits across many directories",
      "flags the `index.ts` barrel files that re-export each feature's contents, giving a concrete reason such as broken tree-shaking, slower bundling, or circular-import hazards, and recommends importing directly from the source file",
      "flags `InvoicePage.tsx` importing `orderHelpers` from `../orders` as a cross-feature import, and says features must be composed at the application/page level instead of reaching into each other's internals",
      "flags the 1400-line `utils.ts` and 900-line `constants.ts` as single global dumps that should be split by domain",
    ],
    threshold: 0.7,
    maxTurns: 4,
  },
  {
    // The path-alias lead in its own scoped prompt — see the header for why it could never fire
    // inside the layout review, and for the prediction this case is here to settle. Detection and
    // remedy are separate practices on purpose: a single "flags X and recommends Y" is the
    // compound shape this repo has paid for repeatedly. The two controls are what make a pass mean
    // "understands the rule" rather than "flagged the obvious thing" — a model that condemns every
    // relative import, or that reaches for a barrel as the fix, fails them.
    name: "import hygiene: swaps the deep relative chain for a path alias, sparing the correct imports",
    kind: "quality",
    prompt: `Review ONLY the import statements in the two invoices files below — the module specifiers themselves, not the folder layout, not what lives in \`utils.ts\`, and not the state management. For each import say whether the path is written the right way, and where it is not, give the fix.

${REVIEW_TASK}

${fx("proposed-structure.md")}`,
    // Keyed on the subject (the chain itself) with the remedy vocabulary only as alternatives —
    // a slot led by "alias" alone would measure the wording of the fix, not whether the answer
    // arrived at the import.
    grounding: [["../../../../", "alias", "@/"]],
    practices: [
      "flags the four-level relative chain in `InvoiceRow.tsx` (`'../../../../utils'`, and the same for `constants`) as too deep to maintain",
      "gives configured path aliases as the fix — an `@/`-style root such as `@/utils` or `@/shared/...` declared once — rather than only rewriting the chain by hand",
      "does NOT flag `InvoicePage.tsx`'s `'./components/table/InvoiceRow'` — a direct import of a file inside the same feature is correct as written",
      // REMOVED on its first measurement (rfa-import-split, 3/5): "does NOT offer a barrel /
      // `index.ts` re-export as the way to shorten the deep import". Both failing runs were
      // convicted for CONDEMNING barrels — "This relies on the barrel `index.ts` file. Per the
      // architecture skill, **avoid barrel files** — they break tree-shaking" and "The skill
      // discourages barrel files for internal modules" — while a PASSING run cites the same
      // behaviour ("The barrel file (`../orders/index.ts`) masks the problem but doesn't fix
      // it"). Same behaviour, opposite verdicts, so the number tracked judge attention.
      //
      // Sharper form of the standing rule that negative practices fight the judge's verbatim
      // evidence requirement: a "does NOT do X" practice whose X is an artifact the FIXTURE
      // displays will be convicted on any discussion of that artifact, a correct condemnation
      // included. The dimension is not lost — an answer that reached for a barrel instead of an
      // alias fails the remedy practice above, which requires an `@/`-style root by name.
    ],
    // 0.6 for the same reason as fastify's encapsulation case: at 0.7 three practices would mean
    // 3/3. Removing the fourth cannot move this case on existing data — all 5 rows have the three
    // survivors passing, so every row scores 3/3.
    threshold: 0.6,
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
