import { describeWorkflow, runWorkflowCases } from "../../../../src/index.js";
import { cases } from "./react-best-practices.cases.js";

describeWorkflow("react-best-practices trigger", () => runWorkflowCases(cases));
