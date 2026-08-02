import { describeWorkflow, runWorkflowCases } from "../../../../src/index.js";
import { cases } from "./react-frontend-architecture.cases.js";

describeWorkflow("react-frontend-architecture trigger", () => runWorkflowCases(cases));
