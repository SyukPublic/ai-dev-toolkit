/**
 * LLM Message Pattern judge, on the subscription. Binary PASS/FAIL per practice, PASS only with
 * a verbatim evidence quote. The judge defaults to a stronger family than the task to soften
 * single-model self-preference; the structural mitigations (blind + binary + verbatim) do the
 * rest, since on a shared subscription the families overlap.
 */

import { EVAL_JUDGE_MODEL } from "../config.js";
import { runContent } from "../runtime/dispatch.js";

const JUDGE_RUBRIC =
  "You are a strict, blind evaluator. Given an OUTPUT and a list of PRACTICES, judge each " +
  "practice independently.\n" +
  "Rules: (1) exactly PASS or FAIL per practice, no scales. (2) PASS only when a direct " +
  "verbatim quote from the OUTPUT is evidence the practice was met — a keyword is not " +
  "evidence. (3) Reply with ONLY minified JSON:\n" +
  '{"results":[{"practice":"<text>","passed":true,"evidence":"<verbatim quote>"}]}';

export interface Verdict {
  results: { practice: string; passed: boolean; evidence: string }[];
  passed: number;
  total: number;
  score: number;
}

interface JudgeRow {
  practice?: unknown;
  passed?: unknown;
  evidence?: unknown;
}

function parseVerdict(text: string): JudgeRow[] {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) throw new Error(`judge returned no JSON: ${text.slice(0, 200)}`);
  const obj = JSON.parse(text.slice(start, end + 1));
  if (!Array.isArray(obj.results)) throw new Error("judge JSON missing results[]");
  return obj.results;
}

/**
 * Bind each judge row to the practice it actually judged, and return the CALLER's practice string
 * rather than the judge's echo of it.
 *
 * The rubric asks the judge to echo the practice text back, but the PRACTICES block is numbered,
 * and the judge sometimes echoes the number instead ("1", "2", …). Records key per-practice stats
 * on this string, so a numeric echo silently forks one practice into two separate rows across
 * runs — `eval:repeat` then reports n/2 twice instead of n once, understating the sample without
 * any visible error (observed in run 20260802T194843).
 *
 * Binding order per row: exact practice text, then the 1-based list number, then the first still
 * unfilled slot in order. A practice the judge never returned counts as FAIL — silently dropping
 * it would divide by a smaller total and inflate the score.
 */
export function bindPractices(rows: JudgeRow[], practices: string[]): Verdict["results"] {
  const indexByText = new Map(practices.map((p, i) => [p.trim(), i]));
  const bound: (JudgeRow | undefined)[] = practices.map(() => undefined);
  const unbound: JudgeRow[] = [];

  for (const row of rows) {
    const echo = String(row.practice ?? "").trim();
    let idx = indexByText.get(echo);
    if (idx === undefined) {
      const asNumber = /^(\d+)[.)]?$/.exec(echo);
      if (asNumber) {
        const i = Number(asNumber[1]) - 1;
        if (i >= 0 && i < practices.length) idx = i;
      }
    }
    if (idx === undefined || bound[idx] !== undefined) unbound.push(row);
    else bound[idx] = row;
  }

  for (let i = 0, u = 0; i < bound.length && u < unbound.length; i++) {
    if (bound[i] === undefined) bound[i] = unbound[u++];
  }

  return practices.map((practice, i) => ({
    practice,
    passed: bound[i]?.passed === true,
    evidence: String(bound[i]?.evidence ?? ""),
  }));
}

/** Judge an output against a list of practices. Model defaults to the stronger judge family. */
export async function llmJudge(output: string, practices: string[], model = EVAL_JUDGE_MODEL): Promise<Verdict> {
  const listed = practices.map((p, i) => `${i + 1}. ${p}`).join("\n");
  const prompt = `${JUDGE_RUBRIC}\n\n## PRACTICES\n${listed}\n\n## OUTPUT\n${output}\n\nReturn the JSON now.`;
  // maxTurns 3, not 1: with no tools the judge normally answers in ONE turn, but the SDK
  // occasionally burns the first turn (empty/continuation output), and a cap of 1 then dies as
  // "Reached maximum number of turns (1)" — a transient that has hit twice in a single full run
  // (see evals/INSIGHTS.md 2026-07-09/11). Extra turns only ever run in exactly those cases, and
  // an in-session continuation is cheaper than an external retry (the prompt embeds the whole
  // OUTPUT under judgement). allowedTools stays [] so added turns cannot do anything but write.
  const res = await runContent(prompt, { allowedTools: [], maxTurns: 3, model });
  const results = bindPractices(parseVerdict(res.text), practices);
  const total = results.length || 1;
  const passed = results.filter((r) => r.passed).length;
  return { results, passed, total, score: passed / total };
}
