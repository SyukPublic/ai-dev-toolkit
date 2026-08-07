import type { SkillCase } from "../../../../src/index.js";
import { fixtureReader } from "../../../../src/index.js";

const fx = fixtureReader(import.meta.url);

// RETRIEVAL tier — see runSkillRetrievalCases, and read the fastify retrieval file's header first:
// that suite is where the tier was piloted and the design notes live there.
//
// WHY THESE THREE MOVED. `next-best-practices/SKILL.md` is 153 lines, and NINETEEN of its sections
// are `See [references/<file>.md] for:` blocks — it names topics and teaches none of them. All the
// substance is in the 19 reference files (76 567 chars against SKILL.md's 4 917). Injecting the
// body alone would hand the model a table of contents with no tools, so these cases would measure
// nothing. Here the guidance is reachable the way production makes it reachable, and this skill is
// in the activation tier's 100%-engagement group, so the model does reach for it.
//
// The fixture is shared with the content tier and unchanged — its header records what is planted
// and the two things that are CORRECT and must not be "fixed" (OrderPage being async; useRouter in
// a client component). Only the task line differs: the content tier forbids tool use, which is
// exactly backwards here.
//
// Thresholds and practices are copied VERBATIM from the content cases on purpose. During the
// transition both tiers run, and the pair is only readable as a diagnostic — a gap localises the
// failure to retrieval rather than to the guidance — if the only variable is where the guidance
// came from. Note the Suspense case therefore inherits a pre-existing tightness: 3 practices at
// threshold 0.7 needs 3/3, so its rate tracks its weakest practice exactly.

// The task line names the mechanism (there is a skill; consult it; follow it to the file it points
// at) rather than merely inviting "project guidance". The fastify pilot is why — read its header:
// with the vaguer wording three of five haiku runs answered inline with zero tool calls, which
// turned the case rate into a measurement of SELECTION, which the activation tier already owns.
const RETRIEVAL_TASK = `This project ships a skill carrying guidance on this subject. Consult that skill, and any reference file it points you to, before you answer — then give the review in your reply. The code is provided inline, so you do not need to search the project for it. For anything already written correctly, say so briefly rather than rewriting it.`;

// FIRST CALIBRATION — `retrieval-calibration`, haiku, n=5, and this suite is the one that split.
// `Next 15 async APIs` is 5/5 with all four practices 5/5, tracing Skill → Read async-patterns.md
// every run. The other two are red, and the TRACE says why in one line rather than the rate:
//
//   | case                | result | trace                                                       |
//   | Next 15 async APIs  | 5/5    | Skill + Read async-patterns.md + rsc-boundaries.md, 5–6 turns|
//   | RSC boundaries      | 0/5    | `tools: ['Skill']`, `reads: []` in ALL FIVE runs, 3 turns    |
//   | Suspense            | 1/5    | reached suspense-boundaries.md in 3 of 5; the other 2 failed the grounding gate having read only rsc-boundaries.md / data-patterns.md |
//
// So RSC boundaries never opened the reference at all, and answering from memory it asserts the
// rules WRONG, confidently: "**Passing `onSelect` callback**: ✅ OK. Simple functions can flow from
// Server → Client Components", "**Callback pattern** (`onSelect`) is fine for small interactions. ✓",
// and "✅ Passing primitives (`activeTab`, `placedAt`) down to client components — correct" — where
// `placedAt` is a Date. The same two practices score 7/8 in the content tier, where the whole
// reference set is injected, so the GUIDANCE is right and only the reaching failed. That is exactly
// the localising diagnostic this tier was built for, working on its first real use.
//
// WHAT IT IS NOT, and this is the part to hold the line on: the pointer is neither missing nor
// vague. `SKILL.md:25` says "Non-serializable props detection" by name under RSC Boundaries, and
// `references/rsc-boundaries.md:48` states the rule correctly. Nothing in the artifact is wrong.
// What happened is the phenomenon this repo has already measured at length for activation — on a
// subject the model believes it already knows, it answers instead of consulting (there, "median 967
// output tokens and no tool calls at all in 29 of 78 misses"). By the standing rule, a red on a step
// a stronger model performs differently is a MODEL-CEILING candidate first and an artifact defect
// second. Do NOT edit next-best-practices/SKILL.md on this evidence.
//
// PREDICTION, recorded before the probe: both red cases re-measured at EVAL_MODEL=claude-sonnet-5,
// n=5. If sonnet opens rsc-boundaries.md / suspense-boundaries.md and the cases go green, this is a
// haiku ceiling in the RETRIEVAL step, these two cases are regression protection at sonnet only, and
// the skill needs nothing. If sonnet ALSO answers from memory on RSC boundaries, then a named,
// on-topic pointer is not enough to earn a Read, and that IS an artifact finding — the same
// enumeration-reads-as-sufficient shape as `architecture-review` 1.0.1 — worth a real
// engineering-paved-path release (which would also carry the pending 1.0.3 changelog correction).
//
// OUTCOME — `next-retrieval-sonnet`, sonnet, 2 × 5. The FIRST branch landed, unambiguously, so
// `next-best-practices/SKILL.md` needs NOTHING and the candidate is closed:
//
//   | case           | haiku                        | sonnet                                     |
//   | RSC boundaries | 0/5, `reads: []` in all five | **5/5, all SIX practices 5/5**, `Read rsc-boundaries.md` in every run, 4 turns |
//   | Suspense       | 1/5, reached the file in 3/5 | 3/5, `suspense-boundaries.md` read in ALL five, `grounded: 1` in all five |
//
// Same prompt, same on-disk skill, same named pointer — one variable changed and the file gets
// opened every time. So the haiku ceiling is in the RETRIEVAL step specifically, which is a new
// instance of a shape this repo already knows from activation (on a subject the model believes it
// knows, it answers instead of consulting) and NOT an index defect. Cost of the correct behaviour,
// for budgeting: sonnet runs this case at 4 turns / 3.0k output against haiku's 3 turns / 2.2k.
//
// The Suspense residual on sonnet was practice-level, not retrieval — both misses landed in runs that
// had read the reference and passed the gate. Fixed and re-measured (`next-suspense-reworded`,
// sonnet, n=5): **3/5 → 5/5, all three practices 5/5**, the `useRouter` control included. Only the
// remedy practice's wording and the threshold changed; the fixture, the detection practice and the
// control are untouched, so the move is attributable.
//
// Where that leaves these two cases: regression protection at sonnet. At the haiku tier default the
// RSC case is a DELIBERATE red — a floor the model cannot clear, for a reason the trace states in one
// line — so read it the way this repo reads `typescript-expert > TS2589` and
// `mermaid-diagram > oversized chart`: recorded, not chased. A `pnpm eval` at the default will show
// it red, and that is the correct result, not a regression.

const FILE = `\`\`\`tsx
${fx("orders-route.tsx")}
\`\`\``;

export const retrievalCases: SkillCase[] = [
  {
    name: "RSC boundaries: the async client component and the props that cannot cross",
    kind: "quality",
    prompt: `Review this App Router route for problems at the SERVER/CLIENT boundary — which component runs where, and what is being passed across. Ignore async API signatures and Suspense for now.

${RETRIEVAL_TASK}

${FILE}`,
    grounding: [["use client", "'use client'"]],
    practices: [
      "flags OrderTimeline as invalid because it is marked `'use client'` and declared `async` — a client component cannot be async",
      "fixes it by moving the awaited work into the server component and passing the result down, rather than by adding a client-side effect or a loading state",
      "flags the `onSelect` function prop as not serializable across the server/client boundary",
      "resolves the onSelect prop either as a Server Action or by moving the handler inside the client component",
      "flags `order.placedAt` — a Date — as a non-serializable prop, and passes a string (or a timestamp) instead, formatting it on the client",
      "does NOT flag OrderPage for being `async` — recognises that it is a Server Component, where async is correct",
    ],
    threshold: 0.7,
    // 10, not the content tier's 4: the Skill call plus a reference Read come before the answer.
    maxTurns: 10,
  },
  {
    name: "Next 15 async APIs: awaits params, searchParams and cookies",
    kind: "quality",
    prompt: `This route was written against Next 14 and we are upgrading to Next 15. Review its use of the framework's own APIs — the page's arguments and anything it reads from the request. Ignore the client components' internals.

${RETRIEVAL_TASK}

${FILE}`,
    grounding: [["await", "Promise"]],
    practices: [
      "identifies that in Next 15 `params` and `searchParams` are asynchronous, so the Props type must declare them as Promises and the page must await them",
      "identifies that `cookies()` is asynchronous too, so `cookies().get('session')` must become `(await cookies()).get('session')`",
      "shows the corrected Props type with `Promise<...>` around both params and searchParams rather than only describing the change in prose",
      "does not present this as optional or stylistic — reading them synchronously is broken on Next 15, not merely dated",
    ],
    threshold: 0.7,
    maxTurns: 10,
  },
  {
    name: "Suspense: catches the CSR bailout from useSearchParams",
    kind: "quality",
    prompt: `Our /orders/[id] route used to be statically rendered and now the whole page ships as client-rendered, which hurt our LCP. Review the code below for what is forcing that. Focus only on rendering strategy.

${RETRIEVAL_TASK}

${FILE}`,
    grounding: [["Suspense", "useSearchParams"]],
    practices: [
      "identifies `useSearchParams` in OrderFilters as the cause of the client-side-rendering bailout for the whole route",
      // REWORDED after `next-retrieval-sonnet`. It read "fixes it by wrapping OrderFilters in a
      // `<Suspense>` boundary with a fallback, so the bailout is contained to that subtree instead
      // of the page" and failed a run whose fix was BETTER: "Drop the internal
      // `useSearchParams()`/redundant `current` computation and just use the `activeTab` prop" —
      // removing the cause outright, so there is no bailout left to contain. That is the
      // detection-conditional-on-one-guessed-remedy trap this repo has already paid for (the
      // hardcoded-JWT-secret practice went 70% → 100% on the same correction). Detection stays a
      // separate practice above, so a run that spots nothing still fails that one.
      "keeps the bailout off the rest of the route — either by containing OrderFilters in a `<Suspense>` boundary with a fallback, or by removing the search-param read from it when the value is already available as a prop",
      "does NOT flag `useRouter` as the cause — it does not force the same bailout, and a client component is where navigation hooks belong",
    ],
    // 0.6, matching DEFAULT_THRESHOLD and the other three-practice cases in this repo. At 0.7 three
    // practices require 3/3, so the case rate collapses to its weakest practice: on sonnet the two
    // non-detection practices each missed once, in DIFFERENT runs, and the case read 3/5 while no
    // practice was below 4/5. Same arithmetic already recorded under "removing a practice TIGHTENS
    // the case's effective threshold" — this case was simply born with it.
    threshold: 0.6,
    maxTurns: 10,
  },
];
