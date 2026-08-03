import type { SkillCase } from "../../../../src/index.js";
import { fixtureReader } from "../../../../src/index.js";

const fx = fixtureReader(import.meta.url);

// Content tier: only SKILL.md is injected (reference.md is a flat root file the loader does not
// inject) and the session has NO tools, so the session summary and the current insights file both
// travel in the prompt. The skill declares Edit/Write, so the prompts ask for the entries it would
// append rather than for a file edit — the same adaptation spec-creator's cases make.
//
// session-summary.md is built so every arm of the anti-banality gate has exactly one target, and
// so the two hardest rules have somewhere to bite:
//
//   ITEM                                    EXPECTED           WHY
//   Promise.all → pool deadlock in CI       CAPTURE            non-obvious, has a root cause
//   retry-with-backoff dead end             CAPTURE            "don't skip the negatives"
//   drizzle .returning() on conflict-skip   DO NOT capture     ALREADY in the file, dated 06-19
//   rename getUser → fetchUser              DO NOT capture     trivia
//   prettier run over 41 files              DO NOT capture     trivia
//   pino 9.4.0 → 9.5.0                      DO NOT capture     routine config edit
//   README docs link                        DO NOT capture     trivia
//   "async is generally tricky"             DO NOT capture     platitude — too generic
//
// The duplicate is the sharpest control. The skill is append-only, which invites "append
// everything"; the rule that actually costs judgement is "read the target file FIRST — if it or
// an equivalent is already recorded, do NOT write it again". The planted duplicate is worded
// differently from the session's phrasing of the same discovery, so matching it requires reading
// the file rather than string-matching.

const CAPTURE_TASK = `This eval session is read-only — do NOT write or edit any file. Report exactly which entries you would append and their final text, and briefly say which candidates you are rejecting and why.`;

export const qualityCases: SkillCase[] = [
  {
    name: "capture: keeps the two real findings, rejects trivia, the platitude and the duplicate",
    kind: "quality",
    prompt: `The session below is wrapping up. Sweep it for anything worth recording in the project's insights file.

${CAPTURE_TASK}

${fx("session-summary.md")}`,
    grounding: [["Promise.allSettled", "allSettled"]],
    practices: [
      "captures the connection-pool finding — Promise.all over the batch opens one connection per item and deadlocks against CI's pool cap of 20, which is why it never reproduced locally — as an entry anchored on `src/indexing/pipeline.ts` and the runFullIndex symbol",
      "captures the reverted retry-with-backoff attempt as a dead end worth recording, rather than dropping it because it did not end in a fix",
      "does NOT append a new entry for the drizzle `.returning()` behaviour — it is already recorded in the file under Gotchas, and append-only does not mean writing a duplicate",
      "rejects the rename, the prettier reformat, the pino version bump and the README link as trivia not worth capturing",
      "rejects 'async code is generally tricky in this codebase' as a platitude — too generic to be actionable",
    ],
    threshold: 0.7,
    maxTurns: 4,
  },
  {
    name: "capture: entries follow the dated one-bullet format with a stable locator",
    kind: "quality",
    prompt: `The session below is wrapping up. Sweep it for anything worth recording in the project's insights file, and show the exact lines you would append.

${CAPTURE_TASK}

${fx("session-summary.md")}`,
    grounding: [["2026-", "[20"]],
    practices: [
      "writes each entry as a single bullet beginning with a bracketed ISO date, in the shape `- [YYYY-MM-DD] <gist>; \\`path\\` (symbol)`",
      "anchors evidence on a stable locator — a file path plus a symbol or function name — rather than on a line number",
      "keeps each entry to at most two sentences, and phrases it so it is actionable to someone who was not in this session",
      "places each entry under a section header that matches its category rather than appending to the end of the file, and does not rewrite or delete the entries already in the file",
    ],
    threshold: 0.7,
    maxTurns: 4,
  },
  {
    name: "restraint: writes nothing after a routine session",
    kind: "quality",
    prompt: `The session below is wrapping up. Sweep it for anything worth recording in the project's insights file.

${CAPTURE_TASK}

${fx("routine-session.md")}`,
    practices: [
      "records nothing — it concludes that this session produced no insight worth capturing, and says so plainly instead of manufacturing an entry",
      "does not stretch any of the items (the zod bump, the prop rename, the typo fix, the gitignore line, the prettier run) into an insight",
      "frames writing nothing as the correct outcome for a routine session rather than as a failure or an omission",
    ],
    threshold: 1.0,
    maxTurns: 4,
  },
];
