import { describeWorkflow, runWorkflowCases } from "../../../../src/index.js";
import { cases } from "./fastify-best-practices.cases.js";

describeWorkflow("fastify-best-practices trigger", () => runWorkflowCases(cases));
