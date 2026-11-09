/** Material palette as texture data: one RGBA texel per material id (doc 03 section 5.3). */
import { MATERIAL_ID_LIMIT, MATERIALS, Material } from '@bayvox/core';

/** Texture width: every id the 10-bit quad field can carry. */
export const PALETTE_WIDTH = MATERIAL_ID_LIMIT;
/** Colour of ids with no MaterialDef: loud magenta, so a bad id is visible instead of silently black. */
export const UNKNOWN_MATERIAL_RGB = 0xff00ff;
/** Alpha of non-opaque materials (water). */
export const TRANSLUCENT_ALPHA = 184;

/** PALETTE_WIDTH x 1 RGBA8, sRGB bytes straight from MaterialDef.color. */
export function buildPaletteRgba(): Uint8Array {
  const out = new Uint8Array(PALETTE_WIDTH * 4);
  for (let id = 0; id < PALETTE_WIDTH; id++) {
    const m = MATERIALS[id];
    const rgb = m === undefined ? UNKNOWN_MATERIAL_RGB : m.color;
    out[id * 4] = (rgb >> 16) & 255;
    out[id * 4 + 1] = (rgb >> 8) & 255;
    out[id * 4 + 2] = rgb & 255;
    // AIR is never drawn; only real translucent materials get the reduced alpha.
    out[id * 4 + 3] = m === undefined || m.opaque || id === Material.AIR ? 255 : TRANSLUCENT_ALPHA;
  }
  return out;
}
