import { describeSkill, describeWorkflow, runSkillCases, runWorkflowCases } from "../../../../src/index.js";
import { cases } from "./engineering-insights.cases.js";
import { qualityCases } from "./engineering-insights.quality.cases.js";

// Two tiers, kept apart on purpose: the workflow tier asks whether the skill ENGAGES (real on-disk
// config, tools granted), the content tier asks what SKILL.md actually teaches (content injected,
// no tools). They fail for different reasons and are read separately.
describeWorkflow("engineering-insights trigger", () => runWorkflowCases(cases));
describeSkill("engineering-insights", () => runSkillCases("engineering-insights", qualityCases));
