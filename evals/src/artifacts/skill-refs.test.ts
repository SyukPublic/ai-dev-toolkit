/**
 * Pins the EVAL_SKILL_REFS knob (config.ts) against the real plugin catalog.
 *
 * The load-bearing assertion is the LAST one: for every skill that ships no `references/`
 * directory, the two settings must produce byte-identical content. That is what makes the knob
 * safe to flip — it can only ever move the 5 suites that actually carry references, so the other
 * 7 can never shift underneath a measurement without anyone noticing.
 */

import { describe, it, expect } from "vitest";
import { skillContent } from "./load.js";
import { listSkills } from "./paths.js";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const hasRefs = (dir: string) => {
  const refs = join(dir, "references");
  return existsSync(refs) && readdirSync(refs).some((f) => f.endsWith(".md"));
};

describe("skillContent references injection", () => {
  it("includes reference material when asked, and drops it when not", () => {
    // fastify is the extreme case: `inject(` appears 22x across references/testing.md and only as a
    // one-line mention plus a pointer in SKILL.md, whose own inline example shows app.listen().
    const withRefs = skillContent("fastify-best-practices", true);
    const skillOnly = skillContent("fastify-best-practices", false);

    expect(withRefs).toContain("## Reference: testing.md");
    expect(skillOnly).not.toContain("## Reference:");
    // Both must still carry the skill body itself.
    expect(skillOnly).toContain("fastify-best-practices");
    expect(withRefs.startsWith(skillOnly)).toBe(true);
  });

  it("drops a payload far larger than the skill body for the reference-heavy skills", () => {
    // Not a style check: the size difference IS the question the knob exists to measure.
    const withRefs = skillContent("fastify-best-practices", true);
    const skillOnly = skillContent("fastify-best-practices", false);
    expect(skillOnly.length).toBeLessThan(withRefs.length / 10);
  });

  it("is a NO-OP for every skill that ships no references/ directory", () => {
    const unaffected = listSkills().filter((s) => !hasRefs(s.dir));
    // Guard the guard: if this list ever empties, the assertion below proves nothing.
    expect(unaffected.length).toBeGreaterThan(0);
    for (const s of unaffected) {
      expect(skillContent(s.name, false)).toBe(skillContent(s.name, true));
    }
  });
});
