import { MATERIALS, Material } from '@bayvox/core';
import { expect, test } from 'vitest';
import { buildPaletteRgba, PALETTE_WIDTH, TRANSLUCENT_ALPHA } from './palette.ts';

test('palette holds every material colour at its id, water translucent, unknown ids magenta', () => {
  const p = buildPaletteRgba();
  expect(p.length).toBe(PALETTE_WIDTH * 4);
  for (const m of MATERIALS) {
    const rgb = ((p[m.id * 4] as number) << 16) | ((p[m.id * 4 + 1] as number) << 8) | (p[m.id * 4 + 2] as number);
    expect(rgb, m.key).toBe(m.color);
    expect(p[m.id * 4 + 3], m.key).toBe(m.opaque || m.id === Material.AIR ? 255 : TRANSLUCENT_ALPHA);
  }
  const unknown = MATERIALS.length;
  expect([...p.subarray(unknown * 4, unknown * 4 + 4)]).toEqual([255, 0, 255, 255]);
  expect([...p.subarray(1023 * 4, 1023 * 4 + 4)]).toEqual([255, 0, 255, 255]);
});
