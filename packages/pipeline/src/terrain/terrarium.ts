/**
 * AWS Terrain Tiles (terrarium PNG): tile maths, cached download, decode, mosaic sampling.
 * Doc 02 section 3: 256 px XYZ Web Mercator tiles, elevation = R * 256 + G + B / 256 - 32768 (NAVD88 m
 * around the Bay). Raw tiles are cached under data/raw/terrarium/<z>/<x>/<y>.png (gitignored).
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PNG } from 'pngjs';

export const TERRARIUM_BASE_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium';
export const TERRARIUM_USER_AGENT = 'voxel-terrain-bake/0.1 (offline build script; fetches each tile once and caches it)';
export const TERRARIUM_TILE_PX = 256;
const FETCH_CONCURRENCY = 8;
const FETCH_ATTEMPTS = 3;

const TILE_PX = TERRARIUM_TILE_PX;
const DEG = Math.PI / 180;

export interface TileId {
  z: number;
  x: number;
  y: number;
}

export interface PixelXY {
  px: number;
  py: number;
}

/**
 * WGS84 degrees to global Web Mercator pixel coordinates at zoom z (256 px tiles).
 * px grows east, py grows south; the centre of pixel (i, j) is at (i + 0.5, j + 0.5).
 */
export function lonLatToPixel(lon: number, lat: number, z: number): PixelXY {
  const size = TILE_PX * 2 ** z;
  const s = Math.sin(lat * DEG);
  return { px: ((lon + 180) / 360) * size, py: (0.5 - Math.atanh(s) / (2 * Math.PI)) * size };
}

/** Decode one terrarium PNG to 256 x 256 elevations in metres, row 0 north. */
export function decodeTerrariumPng(png: Uint8Array, label: string): Float32Array {
  let img: { width: number; height: number; data: Uint8Array };
  try {
    img = PNG.sync.read(Buffer.from(png.buffer, png.byteOffset, png.byteLength));
  } catch (err) {
    throw new Error(`terrarium: cannot decode PNG ${label}: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (img.width !== TILE_PX || img.height !== TILE_PX) {
    throw new Error(`terrarium: ${label} is ${img.width} x ${img.height}, expected ${TILE_PX} x ${TILE_PX}`);
  }
  const out = new Float32Array(TILE_PX * TILE_PX);
  const d = img.data;
  for (let i = 0, p = 0; i < out.length; i++, p += 4) {
    out[i] = d[p] * 256 + d[p + 1] + d[p + 2] / 256 - 32768;
  }
  return out;
}

export function tileCachePath(cacheDir: string, t: TileId): string {
  return path.join(cacheDir, String(t.z), String(t.x), `${t.y}.png`);
}

async function download(t: TileId): Promise<Uint8Array> {
  const url = `${TERRARIUM_BASE_URL}/${t.z}/${t.x}/${t.y}.png`;
  let lastError = '';
  for (let attempt = 1; attempt <= FETCH_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': TERRARIUM_USER_AGENT } });
      if (res.ok) return new Uint8Array(await res.arrayBuffer());
      lastError = `HTTP ${res.status}`;
      // Only server-side and throttling errors are worth retrying; a 403/404 means the tile is missing.
      if (res.status < 500 && res.status !== 429) break;
    } catch (err) {
      lastError = err instanceof Error ? `${err.message}${err.cause instanceof Error ? ` (${err.cause.message})` : ''}` : String(err);
    }
  }
  throw new Error(`terrarium: missing tile ${t.z}/${t.x}/${t.y}: ${lastError} from ${url}`);
}

export interface LoadedTile {
  id: TileId;
  elevation: Float32Array;
  sha256: string;
  fetched: boolean;
}

/** Read one tile from the cache, downloading it first if absent. Throws naming the tile on any failure. */
export async function loadTile(cacheDir: string, id: TileId): Promise<LoadedTile> {
  const file = tileCachePath(cacheDir, id);
  let bytes: Uint8Array;
  let fetched = false;
  if (existsSync(file)) {
    bytes = await readFile(file);
  } else {
    bytes = await download(id);
    fetched = true;
  }
  const elevation = decodeTerrariumPng(bytes, fetched ? `${id.z}/${id.x}/${id.y}` : file);
  if (fetched) {
    // Cache only after a successful decode, atomically, so a broken download never poisons the cache.
    await mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    await writeFile(tmp, bytes);
    await rename(tmp, file);
  }
  return { id, elevation, sha256: createHash('sha256').update(bytes).digest('hex'), fetched };
}

/** A rectangular block of decoded tiles at one zoom, addressable in global pixel coordinates. */
export class Mosaic {
  readonly z: number;
  /** Global pixel coordinate of the mosaic's west and north edges. */
  readonly px0: number;
  readonly py0: number;
  readonly width: number;
  readonly height: number;
  readonly data: Float32Array;

  constructor(z: number, tileX0: number, tileY0: number, tilesX: number, tilesY: number) {
    this.z = z;
    this.px0 = tileX0 * TILE_PX;
    this.py0 = tileY0 * TILE_PX;
    this.width = tilesX * TILE_PX;
    this.height = tilesY * TILE_PX;
    this.data = new Float32Array(this.width * this.height);
  }

  setTile(id: TileId, elevation: Float32Array): void {
    const ox = id.x * TILE_PX - this.px0;
    const oy = id.y * TILE_PX - this.py0;
    if (id.z !== this.z || ox < 0 || oy < 0 || ox + TILE_PX > this.width || oy + TILE_PX > this.height) {
      throw new Error(`terrarium: tile ${id.z}/${id.x}/${id.y} does not belong to this mosaic`);
    }
    for (let row = 0; row < TILE_PX; row++) {
      this.data.set(elevation.subarray(row * TILE_PX, (row + 1) * TILE_PX), ox + (oy + row) * this.width);
    }
  }

  /**
   * The 2017 tile build has seams of bogus deep values (about -2,967 m, one pixel wide, seen along
   * the San Mateo coast and in Suisun Bay at z12). Every pixel below `floorM` is treated as a void
   * and replaced by the mean of its valid 8-neighbours, pass by pass. Returns the number repaired.
   * Throws if voids exceed `maxFraction` of the mosaic or cannot be closed: that would be a new
   * kind of defect, not a seam.
   */
  repairVoids(floorM: number, maxFraction: number): number {
    const { data, width, height } = this;
    let voids: number[] = [];
    for (let i = 0; i < data.length; i++) if (!(data[i] >= floorM)) voids.push(i);
    const total = voids.length;
    if (total > data.length * maxFraction) {
      throw new Error(
        `terrarium: z${this.z} mosaic has ${total} pixels below ${floorM} m, more than ${maxFraction * 100}% of ${data.length}`,
      );
    }
    for (let pass = 0; voids.length > 0; pass++) {
      if (pass === 16) throw new Error(`terrarium: z${this.z} mosaic still has ${voids.length} void pixels after 16 repair passes`);
      const fills = new Float32Array(voids.length);
      const remaining: number[] = [];
      for (let k = 0; k < voids.length; k++) {
        const i = voids[k] as number;
        const x = i % width;
        const y = (i - x) / width;
        let sum = 0;
        let count = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            const v = data[nx + ny * width];
            if (v >= floorM) {
              sum += v;
              count++;
            }
          }
        }
        if (count === 0) remaining.push(i);
        fills[k] = count === 0 ? Number.NaN : sum / count;
      }
      // Apply after the scan so a pass only reads values that were valid when it started.
      for (let k = 0; k < voids.length; k++) if (!Number.isNaN(fills[k])) data[voids[k] as number] = fills[k];
      if (remaining.length === voids.length)
        throw new Error(`terrarium: z${this.z} mosaic has ${remaining.length} void pixels with no valid neighbour`);
      voids = remaining;
    }
    return total;
  }

  /** Bilinear elevation at global pixel coordinates. Throws if the 2 x 2 footprint leaves the mosaic. */
  sample(px: number, py: number): number {
    const u = px - 0.5 - this.px0;
    const v = py - 0.5 - this.py0;
    const i = Math.floor(u);
    const j = Math.floor(v);
    if (!(i >= 0 && j >= 0 && i + 1 < this.width && j + 1 < this.height)) {
      throw new Error(`terrarium: sample at pixel (${px}, ${py}) z${this.z} is outside the loaded mosaic`);
    }
    const fu = u - i;
    const fv = v - j;
    const d = this.data;
    const k = i + j * this.width;
    const north = d[k] * (1 - fu) + d[k + 1] * fu;
    const south = d[k + this.width] * (1 - fu) + d[k + this.width + 1] * fu;
    return north * (1 - fv) + south * fv;
  }
}

/** Lowest plausible elevation in the game grid: the Golden Gate channel bottoms out near -115 m (doc 02). */
export const VOID_FLOOR_M = -200;
/** More void pixels than this share of a mosaic fails the build. */
export const VOID_MAX_FRACTION = 0.0005;

export interface MosaicResult {
  mosaic: Mosaic;
  tileCount: number;
  fetchedCount: number;
  /** Source void pixels (below VOID_FLOOR_M) replaced from their neighbours. */
  repairedVoids: number;
  /** sha256 over the sorted "z/x/y sha256" lines of every tile: the identity of the raw input. */
  sourceSha256: string;
}

/**
 * Load every tile needed to bilinear-sample the given global pixel bounds (a 2 px margin is added),
 * with bounded concurrency. Fails loudly on the first tile that cannot be fetched or decoded.
 */
export async function loadMosaic(
  cacheDir: string,
  z: number,
  bounds: { minPx: number; minPy: number; maxPx: number; maxPy: number },
): Promise<MosaicResult> {
  const margin = 2;
  const x0 = Math.floor((bounds.minPx - margin) / TILE_PX);
  const y0 = Math.floor((bounds.minPy - margin) / TILE_PX);
  const x1 = Math.floor((bounds.maxPx + margin) / TILE_PX);
  const y1 = Math.floor((bounds.maxPy + margin) / TILE_PX);
  const limit = 2 ** z;
  if (!(x0 >= 0 && y0 >= 0 && x1 < limit && y1 < limit && x1 >= x0 && y1 >= y0)) {
    throw new Error(`terrarium: pixel bounds ${JSON.stringify(bounds)} do not map to valid z${z} tiles`);
  }
  const ids: TileId[] = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) ids.push({ z, x, y });
  const mosaic = new Mosaic(z, x0, y0, x1 - x0 + 1, y1 - y0 + 1);
  const lines: string[] = new Array(ids.length);
  let next = 0;
  let fetchedCount = 0;
  const worker = async (): Promise<void> => {
    while (next < ids.length) {
      const index = next++;
      const id = ids[index] as TileId;
      const tile = await loadTile(cacheDir, id);
      mosaic.setTile(id, tile.elevation);
      if (tile.fetched) fetchedCount++;
      lines[index] = `${id.z}/${id.x}/${id.y} ${tile.sha256}`;
    }
  };
  await Promise.all(Array.from({ length: Math.min(FETCH_CONCURRENCY, ids.length) }, worker));
  const sourceSha256 = createHash('sha256').update(lines.join('\n')).digest('hex');
  const repairedVoids = mosaic.repairVoids(VOID_FLOOR_M, VOID_MAX_FRACTION);
  return { mosaic, tileCount: ids.length, fetchedCount, repairedVoids, sourceSha256 };
}
