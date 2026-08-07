import { describeAgent, runAgentCases } from "../../../../src/index.js";
import { cases } from "./brainstormer.cases.js";

describeAgent("brainstormer", () => runAgentCases("brainstormer", cases));
