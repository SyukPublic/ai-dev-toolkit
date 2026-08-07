/**
 * Labeled test groups. Wrapping vitest's `describe` gives every case a tier prefix in the
 * output (skill: / agent: / workflow:), which is both readable and how the statistics layer
 * groups series by tier.
 */

import { describe } from "vitest";

export const describeSkill = (name: string, fn: () => void) => describe(`skill:${name}`, fn);
export const describeAgent = (name: string, fn: () => void) => describe(`agent:${name}`, fn);
export const describeWorkflow = (name: string, fn: () => void) => describe(`workflow:${name}`, fn);
/**
 * The retrieval tier: judged cases run against the on-disk harness rather than an injected
 * artifact. Its own prefix, because a `retrieval:` row and a `skill:` row for the same case name
 * are DIFFERENT measurements and must never pool — see runSkillRetrievalCases.
 */
export const describeSkillRetrieval = (name: string, fn: () => void) =>
  describe(`retrieval:${name}`, fn);
