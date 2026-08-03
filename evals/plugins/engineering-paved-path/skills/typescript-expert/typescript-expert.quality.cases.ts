import type { SkillCase } from "../../../../src/index.js";
import { fixtureReader } from "../../../../src/index.js";

const fx = fixtureReader(import.meta.url);

// Behavioural cases for the largest skill in the catalog (439 lines), which until now had
// activation coverage only. Content tier: SKILL.md plus its references/ directory is injected and
// the session has NO tools, so every prompt carries its own code.
//
// These target guidance DISTINCTIVE to this skill rather than general TypeScript competence a bare
// model already has, and each case pairs the positive with something the skill says NOT to do — so
// an answer that keyword-matches without the skill's judgement fails the discriminating practice:
//
//   * branded types, `satisfies` over a widening annotation, `as const` + typeof[number]
//     ... vs. leaving the `as number` cast that the annotation made necessary
//   * the TS2589 fix priority — cap recursion, interface extends over intersection, split large
//     unions ... vs. `skipLibCheck`, which the skill scopes to library checking and warns can mask
//     real app typing issues (and which cannot affect an error raised by this project's own source)
//   * `paths` is compile-time only ... vs. any tsconfig-only change presented as the runtime fix
//
// Activation coverage for this skill lives in typescript-expert.cases.ts; both are registered from
// typescript-expert.eval.ts.

const REVIEW_TASK = `The code is provided inline — treat it as already read and answer directly in your reply (do not ask for tool access or more files). Give concrete before/after TypeScript, not general advice.`;

export const qualityCases: SkillCase[] = [
  {
    name: "type-level review: brands the domain primitives, keeps literals with satisfies and as const",
    kind: "quality",
    prompt: `Review the typing in this billing package. Two bugs already slipped through code review: a caller swapped two id arguments and it still compiled, and a typo'd route string reached production. Tighten the types so the compiler catches both.

${REVIEW_TASK}

\`\`\`ts
${fx("domain-types.ts")}
\`\`\``,
    // An answer that never reaches for nominal typing is not worth judging.
    grounding: [["brand", "Brand", "nominal"]],
    practices: [
      "replaces the bare `type UserId = string` / `type OrderId = string` aliases with branded (nominal) types — an intersection with a unique marker property, e.g. `type Brand<K, T> = K & { __brand: T }` — so that passing a UserId where an OrderId is expected becomes a compile error",
      "explains that the swapped-argument call in handleRefund compiles today precisely because both aliases erase to `string`, and would fail to compile once the ids are branded",
      "replaces the `: Record<string, string | number>` annotation on appConfig with a `satisfies Record<string, string | number>` clause, and states that this keeps the literal/narrow property types (so `appConfig.timeout` is a number) while still enforcing the constraint",
      "types the routes with `as const` and derives the union with an indexed access such as `typeof routes[number]`, so that a typo'd path like '/hoem' is rejected at the call site",
      "notes that the `as number` cast in readTimeout stops being necessary once appConfig keeps its inferred literal types — the cast was compensating for the widening annotation",
    ],
    threshold: 0.7,
    maxTurns: 4,
  },
  {
    name: "TS2589: caps the recursion and splits the union without reaching for skipLibCheck",
    kind: "quality",
    // Keep the skipLibCheck sentence ADJACENT to the question. It was once split off behind an
    // added "go through the whole file, list every contributor" paragraph, on the theory that the
    // practices were asking for more than the prompt did. Measured: the score went DOWN, 3/5 to
    // 2/5, and the newly-failing practice was the skipLibCheck rebuttal itself — the redirection
    // pulled the model into enumerating constructs and it dropped the refusal. Reverted.
    prompt: `Our build fails with "error TS2589: Type instantiation is excessively deep and possibly infinite" on the file below. A teammate suggests turning on \`skipLibCheck\` to make it go away. What is actually wrong and how should we fix it?

${REVIEW_TASK}

\`\`\`ts
${fx("deep-types.ts")}
\`\`\``,
    // NOT the literal "TS2589": the code is in the PROMPT, and a good answer explains the failure
    // in words ("exceeds the instantiation depth limit") without echoing the number back. Gating
    // on the echo failed a correct answer outright, before the judge ever saw it.
    grounding: [["TS2589", "excessively deep", "instantiation", "recursi", "depth"]],
    practices: [
      // Do NOT demand that this be called "the primary cause", and do NOT demand one particular
      // remedy shape. Measured: claude-sonnet-5 fails such a wording while giving the BETTER
      // answer — it presents the recursion, the intersection, and the 240-key mapped type as
      // three compounding causes and fixes the intersection rather than adding a depth counter.
      // claude-haiku-4-5 passes it and misses the other two. Two competent answers satisfying
      // different subsets of a remedy menu is a defect in the practice, not in either model.
      "identifies the self-referential type `Nested<T> = T | Nested<T>[]` as one of the causes of the blow-up, and proposes a concrete restructuring of it — a depth-limited variant, a non-recursive reformulation, or any other change that stops the unbounded re-expansion",
      "recommends replacing the chained intersection in `WithMeta<T>` with an interface using `extends` (or otherwise flattening the intersection), because intersections are markedly more expensive for the checker than interface inheritance",
      "flags the 240-member `FieldName` union as a contributing cost and recommends splitting it or generating it differently, consistent with the guidance to break up very large unions",
      "rejects `skipLibCheck` as the fix and explains why: it only skips type checking of declaration files, so it cannot affect an error raised by this project's own source, and it risks masking real typing problems",
      "keeps the recommendations concrete — shows the rewritten type(s) rather than only naming the strategies",
    ],
    threshold: 0.7,
    maxTurns: 4,
  },
  {
    name: "path mapping: names it a compile-time-only feature and gives a runtime resolver",
    kind: "quality",
    prompt: `Our tsconfig has \`baseUrl: "./src"\` and \`paths: { "@app/*": ["*"] }\`. \`tsc --noEmit\` passes cleanly and the editor resolves everything, but running the compiled output with \`node dist/index.js\` throws \`Error: Cannot find module '@app/services/orders'\`. We have already tried changing \`moduleResolution\` and rebuilding from scratch. What is going on and how do we fix it?

Answer directly and concretely.`,
    grounding: [["compile-time", "compile time", "compileTime"]],
    practices: [
      "states the root cause plainly: TypeScript `paths` are a compile-time resolution feature only — tsc does not rewrite the import specifiers it emits, so Node's runtime resolver never learns about the alias",
      "explains why the attempted fixes cannot work — changing `moduleResolution` and rebuilding affect only how tsc resolves, not what Node resolves at runtime",
      "gives at least one concrete runtime remedy: registering a path resolver at runtime (e.g. `tsconfig-paths/register`), a bundler or build step that rewrites the specifiers to real relative paths, or dropping the aliases in favour of package/workspace entry points",
      "does not present a tsconfig-only change (baseUrl, paths, moduleResolution, or module) as sufficient on its own to make the runtime error go away",
    ],
    threshold: 0.7,
    maxTurns: 4,
  },
];
