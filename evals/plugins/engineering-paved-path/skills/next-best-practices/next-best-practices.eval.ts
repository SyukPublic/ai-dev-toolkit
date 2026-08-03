import { describeSkill, describeWorkflow, runSkillCases, runWorkflowCases } from "../../../../src/index.js";
import { cases } from "./next-best-practices.cases.js";
import { qualityCases } from "./next-best-practices.quality.cases.js";

// Two tiers, kept apart on purpose: the workflow tier asks whether the skill ENGAGES (real on-disk
// config, tools granted), the content tier asks what the skill's content teaches (SKILL.md plus
// references/ injected, no tools). They fail for different reasons and are read separately — and
// for this skill in particular the content tier injects far more than production would; see the
// header of the quality cases file.
describeWorkflow("next-best-practices trigger", () => runWorkflowCases(cases));
describeSkill("next-best-practices", () => runSkillCases("next-best-practices", qualityCases));
