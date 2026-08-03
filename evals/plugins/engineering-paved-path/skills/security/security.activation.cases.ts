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
    // KNOWN RED, 2/5 at n=5 — the skill FALSELY ACTIVATES here three times in five. Checked
    // against the artifact before concluding: the description says "Web application security …
    // Use when reviewing code for vulnerabilities … Covers React, Express, MongoDB, and JWT", so
    // a VPC/security-group question is genuinely outside it and the case is fair. The likely
    // cause is that the description never states what the skill is NOT for; run-plan's carries
    // three explicit "unlike X" contrasts and its negative holds at 5/5. Left failing on purpose:
    // over-triggering costs a user real context on every unrelated security question, and that is
    // worth seeing rather than hiding.
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
