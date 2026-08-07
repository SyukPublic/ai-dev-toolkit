import type { SkillCase } from "../../../../src/index.js";
import { fixtureReader } from "../../../../src/index.js";

const fx = fixtureReader(import.meta.url);

// RETRIEVAL tier — the same three reviews as the content tier used to run, but against the
// assembled on-disk harness: the skill is a real project asset and the model must decide to
// consult it and Read the reference that holds the answer. See runSkillRetrievalCases.
//
// WHY THESE THREE MOVED. `fastify-best-practices/SKILL.md` is 75 lines and 24 of them are links
// into `references/`; measured against the skill body, `fastify-plugin`, `fp(`, `TypeBox`,
// `response schema` and `fast-json-stringify` occur ZERO times, and `inject` occurs twice — both
// inside the index line pointing at references/testing.md. All the substance is in the 19
// reference files (172 866 chars against SKILL.md's 4 574). So once the content tier stops
// injecting `references/` there is nothing left there for these cases to measure: the model would
// be handed a table of contents with no tools. This tier asks the question production actually
// asks — can the guidance be REACHED and applied — and it is only viable here because fastify sits
// in the activation tier's 100%-engagement group (framework-specific subjects never miss).
//
// The prompts deliberately keep the fixture inline. The workspace hosts no Fastify app, and
// planting one would put a second, contradictory sample project next to the Orders one — the
// incoherence the implementer suite already paid for. What changed from the content wording is the
// tool clause: "do not ask for tool access or more files" is exactly wrong here.
//
// THE TASK LINE NAMES THE MECHANISM, and the pilot is why. First wording said only "consult
// whatever guidance this project carries on the subject" (`fastify-retrieval-pilot`, haiku, n=5 on
// the testing case). The tier itself worked perfectly where it ran: the two runs that engaged went
// `Skill` → `Read .claude/skills/fastify-best-practices/references/testing.md` → 4/4 and 3/4
// practices, in 4–5 turns. But THREE of five runs made ZERO tool calls, wrote a full 1.4–2.8k-token
// answer inline, never said `inject`, and failed the grounding gate — so the case read 2/5 while
// every engaged run passed.
//
// That is the haiku non-engagement shape this repo has already measured ("median 967 output tokens
// and no tool calls at all in 29 of 78 misses — the model writing a full competent answer instead
// of consulting anything"), and it makes the RATE a measurement of selection rather than of
// retrieval. Selection is the ACTIVATION tier's question and it is already at 100% for this skill —
// on a prompt framed as an explicit "what's the right way to do this in Fastify?". A code review
// with the code inline invites an inline answer instead, which is exactly what happened.
//
// So the task line now names the mechanism: there IS a skill, consult it, and follow it to the file
// it points at. That is a CONSTRAINT on the session, not a false fact about the project, and it is
// the same latitude an agent-tier prompt takes when it says "this session is read-only". It does
// not name which skill and it does not name the reference file, so finding the right one remains
// the measured step.
//
// PREDICTION, recorded before the re-measure: engagement should go 2/5 → ≥4/5, and if the judged
// practices then hold ≥4/5 among the engaged runs, this tier isolates retrieval and the relocation
// is sound. If engagement stays ≤2/5 even with the skill named, haiku cannot serve a judged
// retrieval tier, and the honest resolution is to run it at a stronger model with the judge moved
// up as well — NOT to keep loosening the prompt. Record that outcome rather than working around it.
//
// Read the content-tier file's header for what the fixture plants and what must NOT be "fixed";
// the fixture is shared and unchanged.

const RETRIEVAL_TASK = `This project ships a skill carrying guidance on this subject. Consult that skill, and any reference file it points you to, before you answer — then give the review in your reply. The code is provided inline, so you do not need to search the project for it. For anything already written correctly, say so briefly rather than rewriting it.`;

const FILE = `\`\`\`ts
${fx("orders-app.ts")}
\`\`\``;

export const retrievalCases: SkillCase[] = [
  {
    name: "testing: moves the test off a real port and onto inject()",
    kind: "quality",
    prompt: `Review the TEST in this Fastify app. It is flaky in CI and occasionally fails with EADDRINUSE.

${RETRIEVAL_TASK}

${FILE}`,
    grounding: [["inject", "inject("]],
    practices: [
      "replaces `app.listen()` plus `fetch()` with `app.inject()`, so the test issues the request in-process with no port and no network",
      "connects that directly to the reported symptom: nothing binds port 4321, so EADDRINUSE cannot occur and parallel test files stop colliding",
      "reads the assertion target off the inject response (its `statusCode`, and `json()` or `payload` for the body) rather than a fetch Response",
      "does NOT flag the `await app.ready()` call as a problem — it is required before the first request and is correct as written",
    ],
    threshold: 0.7,
    // 10, not the content tier's 4: the model spends turns on the Skill call and on Reading
    // references/testing.md before it writes anything. A cap sized for a one-turn content answer
    // starves this tier and the row reads as a content failure.
    maxTurns: 10,
  },
  {
    name: "encapsulation: finds the decorator that never reaches its siblings",
    kind: "quality",
    prompt: `Review the PLUGIN STRUCTURE of this Fastify app. We are getting "fastify.audit is not a function" in production and cannot see why — the plugin is registered.

${RETRIEVAL_TASK}

${FILE}`,
    grounding: [["fastify-plugin", "fp("]],
    practices: [
      "explains the cause as Fastify's plugin encapsulation: auditPlugin is a plain plugin, so the `audit` decorator stays in that plugin's own context and is not visible to the sibling route plugin",
      "fixes it by wrapping auditPlugin in `fastify-plugin` (fp) so the decorator is published to the parent context",
      "does NOT recommend changing dbPlugin — recognises that it is already correct, being wrapped in fp() precisely so its decorator reaches the rest of the app",
    ],
    // Three practices: see the content-tier file for the retracted `fastify.db` claim, which was
    // false rather than merely unmet. At 0.7 three practices would mean 3/3.
    threshold: 0.6,
    maxTurns: 10,
  },
  {
    name: "schemas: replaces the imperative validation and adds response schemas",
    kind: "quality",
    prompt: `Review how this Fastify app handles VALIDATION and RESPONSE SERIALIZATION. Ignore plugin structure and tests for now.

${RETRIEVAL_TASK}

${FILE}`,
    grounding: [["schema", "Schema"]],
    practices: [
      "replaces the hand-rolled if-chain in POST /orders with a JSON Schema attached to the route, so Fastify validates the body before the handler runs",
      "recommends TypeBox for declaring that schema, so the TypeScript types come from the same definition",
      "flags that neither route declares a response schema",
      "gives a concrete reason for the response schema beyond tidiness — it lets Fastify serialize with fast-json-stringify, and it bounds the payload to declared fields instead of returning whatever the database row contains",
    ],
    threshold: 0.7,
    maxTurns: 10,
  },
];
