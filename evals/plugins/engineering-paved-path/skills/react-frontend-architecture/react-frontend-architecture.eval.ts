import { describeSkill, describeWorkflow, runSkillCases, runWorkflowCases } from "../../../../src/index.js";
import { cases } from "./react-frontend-architecture.cases.js";
import { qualityCases } from "./react-frontend-architecture.quality.cases.js";

// Two tiers, kept apart on purpose: the workflow tier asks whether the skill ENGAGES (real on-disk
// config, tools granted), the content tier asks what SKILL.md actually teaches (content injected,
// no tools). They fail for different reasons and are read separately.
describeWorkflow("react-frontend-architecture trigger", () => runWorkflowCases(cases));
describeSkill("react-frontend-architecture", () =>
  runSkillCases("react-frontend-architecture", qualityCases),
);
