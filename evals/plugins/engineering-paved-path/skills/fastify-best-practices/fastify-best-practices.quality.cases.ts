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
//                                                    so `audit` never reaches sibling routes and
//                                                    fastify.db is undefined inside it
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
      "notes that `fastify.db` is also unavailable inside auditPlugin as written, since the decorator it depends on is added by a separate registration",
      "does NOT recommend changing dbPlugin — recognises that it is already correct, being wrapped in fp() precisely so its decorator reaches the rest of the app",
    ],
    threshold: 0.7,
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
