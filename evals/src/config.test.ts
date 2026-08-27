/**
 * Pins the tool blocklist. Free — no model, no session.
 *
 * It exists because the blocklist is a DENYLIST OF NAMES and its failure mode is silence: a tool
 * that runs commands but is not named here is simply allowed, and nothing anywhere says so. That
 * is not hypothetical — `Bash` was blocked while `Monitor` (a `command` runner "in the same shell
 * environment as Bash") was not, and a workflow-tier session used it to write eleven real files
 * into the assembled workspace.
 *
 * So the assertions below are deliberately about CATEGORIES rather than about a snapshot of the
 * array: every tool that can run a command, write a file, or reach outside the process must be
 * blocked in BOTH tiers, and the two tiers must not drift apart.
 */

import { test, expect } from "vitest";
import { MUTATING_TOOLS, WORKFLOW_ALLOWED_TOOLS, WORKFLOW_DISALLOWED_TOOLS } from "./config.js";

const EXECUTES = ["Bash", "PowerShell", "Monitor"];
const WRITES = ["Write", "Edit", "MultiEdit", "NotebookEdit"];
const ESCAPES = ["Artifact", "SendMessage", "Workflow", "RemoteTrigger", "CronCreate"];

test("every tool that runs a command is blocked in both tiers", () => {
  for (const tool of EXECUTES) {
    expect(WORKFLOW_DISALLOWED_TOOLS, `workflow tier allows ${tool}`).toContain(tool);
    expect(MUTATING_TOOLS, `agent tier allows ${tool}`).toContain(tool);
  }
});

test("every tool that writes a file is blocked in both tiers", () => {
  for (const tool of WRITES) {
    expect(WORKFLOW_DISALLOWED_TOOLS, `workflow tier allows ${tool}`).toContain(tool);
    expect(MUTATING_TOOLS, `agent tier allows ${tool}`).toContain(tool);
  }
});

test("every tool that reaches outside the process is blocked in both tiers", () => {
  for (const tool of ESCAPES) {
    expect(WORKFLOW_DISALLOWED_TOOLS, `workflow tier allows ${tool}`).toContain(tool);
    expect(MUTATING_TOOLS, `agent tier allows ${tool}`).toContain(tool);
  }
});

test("the two tiers block the same set — neither may drift", () => {
  expect([...WORKFLOW_DISALLOWED_TOOLS].sort()).toEqual([...MUTATING_TOOLS].sort());
});

test("the workflow allow-list never names a blocked tool", () => {
  // The allow-list is inert under bypassPermissions, so this cannot protect anything on its own —
  // but an allow-list contradicting the blocklist is a statement of intent that has gone wrong.
  for (const tool of WORKFLOW_ALLOWED_TOOLS) {
    expect(WORKFLOW_DISALLOWED_TOOLS, `${tool} is both allowed and blocked`).not.toContain(tool);
  }
});

test("researcher's method survives the blocklist — WebSearch and WebFetch stay available", () => {
  // The one place over-blocking would silently destroy a suite instead of protecting it.
  for (const tool of ["WebSearch", "WebFetch"]) {
    expect(MUTATING_TOOLS, `agent tier blocks ${tool}`).not.toContain(tool);
    expect(WORKFLOW_DISALLOWED_TOOLS, `workflow tier blocks ${tool}`).not.toContain(tool);
  }
});
