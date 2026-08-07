import {
  EVAL_SKILL_REFS,
  describeSkill,
  describeSkillRetrieval,
  describeWorkflow,
  runSkillCases,
  runSkillRetrievalCases,
  runWorkflowCases,
} from "../../../../src/index.js";
import { cases } from "./fastify-best-practices.cases.js";
import { qualityCases } from "./fastify-best-practices.quality.cases.js";
import { retrievalCases } from "./fastify-best-practices.retrieval.cases.js";

// Three tiers for this skill, and the third one carries the reviews the content tier used to run:
//   workflow  — does the skill ENGAGE at all (real on-disk config, tools granted)
//   retrieval — judged, on-disk: having engaged, does the model find the rule in references/ and
//               apply it. The question production asks. Default tier for this skill's reviews.
//   skill     — what the INJECTED content teaches. OPT-IN only, see below.
//
// The content tier is registered only under `EVAL_SKILL_REFS=1`, because this SKILL.md is a 75-line
// index: 24 of those lines are links into references/, and `fastify-plugin`, `fp(`, `TypeBox`,
// `response schema` and `fast-json-stringify` occur zero times in the body. With the default
// (SKILL.md only) the tier would hand the model a table of contents and no tools, so its three cases
// would measure nothing at all — a red that means nothing is worse than no case.
//
// With the flag ON both arms run, and the PAIR is the diagnostic the payload question was after: the
// content arm asks "is the guidance right when everything is already in context", the retrieval arm
// asks "is it reachable"; a gap localises the failure to retrieval rather than to the guidance.
describeWorkflow("fastify-best-practices trigger", () => runWorkflowCases(cases));
describeSkillRetrieval("fastify-best-practices", () =>
  runSkillRetrievalCases("fastify-best-practices", retrievalCases),
);
if (EVAL_SKILL_REFS) {
  describeSkill("fastify-best-practices", () => runSkillCases("fastify-best-practices", qualityCases));
}
