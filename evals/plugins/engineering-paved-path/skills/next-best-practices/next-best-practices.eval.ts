import {
  EVAL_SKILL_REFS,
  describeSkill,
  describeSkillRetrieval,
  describeWorkflow,
  runSkillCases,
  runSkillRetrievalCases,
  runWorkflowCases,
} from "../../../../src/index.js";
import { cases } from "./next-best-practices.cases.js";
import { qualityCases } from "./next-best-practices.quality.cases.js";
import { retrievalCases } from "./next-best-practices.retrieval.cases.js";

// Three tiers; the retrieval tier carries the reviews the content tier used to run. Same reasoning
// as fastify-best-practices — read that eval file's header, and the retrieval cases file's.
//
// The content tier is OPT-IN (`EVAL_SKILL_REFS=1`) because this SKILL.md teaches nothing directly:
// nineteen of its sections are `See [references/…] for:` blocks. With the default (SKILL.md only) it
// would measure a table of contents. With the flag on, the retrieval-vs-content pair localises a
// failure to retrieval rather than to the guidance.
describeWorkflow("next-best-practices trigger", () => runWorkflowCases(cases));
describeSkillRetrieval("next-best-practices", () =>
  runSkillRetrievalCases("next-best-practices", retrievalCases),
);
if (EVAL_SKILL_REFS) {
  describeSkill("next-best-practices", () => runSkillCases("next-best-practices", qualityCases));
}
