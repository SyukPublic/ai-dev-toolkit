import { describeSkill, describeWorkflow, runSkillCases, runWorkflowCases } from "../../../../src/index.js";
import { cases } from "./react-best-practices.cases.js";
import { qualityCases } from "./react-best-practices.quality.cases.js";

// Two tiers, kept apart on purpose: the workflow tier asks whether the skill ENGAGES (real on-disk
// config, tools granted), the content tier asks what SKILL.md actually teaches (content injected,
// no tools). They fail for different reasons and are read separately.
describeWorkflow("react-best-practices trigger", () => runWorkflowCases(cases));
describeSkill("react-best-practices", () => runSkillCases("react-best-practices", qualityCases));
