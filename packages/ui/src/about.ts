/**
 * Where the source lives and what the build cost. One place, read by the title screen and the Credits sheet.
 *
 * The cost is the token usage of the Claude Code sessions that built the game (main session plus subagents), summed from
 * their transcripts on 2026-11-10 and priced at Claude Fable 5.2 list API prices: $8 per million input tokens, $40 per
 * million output tokens, $0.20 per million cache-read tokens. Cache writes are priced at 1.25x input (5 minute) and 2x
 * input (1 hour); the 2x multiplier is an assumption.
 *   input 6,864; output 6,783,405; cache read 837,539,867; cache write 24,140,453 (5 min) and 571,108 (1 h).
 *   $0.05 + $271.34 + $167.51 + $241.40 + $9.14 = $689.44
 */
export const GITHUB_URL = 'https://github.com/jakozaur/sf_bay_area_transit_fable_5_2_game';
export const BUILD_COST_USD = 690;
export const BUILD_COST_LINE = `Built by Claude Fable 5.2 for about $${BUILD_COST_USD} at API prices.`;
export const BUILD_COST_DETAIL =
  'Written by Claude Fable 5.2 in Claude Code. Token usage as of 10 Nov 2026: 6.8 million output tokens, 838 million cached input tokens read, 25 million written to cache. At list API prices ($8 in, $40 out, $0.20 cache read per million tokens) that is about $690.';
