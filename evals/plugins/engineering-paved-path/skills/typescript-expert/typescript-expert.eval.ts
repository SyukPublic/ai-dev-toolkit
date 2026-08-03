import { describeSkill, describeWorkflow, runSkillCases, runWorkflowCases } from "../../../../src/index.js";
import { cases } from "./typescript-expert.cases.js";
import { qualityCases } from "./typescript-expert.quality.cases.js";

// Two tiers for one skill, deliberately kept apart: the workflow tier asks whether the skill
// ENGAGES (real on-disk config, tools granted), the content tier asks what SKILL.md actually
// teaches (content injected, no tools). They fail for different reasons and are read separately.
describeWorkflow("typescript-expert trigger", () => runWorkflowCases(cases));
describeSkill("typescript-expert", () => runSkillCases("typescript-expert", qualityCases));
