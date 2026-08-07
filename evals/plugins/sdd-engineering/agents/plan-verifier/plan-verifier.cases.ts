import type { AgentCase } from "../../../../src/index.js";
import { fixtureReader } from "../../../../src/index.js";

const fx = fixtureReader(import.meta.url);

// plan-verifier is read-only by declaration (Read, Grep, Glob, Bash, Skill), so the agent tier
// measures it almost exactly as production runs it — only Bash is stripped. The spec and the
// implementation are passed INLINE rather than planted in the assembled workspace: the workspace
// is shared by every workflow-tier suite, and adding a half-implemented feature to it would
// perturb unrelated cases (adding one plan file already moved the run-plan Gate-0 rate).
//
// The fixture pair is built so each of the agent's five verdicts has an unambiguous right answer,
// and so its two self-declared failure modes are separable:
//
//   AC-1 date-range 400   IMPLEMENTED  .refine(from <= to) + reply.code(400) BEFORE the query
//   AC-2 workspace scope  IMPLEMENTED  eq(orders.workspaceId, workspaceId) in the where clause
//   AC-3 RFC 4180         DIVERGENT    csvCell() handles ',' only — no quote doubling, no newline
//   AC-4 text/csv         DIVERGENT    sends 'application/octet-stream'
//   AC-5 streaming        MISSING      toCsv() builds one string from all rows
//   AC-6 audit log        MISSING      nothing anywhere
//   AC-7 column order     DIVERGENT    header is orderId,status,placedAt,totalCents (2↔3 swapped)
//
// Two deliberate traps, one per failure mode the agent's own body calls out:
//   * ORPHAN CODE — the `?format=json` branch and toJson() are in NO acceptance criterion.
//     "Added Requirement" is named in the agent body as one of the most common failure modes, so
//     inventing an AC for it (or grading it DIVERGENT) is the thing to catch.
//   * OUT-OF-SCOPE QUALITY — the handler calls db.select() directly, a plain layering violation.
//     The agent is scope-guarded to requirement coverage, so this may appear only as a note.

const spec = fx("spec-order-export.md");
const impl = fx("order-export.impl.ts");

// A SECOND, SEPARATE fixture pair for the parity case below, deliberately NOT an eighth AC bolted
// onto the pair above. Two reasons, both learned the hard way in this repo: an extra checklist item
// displaces attention in the two cases that already share that prompt (each carries 5–7 practices),
// and one of those practices asserts "every row of the traceability matrix traces to one of
// AC-1..AC-7", so widening the spec would silently falsify a passing practice. Its own pair costs a
// small file and perturbs nothing.
const paritySpec = fx("spec-export-parity.md");
const parityImpl = fx("export-parity.impl.ts");

const VERIFY_PROMPT = `Verify the implementation below against its specification.

Both files are provided inline — treat them as already read and answer directly (do not ask for
tool access or more files). Cite evidence as \`order-export.impl.ts:<line>\`, counting lines from 1
at the first import.

### docs/specs/SPEC-2026-07-22-order-export.md

${spec}

### server/src/modules/orders/order-export.impl.ts

\`\`\`ts
${impl}
\`\`\``;

export const cases: AgentCase[] = [
  {
    name: "grades the real gaps with the right verdicts and cites evidence",
    kind: "quality",
    prompt: VERIFY_PROMPT,
    // Gate on the agent's own fixed verdict vocabulary, NOT on "AC-5"/"AC-6": the RTM quotes the
    // requirement text and numbers its own rows 1..7, so a correct report frequently never echoes
    // the AC ids at all. An id-based gate failed a flawless RTM before the judge saw it.
    grounding: ["MISSING"],
    practices: [
      "grades AC-5 (streaming above 10 000 rows) as MISSING — the code builds the whole CSV as one in-memory string and never streams",
      "grades AC-6 (audit-log entry) as MISSING — there is no audit logging anywhere in the file",
      "grades AC-4 as DIVERGENT (not IMPLEMENTED): the spec requires `Content-Type: text/csv` but the code sends `application/octet-stream` — and gives BOTH the spec requirement and the actual code behaviour",
      "grades AC-3 as DIVERGENT or PARTIAL, identifying that csvCell only handles the comma case — a value containing a double quote or a newline is not escaped per RFC 4180",
      "grades AC-7 as DIVERGENT or PARTIAL, identifying that the emitted column order is orderId, status, placedAt, totalCents while the spec requires orderId, placedAt, status, totalCents",
      "cites a concrete `file:line` reference (or test name) for every verdict except the MISSING ones, rather than asserting a verdict with no evidence",
      "leads the report with the coverage summary before the requirements traceability matrix, as its output format requires",
    ],
    threshold: 0.7,
    maxTurns: 30,
  },
  {
    name: "credits what is implemented, treats unspecced code as orphan, and keeps quality out of the verdicts",
    kind: "quality",
    prompt: VERIFY_PROMPT,
    // Same reason as the case above — verdict vocabulary, not AC ids.
    grounding: ["IMPLEMENTED"],
    practices: [
      "grades AC-1 as IMPLEMENTED, citing the schema refinement that rejects from > to and the 400 reply that returns before any query runs",
      "grades AC-2 as IMPLEMENTED, citing the `eq(orders.workspaceId, workspaceId)` condition in the where clause",
      "reports the `?format=json` branch (and toJson) as orphan code — code with no corresponding requirement — under Follow-ups or an equivalent scope note; it does NOT invent an acceptance criterion for JSON export and does NOT grade it DIVERGENT",
      "does NOT introduce any requirement that is absent from the specification — every row of the traceability matrix traces to one of AC-1..AC-7",
      // Precise on purpose. An earlier wording asked that `db.select()` stay "out of the
      // verdicts", and the judge failed a correct report for quoting that exact line as evidence
      // that AC-5 buffers everything in memory — which is the right evidence for the right
      // verdict. What is actually under control is whether LAYERING is graded as though it were
      // a requirement; citing the query line elsewhere is legitimate.
      "does not grade the architecture of the handler — that the route queries the database directly instead of going through a repository is a layering concern, and it may appear only as an explicitly out-of-scope note, never as a requirement row, a verdict, or an entry in the gaps-severity table",
    ],
    threshold: 0.7,
    maxTurns: 30,
  },
  {
    // COVERAGE, not a repair — added 2026-08-07 after an enumeration audit RETRACTED the candidate
    // it grew out of. Two facts made it worth a case anyway, and both are about coverage rather
    // than about a defect:
    //
    //  1. `AMBIGUOUS-IN-SPEC` has never been exercised as an intended verdict. The pair above is
    //     built so each verdict has "an unambiguous right answer", but its seven ACs land on
    //     IMPLEMENTED / DIVERGENT / MISSING only; two practices accept "DIVERGENT or PARTIAL" as
    //     alternatives. So one of the agent's five verdicts was unmeasured.
    //  2. The retracted candidate left a thin residue. `plan-verifier.md` says a verdict without
    //     evidence is "downgraded to `PARTIAL` or `AMBIGUOUS-IN-SPEC`", while AMBIGUOUS-IN-SPEC's
    //     own row says "This is a real finding, not a cop-out". A requirement that is PRECISE but
    //     unverifiable here can therefore be routed to the branch the definition forbids.
    //
    // The fixture is built so those two are a discriminating PAIR rather than one lead:
    //     AC-1  IMPLEMENTED        415 before any query runs — a plain control
    //     AC-2  precise, UNVERIFIABLE here — the legacy exporter it must match byte-for-byte is
    //           explicitly not part of this codebase, so nothing provided can settle it
    //     AC-3  self-CONTRADICTORY — one sentence requires every order in the requested range, the
    //           next forbids cancelled ones, and a cancelled order in range cannot satisfy both.
    //           The implementation does include every order in range, so there IS code to grade
    //
    // AC-2 and AC-3 are the whole point: an agent that labels AC-2 AMBIGUOUS-IN-SPEC has conflated
    // "the spec is unclear" with "I cannot verify this here", which is exactly the residue.
    //
    // NOTE WHAT THE PRACTICES DO NOT DO: none of them demands a specific verdict for AC-2. Both
    // `PARTIAL` and `MISSING` are defensible there — nothing in the implementation is incomplete,
    // yet nothing enforces the equivalence either — and a practice naming one would fail a correct
    // answer, which is this repo's most repeated defect. They constrain the two things the contract
    // really settles: do not claim confirmed evidence, and do not take the forbidden branch.
    //
    // PREDICTION, recorded before the run. If AC-2 stays out of IMPLEMENTED and out of
    // AMBIGUOUS-IN-SPEC while the reason is stated, the residue is closed as "the contract routes
    // this correctly in practice" and this case becomes regression protection. If AC-2 is labelled
    // AMBIGUOUS-IN-SPEC, the residue is real and `plan-verifier.md` owes one sentence separating an
    // unclear spec from an unverifiable one — an artifact finding, and a release. Measured at the
    // tier default (haiku) first, which is the floor; a red there is a model-ceiling candidate
    // before it is a definition defect, so confirm on the declared `opus` before editing the agent.
    //
    // RESULT of the first run (`pv-parity-coverage`, haiku, n=5): **the residue is CLOSED.** AC-2
    // stayed out of IMPLEMENTED 5/5 and out of AMBIGUOUS-IN-SPEC 5/5, so the agent does not take
    // the branch its own definition forbids. AC-1's control held 5/5. No `plan-verifier.md` change.
    //
    // …and that run also exposed a defect in MY OWN fixture, which is why AC-3 above is worded
    // differently now. v1 read "WHEN an order has been cancelled, THE SYSTEM SHALL omit it from the
    // export unless the caller asks for the full history", and all five runs graded it **MISSING**
    // with evidence like "No status filtering in query (lines 34–42), no `includeFullHistory`". They
    // were RIGHT: the primary clause is plainly unimplemented, so MISSING dominates and the
    // ambiguity in the exception clause never has to be resolved. The plant was ambiguous *and*
    // unimplemented — fourth instance in this repo of "is your planted premise a FACT or your
    // opinion", and this time the premise was mine.
    //
    // v2 makes the contradiction DECISIVE: the implementation genuinely includes every order in
    // range, so there is code to grade and MISSING is off the table. And the practice no longer
    // demands the AMBIGUOUS-IN-SPEC *label* — applying to AC-3 the same rule I had deliberately
    // applied to AC-2. A spec that contradicts itself can be honestly reported as DIVERGENT against
    // the forbidding sentence, so demanding one label would fail a defensible answer. What the
    // contract really settles is that the contradiction must be SURFACED, not silently resolved.
    //
    // Consequence to state plainly: the AMBIGUOUS-IN-SPEC label therefore remains UNEXERCISED as an
    // intended verdict, and that is deliberate — demanding it would be the enumerated-verdict defect
    // this suite already avoids for AC-2. PREDICTION for v2: ≥4/5. If it still reads low, the honest
    // conclusion is that this agent reports contradictions by grading against the stricter sentence
    // rather than by labelling them, which is a fact worth recording — not a third rewording.
    //
    // v2 RESULT: 0/5 again, so the second branch landed and the practice is REMOVED rather than
    // reworded — see the note at its site below for the mechanism, which is better than the practice
    // was. AC-3 stays in the fixture: it costs nothing, it keeps the checklist realistic, and it is
    // now documented as the thing this suite CANNOT measure and why.
    //
    // WHAT THIS CASE MEASURES, FINAL: the unverifiable-requirement path, and nothing else. AC-1 as a
    // plain control, and the three AC-2 practices that settle the residue this case was built for.
    // On the v2 rows it reads 5/5 with the dead practice gone. Regression protection, not discovery.
    name: "parity: separates a precise-but-unverifiable requirement from a genuinely ambiguous one",
    kind: "quality",
    prompt: `Verify the implementation below against its specification.

Both files are provided inline — treat them as already read and answer directly (do not ask for
tool access or more files). Cite evidence as \`export-parity.impl.ts:<line>\`, counting lines from 1
at the first import.

### docs/specs/SPEC-2026-08-01-export-parity.md

${paritySpec}

### server/src/modules/orders/export-parity.impl.ts

\`\`\`ts
${parityImpl}
\`\`\``,
    // Gate on the SUBJECT the answer has to arrive at, not on a verdict: whether AC-3 deserves
    // AMBIGUOUS-IN-SPEC is the judgement under test, so gating on that literal would put a
    // judgement in the cheap deterministic tier. The legacy exporter is a fact of the fixture.
    grounding: [["legacy", "byte-identical", "byte identical"]],
    practices: [
      "grades AC-1 as IMPLEMENTED and cites the 415 reply that returns before any query runs",
      "does NOT report AC-2 as IMPLEMENTED — it does not claim confirmed evidence for a byte-for-byte equivalence with a legacy exporter that is not part of the material provided",
      "says explicitly WHY AC-2 cannot be confirmed from what it was given — the legacy exporter it must match is outside this codebase — rather than silently settling on a verdict",
      "does NOT label AC-2 AMBIGUOUS-IN-SPEC: that requirement's wording is precise, and what is missing is the means to verify it, not clarity",
      // REMOVED after two measured wordings, per the rule recorded above that a third rewording is
      // not the answer. v1 demanded the `AMBIGUOUS-IN-SPEC` label for an AC that was ambiguous AND
      // unimplemented: 0/5, all five grading it MISSING, correctly. v2 made the contradiction
      // decisive and asked only that it be SURFACED: 0/5 again — and the evidence explains why in
      // the agent's own terms. It splits the AC and grades each half: "Date-range filtering
      // **implemented** … **Cancellation filtering missing**: no status condition in WHERE clause".
      //
      // That is its CONTRACT, not a miss. Phase 1 mandates a checklist of atomic items — "one
      // testable assertion" each — so a two-sentence AC is legitimately decomposed, and once it is,
      // there is no contradiction left to surface: the agent never holds both sentences as a single
      // obligation. Third time on this one case that the agent was right and the plant was wrong.
      //
      // The generalisable lesson, and the reason this is worth more than the practice was: **you
      // cannot plant a spec self-contradiction for an agent whose first phase is instructed to
      // atomise requirements.** Decomposition dissolves it. If `AMBIGUOUS-IN-SPEC` is ever to be
      // exercised as an intended verdict, the route is the OTHER half of its definition — wording
      // that is genuinely unclear *within one atomic assertion* — not two clauses that disagree.
      //
      // Removing it leaves four practices at threshold 0.7, so one miss is still absorbed, and the
      // case is 5/5 on the existing v2 rows by construction (four runs 4/4, one 3/4 = 0.75). No
      // re-measure owed.
    ],
    threshold: 0.7,
    maxTurns: 30,
  },
  {
    // The agent's declared HARD GATE. `refunds` is deliberate: the assembled workspace HAS refund
    // code (server/src/modules/orders/service.ts → startRefund) but no refunds plan or spec, so a
    // model that grades from the code alone fails exactly the way the gate exists to prevent.
    // docs/plans/ does contain an unrelated order-export plan, so "the directory is empty" is not
    // an available shortcut either.
    name: "hard gate: refuses to verify a feature that has no resolvable spec",
    kind: "quality",
    prompt:
      "Verify the payment refunds feature in this project against its specification, and give me " +
      "the requirement coverage.",
    grounding: [["blocked", "Blocked", "BLOCKED"]],
    practices: [
      "reports Status: blocked instead of producing a coverage verdict — no plan or spec for a refunds feature could be resolved",
      "names what it looked for and where (a refunds plan/spec under the docs/plans and docs/specs conventions), rather than only stating that it is blocked",
      "does NOT fabricate requirements for refunds from the implementation code, and does NOT produce a filled-in traceability matrix built from what the code happens to do",
    ],
    threshold: 1.0,
    // Deliberately generous. Proving a spec ABSENT is an exhaustive search, and this agent runs at
    // xhigh effort: at maxTurns 20 it spent every turn globbing and grepping and was cut off
    // mid-search, so the case failed its grounding gate on a truncated transcript rather than on
    // the verdict it never got to write. The turn budget must outlast the search for the gate to
    // be measuring the gate.
    maxTurns: 45,
  },
];
