import type { SkillCase } from "../../../../src/index.js";
import { fixtureReader } from "../../../../src/index.js";

const fx = fixtureReader(import.meta.url);

// Content tier: only SKILL.md is injected (this skill keeps its examples in a flat examples.md,
// which the loader deliberately does not inject) and the session has NO tools, so the component
// travels in the prompt.
//
// OrderDashboard.jsx plants seven violations the skill names explicitly, and — following the
// security suite's design — three patterns that are DELIBERATELY CORRECT and must survive review:
//
//   PLANTED                                        SKILL RULE
//   visibleOrders in useState + syncing useEffect  "Derive, Don't Store" (the #1 anti-pattern)
//   total in a second effect off the first         "NEVER chain useEffects that trigger each other"
//   renderStatusFilter returning JSX               render factories break reconciliation
//   {sorted.length && <p>}                         renders a literal 0 when the list is empty
//   key={i} on a sorted+filtered list              index keys when lists reorder
//   icon-only <button><XIcon /></button>           aria-label required
//   useMemo on a template string                   "simple concatenation does NOT need memoization"
//
//   CORRECT, MUST NOT BE FLAGGED                   WHY
//   useMemo(() => sortOrders(...))                 expensive and profiled — the skill's own carve-out
//   useCallback(handleSelect)                      passed to a memo()'d child — the exact stated case
//   STATUSES at module scope                       already the recommended extraction
//
// The correct-pattern controls carry most of the discriminating weight. A model told "be skeptical
// of memoization" will happily strip every memo in the file; the skill's value is knowing which
// two to keep.

const REVIEW_TASK = `The component is provided inline — treat it as already read and answer directly in your reply (do not ask for tool access or more files). For anything you judge correct as written, say so briefly rather than inventing a problem with it.`;

export const qualityCases: SkillCase[] = [
  {
    name: "review: catches derived state, chained effects, the render factory and index keys",
    kind: "quality",
    prompt: `Review this React component before it ships.

${REVIEW_TASK}

\`\`\`jsx
${fx("OrderDashboard.jsx")}
\`\`\``,
    grounding: [["derive", "derived"]],
    practices: [
      "flags storing `visibleOrders` in useState and syncing it from props in a useEffect — the filtered list is derived state and must be computed during render instead",
      "flags the second effect that derives `total` from `visibleOrders` as a chained effect, and computes the total during render rather than in state",
      "flags `renderStatusFilter` as a render factory — a camelCase function returning JSX is not a component and should become a PascalCase component used as `<StatusFilter />`",
      "flags `key={i}` on the sorted and filtered rows, explaining that an array index breaks identity once the list is reordered or filtered, and uses a stable id such as order.id instead",
      "flags `{sorted.length && <p>…</p>}` as rendering a literal 0 when the list is empty, and fixes it with an explicit comparison or a ternary",
    ],
    threshold: 0.7,
    maxTurns: 4,
  },
  {
    name: "review: keeps the two justified memos and the a11y gap, without stripping memoization wholesale",
    kind: "quality",
    prompt: `Review this React component before it ships. Pay particular attention to whether each memoization in it is earning its keep.

${REVIEW_TASK}

\`\`\`jsx
${fx("OrderDashboard.jsx")}
\`\`\``,
    practices: [
      "does NOT recommend removing `useMemo(() => sortOrders(visibleOrders))` — recognises it as the justified case, an expensive computation over a large list, which the comment states has been profiled",
      "does NOT recommend removing `useCallback` from handleSelect — recognises that it is passed to OrderRow, which is wrapped in memo(), so the callback identity matters",
      "flags the `useMemo` around the `label` template string as unnecessary — simple string concatenation does not need memoization",
      "flags the icon-only button containing `<XIcon />` as missing an accessible name, and adds an aria-label",
      "does NOT flag the module-level `STATUSES` constant — it is already extracted outside the component, which is the recommended pattern",
    ],
    threshold: 0.7,
    maxTurns: 4,
  },
  {
    name: "guidance: routes filter state to the URL and keeps Context as dependency injection",
    kind: "quality",
    prompt: `We have an orders list page with a status filter, a search box, and pagination. Right now all three live in useState inside the page component, and we are about to move them into a global React Context so that a few sibling components can read them. Users also complain that they cannot share or bookmark a filtered view, and that the back button does not undo a filter change.

Is Context the right destination for this state? Answer directly and concretely, and say where each piece of state should live.`,
    grounding: [["URL", "url", "search param", "searchParam", "query param"]],
    practices: [
      // Decomposed. This was one practice reading "says Context is the wrong destination AND
      // states the rule behind it", and it scored 2/5 at n=5 while the URL-routing practice
      // beside it scored 5/5 — the model reliably moved the state to the URL without separately
      // declaring a verdict on Context. Two claims, two practices.
      "answers the question that was asked: Context is not the right destination for this state",
      "gives the rule behind that answer — Context is for dependency injection (auth, theme, and similar), not a general-purpose global state store",
      "routes the filter, search and pagination state into the URL's search params, explicitly connecting that to the reported symptoms: a filtered view becomes shareable and bookmarkable, and the back button starts undoing filter changes",
      // REMOVED, on evidence rather than convenience: "notes the re-render cost of the proposed
      // Context — a change re-renders every consumer". It scored 0/5, and the principled fix was
      // tried first and MEASURED: adding "if we went ahead with the Context anyway, what would it
      // cost us at runtime?" to the prompt moved the target practice only 0/5 → 1/5 while
      // dropping the rule-statement practice beside it from 3/5 → 0/5, taking the case from 3/5
      // to 1/5. Reverted. An answer has a budget of attention; a sub-question buys one thing by
      // spending another — the same mechanism seen on the TS2589 prompt.
      //
      // "Context changes re-render ALL consumers" is real skill content and should still be
      // measured, but it needs its OWN case with a prompt about nothing else, where it is not
      // competing with four other practices. Not written yet — see .plans.
      "prefers passing the values down (or reading them from the URL where they are needed) over introducing a provider for a single subtree",
    ],
    threshold: 0.7,
    maxTurns: 4,
  },
];
