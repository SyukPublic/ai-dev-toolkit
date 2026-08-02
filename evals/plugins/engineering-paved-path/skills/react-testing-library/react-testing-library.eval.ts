import { describeWorkflow, runWorkflowCases } from "../../../../src/index.js";
import { cases } from "./react-testing-library.cases.js";

describeWorkflow("react-testing-library trigger", () => runWorkflowCases(cases));
