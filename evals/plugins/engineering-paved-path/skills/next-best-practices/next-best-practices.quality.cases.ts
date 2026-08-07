import type { SkillCase } from "../../../../src/index.js";
import { fixtureReader } from "../../../../src/index.js";

const fx = fixtureReader(import.meta.url);

// Content tier, no tools. READ THIS BEFORE INTERPRETING A RESULT: this skill's SKILL.md is a
// 153-line index, and all of its substance lives in references/ (19 files). Since those files
// moved out of the skill root in engineering-paved-path 1.0.2 the loader injects them — roughly
// 81k chars per case. Production loads only the SKILL.md body and reads a reference on demand, so
// a case here asks "does this content teach the right thing", NOT "does this skill help in a real
// session". The second question belongs to the activation tier.
//
// orders-route.tsx plants one instance of each detection rule the references define, and keeps
// two things that are already right:
//
//   PLANTED                                        REFERENCE
//   `'use client'` + `export async function`        rsc-boundaries.md — client components cannot
//     with an await inside                           be async; only Server Components can
//   onSelect function passed server → client        rsc-boundaries.md — props must be
//   order.placedAt (a Date) passed the same way      JSON-serializable
//   params/searchParams typed and read              async-patterns.md — in Next 15+ params,
//     synchronously; cookies() not awaited           searchParams, cookies() and headers() are
//                                                    asynchronous
//   useSearchParams with no Suspense boundary       suspense-boundaries.md — without one the whole
//                                                    route falls back to client rendering
//
//   CORRECT, MUST NOT BE "FIXED"                   WHY
//   OrderPage itself being `async`                 it is a Server Component; async is correct there
//   useRouter in a client component                 that is where navigation hooks belong

const REVIEW_TASK = `The code is provided inline — treat it as already read and answer directly in your reply (do not ask for tool access or more files). For anything already written correctly, say so briefly rather than rewriting it.`;

const FILE = `\`\`\`tsx
${fx("orders-route.tsx")}
\`\`\``;

export const qualityCases: SkillCase[] = [
  {
    name: "RSC boundaries: the async client component and the props that cannot cross",
    kind: "quality",
    prompt: `Review this App Router route for problems at the SERVER/CLIENT boundary — which component runs where, and what is being passed across. Ignore async API signatures and Suspense for now.

${REVIEW_TASK}

${FILE}`,
    grounding: [["use client", "'use client'"]],
    practices: [
      "flags OrderTimeline as invalid because it is marked `'use client'` and declared `async` — a client component cannot be async",
      "fixes it by moving the awaited work into the server component and passing the result down, rather than by adding a client-side effect or a loading state",
      // Split: detection and remedy. As one practice ("flags it AND resolves it") this failed
      // while the neighbouring Date-prop practice passed, which is the shape that makes detecting
      // a defect conditional on the case author having guessed the right cure.
      "flags the `onSelect` function prop as not serializable across the server/client boundary",
      "resolves the onSelect prop either as a Server Action or by moving the handler inside the client component",
      "flags `order.placedAt` — a Date — as a non-serializable prop, and passes a string (or a timestamp) instead, formatting it on the client",
      "does NOT flag OrderPage for being `async` — recognises that it is a Server Component, where async is correct",
    ],
    threshold: 0.7,
    maxTurns: 4,
  },
  {
    name: "Next 15 async APIs: awaits params, searchParams and cookies",
    kind: "quality",
    prompt: `This route was written against Next 14 and we are upgrading to Next 15. Review its use of the framework's own APIs — the page's arguments and anything it reads from the request. Ignore the client components' internals.

${REVIEW_TASK}

${FILE}`,
    grounding: [["await", "Promise"]],
    practices: [
      "identifies that in Next 15 `params` and `searchParams` are asynchronous, so the Props type must declare them as Promises and the page must await them",
      "identifies that `cookies()` is asynchronous too, so `cookies().get('session')` must become `(await cookies()).get('session')`",
      "shows the corrected Props type with `Promise<...>` around both params and searchParams rather than only describing the change in prose",
      "does not present this as optional or stylistic — reading them synchronously is broken on Next 15, not merely dated",
    ],
    threshold: 0.7,
    maxTurns: 4,
  },
  {
    name: "Suspense: catches the CSR bailout from useSearchParams",
    kind: "quality",
    prompt: `Our /orders/[id] route used to be statically rendered and now the whole page ships as client-rendered, which hurt our LCP. Review the code below for what is forcing that. Focus only on rendering strategy.

${REVIEW_TASK}

${FILE}`,
    grounding: [["Suspense", "useSearchParams"]],
    practices: [
      "identifies `useSearchParams` in OrderFilters as the cause of the client-side-rendering bailout for the whole route",
      // Kept byte-identical to the retrieval twin — the pair is only readable as a diagnostic if the
      // only variable is where the guidance came from. The reasoning for this wording and for the
      // 0.6 threshold is recorded in next-best-practices.retrieval.cases.ts.
      "keeps the bailout off the rest of the route — either by containing OrderFilters in a `<Suspense>` boundary with a fallback, or by removing the search-param read from it when the value is already available as a prop",
      "does NOT flag `useRouter` as the cause — it does not force the same bailout, and a client component is where navigation hooks belong",
    ],
    threshold: 0.6,
    maxTurns: 4,
  },
];
