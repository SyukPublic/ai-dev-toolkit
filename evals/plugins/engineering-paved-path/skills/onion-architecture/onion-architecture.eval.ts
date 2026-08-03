import { describeSkill, describeWorkflow, runSkillCases, runWorkflowCases } from "../../../../src/index.js";
import { cases } from "./onion-architecture.cases.js";
import { activationCases } from "./onion-architecture.activation.cases.js";

// Two tiers, kept apart on purpose: the content tier asks what SKILL.md teaches (content injected,
// no tools), the workflow tier asks whether the skill ENGAGES (real on-disk config, tools granted).
// They fail for different reasons and are read separately.
describeSkill("onion-architecture", () => runSkillCases("onion-architecture", cases));
describeWorkflow("onion-architecture trigger", () => runWorkflowCases(activationCases));
