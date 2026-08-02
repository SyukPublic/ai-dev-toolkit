import { describeWorkflow, runWorkflowCases } from "../../../../src/index.js";
import { cases } from "./typescript-expert.cases.js";

describeWorkflow("typescript-expert trigger", () => runWorkflowCases(cases));
