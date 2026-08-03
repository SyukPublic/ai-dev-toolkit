import { describeSkill, describeWorkflow, runSkillCases, runWorkflowCases } from "../../../../src/index.js";
import { cases } from "./react-testing-library.cases.js";
import { qualityCases } from "./react-testing-library.quality.cases.js";

// Two tiers, kept apart on purpose: the workflow tier asks whether the skill ENGAGES (real on-disk
// config, tools granted), the content tier asks what SKILL.md actually teaches (content injected,
// no tools). They fail for different reasons and are read separately.
describeWorkflow("react-testing-library trigger", () => runWorkflowCases(cases));
describeSkill("react-testing-library", () => runSkillCases("react-testing-library", qualityCases));
