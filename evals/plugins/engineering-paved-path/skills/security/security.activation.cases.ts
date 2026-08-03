import type { WorkflowCase } from "../../../../src/index.js";

/**
 * Trigger (activation) suite for engineering-paved-path:security. Workflow-tier: each case runs in
 * the assembled workspace (src/workspace.ts) and asserts whether THIS skill engages (a Skill call
 * or its SKILL.md read). Positives are `indicative` (a model may do the work inline — logged, not
 * blocking); a false activation on the near-miss negative is a hard failure.
 *
 * This skill had four quality cases and no activation coverage — the same blind spot recorded in
 * onion-architecture.activation.cases.ts.
 *
 * The negative is chosen so the word "security" is unavoidably present while the skill is still
 * the wrong tool: infrastructure hardening with no application code to review. This skill is an
 * application-code review guide (OWASP Top 10 for a React + Express + MongoDB + JWT stack), so a
 * trigger that fires here is keyword-matching on "security" rather than recognising its scope.
 */
export const activationCases: WorkflowCase[] = [
  {
    kind: "activation",
    name: "security engages on an application auth-code review",
    prompt:
      "Before we ship, review the login and session code in our Express + MongoDB app: it looks " +
      "up the user with the request body, signs a JWT, and renders the profile page with the " +
      "user's bio. What could an attacker do with this, and what should we change?",
    skill: "security",
    shouldActivate: true,
    indicative: true,
    maxTurns: 4,
  },
  {
    kind: "activation",
    // Near-miss: the word "security" is right there, but this is network/infrastructure hardening
    // with no application code in scope — outside what this skill reviews.
    //
    // This case found and then verified a real defect. At first measurement the skill FALSELY
    // ACTIVATED here three times in five (negative 2/5). The description was the cause: it said
    // "Web application security best practices … Use when reviewing code for vulnerabilities" and
    // never stated what the skill is NOT for, so any question containing "security" pulled the
    // whole OWASP guide into context.
    //
    // engineering-paved-path 1.0.3 rewrote the description to say it reviews application SOURCE
    // CODE, to list trigger terms, and to name the out-of-scope areas explicitly. Measured at n=5
    // that read as 40% → 80% here and 60% → 80% on the positive.
    //
    // THAT MEASUREMENT DID NOT HOLD. n=5 is far too small for a rate near 50% (±22pp), and pooling
    // every series recorded against the 1.0.3 description gives:
    //
    //     correct non-engagement (this case)   7/20  = 35%
    //     engagement (the positive)            8/22  = 36%
    //
    // The 80% pair was one lucky five-run series, and the "before" figure was a five-run series
    // too, so there is no evidence 1.0.3 improved the trigger at all. Both numbers are still in the
    // published 1.0.3 changelog.
    //
    // DEAD END, measured — do not repeat. Hypothesis: the 1.0.3 exclusion clause listed the
    // near-miss vocabulary itself ("VPC and security-group design … which ports to open, public
    // IPs"), four of whose terms appear verbatim in this prompt, and lexical overlap beats a
    // negation for skill selection. Tested by replacing the list with "Reads application source
    // code only — questions about infrastructure, networking, or cloud platform configuration are
    // out of scope" (description 869 → 712 chars, shared terms 4 → 0), both cases re-measured at
    // n=10 in one run:
    //
    //     negative  10% → 10%   Δ 0
    //     positive  30% → 10%   Δ −20
    //
    // Reverted byte-for-byte. Term overlap is NOT the mechanism.
    //
    // IT IS A MODEL CEILING — do NOT edit security/SKILL.md's description. Same description, same
    // cases, one variable changed:
    //
    //     model under test        positive engages    negative stays out
    //     claude-sonnet-5 (n=5)   5/5  100%           5/5  100%
    //     claude-haiku-4-5 (n=10) 3/10  30%           1/10  10%
    //
    // Sonnet's traces are identical across all five runs: on the positive turns=2,
    // tools: ['Skill'], skills: ['security'], 4-16 output tokens (early stop on engagement); on the
    // negative turns=1, tools: [], ~1500-1850 output tokens — it answers the infrastructure question
    // itself and never touches the skill. That is the description working exactly as written, in
    // both directions, on a model able to follow it.
    //
    // So the 1.0.3 rewrite is right on the merits even though the numbers published for it are not
    // reproducible. EVAL_MODEL defaults to claude-haiku-4-5, so this pair will keep reading red in
    // the default series — that is the tripwire working, not a regression, exactly as with the NoSQL
    // operator-injection miss in security.cases.ts.
    //
    // Also refuted by the same probe: that topical match on the skill's own NAME drives the false
    // activation (sonnet never fires on the word "security" here), and that a capable model would
    // displace the skill by answering inline (sonnet engages MORE on the positive, not less).
    // Anything further here is a model-selection question, not a content one.
    name: "near-miss negative — VPC and firewall hardening must NOT engage the app-security review skill",
    prompt:
      "We are setting up the VPC and security groups for our managed Postgres instance. Which " +
      "ports should be open, should the database get a public IP, and how do we restrict access " +
      "to just the application subnet?",
    skill: "security",
    shouldActivate: false,
    maxTurns: 4,
  },
];
