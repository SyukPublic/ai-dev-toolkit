import { describeSkill, describeWorkflow, runSkillCases, runWorkflowCases } from "../../../../src/index.js";
import { cases } from "./dpdk-dataplane-engineering.cases.js";
import { activationCases } from "./dpdk-dataplane-engineering.activation.cases.js";

// Two tiers, kept apart on purpose: the content tier asks what SKILL.md teaches (content injected,
// no tools), the workflow tier asks whether the skill ENGAGES (real on-disk config, tools granted).
// They fail for different reasons and are read separately.
describeSkill("dpdk-dataplane-engineering", () => runSkillCases("dpdk-dataplane-engineering", cases));
describeWorkflow("dpdk-dataplane-engineering trigger", () => runWorkflowCases(activationCases));
