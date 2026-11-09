/**
 * Region loader, part 1: fetches and decodes the world data named by the manifest (core manifest.ts) into
 * plain feature lists and rasters. No DOM: the caller injects how bytes are fetched, so the same code runs
 * in the app (fetch), in Node tests (readFile) and in workers.
 */
import {
  type AssetRef,
  CHUNK_SIZE,
  decodeFarVectors,
  decodeRailNetwork,
  decodeSiteVectorTile,
  decodeTerrainRaster,
  type FarVectors,
  GRID_ORIGIN_EASTING,
  GRID_ORIGIN_NORTHING,
  GRID_TILES_X,
  GRID_TILES_Y,
  Material,
  type RailNetwork,
  SEA_LEVEL_M,
  SITE_TILE_SIZE_M,
  type SiteAsset,
  type SiteBuilding,
  type TerrainRaster,
  TILE_SIZE_M,
  VOXEL_SIZE_M,
  WORLD_FORMAT_VERSION,
  type WorldManifest,
} from '@bayvox/core';
import { strFromU8, unzlibSync } from 'fflate';

/** Returns the bytes of a data file. `path` is relative to data/ (a manifest `file` value, or `manifest.json`). */
export type FetchBytes = (path: string) => Promise<Uint8Array>;

/** Fetches and validates data/manifest.json. Throws if it was built for another frame, voxel size or layout version. */
export async function loadManifest(fetchBytes: FetchBytes): Promise<WorldManifest> {
  const bytes = await fetchBytes('manifest.json');
  let m: WorldManifest;
  try {
    m = JSON.parse(strFromU8(bytes)) as WorldManifest;
  } catch (err) {
    throw new Error(`loadManifest: manifest.json is not JSON (${(err as Error).message}); run pnpm data:build`);
  }
  if (m.format !== 'bayvox-world' || m.formatVersion !== WORLD_FORMAT_VERSION) {
    throw new Error(`loadManifest: manifest is ${m.format} v${m.formatVersion}, this build reads bayvox-world v${WORLD_FORMAT_VERSION}`);
  }
  const f = m.frame;
  if (
    f.originEasting !== GRID_ORIGIN_EASTING ||
    f.originNorthing !== GRID_ORIGIN_NORTHING ||
    f.tileSizeM !== TILE_SIZE_M ||
    f.tilesX !== GRID_TILES_X ||
    f.tilesY !== GRID_TILES_Y ||
    f.seaLevelM !== SEA_LEVEL_M
  ) {
    throw new Error(`loadManifest: data was built for frame ${JSON.stringify(f)}, which differs from this build's world frame`);
  }
  if (m.voxelSizeM !== VOXEL_SIZE_M || m.chunkSize !== CHUNK_SIZE) {
    throw new Error(
      `loadManifest: data is for ${m.voxelSizeM} m voxels in ${m.chunkSize}^3 chunks, this build uses ${VOXEL_SIZE_M} m and ${CHUNK_SIZE}`,
    );
  }
  return m;
}

/** Fetches one manifest asset and checks its size against the manifest (the sha256 is not recomputed here). */
async function fetchAsset(ref: AssetRef, fetchBytes: FetchBytes): Promise<Uint8Array> {
  const bytes = await fetchBytes(ref.file);
  if (bytes.length !== ref.bytes) {
    throw new Error(`world data: ${ref.file} is ${bytes.length} bytes, the manifest says ${ref.bytes}; the data directory is stale`);
  }
  return bytes;
}

function inflate(file: string, zlib: Uint8Array, rawBytes?: number): Uint8Array {
  try {
    return rawBytes === undefined ? unzlibSync(zlib) : unzlibSync(zlib, { out: new Uint8Array(rawBytes) });
  } catch (err) {
    throw new Error(`world data: ${file} does not inflate: ${String((err as Error).message ?? err)}`);
  }
}

function terrain(file: string, bytes: Uint8Array): TerrainRaster {
  return decodeTerrainRaster(bytes, (zlib, rawBytes) => inflate(file, zlib, rawBytes));
}

/** The whole-grid 64 m raster. */
export async function loadFarRaster(manifest: WorldManifest, fetchBytes: FetchBytes): Promise<TerrainRaster> {
  const r = terrain(manifest.far.file, await fetchAsset(manifest.far, fetchBytes));
  if (r.kind !== 'far' || r.cols !== manifest.far.cols || r.rows !== manifest.far.rows || r.cellM !== manifest.far.cellM) {
    throw new Error(
      `world data: ${manifest.far.file} is a ${r.kind} raster ${r.cols} x ${r.rows} at ${r.cellM} m, the manifest says otherwise`,
    );
  }
  return r;
}

export async function loadRailNetwork(manifest: WorldManifest, fetchBytes: FetchBytes): Promise<RailNetwork> {
  return decodeRailNetwork(inflate(manifest.rail.file, await fetchAsset(manifest.rail, fetchBytes)));
}

export async function loadFarVectors(manifest: WorldManifest, fetchBytes: FetchBytes): Promise<FarVectors> {
  return decodeFarVectors(inflate(manifest.farVectors.file, await fetchAsset(manifest.farVectors, fetchBytes)));
}

/** Plan bounding box in world metres. */
export interface Box2 {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

export interface SiteFootprint extends Box2 {
  /** Outer ring first, then holes; flat x, z pairs in world metres. */
  rings: Float64Array[];
  /** Roof height above ground, metres. */
  heightM: number;
  /** Material id of the massing (BUILDING_*). */
  material: number;
  /** Landmark name, or ''. */
  name: string;
}

export interface SiteLine extends Box2 {
  /** Flat x, z pairs in world metres. */
  points: Float64Array;
  /** Painted width in metres. */
  widthM: number;
  material: number;
}

export interface SiteArea extends Box2 {
  rings: Float64Array[];
  material: number;
}

/** One work site, decoded: DEM tiles plus every vector feature that the voxelizer uses. */
export interface SiteData {
  id: string;
  title: string;
  /** World metres covered by the site's tiles. */
  bounds: Box2;
  tileBox: { tx0: number; ty0: number; nx: number; ny: number };
  /** DEM tile rasters, index (tx - tx0) + (ty - ty0) * nx. */
  dem: TerrainRaster[];
  /** Building massing: outlines of buildings without parts, plus every building part. */
  buildings: SiteFootprint[];
  /** Ground paint in draw order: land use first, then roads and rail. */
  areas: SiteArea[];
  lines: SiteLine[];
  /** Tidal water (ocean, bay, tidal channels): filled to sea level whatever the DEM says. */
  tidalWater: SiteArea[];
  /** Counts of what was decoded, for logs and tests. */
  counts: { buildings: number; buildingParts: number; roads: number; water: number; landuse: number; railTracks: number };
}

/** Roof height from which a building is drawn as a glass tower. */
export const TOWER_MIN_HEIGHT_M = 75;
/** Unclassified buildings at least this tall are drawn as commercial, lower ones as residential. */
const UNCLASSIFIED_COMMERCIAL_MIN_M = 25;
/** Painted width of a mainline track, metres. */
const RAIL_WIDTH_M = 4;

const RESIDENTIAL_CLASSES = new Set(['apartments', 'house', 'residential', 'detached', 'houseboat', 'dormitory', 'terrace']);
const COMMERCIAL_CLASSES = new Set(['office', 'retail', 'commercial', 'hotel', 'supermarket', 'kiosk']);
const INDUSTRIAL_CLASSES = new Set(['industrial', 'warehouse', 'shed', 'garage', 'garages', 'carport', 'parking', 'roof', 'service']);
const CIVIC_SUBTYPES = new Set(['civic', 'education', 'religious', 'medical', 'military']);

/** Landmark names that mark a transit building when the source gives it no subtype. */
const TRANSIT_NAME = /transit center|train station|railway station|caltrain|ferry building|ferry terminal/i;

/** Massing material of an Overture building (assets/vectors.ts SITE_BUILDING_SCHEMA). */
export function buildingMaterial(b: Pick<SiteBuilding, 'heightDm' | 'subtype' | 'cls' | 'name'>): number {
  const heightM = b.heightDm / 10;
  if (b.subtype === 'transportation' || TRANSIT_NAME.test(b.name)) return Material.BUILDING_TRANSIT;
  if (heightM >= TOWER_MIN_HEIGHT_M) return Material.BUILDING_TOWER;
  if (b.subtype === 'residential' || RESIDENTIAL_CLASSES.has(b.cls)) return Material.BUILDING_RESIDENTIAL;
  if (CIVIC_SUBTYPES.has(b.subtype)) return Material.BUILDING_CIVIC;
  if (b.subtype === 'industrial' || b.subtype === 'outbuilding' || INDUSTRIAL_CLASSES.has(b.cls)) return Material.BUILDING_INDUSTRIAL;
  if (b.subtype === 'commercial' || b.subtype === 'entertainment' || b.subtype === 'service' || COMMERCIAL_CLASSES.has(b.cls)) {
    return Material.BUILDING_COMMERCIAL;
  }
  return heightM >= UNCLASSIFIED_COMMERCIAL_MIN_M ? Material.BUILDING_COMMERCIAL : Material.BUILDING_RESIDENTIAL;
}

/** Land-use subtypes painted as grass. Everything else keeps the default pavement. */
const GREEN_SUBTYPES = new Set(['park', 'managed', 'horticulture', 'recreation', 'cemetery', 'golf', 'agriculture', 'protected']);
/** Recreation classes that are not green. */
const NOT_GREEN_CLASSES = new Set(['marina', 'playground', 'track']);
/** Water subtypes at sea level. Ponds, basins and fountains are painted as a one-voxel water surface instead. */
const TIDAL_SUBTYPES = new Set(['ocean', 'river', 'canal', 'strait', 'bay']);
/** Road classes that are footpaths: left as pavement. */
const UNPAINTED_ROADS = new Set(['pedestrian', 'footway', 'path', 'steps', 'cycleway']);

function boxOfRings(rings: readonly Float64Array[], grow = 0): Box2 {
  let minX = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i += 2) {
      const x = ring[i] as number;
      const z = ring[i + 1] as number;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
  }
  return { minX: minX - grow, minZ: minZ - grow, maxX: maxX + grow, maxZ: maxZ + grow };
}

function intersects(a: Box2, b: Box2): boolean {
  return a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
}

/**
 * Fetches and decodes every tile of one site. `rail` (optional) adds the mainline tracks inside the site
 * as ballast paint. Throws naming the file if a tile is missing, stale or does not decode.
 */
export async function loadSite(manifest: WorldManifest, siteId: string, fetchBytes: FetchBytes, rail?: RailNetwork): Promise<SiteData> {
  const asset: SiteAsset | undefined = manifest.sites.find((s) => s.id === siteId);
  if (asset === undefined) {
    throw new Error(`loadSite: the manifest has no site "${siteId}" (known: ${manifest.sites.map((s) => s.id).join(', ')})`);
  }
  const { tx0, ty0, nx, ny } = asset.tileBox;
  const bounds: Box2 = { minX: asset.bbox[0], minZ: asset.bbox[1], maxX: asset.bbox[2], maxZ: asset.bbox[3] };
  if (
    bounds.minX !== tx0 * SITE_TILE_SIZE_M ||
    bounds.maxX !== (tx0 + nx) * SITE_TILE_SIZE_M ||
    bounds.maxZ !== 0 - ty0 * SITE_TILE_SIZE_M ||
    bounds.minZ !== 0 - (ty0 + ny) * SITE_TILE_SIZE_M
  ) {
    throw new Error(
      `loadSite: site ${siteId} bbox ${JSON.stringify(asset.bbox)} does not match its tile box ${JSON.stringify(asset.tileBox)}`,
    );
  }
  if (asset.dem.length !== nx * ny || asset.tiles.length !== nx * ny) {
    throw new Error(
      `loadSite: site ${siteId} lists ${asset.dem.length} DEM and ${asset.tiles.length} vector tiles for a ${nx} x ${ny} box`,
    );
  }
  const [demFiles, vectorFiles] = await Promise.all([
    Promise.all(asset.dem.map((t) => fetchAsset(t, fetchBytes))),
    Promise.all(asset.tiles.map((t) => fetchAsset(t, fetchBytes))),
  ]);

  const dem: TerrainRaster[] = new Array(nx * ny);
  asset.dem.forEach((t, i) => {
    const r = terrain(t.file, demFiles[i] as Uint8Array);
    if (
      r.kind !== 'dem' ||
      r.originX !== t.tx * SITE_TILE_SIZE_M ||
      r.originN !== t.ty * SITE_TILE_SIZE_M ||
      (r.cols - 1) * r.cellM !== SITE_TILE_SIZE_M
    ) {
      throw new Error(`loadSite: ${t.file} is not the DEM of site tile (${t.tx}, ${t.ty})`);
    }
    dem[t.tx - tx0 + (t.ty - ty0) * nx] = r;
  });

  const site: SiteData = {
    id: asset.id,
    title: asset.title,
    bounds,
    tileBox: asset.tileBox,
    dem,
    buildings: [],
    areas: [],
    lines: [],
    tidalWater: [],
    counts: { buildings: 0, buildingParts: 0, roads: 0, water: 0, landuse: 0, railTracks: 0 },
  };
  const tiles = asset.tiles.map((t, i) => decodeSiteVectorTile(inflate(t.file, vectorFiles[i] as Uint8Array)));
  // Parts carry the massing but rarely the use or the name: they inherit those from their building,
  // which may sit in another tile (idHash of a part is the hash of its building's id).
  const parents = new Map<number, SiteBuilding>();
  for (const tile of tiles) for (const b of tile.buildings) if (b.hasParts !== 0) parents.set(b.idHash, b);
  const footprint = (b: SiteBuilding, parent?: SiteBuilding): SiteFootprint => {
    const name = b.name !== '' ? b.name : (parent?.name ?? '');
    const material = buildingMaterial({
      heightDm: b.heightDm,
      subtype: b.subtype !== '' ? b.subtype : (parent?.subtype ?? ''),
      cls: b.cls !== '' ? b.cls : (parent?.cls ?? ''),
      name,
    });
    return { rings: b.parts, heightM: b.heightDm / 10, material, name, ...boxOfRings(b.parts) };
  };
  for (const tile of tiles) {
    for (const b of tile.buildings) {
      site.counts.buildings++;
      // The parts carry the massing of such a building; its outline would bury them in a full-height box.
      if (b.hasParts === 0) site.buildings.push(footprint(b));
    }
    for (const b of tile.buildingParts) {
      site.counts.buildingParts++;
      site.buildings.push(footprint(b, parents.get(b.idHash)));
    }
    for (const l of tile.landuse) {
      site.counts.landuse++;
      let material = 0;
      if (GREEN_SUBTYPES.has(l.subtype) && !NOT_GREEN_CLASSES.has(l.cls)) material = Material.GRASS;
      else if (l.subtype === 'transportation' && l.cls === 'railway') material = Material.TRACK_BALLAST;
      if (material !== 0) site.areas.push({ rings: l.parts, material, ...boxOfRings(l.parts) });
    }
    for (const w of tile.water) {
      site.counts.water++;
      const area: SiteArea = { rings: w.parts, material: Material.WATER, ...boxOfRings(w.parts) };
      if (TIDAL_SUBTYPES.has(w.subtype) || w.cls === 'dock') site.tidalWater.push(area);
      else site.areas.push(area);
    }
    for (const r of tile.roads) {
      site.counts.roads++;
      if (r.tunnel !== 0 || UNPAINTED_ROADS.has(r.cls)) continue;
      const widthM = r.widthDm / 10;
      for (const points of r.parts) site.lines.push({ points, widthM, material: Material.ROAD, ...boxOfRings([points], widthM / 2) });
    }
  }
  if (rail !== undefined) {
    for (const track of rail.tracks) {
      if (track.cls !== 'rail' || track.tunnel !== 0) continue;
      for (const points of track.parts) {
        const box = boxOfRings([points], RAIL_WIDTH_M / 2);
        if (!intersects(box, bounds)) continue;
        site.counts.railTracks++;
        site.lines.push({ points, widthM: RAIL_WIDTH_M, material: Material.TRACK_BALLAST, ...box });
      }
    }
  }
  if (site.buildings.length === 0) throw new Error(`loadSite: site ${siteId} decoded to zero buildings; its vector tiles are empty`);
  return site;
}
