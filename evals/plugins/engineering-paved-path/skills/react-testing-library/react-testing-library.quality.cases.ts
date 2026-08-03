import type { SkillCase } from "../../../../src/index.js";
import { fixtureReader } from "../../../../src/index.js";

const fx = fixtureReader(import.meta.url);

// Content tier: SKILL.md plus its references/ directory is injected (this skill was split into a
// 278-line core plus references/, and the loader picks up a references/ DIRECTORY), no tools.
//
// CommentForm.test.jsx is written the way a suite drifts in practice — nine tests, most of them
// asserting one fact each — and plants the anti-patterns the skill's own table names, alongside
// two tests that are CORRECT and must survive review:
//
//   PLANTED                                   SKILL RULE
//   nine one-assertion tests                  1-3 user-flow tests per component
//   fireEvent.change / .click                 always userEvent, never fireEvent
//   const { getByTestId } = render(...)       always screen, never destructure render()
//   getByTestId as the first choice           getByRole / getByLabelText first, testId last resort
//   container.querySelector('h2')             use RTL queries, not container.querySelector
//   toMatchSnapshot()                         snapshots do not replace behaviour assertions
//   asserting .value / "updates state"        test rendered behaviour, not internals
//   await new Promise(setTimeout, 300)        never fixed delays — findBy / waitFor
//   act(() => fireEvent.click(...))           RTL wraps act() itself
//   vi.mock('axios')                          mock at the network layer with MSW, not the HTTP client
//
//   CORRECT, MUST NOT BE "FIXED"              WHY
//   queryByText(...).not.toBeInTheDocument()  queryBy is the documented way to assert absence
//   within(card).getByText('Ada')             scoping with within() is the documented pattern
//
// The two correct tests carry the discriminating weight: a model told "this suite is full of
// anti-patterns" tends to rewrite everything, including the two lines that were already right.

const REVIEW_TASK = `The test file is provided inline — treat it as already read and answer directly in your reply (do not ask for tool access or more files). For anything already written correctly, say so briefly instead of rewriting it.`;

const FILE = `\`\`\`jsx
${fx("CommentForm.test.jsx")}
\`\`\``;

export const qualityCases: SkillCase[] = [
  {
    name: "review: consolidates the one-assertion tests and fixes query and interaction choices",
    kind: "quality",
    prompt: `Review this test file. It passes, but it is brittle and it keeps breaking on refactors that do not change behaviour.

${REVIEW_TASK}

${FILE}`,
    grounding: [["userEvent", "user-event"]],
    practices: [
      "recommends consolidating the many single-assertion tests into a small number of tests that walk a full user flow — roughly one to three per component — rather than keeping one `it()` per rendered element",
      "replaces `fireEvent` with `userEvent`, including calling `userEvent.setup()` before render and awaiting each interaction",
      "stops destructuring queries from `render()` and uses `screen` instead",
      "replaces the `getByTestId` and `container.querySelector` lookups with accessible queries — `getByRole` or `getByLabelText` — keeping testids only where no accessible query works",
      "flags the tests that assert implementation details rather than user-visible behaviour — the input's `.value` and the 'updates state when typing' test — and the `toMatchSnapshot` test as no substitute for explicit behavioural assertions",
      // Moved here from the async case, where the prompt scopes the review to async handling and
      // mocking: these two tests are neither, so a model that ignored them was being obedient and
      // the controls failed a correct answer. Query patterns belong with the query-choice case.
      "does NOT rewrite the `queryByText(...).not.toBeInTheDocument()` assertion or the `within(card).getByText('Ada')` assertion — recognises queryBy as the correct way to assert absence and `within` as the correct way to scope a query",
    ],
    threshold: 0.7,
    maxTurns: 4,
  },
  {
    name: "review: fixes the async and mocking strategy without rewriting the two correct tests",
    kind: "quality",
    prompt: `Review the async handling and the mocking strategy in this test file. The submit test is flaky in CI.

${REVIEW_TASK}

${FILE}`,
    grounding: [["findBy", "waitFor"]],
    practices: [
      "identifies `await new Promise((resolve) => setTimeout(resolve, 300))` as the cause of the flakiness and replaces the fixed delay with `findBy` (or `waitFor`)",
      "removes the manual `act()` wrapper around the click, explaining that React Testing Library already wraps interactions in act()",
      "recommends mocking at the network layer with MSW instead of `vi.mock('axios')`, so the test does not couple to the HTTP client",
      // The control for THIS case has to be inside its own scope (async + mocking), which is why
      // the queryBy/within controls moved to the query-choice case above.
      "does NOT flag the `beforeEach(() => vi.clearAllMocks())` as a problem — resetting mock state between tests is the recommended hygiene, not an anti-pattern",
    ],
    threshold: 0.7,
    maxTurns: 4,
  },
  {
    name: "guidance: picks the form scenarios and declines to test the implementation details",
    kind: "quality",
    prompt: `We are about to write tests for a new BlogEditor form component: title and body fields, client-side validation, and a submit that POSTs to /api/blogs. Our team's habit is to aim for 100% line coverage, so someone has proposed one test per field, one per validation rule, one for each piece of internal state, and a snapshot.

How many tests should this component have and what should each one cover? Answer directly and concretely.`,
    grounding: [["coverage", "use case", "use-case"]],
    practices: [
      "pushes back on the line-coverage target, arguing for use-case coverage — what the user can do — over hitting every line, and rejects the one-test-per-field-and-per-state plan",
      "proposes roughly three tests for a form component and describes them as complete user flows: a happy path that fills the fields, submits, and asserts the success feedback; a validation path that submits invalid or empty input and asserts the error messages; and an API-failure path that asserts the server error is surfaced",
      "explicitly excludes tests of internal state and a snapshot test from the plan, explaining that they assert implementation rather than behaviour",
      "recommends mocking the POST at the network layer (MSW) rather than mocking the component's own module or HTTP client",
    ],
    threshold: 0.7,
    maxTurns: 4,
  },
];
