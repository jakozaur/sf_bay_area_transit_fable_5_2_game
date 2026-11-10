import { describe, expect, test } from 'vitest';
import { DESIGN_OPTIONS } from './design.ts';
import { EVENTS } from './events.ts';
import { RECEIPT_LINE_DEFS } from './receipt.ts';
import { REFORMS } from './reforms.ts';
import { playerSource } from './sources.ts';

describe('evidence as the player reads it', () => {
  test('citations of the research docs are dropped and the fact they carry is kept', () => {
    expect(playerSource('doc 07 E4 (SB 131); litigation trigger probability x0.8')).toBe('SB 131; litigation trigger probability x0.8');
    expect(playerSource('doc 07 R1; doc 11 section 1.4 (specustawa: single ZRID decision, 90 days)')).toBe(
      'specustawa: single ZRID decision, 90 days',
    );
    expect(playerSource('doc 07 section 6 (SF bike plan: 4-year injunction) and section 4 (litigation +1 to +4 years)')).toBe(
      'SF bike plan: 4-year injunction; litigation +1 to +4 years',
    );
    expect(playerSource('doc 05 section 3.1 and doc 11 section 6.2 (The Portal: three-track mined tunnel, about 190 m2)')).toBe(
      'The Portal: three-track mined tunnel, about 190 m2',
    );
    expect(playerSource('doc 07 section 4 (4 percent a year). Computed as the remainder, so it carries more')).toBe(
      '4 percent a year. Computed as the remainder, so it carries more',
    );
    expect(playerSource('doc 06 sections 3.3 and 7.5 (30 to 40 percent held (and always spent); GLX carried 25 plus 7 percent)')).toBe(
      '30 to 40 percent held (and always spent); GLX carried 25 plus 7 percent',
    );
    // Nothing to strip: the text comes back as it was.
    expect(playerSource('game rule: metres bored off the plan cost 25 percent more')).toBe(
      'game rule: metres bored off the plan cost 25 percent more',
    );
    // Called twice in a row (the matcher keeps no state between calls).
    expect(playerSource('doc 07 E4 (SB 131)')).toBe('SB 131');
    expect(playerSource('doc 07 E4 (SB 131)')).toBe('SB 131');
  });

  test('every evidence line of the game reads without a citation and still says something', () => {
    const lines: [string, string][] = [
      ...REFORMS.map((r): [string, string] => [`reform ${r.id}`, r.evidence]),
      ...EVENTS.map((e): [string, string] => [`event ${e.id}`, e.evidence]),
      ...DESIGN_OPTIONS.map((o): [string, string] => [`design ${o.id}`, o.evidence]),
      ...Object.entries(RECEIPT_LINE_DEFS).map(([id, d]): [string, string] => [`receipt ${id}`, d.evidence]),
    ];
    // 12 reforms, 7 event cards, 6 design options and 16 receipt lines.
    expect(lines.length).toBeGreaterThanOrEqual(41);
    for (const [who, evidence] of lines) {
      const shown = playerSource(evidence);
      expect(shown, `${who}: ${evidence}`).not.toMatch(/\bdoc \d|\bsections? \d/);
      expect(shown.length, `${who}: "${shown}" from "${evidence}"`).toBeGreaterThan(12);
      expect(shown, who).not.toMatch(/^[;,.)]|\(\)|; ;|\s;/);
    }
  });
});
