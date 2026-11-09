import { describe, expect, test } from 'vitest';
import { isOpaque, isSolid, MATERIAL_COUNT, MATERIAL_ID_LIMIT, MATERIAL_OPAQUE, MATERIALS, Material, materialDef } from './materials.ts';
import { AO_NONE, FACE_NEG_Z, FACE_NORMALS, packQuadWord0, packQuadWord1, unpackQuad } from './mesh.ts';

describe('packed quad', () => {
  test('round-trips field extremes', () => {
    const quads = new Uint32Array([
      packQuadWord0(31, 31, 31, 32, 32, FACE_NEG_Z),
      packQuadWord1(1023, AO_NONE, 0x3fff),
      packQuadWord0(0, 0, 0, 1, 1, 0),
      packQuadWord1(0, 0),
      packQuadWord0(5, 17, 30, 7, 2, 2),
      packQuadWord1(Material.ROCK, 0b10_01_00_11),
    ]);
    expect(unpackQuad(quads, 0)).toEqual({ x: 31, y: 31, z: 31, w: 32, h: 32, face: 5, material: 1023, ao: 255, flags: 0x3fff });
    expect(unpackQuad(quads, 1)).toEqual({ x: 0, y: 0, z: 0, w: 1, h: 1, face: 0, material: 0, ao: 0, flags: 0 });
    expect(unpackQuad(quads, 2)).toEqual({ x: 5, y: 17, z: 30, w: 7, h: 2, face: 2, material: 7, ao: 0b10010011, flags: 0 });
    expect(() => unpackQuad(quads, 3)).toThrow('quad index 3');
  });

  test('documented bit positions', () => {
    expect(packQuadWord0(1, 0, 0, 1, 1, 0)).toBe(1);
    expect(packQuadWord0(0, 1, 0, 1, 1, 0)).toBe(1 << 6);
    expect(packQuadWord0(0, 0, 1, 1, 1, 0)).toBe(1 << 12);
    expect(packQuadWord0(0, 0, 0, 2, 1, 0)).toBe(1 << 18);
    expect(packQuadWord0(0, 0, 0, 1, 2, 0)).toBe(1 << 23);
    expect(packQuadWord0(0, 0, 0, 1, 1, 1)).toBe(1 << 28);
    expect(packQuadWord1(1, 0)).toBe(1);
    expect(packQuadWord1(0, 1)).toBe(1 << 10);
    expect(packQuadWord1(0, 0, 1)).toBe(1 << 18);
  });

  test('face normals are unit axes, positive faces even', () => {
    FACE_NORMALS.forEach((n, face) => {
      const axis = face >> 1;
      expect(n[axis]).toBe(face % 2 === 0 ? 1 : -1);
      expect(Math.abs(n[0]) + Math.abs(n[1]) + Math.abs(n[2])).toBe(1);
    });
  });
});

describe('materials', () => {
  test('table is dense, keys match, ids fit the quad field', () => {
    expect(MATERIAL_COUNT).toBe(Object.keys(Material).length);
    expect(MATERIAL_COUNT).toBeLessThanOrEqual(MATERIAL_ID_LIMIT);
    MATERIALS.forEach((m, i) => {
      expect(m.id).toBe(i);
      expect(Material[m.key as keyof typeof Material]).toBe(i);
      expect(MATERIAL_OPAQUE[i]).toBe(m.opaque ? 1 : 0);
      expect(m.color).toBeGreaterThanOrEqual(0);
      expect(m.color).toBeLessThanOrEqual(0xffffff);
    });
  });

  test('frozen ids', () => {
    expect([Material.AIR, Material.WATER, Material.FILL, Material.BAY_MUD, Material.SAND, Material.ROCK]).toEqual([0, 1, 2, 3, 4, 7]);
    expect([Material.CONCRETE_LINING, Material.TRACK_BALLAST, Material.ROAD, Material.GRASS, Material.BEACH_SAND]).toEqual([
      8, 9, 10, 11, 12,
    ]);
  });

  test('opacity and solidity', () => {
    expect(isOpaque(Material.AIR)).toBe(false);
    expect(isOpaque(Material.WATER)).toBe(false);
    expect(isSolid(Material.WATER)).toBe(false);
    expect(isOpaque(Material.BUILDING_TOWER)).toBe(true);
    expect(isSolid(Material.BAY_MUD)).toBe(true);
    expect(() => materialDef(999)).toThrow('999');
  });
});
