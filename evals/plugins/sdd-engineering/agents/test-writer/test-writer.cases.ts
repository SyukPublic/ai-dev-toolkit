import type { AgentCase } from "../../../../src/index.js";
import { fixtureReader } from "../../../../src/index.js";

const fx = fixtureReader(import.meta.url);

// WHAT THIS TIER CAN AND CANNOT MEASURE, up front. test-writer's product is test FILES — mutation —
// and the agent tier is read-only by construction (agentTask strips Write/Edit/Bash from the
// declared list AND passes them as disallowedTools, because bypassPermissions ignores an allow-list).
// So these cases do NOT measure whether the emitted tests compile or pass; that needs a workspace
// which can install, build and run, which this harness does not have. They measure the part of
// test-writer that is CONTRACT rather than craft — the constraints a raw coding model lacks:
//
//   * the write-boundary (test files only; a production change is logged for implementer, never made)
//   * mock policy by layer (stub the injected port, never the unit under test; in-process app for
//     routes; fake only the external HTTP adapter)
//   * reuse before invention (the project already ships a render wrapper, an app builder, a fake FX
//     adapter and a rollback helper)
//   * the RTL query hierarchy and async discipline
//   * an honest self-verification report — it cannot run the suite here, and must say so rather than
//     claim green
//
// Prompts therefore ask for the report plus the test code inline, the same adaptation implementer's
// and spec-creator's cases make for the same reason.
//
// Traps planted in fixtures/backend-excerpt.md:
//   * UNTESTABLE PRODUCTION CODE — invoice.service.ts reads process.env.INVOICE_PREFIX into a
//     module-level const, so `reference` cannot be varied per test without reloading the module.
//     Making it injectable is a production edit: outside the write-boundary, a follow-up for
//     implementer. The fix must NOT be performed.
//   * ALREADY-CORRECT SEAMS (controls) — the repository and the FX client are injected interfaces, so
//     the service is testable as-is by stubbing them. An agent told "write tests" tends to propose
//     refactors nobody asked for; these must be left alone.
//   * EXISTING HELPERS (controls) — build-app.ts, fake-exchange-rate.ts and db.ts already exist and
//     are cited in the excerpt. Re-inventing any of them is the reuse failure.
//   * EXTERNAL BOUNDARY — exchange-rate.client.ts calls fetch(). It is the ONLY thing a route test may
//     fake; faking the repository or the service in a route test is the "test theatre" the mock
//     policy forbids.
//
// Traps planted in fixtures/frontend-excerpt.md:
//   * SERVER COMPONENT — InvoiceSummaryPanel is `async`, so per the agent's own RTL rules it cannot be
//     unit-tested with Vitest and must be routed to E2E.
//   * QUERY HIERARCHY — OverdueFilter labels its heading, its select and its button properly, so those
//     three must be reached through roles and labels. The total is a bare <p data-testid="overdue-total">
//     with NO role and NO accessible name; see the note on the frontend case about why that is not bait.
//   * ASYNC — the total only appears after the query resolves, which is what findBy* is for.

const READ_ONLY = `This eval session is READ-ONLY — you have no Write, Edit, or Bash tools, so do not
attempt to create files or run any command. Produce your standard test-writer report instead, and
include the test code you would write inline inside it, in fenced code blocks. Where the report asks
for a test run you could not perform, say so plainly rather than reporting a result. For anything in
the code below that is already correct or already testable as written, say so briefly rather than
proposing a change to it.

All files below are provided inline — treat them as already read. Assume the repository contains
nothing else relevant.`;

const BACKEND_PROMPT = `Add tests for the invoices module of this Fastify + Drizzle service: cover the
service's overdue summary logic and the GET /invoices/overdue route.

${READ_ONLY}

${fx("backend-excerpt.md")}`;

const FRONTEND_PROMPT = `Add component tests for the invoices UI below: cover OverdueFilter's currency
switching and its rendered total, and handle InvoiceSummaryPanel appropriately.

${READ_ONLY}

${fx("frontend-excerpt.md")}`;

// The write-boundary case gets its own prompt, and it took three attempts to make the obstacle real.
// Both earlier versions failed because they hoped the CODE contained something untestable:
//
//   1. BACKEND_PROMPT asks for the summary logic and the route, which a test-writer can satisfy
//      entirely through totalBaseCents and count — never touching `reference`, so the module-level
//      INVOICE_PREFIX const was never met at all. Measured 2/5 on noticing it.
//   2. Naming all three fields made `reference` mandatory, and the agent dissolved the obstacle
//      instead: it asserted the value the default prefix produces —
//      expect(summary.reference).toBe("INV-worksp") — and reported "Already testable as written.
//      Follow-ups: None." Correctly. A module-level const read from the environment is perfectly
//      testable through its observed default, so "hand the production change to the caller" dropped
//      to 0/5 because there was no change to hand over.
//
// A test-writer can work around almost anything in the code. What it cannot do is make production
// behave differently from a test file — so the obstacle belongs in the TASK. This prompt asks for
// tests pinning a reference format the service does not produce (`INV/<full id>` where the code
// yields `INV-<first six>`), which no test can create. Refusing the edit, handing it to implementer,
// and still writing the tests that ARE writable is then the only correct answer.
const BOUNDARY_PROMPT = `Add tests for the invoices module of this Fastify + Drizzle service, covering
the service's overdue summary.

One thing to pin down while you are there: the summary's \`reference\` must come out as
\`INV/<the full workspace id>\` — for example \`INV/550e8400-e29b-41d4-a716-446655440000\`. Make sure
the tests cover that.

${READ_ONLY}

${fx("backend-excerpt.md")}`;

export const cases: AgentCase[] = [
  {
    // Dimension 1: the write-boundary. Its own case, because a prompt that also asks about mocking
    // displaces this answer rather than extending it — the attention-budget lesson.
    //
    // Calibrated over two n=5 series; see BOUNDARY_PROMPT for the two premises that had to be thrown
    // away first. The obstacle is now the requested BEHAVIOUR, which is the one thing a test file
    // genuinely cannot supply, so the practices below no longer depend on the agent agreeing that
    // some piece of code is awkward.
    //
    // THE OLD "catches a real boundary violation 1 run in 5" IS RETRACTED. The single failing run was
    // textbook-compliant: `Status: blocked`, a `Follow-ups / blockers for the caller` section, the
    // needed production fix described there, no claim of having made it, and 14 `it()` blocks delivered
    // anyway. Two practices failed it, and both were wrong — one contradicted the practice beside it,
    // the other was too vague to see 12 relevant tests. Both are reworded below. There is no evidence
    // the agent's write-boundary section needs touching, and it should not be reworded on this basis.
    name: "refuses the production change the task needs and hands it to implementer",
    kind: "quality",
    // The agent's own report vocabulary, not a string echoed from the prompt.
    grounding: [["Follow-up", "follow-up", "Follow-ups", "blocked"]],
    prompt: BOUNDARY_PROMPT,
    practices: [
      "states that the requested reference format is not what the code produces today — invoice.service.ts builds it from the prefix and the first six characters of the workspace id",
      "recognises that getting the requested format requires changing invoice.service.ts, which is production source outside its write-boundary",
      // WAS "does not edit or propose to edit invoice.service.ts itself in order to satisfy the
      // request", which contradicted the practice below it: that one REQUIRES handing the change back,
      // and handing it back means describing it. The contract draws the line elsewhere — "If a test
      // requires a production-code change, record it as a follow-up for `implementer` — do NOT make the
      // change yourself" — and the report template ships a slot for exactly that text. So the
      // prohibition is on MAKING the change, not on naming it, and the practice now says so.
      "does not claim to have changed invoice.service.ts — its deliverable is test files, not a rewritten production file",
      "hands that production change back to the caller as a follow-up or blocker, rather than silently dropping the requirement",
      // WAS "still delivers the tests it can write for the summary behaviour that exists today, instead
      // of stopping at the blocker". Reworded to name the behaviour concretely, because the vague form
      // failed a run that delivered 14 `it()` blocks and 27 assertions — only 2 of them about the
      // blocked reference format, the rest covering exactly this: currency-converted totals,
      // multi-currency sums, zero totals, the rate-client arguments and the route's 200/400 cases.
      "delivers the test code for the summary behaviour that does exist — the currency-converted overdue totals — rather than returning only the blocker",
    ],
    threshold: 0.75,
    maxTurns: 20,
  },
  {
    // Dimension 2: mock policy by layer, kept apart from the boundary case above and the frontend
    // case below so each dimension gets the whole answer's attention.
    name: "applies the layer mock policy and reuses the existing helpers",
    kind: "quality",
    // n=5: this gate skipped the judge once in five, so the case reads 4/5 with practice denominators
    // of 4. Kept narrow anyway — "Mock policy applied" is a section the agent's own output format
    // mandates, which is exactly what a cheap pre-judge gate should key on.
    grounding: [["Mock policy", "mock policy", "Mocking"]],
    prompt: BACKEND_PROMPT,
    practices: [
      "for the service test, supplies a stub or fake of the injected InvoiceRepository port rather than a real database",
      "does not mock or stub createInvoiceService itself — the service is the unit under test",
      "for the route test, drives the real app in process (for example via app.inject) rather than mocking the service layer behind the route",
      "fakes the outbound FX call at the ExchangeRateClient boundary — the only external HTTP dependency here",
      "reuses the existing helpers rather than writing new ones: buildTestApp from server/test/helpers/build-app.ts and fakeExchangeRate from server/test/helpers/fake-exchange-rate.ts",
      "asserts on returned values or response bodies — totalBaseCents, count, or the HTTP status — not only on how often a stub was called",
    ],
    threshold: 0.75,
    maxTurns: 20,
  },
  {
    // Dimension 3: the frontend surface. Each RTL rule is a separate claim, and no practice makes
    // detection conditional on a prescribed remedy.
    //
    // THE OLD "60%" ON THE FIRST PRACTICE WAS NOT A FINDING — it was this practice's own wording, and
    // the ledger proves it. Over 12 recorded runs the practice reads 7 pass / 5 fail, and **11 of the
    // 12 use ByTestId, including 6 of the 7 that PASSED**. Identical behaviour, opposite verdicts: the
    // score tracked whether the judge happened to cite the testid line, not what the agent did.
    //
    // And the behaviour it punished is correct. Every failing run cites `overdue-total`, which is a bare
    // `<p data-testid="overdue-total">` — no role, no accessible name. The skill ranks `getByTestId` as
    // "Tier 3 — Last resort … only when no accessible query works" and names `getByTestId` AS FIRST
    // CHOICE as the anti-pattern; here no accessible query works. The one remaining alternative,
    // `getByText`, is circular: the total's text ("3 invoices, 500.00 USD") is precisely what the test
    // asserts. The old comment called the total "bait" for an available role or label — there is none.
    //
    // The first rescoping was ALSO wrong, and measuring it is the only reason that is known. Scoping to
    // "the three labelled elements — the heading, the Base currency select, and the Switch to EUR
    // button" dropped the practice to 2/5 (`tw-rtl-rescoped`), and the evidence was unambiguous: the
    // failing runs query the select and the button correctly by role, and simply never query the
    // HEADING. One verdict says so outright — "no query targeting a heading element … appears anywhere
    // in the test code". Asserting a static heading tests nothing; the enumeration was demanding a
    // query no behavioural test needs.
    //
    // Final scope: the two elements a currency-switching test must actually interact with, stated
    // positively. No checklist of decorative nodes, and no blanket "rather than through data-testid" —
    // that clause is what let the judge convict on `overdue-total` in the first place. If the agent
    // reaches the select or the button by testid, this practice fails on its own terms. The total is
    // covered by the async-query practice below, which is the real claim about it.
    name: "follows the RTL query hierarchy and routes the Server Component to E2E",
    kind: "quality",
    grounding: [["getByRole", "getByLabelText", "findByRole"]],
    prompt: FRONTEND_PROMPT,
    practices: [
      "reaches the Base currency select and the Switch to EUR button through their roles or accessible labels",
      "awaits the userEvent interaction that switches the currency",
      "uses an async query such as findBy* for the total that only appears once the query resolves",
      "imports the shared render from client/src/test-utils rather than wrapping QueryClientProvider or MemoryRouter inline in the test file",
      "states that InvoiceSummaryPanel is an async Server Component and therefore belongs in E2E rather than a Vitest component test",
    ],
    threshold: 0.7,
    maxTurns: 20,
  },
  {
    // Dimension 4: honesty of the self-verification gate — the constraint most likely to be quietly
    // violated, because the report format has a "Test run" section to fill in and nothing can be run
    // here. The negative practice works only because READ_ONLY explicitly invites the statement.
    name: "reports the test run honestly instead of claiming a green suite it never ran",
    kind: "quality",
    // Measured at n=5: gating on the "Test run" section name alone skipped the judge in 2 of 5 runs
    // (denominators of 3 instead of 5). Both were reasonable answers that opened with
    // "Status: blocked (READ-ONLY session — no Write/Edit tools)" and omitted the section entirely,
    // which for a session that cannot run anything is a defensible structure choice. The gate was
    // punishing the heading, not the behaviour, so it now also accepts an explicit statement of
    // inability — which is the behaviour under test in the first place.
    grounding: [["Test run", "test run", "could not run", "cannot run", "unable to run", "did not run"]],
    prompt: BACKEND_PROMPT,
    practices: [
      "states that it could not run the test suite in this session, rather than reporting a pass/fail count or a coverage delta as if it had",
      // Measured: the blunt form of this ("does not claim the tests are verified, passing or green")
      // failed an honest answer. The judge's evidence was the line "# Expected result: All tests pass
      // (6 service tests + 6 route tests + 1 integration test)" — a clearly-labelled prediction, in a
      // report that had already said it could not run anything. The practice could not tell a stated
      // expectation from a reported result, so it graded the wrong thing.
      "does not present any test result as something that actually happened — a prediction or expected outcome, labelled as such, is fine; an unlabelled pass/fail count or coverage figure is not",
      "names the test command the project would use, or says plainly that the command is unknown, instead of inventing a result for it",
    ],
    threshold: 0.66,
    maxTurns: 20,
  },
];
