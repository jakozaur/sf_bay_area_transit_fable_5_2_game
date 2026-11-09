/**
 * Material ids. Stored as u16 in voxel data; the packed quad format (mesh.ts) carries 10 bits,
 * so ids must stay below 1024. Ids are frozen: append, never renumber (saves and baked data pin them).
 *
 * Geology follows doc 02 section 7.1 (FILL, BAY_MUD, SAND, ALLUVIUM, STIFF_CLAY, ROCK). Note that
 * doc 02 numbers its geology classes 1 to 6; the runtime ids here are different because AIR and
 * WATER come first. The pipeline maps doc 02 classes to these ids by name.
 */
export const Material = {
  AIR: 0,
  WATER: 1,
  /** Artificial fill: 1850s onward rubble and sand (SoMa, Mission Bay). */
  FILL: 2,
  /** Young Bay Mud: soft saturated estuarine clay. */
  BAY_MUD: 3,
  /** Dune sand and Colma Formation (underground stratum). */
  SAND: 4,
  /** Alluvial fans and plains: interbedded clay, sand, gravel. */
  ALLUVIUM: 5,
  /** Old Bay Clay / San Antonio Formation. */
  STIFF_CLAY: 6,
  /** Franciscan Complex and East Bay Hills rock. */
  ROCK: 7,
  CONCRETE_LINING: 8,
  TRACK_BALLAST: 9,
  ROAD: 10,
  /** Parks and other vegetated ground. */
  GRASS: 11,
  /** Beach sand (surface class, distinct from the SAND stratum). */
  BEACH_SAND: 12,
  BUILDING_RESIDENTIAL: 13,
  BUILDING_COMMERCIAL: 14,
  BUILDING_INDUSTRIAL: 15,
  BUILDING_CIVIC: 16,
  /** Glass-clad high-rise. Opaque for meshing. */
  BUILDING_TOWER: 17,
  /** Stations, depots and other transit structures. */
  BUILDING_TRANSIT: 18,
} as const;

export type MaterialId = (typeof Material)[keyof typeof Material];

export interface MaterialDef {
  id: number;
  /** Stable machine name, equal to the key in Material. */
  key: string;
  label: string;
  /** Base colour, 0xRRGGBB sRGB. The renderer may add procedural detail. */
  color: number;
  /** False for AIR and for materials meshed in the transparent pass (WATER). */
  opaque: boolean;
  /** True if a voxel of this material blocks movement and can be dug. False for AIR and WATER. */
  solid: boolean;
}

function def(id: number, key: string, label: string, color: number, opaque = true, solid = true): MaterialDef {
  return { id, key, label, color, opaque, solid };
}

/** Indexed by material id. Dense: MATERIALS[id].id === id. */
export const MATERIALS: readonly MaterialDef[] = [
  def(Material.AIR, 'AIR', 'Air', 0x000000, false, false),
  def(Material.WATER, 'WATER', 'Water', 0x2f6f9f, false, false),
  def(Material.FILL, 'FILL', 'Artificial fill', 0x8a7a66),
  def(Material.BAY_MUD, 'BAY_MUD', 'Bay Mud', 0x55594c),
  def(Material.SAND, 'SAND', 'Sand (Colma / dune)', 0xc9b27c),
  def(Material.ALLUVIUM, 'ALLUVIUM', 'Alluvium', 0xa58b5f),
  def(Material.STIFF_CLAY, 'STIFF_CLAY', 'Stiff clay (Old Bay Clay)', 0x7d6a58),
  def(Material.ROCK, 'ROCK', 'Franciscan rock', 0x6b6f76),
  def(Material.CONCRETE_LINING, 'CONCRETE_LINING', 'Concrete lining', 0xb9b9b4),
  def(Material.TRACK_BALLAST, 'TRACK_BALLAST', 'Track ballast', 0x4a4540),
  def(Material.ROAD, 'ROAD', 'Road', 0x3c3f44),
  def(Material.GRASS, 'GRASS', 'Grass / park', 0x6f9a4b),
  def(Material.BEACH_SAND, 'BEACH_SAND', 'Beach sand', 0xe2d3a0),
  def(Material.BUILDING_RESIDENTIAL, 'BUILDING_RESIDENTIAL', 'Building: residential', 0xd8c7a8),
  def(Material.BUILDING_COMMERCIAL, 'BUILDING_COMMERCIAL', 'Building: commercial', 0xa9b4c0),
  def(Material.BUILDING_INDUSTRIAL, 'BUILDING_INDUSTRIAL', 'Building: industrial', 0x9a8f86),
  def(Material.BUILDING_CIVIC, 'BUILDING_CIVIC', 'Building: civic', 0xcdbfa6),
  def(Material.BUILDING_TOWER, 'BUILDING_TOWER', 'Building: tower', 0x7fa3bd),
  def(Material.BUILDING_TRANSIT, 'BUILDING_TRANSIT', 'Building: transit', 0xe8e4da),
];

export const MATERIAL_COUNT = MATERIALS.length;
/** Exclusive upper bound on material ids imposed by the 10-bit field in the packed quad. */
export const MATERIAL_ID_LIMIT = 1024;

/** 1 if the material id is opaque, else 0. Indexed by id; ids at or above MATERIAL_COUNT read as undefined. */
export const MATERIAL_OPAQUE: Uint8Array = Uint8Array.from(MATERIALS, (m) => (m.opaque ? 1 : 0));

export function materialDef(id: number): MaterialDef {
  const m = MATERIALS[id];
  if (m === undefined) throw new RangeError(`materialDef: unknown material id ${id}`);
  return m;
}

export function isOpaque(id: number): boolean {
  return materialDef(id).opaque;
}

export function isSolid(id: number): boolean {
  return materialDef(id).solid;
}
