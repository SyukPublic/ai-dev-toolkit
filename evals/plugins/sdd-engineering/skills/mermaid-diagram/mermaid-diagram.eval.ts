import { describeSkill, describeWorkflow, runSkillCases, runWorkflowCases } from "../../../../src/index.js";
import { cases } from "./mermaid-diagram.cases.js";
import { qualityCases } from "./mermaid-diagram.quality.cases.js";

// Two tiers, kept apart on purpose: the workflow tier asks whether the skill ENGAGES (real on-disk
// config, tools granted), the content tier asks what SKILL.md actually teaches (content injected,
// no tools). They fail for different reasons and are read separately.
describeWorkflow("mermaid-diagram trigger", () => runWorkflowCases(cases));
describeSkill("mermaid-diagram", () => runSkillCases("mermaid-diagram", qualityCases));
