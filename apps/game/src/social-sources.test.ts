/** The backlash posts are adaptations of real public comments: every template names the item it adapts, and the item exists. */
import { readFileSync } from 'node:fs';
import { SOCIAL_TEMPLATE_SOURCES, SOCIAL_TEMPLATES } from '@bayvox/sim';
import { describe, expect, test } from 'vitest';

const DOC = new URL('../../../docs/research/12-opposition-comments.md', import.meta.url);
/** Items the record keeps and the game must not adapt: comments aimed at vulnerable people (see the doc's caveats). */
const NOT_USED = ['H6', 'H12', 'H15', 'H16', 'H17', 'H42', 'H43', 'H46', 'A8'];

describe('backlash sources', () => {
  const doc = readFileSync(DOC, 'utf8');
  const ids = new Set([...doc.matchAll(/^([HRA]\d+)\. /gm)].map((m) => m[1]));

  test('the research file lists the housing items, the rail items and the patterns', () => {
    for (let i = 1; i <= 74; i++) expect(ids.has(`H${i}`), `H${i}`).toBe(true);
    for (let i = 1; i <= 42; i++) expect(ids.has(`R${i}`), `R${i}`).toBe(true);
    for (let i = 1; i <= 15; i++) expect(ids.has(`A${i}`), `A${i}`).toBe(true);
    expect(doc.includes(String.fromCharCode(0x2014))).toBe(false);
  });

  test('every template carries a source id that exists in the research file, and none from the items left out', () => {
    expect(Object.keys(SOCIAL_TEMPLATE_SOURCES)).toEqual(Object.keys(SOCIAL_TEMPLATES));
    for (const [group, sources] of Object.entries(SOCIAL_TEMPLATE_SOURCES)) {
      expect(sources.length, group).toBe(SOCIAL_TEMPLATES[group].length);
      sources.forEach((id, i) => {
        expect(ids.has(id), `${group}[${i}]: "${id}" is not an item of docs/research/12-opposition-comments.md`).toBe(true);
        expect(NOT_USED, `${group}[${i}]`).not.toContain(id);
      });
    }
    // Housing draws on the housing record, the railway groups on the rail record.
    for (const id of SOCIAL_TEMPLATE_SOURCES.housing) expect(id, id).toMatch(/^H\d+$/);
    for (const group of ['design', 'tunnelling', 'smallBore', 'eventSettle', 'eventFunding'])
      for (const id of SOCIAL_TEMPLATE_SOURCES[group]) expect(id, `${group}: ${id}`).toMatch(/^[HR]\d+$/);
    expect(SOCIAL_TEMPLATE_SOURCES.tunnelling.every((id) => id.startsWith('R'))).toBe(true);
  });
});
