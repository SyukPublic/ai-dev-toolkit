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
      "fixes it by wrapping OrderFilters in a `<Suspense>` boundary with a fallback, so the bailout is contained to that subtree instead of the page",
      "does NOT flag `useRouter` as the cause — it does not force the same bailout, and a client component is where navigation hooks belong",
    ],
    threshold: 0.7,
    maxTurns: 10,
  },
];
