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
    // Fixed in engineering-paved-path 1.0.3 by rewriting the description to say it reviews
    // application SOURCE CODE, to list trigger terms, and to name the out-of-scope areas
    // explicitly — the shape run-plan already uses, whose negative holds at 5/5. Re-measured at
    // n=5: this negative went 40% → 80% AND the positive went 60% → 80%, so clarifying the scope
    // helped the trigger in both directions rather than trading one failure for another.
    //
    // Residual: one false activation in five still happens. Do not chase it by narrowing the
    // description further without measuring the positive in the same run.
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
