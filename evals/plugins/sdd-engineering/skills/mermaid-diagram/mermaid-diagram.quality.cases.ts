import type { SkillCase } from "../../../../src/index.js";
import { fixtureReader } from "../../../../src/index.js";

const fx = fixtureReader(import.meta.url);

// Content tier: only SKILL.md is injected (examples.md is a flat root file the loader does not
// inject), no tools.
//
// The two type-choice cases are the discriminating ones. Any model can emit valid Mermaid; the
// skill's contribution is the decision guide — API calls between services over time are a
// SEQUENCE diagram, and a lifecycle with transitions is a STATE diagram. Both prompts describe
// the subject in plain prose and never name a diagram type, and the first one is deliberately
// phrased with "steps" and "then ... then ...", which pulls hard toward a flowchart. The skill
// says so outright: "Don't use flowcharts for everything — sequence diagrams are better for API
// flows."
//
// deploy-flowchart.md plants the Don't list in one diagram: ~28 nodes (cap is ~20), a nested
// `direction LR` inside a TD chart, every arrow unlabelled including the branch out of a decision
// point, `~~~` used to nudge layout, and three hardcoded fills where a class would do.

const REVIEW_TASK = `Answer directly and concretely — no need to ask for tool access or more files.`;

export const qualityCases: SkillCase[] = [
  {
    name: "type choice: an inter-service request flow is a sequence diagram, not a flowchart",
    kind: "quality",
    prompt: `Draw us a diagram for onboarding docs. When a client posts an order, our API gateway first validates the payload, then asks the auth service to resolve the token, then calls the payments service to authorise the card, then calls the inventory service to reserve stock, and finally writes the order and returns 201. Payments can decline, in which case the gateway returns 402 and nothing is reserved.

${REVIEW_TASK}`,
    grounding: ["sequenceDiagram"],
    practices: [
      // Split. As one practice reading "chooses a sequence diagram AND says why" this failed while
      // the grounding gate — which requires the literal `sequenceDiagram` in the output — passed,
      // so the model had demonstrably chosen right and was failed on the second clause.
      //
      // The "explains the choice" half was then REMOVED, and so was its twin in the state case.
      // Measured `mermaid-content-n5`: 0/5 and 0/5 across the two cases, i.e. 10 consecutive
      // failures, EVERY ONE with empty judge evidence — there was no sentence to quote, because the
      // model draws the right diagram and never editorialises about the choice. Both cases still
      // scored 5/5, so the miss was invisible in the case rate and only the practice column showed
      // it. Three independent reasons not to reword it a third time:
      //   1. The skill never asks for a rationale. `SKILL.md` has zero occurrences of
      //      explain/why/justify/rationale; what it ships is a decision TABLE (subject → diagram
      //      type → syntax, SKILL.md:27-28). The contract is the choice, not the narration.
      //   2. Nothing is lost. The choice is already asserted twice — by the practice below and by
      //      the grounding gate, which requires the literal `sequenceDiagram` / `stateDiagram`
      //      token in the output. A model cannot pass those and have chosen wrongly.
      //   3. It graded elaboration: it could only fail an answer for being correct in fewer words,
      //      which is the playbook's explicit disqualifier. This was already its second wording,
      //      and the rule for a third is to remove it instead.
      "chooses a sequence diagram (`sequenceDiagram`) rather than a flowchart",
      "gives each service its own participant and shows the calls between them in order, rather than modelling the steps as a single chain of process boxes",
      "represents the decline path — the 402 with nothing reserved — rather than diagramming only the happy path",
      "wraps the diagram in a triple-backtick `mermaid` code block so it renders in markdown",
    ],
    threshold: 0.7,
    maxTurns: 4,
  },
  {
    name: "type choice: an entity lifecycle is a state diagram",
    kind: "quality",
    prompt: `We need a diagram for the docs showing how an order moves through its life. A new order is pending. Paying it makes it paid; failing payment makes it failed, and from failed the customer can retry back to pending. A paid order ships, and a shipped order is delivered, which is the end of the line. A pending or paid order can be cancelled at any point, and cancelled is also terminal.

${REVIEW_TASK}`,
    grounding: ["stateDiagram"],
    practices: [
      // Split for the same reason as the sequence case above, and its "explains the choice" half
      // removed for the same measured reason — see the sequence case. The two practices were the
      // same shape and failed identically, 0/5 each with empty evidence, which is what made the
      // diagnosis a pattern rather than one noisy practice.
      "chooses a state diagram (`stateDiagram-v2`) rather than a flowchart",
      "marks the start and the terminal states with `[*]`, covering both delivered and cancelled as endpoints",
      "labels the transitions with the events that cause them (paying, payment failure, retry, shipping, delivery, cancellation) rather than leaving bare arrows between states",
      "wraps the diagram in a triple-backtick `mermaid` code block so it renders in markdown",
    ],
    threshold: 0.7,
    maxTurns: 4,
  },
  // The review is TWO scoped cases, not one "what is wrong with this" prompt, and every practice
  // is a single claim. Both decisions were forced by measurement.
  //
  // As one case with five "flags X AND recommends Y" practices it scored 0/5 on an answer that
  // was actually good: it wrote "Too many nodes (24 total)" and "Invisible link is a layout hack
  // — smoke ~~~ approval suggests the structure itself is forcing bad layout decisions", which is
  // almost verbatim what two of the practices asked for. Both failed, because the model's
  // remedies were not the remedies the practices prescribed. A correct finding scored zero.
  //
  // The single prompt also asked for five unrelated defects at once, so the model answered with
  // its own top-six — partly overlapping, partly its own (a backward rollback edge, an unclear
  // critical path). Splitting by dimension is what took the workflow-retro timing case from 1/4
  // to 3/3.
  {
    name: "review: reads the oversized chart as a structural problem",
    kind: "quality",
    prompt: `Review the STRUCTURE of this diagram from our deployment docs — its size, its direction, and whether a reader can tell what each arrow means. Ignore styling for now.

${REVIEW_TASK}

${fx("deploy-flowchart.md")}`,
    // NOT ["20"]: a correct answer can say "far too many nodes" without naming the ceiling, and
    // the number lives in SKILL.md rather than in the prompt, so requiring the echo gates on
    // recall of a figure instead of on the judgement.
    grounding: [["node", "arrow", "label"]],
    practices: [
      "flags the number of nodes as too many for a single diagram",
      "recommends splitting it into more than one diagram, rather than only rearranging this one",
      // KNOWN RED, both 0/5 at n=5 — stable misses, not variance, and the prompt names both
      // dimensions explicitly ("its direction, and whether a reader can tell what each arrow
      // means"). The model reliably reports the size problem and stops. Node count is 3/5 and the
      // split remedy 4/5, so this case cannot reach the 0.7 gate while these two sit at zero, and
      // it stays red on purpose: the redness IS the finding, the same call made for TS2589 in
      // typescript-expert. Do not move the threshold to hide it, and do not delete these two —
      // "label edges" and "don't mix directions" are both on the skill's own Don't list.
      "flags the unlabelled arrows — in particular the branch where `verify` leads to both `notify` and `rollback` with nothing saying which condition applies",
      "flags the `direction LR` inside the legend subgraph as mixing directions inside one `flowchart TD`",
    ],
    threshold: 0.7,
    maxTurns: 4,
  },
  {
    name: "review: names the layout and colour hacks",
    kind: "quality",
    prompt: `Look at how this diagram from our deployment docs handles layout and colour. Is anything there working against us?

${REVIEW_TASK}

${fx("deploy-flowchart.md")}`,
    grounding: [["~~~", "invisible", "style", "fill"]],
    practices: [
      "flags the `smoke ~~~ approval` invisible link as a layout hack rather than accepting it as normal",
      "says the layout should be fixed through direction or grouping instead of an invisible link",
      "flags the three hardcoded `style ... fill:#ff6b6b` declarations",
      "recommends a `classDef` class, or leaving colour to the theme, instead of repeating an inline fill per node",
    ],
    threshold: 0.7,
    maxTurns: 4,
  },
];
