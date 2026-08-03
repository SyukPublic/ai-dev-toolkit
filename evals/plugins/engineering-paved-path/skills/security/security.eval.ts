import { describeSkill, describeWorkflow, runSkillCases, runWorkflowCases } from "../../../../src/index.js";
import { cases } from "./security.cases.js";
import { activationCases } from "./security.activation.cases.js";

// Two tiers, kept apart on purpose: the content tier asks what SKILL.md teaches (content injected,
// no tools), the workflow tier asks whether the skill ENGAGES (real on-disk config, tools granted).
// They fail for different reasons and are read separately.
describeSkill("security", () => runSkillCases("security", cases));
describeWorkflow("security trigger", () => runWorkflowCases(activationCases));
