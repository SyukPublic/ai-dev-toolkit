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
