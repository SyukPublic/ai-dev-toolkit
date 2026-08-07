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
      // DIAGNOSED AND FIXED 2026-08-07 — read this before reacting to a red on this case.
      // The full run at 4127191 turned this case red for the first time (2/4), and it was NOT a
      // regression. Lifetime practice rates across all 8 rows of the PRE-FIX wording:
      //
      //     8/8  single bullet beginning with a bracketed ISO date
      //     8/8  anchors evidence on a stable locator
      //     4/8  "at most two sentences, AND phrases it so it is actionable"   <-- soft
      //     6/8  "under a matching section header, AND does not rewrite/delete" <-- soft
      //
      // The case read 7/7 only because 4 practices at threshold 0.7 absorb ONE miss (3/4 = 0.75).
      // Every earlier "pass" recorded p=3/4 in four of seven rows — always one of these two. This
      // run both missed, which is a ~12% event given their rates, and the case crossed. So the 7/7
      // was never robust: a 50% practice sat inside a case that read 100%. Sixth instance in this
      // repo of the case rate hiding a sub-threshold practice.
      //
      // Both are COMPOUND, which is the likely cause rather than the model:
      //  - The 4/8 joins a length limit to an actionability requirement. The length half is also
      //    unquotable (the judge needs verbatim evidence and "at most two sentences" is an absence
      //    — both failures this run carry EMPTY evidence), and it is redundant with the first
      //    practice, which already pins the shape to a single bullet.
      //  - The 6/8 joins placement to non-destructiveness, and the second half is again an absence.
      //
      // THE FIX, and one thing it deliberately does NOT do. The length clause is gone: it graded
      // brevity, it is unquotable, and the first practice already pins each entry to a single bullet,
      // so it was redundant as well as soft. The other compound is split — but NOT into "does not
      // rewrite or delete the entries already in the file", which would be a negative practice about
      // an ABSENCE and therefore soft for exactly the reason the compound was. The prompt asks for
      // "the exact lines you would append", so the same requirement has a positive, quotable form:
      // the SHAPE of the answer is append-only. That is what the fifth practice below asserts.
      //
      // Threshold stays 0.7: five practices need 4/5, so one miss is still absorbed. Raising it would
      // re-hide whatever stays soft, which is how this case got here.
      //
      // PREDICTION, recorded before the re-measure: the actionability practice should reach ≥4/5 now
      // that it is not carrying a length limit, and both split practices ≥4/5. If the append-only
      // practice stays soft against answers that plainly show only new bullets, the positive
      // reformulation failed and the honest move is to REMOVE it rather than word it a third time.
      // If the actionability practice stays at ~50% on its own, the miss is the SKILL's — SKILL.md
      // would then owe a statement about what makes an entry actionable — and that is a finding.
      //
      // OUTCOME — `ei-capture-split`, haiku, n=5, all 5 rows. Case 5/5. Both rewrites moved
      // decisively and the positive reformulation worked, so no skill finding:
      //
      //     4/8 → 5/5   actionability (length clause dropped)
      //     6/8 → 5/5   placement (split out)
      //       — → 5/5   append-only, the positive form of the absence it replaced
      //     8/8 → 4/5   the FORMAT practice, which had never missed before
      //
      // That last line is why this is not a clean win, and the honest reading is that **the length
      // requirement did not disappear, it migrated.** The one failure's cited evidence CONFORMS to
      // the stated shape — a single bullet, opening `- [2026-08-07]`, closing
      // "; `src/indexing/pipeline.ts` (runFullIndex)" — and the only thing unusual about it is a
      // two-sentence gist. So the judge appears to read `<gist>` as something short, which is the
      // strictness the removed clause used to carry explicitly.
      //
      // Left as written: one instance in five, and the planner's recorded judge-misread precedent
      // says changing a practice on n=1 is how the earlier churn started. Pooled with its pre-split
      // history the wording sits at 12/13. THE OBSERVABLE TO WATCH: if this practice trends below
      // ~80% over the next series, it earns the same treatment as the clause removed above — drop
      // the shape-by-example from the practice and let the grounding slot carry the date format.
      "phrases each entry so it is actionable to someone who was not in this session — it names what to do or what to watch for, not merely that something happened",
      "places each entry under the section header matching its category rather than appending everything to the end of the file",
      "shows only the new lines to be appended, rather than reproducing or rewriting the entries already in the file",
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
