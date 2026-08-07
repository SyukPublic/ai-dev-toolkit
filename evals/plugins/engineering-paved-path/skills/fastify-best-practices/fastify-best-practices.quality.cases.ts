import type { SkillCase } from "../../../../src/index.js";
import { fixtureReader } from "../../../../src/index.js";

const fx = fixtureReader(import.meta.url);

// Content tier, no tools. READ THIS BEFORE INTERPRETING A RESULT: this skill's SKILL.md is a
// 75-line index, and all of its substance lives in references/ (19 files). Since that directory
// moved from `rules/` in engineering-paved-path 1.0.2 the loader injects it — roughly 178k chars
// per case. Production loads only the SKILL.md body and reads a reference on demand, so a case
// here asks "does this content teach the right thing", NOT "does this skill help in a real
// session". The second question belongs to the activation tier.
//
// orders-app.ts plants the footguns the references warn about, and keeps two things that are
// already right:
//
//   PLANTED                                        REFERENCE
//   audit plugin decorates without fp()            plugins.md — a plain plugin is encapsulated,
//                                                    so `audit` never reaches the sibling routes
//   hand-rolled if-chain body validation           schemas.md — validate with a schema (TypeBox
//                                                    preferred), not imperative checks
//   no response schema on either route             serialization.md — response schemas enable
//                                                    fast-json-stringify and bound the payload
//   tests over a real port with fetch()            testing.md — inject() needs no network
//
//   CORRECT, MUST NOT BE "FIXED"                   WHY
//   dbPlugin wrapped in fp()                       that is exactly how a shared decorator is
//                                                    published to the parent context
//   `await app.ready()` in the test                required before inject/first request
//
// RETRACTED (2026-08-07) — the encapsulation case used to carry a fourth practice: "notes that
// `fastify.db` is also unavailable inside auditPlugin as written, since the decorator it depends
// on is added by a separate registration". It measured 0/7 with EMPTY judge evidence on every row,
// and the claim is simply FALSE. `dbPlugin` IS wrapped in fp(), so `db` is published to the root
// context and every later child — auditPlugin included — inherits it; and `fastify.db` is read
// inside the `audit` closure at CALL time, not at decorate time, so it resolves either way.
// references/plugins.md:44 says so in the skill's own words ("available to the parent and
// siblings"), and two recorded runs stated it verbatim: "dbPlugin **is** wrapped in `fp()`, which
// breaks encapsulation and makes `fastify.db` available to the parent and siblings" (20260804T220622)
// and "so `fastify.db` is guaranteed to exist when the audit decorator is created" (20260803T101354).
// The model was right seven times out of seven.
//
// The fixture is NOT the thing to change: making the claim true would mean dropping fp() from
// dbPlugin, which would destroy the fourth practice below — the control that carries this case's
// whole discrimination. So the practice goes, and `threshold` drops 0.7 → 0.6 with it, because at
// 0.7 a three-practice case silently becomes "must be perfect" (2/3 = 0.667). No re-measure is
// owed: on all 7 existing rows the three surviving practices passed, so every row still scores
// 3/3 = 1.0 and the case rate is unchanged by construction.
//
// The honest adjacent lead — auditPlugin consumes `fastify.db` without declaring
// `dependencies: ['database-plugin']` or guarding with `hasDecorator` (decorators.md:315) — is
// real content, but it is a SECOND finding on a prompt that asks why `fastify.audit` is not a
// function, which is exactly the attention-budget shape that produced this 0/7. If it is wanted,
// it needs its own scoped prompt.

const REVIEW_TASK = `The code is provided inline — treat it as already read and answer directly in your reply (do not ask for tool access or more files). For anything already written correctly, say so briefly rather than rewriting it.`;

const FILE = `\`\`\`ts
${fx("orders-app.ts")}
\`\`\``;

export const qualityCases: SkillCase[] = [
  {
    name: "encapsulation: finds the decorator that never reaches its siblings",
    kind: "quality",
    prompt: `Review the PLUGIN STRUCTURE of this Fastify app. We are getting "fastify.audit is not a function" in production and cannot see why — the plugin is registered.

${REVIEW_TASK}

${FILE}`,
    grounding: [["fastify-plugin", "fp("]],
    practices: [
      "explains the cause as Fastify's plugin encapsulation: auditPlugin is a plain plugin, so the `audit` decorator stays in that plugin's own context and is not visible to the sibling route plugin",
      "fixes it by wrapping auditPlugin in `fastify-plugin` (fp) so the decorator is published to the parent context",
      "does NOT recommend changing dbPlugin — recognises that it is already correct, being wrapped in fp() precisely so its decorator reaches the rest of the app",
    ],
    // 0.6, not 0.7: three practices at 0.7 would require 3/3. See the RETRACTED note in the header.
    threshold: 0.6,
    maxTurns: 4,
  },
  {
    name: "schemas: replaces the imperative validation and adds response schemas",
    kind: "quality",
    prompt: `Review how this Fastify app handles VALIDATION and RESPONSE SERIALIZATION. Ignore plugin structure and tests for now.

${REVIEW_TASK}

${FILE}`,
    grounding: [["schema", "Schema"]],
    practices: [
      "replaces the hand-rolled if-chain in POST /orders with a JSON Schema attached to the route, so Fastify validates the body before the handler runs",
      "recommends TypeBox for declaring that schema, so the TypeScript types come from the same definition",
      "flags that neither route declares a response schema",
      "gives a concrete reason for the response schema beyond tidiness — it lets Fastify serialize with fast-json-stringify, and it bounds the payload to declared fields instead of returning whatever the database row contains",
    ],
    threshold: 0.7,
    maxTurns: 4,
  },
  {
    name: "testing: moves the test off a real port and onto inject()",
    kind: "quality",
    prompt: `Review the TEST in this Fastify app. It is flaky in CI and occasionally fails with EADDRINUSE.

${REVIEW_TASK}

${FILE}`,
    grounding: [["inject", "inject("]],
    practices: [
      "replaces `app.listen()` plus `fetch()` with `app.inject()`, so the test issues the request in-process with no port and no network",
      "connects that directly to the reported symptom: nothing binds port 4321, so EADDRINUSE cannot occur and parallel test files stop colliding",
      "reads the assertion target off the inject response (its `statusCode`, and `json()` or `payload` for the body) rather than a fetch Response",
      "does NOT flag the `await app.ready()` call as a problem — it is required before the first request and is correct as written",
    ],
    threshold: 0.7,
    maxTurns: 4,
  },
];
