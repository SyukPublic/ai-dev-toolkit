import { describeWorkflow, runWorkflowCases } from "../../../../src/index.js";
import { cases } from "./mermaid-diagram.cases.js";

describeWorkflow("mermaid-diagram trigger", () => runWorkflowCases(cases));
