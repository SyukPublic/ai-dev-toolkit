import { describeWorkflow, runWorkflowCases } from "../../../../src/index.js";
import { cases } from "./workflow-retro.cases.js";

describeWorkflow("workflow-retro trigger", () => runWorkflowCases(cases));
