import { describeWorkflow, runWorkflowCases } from "../../../../src/index.js";
import { cases } from "./engineering-insights.cases.js";

describeWorkflow("engineering-insights trigger", () => runWorkflowCases(cases));
