/**
 * Where the source lives and what the build took. One place, read by the title screen and the Credits sheet; the README
 * section "How it was built" repeats the figures and a test keeps the two in step.
 *
 * Effort and cost come from the transcripts of the Claude Code sessions that built the game (2 sessions and their
 * subagents), read on 2026-11-11. Cost is token usage at Claude Fable 5.2 list API prices: $8 per million input tokens,
 * $40 per million output tokens, $0.20 per million cache-read tokens. Cache writes are priced at 1.25x input (5 minute)
 * and 2x input (1 hour); the 2x multiplier is an assumption.
 *   input 7,040; output 6,855,467; cache read 848,417,406; cache write 24,343,266 (5 min) and 734,839 (1 h).
 *   $0.06 + $274.22 + $169.68 + $243.43 + $11.76 = $699.15
 * Working hours are the sum of gaps under 5 minutes between model replies. Lines are `git ls-files` counts: TypeScript
 * outside tests, then unit and end-to-end tests.
 */
export const GITHUB_URL = 'https://github.com/jakozaur/sf_bay_area_transit_fable_5_2_game';

export const BUILD = {
  asOf: '11 Nov 2026',
  costUsd: 700,
  prompts: 15,
  workingHours: 15,
  modelRequests: 3_500,
  toolCalls: 5_300,
  outputTokensM: 6.9,
  cacheReadTokensM: 848,
  cacheWriteTokensM: 25,
  codeLines: 45_000,
  testLines: 21_000,
  unitTests: 756,
  e2eTests: 54,
} as const;

const n = (v: number): string => v.toLocaleString('en-US');

export const BUILD_COST_LINE = `Built by Claude Fable 5.2 for about $${BUILD.costUsd} at API prices: ${BUILD.prompts} prompts, ${BUILD.workingHours} hours, ${n(BUILD.codeLines + BUILD.testLines)} lines.`;

/** Credits sheet and README, one fact per row. */
export const BUILD_FACTS: readonly (readonly [string, string])[] = [
  ['Author', 'Claude Fable 5.2 in Claude Code, directed by one person'],
  ['Prompts typed', `${BUILD.prompts}, most of them dictated`],
  ['Working time', `about ${BUILD.workingHours} hours over 3 days`],
  ['Model requests', `about ${n(BUILD.modelRequests)}, with ${n(BUILD.toolCalls)} tool calls`],
  ['Code', `${n(BUILD.codeLines)} lines of TypeScript`],
  ['Tests', `${n(BUILD.testLines)} lines: ${BUILD.unitTests} unit tests, ${BUILD.e2eTests} end-to-end tests`],
  [
    'Tokens',
    `${BUILD.outputTokensM} million written, ${BUILD.cacheReadTokensM} million read from cache, ${BUILD.cacheWriteTokensM} million written to cache`,
  ],
  ['Cost', `about $${BUILD.costUsd} at list API prices ($8 in, $40 out, $0.20 cache read per million tokens)`],
];
