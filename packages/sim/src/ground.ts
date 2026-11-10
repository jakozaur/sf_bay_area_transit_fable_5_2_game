/** Ground classes from voxel materials (round 2): how the sim reads the geology of the world it is handed. */
import { Material } from '@bayvox/core';
import type { Geology } from './types.ts';

/**
 * Material id at a world position in metres. Injected by the app (WorldPort.voxelAt over the loaded site);
 * the sim itself never reads voxels. Must be a pure function of the world: a driven heading samples it.
 */
export type GroundQuery = (x: number, y: number, z: number) => number;

const BY_MATERIAL: Partial<Record<number, Geology>> = {
  // Fill and Bay Mud are the saturated, soft ground of the Bay margin (doc 02 section 5).
  [Material.FILL]: 'bayMud',
  [Material.BAY_MUD]: 'bayMud',
  [Material.SAND]: 'softGround',
  [Material.ALLUVIUM]: 'softGround',
  [Material.STIFF_CLAY]: 'softGround',
  [Material.ROCK]: 'rock',
  // Surface classes: the soil under them.
  [Material.ROAD]: 'softGround',
  [Material.GRASS]: 'softGround',
  [Material.BEACH_SAND]: 'softGround',
  [Material.PAVEMENT]: 'softGround',
  // Structures in the face: foundations, old linings, ballast.
  [Material.CONCRETE_LINING]: 'mixedFace',
  [Material.TRACK_BALLAST]: 'mixedFace',
  [Material.BUILDING_RESIDENTIAL]: 'mixedFace',
  [Material.BUILDING_COMMERCIAL]: 'mixedFace',
  [Material.BUILDING_INDUSTRIAL]: 'mixedFace',
  [Material.BUILDING_CIVIC]: 'mixedFace',
  [Material.BUILDING_TOWER]: 'mixedFace',
  [Material.BUILDING_TRANSIT]: 'mixedFace',
};

/** Ground class of a core material id, for sampling the geology of a waypoint from the voxel world. Throws for AIR and WATER. */
export function geologyOfMaterial(material: number): Geology {
  const g = BY_MATERIAL[material];
  if (g === undefined) {
    if (material === Material.AIR || material === Material.WATER)
      throw new Error(`sim geologyOfMaterial: material ${material} (${material === Material.AIR ? 'AIR' : 'WATER'}) is not ground`);
    throw new Error(`sim geologyOfMaterial: unknown material id ${material}`);
  }
  return g;
}

/**
 * Ground class of a tunnel face of radius `radiusM` centred on (x, y, z): crown, axis and invert are sampled.
 * Rock together with soil is a mixed face. Null when all three samples are air or water (the face stands in a
 * box or a pit), so the caller keeps what it had.
 */
export function faceGeology(ground: GroundQuery, x: number, y: number, z: number, radiusM: number): Geology | null {
  const off = radiusM * 0.8;
  let rock = false;
  let soil: Geology | null = null;
  let mixed = false;
  for (const dy of [off, 0, -off]) {
    const m = ground(x, y + dy, z);
    if (m === Material.AIR || m === Material.WATER) continue;
    const g = geologyOfMaterial(m);
    if (g === 'rock') rock = true;
    else if (g === 'mixedFace') mixed = true;
    else if (soil === null || g === 'bayMud') soil = g;
  }
  if (mixed || (rock && soil !== null)) return 'mixedFace';
  if (rock) return 'rock';
  return soil;
}
