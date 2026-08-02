import { describeWorkflow, runWorkflowCases } from "../../../../src/index.js";
import { cases } from "./next-best-practices.cases.js";

describeWorkflow("next-best-practices trigger", () => runWorkflowCases(cases));
