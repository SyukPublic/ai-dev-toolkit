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
//   useMemo on a template string                   "simple concatenation does NOT need memoization"
//
// The icon-only <button><XIcon /></button> is still planted here but is NO LONGER asserted: that rule
// lives in the accessibility case at the bottom of this file, with its own prompt and its own controls.
// Asserting it on a memoization-focused prompt measured 0/5 and measured nothing.
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
    // RENAMED (was "…keeps the two justified memos and the a11y gap, without stripping memoization
    // wholesale") because the a11y practice was removed from it — see below. The rename resets this
    // case's lifetime pooling, since the ledger keys on `file > test name`: ~6 rows of history stop
    // matching. Recorded rather than done silently; the alternative was a name that describes a
    // practice the case no longer has.
    name: "review: keeps the two justified memos without stripping memoization wholesale",
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
      // REMOVED: "flags the icon-only button containing `<XIcon />` as missing an accessible name, and
      // adds an aria-label". It sat at 0/5 and was recorded in .plans as a content gap in the skill.
      // It was not: across all six recorded runs the answer contains no "aria", no "accessib", no
      // "a11y" and no "screen reader" AT ALL. This prompt says "pay particular attention to whether
      // each memoization in it is earning its keep", so the answer goes to memos and the rule is never
      // asked about — a practice measuring nothing, and a permanent red in the suite. Accessibility now
      // has its own case below (5/5, both controls held), which is where the dimension belongs.
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
  {
    // The re-render rule, in its OWN case. It was tried as a sixth practice on the guidance case above
    // and measured 0/5 while dragging that case from 3/5 to 1/5 — an answer has a budget of attention.
    // So this prompt asks about nothing else: no URL routing, no verdict on whether Context is the
    // right home for filter state, just "what happens on each update, and what should change".
    //
    // Two contexts on purpose, one of them CORRECT. ThemeContext is textbook dependency injection —
    // slow-changing, exactly what the skill says Context is for — and an answer that condemns it has
    // pattern-matched "Context bad" rather than understood the rule. That control carries the
    // discrimination, the same way the two justified memos do in the case above.
    //
    // Grounding is deliberately near-free (does the answer talk about context at all). The concept
    // under test IS the wording — "re-renders every consumer" versus "all subscribers update" — so a
    // gate keyed on it would do the judge's job and fail correct answers on phrasing, which is the
    // repeated cause of false reds in this repo.
    name: "guidance: names the re-render cost of a mixed context and splits it, sparing the DI one",
    kind: "quality",
    prompt: `Our React app has two contexts.

ThemeContext holds the colour scheme and the locale. It changes only when the user flips a setting.

AppStateContext holds the signed-in user, and also a \`liveOrderCount\` that a websocket updates every few seconds. About forty components read AppStateContext, and most of them only need the signed-in user.

What happens in the app each time \`liveOrderCount\` updates, and what should we change? For each of the two contexts, say whether it should stay as it is.`,
    grounding: [["Context", "context"]],
    practices: [
      "states that every component reading AppStateContext re-renders when liveOrderCount changes, including the components that only read the signed-in user",
      "recommends splitting AppStateContext by concern, so the frequently-changing liveOrderCount no longer shares a provider with the signed-in user",
      "leaves ThemeContext alone — it is slow-changing dependency-injection data and is being used the way Context is meant to be used",
    ],
    threshold: 0.6,
    maxTurns: 4,
  },
  {
    // Accessibility, in its own case, for the same reason the Context rule needed one. The
    // aria-label rule sat at 0/5 as the fifth practice of the memoization case above and was recorded
    // in .plans as a content gap — but the recorded outputs refute that: across all six runs the
    // answer never contains "aria", "accessib", "a11y" or "screen reader" AT ALL. That prompt says
    // "pay particular attention to whether each memoization is earning its keep", so the model spends
    // the whole answer on memos. The rule was never being asked about, so it was never being measured.
    // SKILL.md:144 states it plainly and nothing suggested the guidance was at fault.
    //
    // Two planted violations and two controls, per the discrimination rule: an answer that bolts an
    // aria-label onto a button whose visible text already names it has pattern-matched "add aria-label"
    // instead of reading the skill, and that redundant label can override the visible name.
    name: "review: names the icon-only button and the unlinked error, without labelling what is already labelled",
    kind: "quality",
    prompt: `Review this component for accessibility before it ships.

The component is provided inline — treat it as already read and answer directly in your reply (do not ask for tool access or more files). For anything you judge correct as written, say so briefly rather than inventing a problem with it.

\`\`\`jsx
${fx("EditProfileForm.jsx")}
\`\`\``,
    grounding: [["accessib", "aria", "screen reader"]],
    practices: [
      "flags the icon-only close button as having no accessible name, and gives it one — an aria-label (or equivalent visually-hidden text)",
      "flags that the validation error is only visually adjacent to the input, and associates it programmatically — aria-describedby pointing at the message, and marking the field invalid",
      "does not add an aria-label to the 'Save changes' button — its visible text already names it, and it is correct as written",
      "does not claim the 'Display name' input is missing a label — the label element is already associated with it via htmlFor",
    ],
    threshold: 0.7,
    maxTurns: 4,
  },
];
