/**
 * Where the source lives and what the build cost. One place, read by the title screen and the Credits sheet.
 *
 * The cost is the token usage of the Claude Code sessions that built the game (main session plus subagents), summed from
 * their transcripts on 2026-11-10 and priced at Claude Fable 5.2 list API prices: $8 per million input tokens, $40 per
 * million output tokens, $0.20 per million cache-read tokens. Cache writes are priced at 1.25x input (5 minute) and 2x
 * input (1 hour); the 2x multiplier is an assumption.
 *   input 6,760; output 6,673,037; cache read 826,131,750; cache write 23,917,433 (5 min) and 487,248 (1 h).
 *   $0.05 + $266.92 + $165.23 + $239.17 + $7.80 = $679.17
 */
export const GITHUB_URL = 'https://github.com/jakozaur/sf_bay_area_transit_fable_5_2_game';
export const BUILD_COST_USD = 680;
export const BUILD_COST_LINE = `Built by Claude Fable 5.2 for about $${BUILD_COST_USD} at API prices.`;
export const BUILD_COST_DETAIL =
  'Written by Claude Fable 5.2 in Claude Code. Token usage as of 10 Nov 2026: 6.7 million output tokens, 826 million cached input tokens read, 24 million written to cache. At list API prices ($8 in, $40 out, $0.20 cache read per million tokens) that is about $680.';
