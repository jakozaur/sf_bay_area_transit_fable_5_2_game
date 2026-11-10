/**
 * Material slices for cut faces: where a clip region removes ground, the exposed face is drawn as a quad
 * coloured from a small texture of material ids sampled out of the voxel store, so strata show without any
 * remeshing. cap.ts does the horizontal chunk-aligned case; this file does vertical walls (the ring wall of
 * the cut plane, the walls of the follow cutaway) and an arbitrary horizontal rectangle (the cutaway floor).
 */
import { CHUNK_SIZE, CHUNK_Y_MAX, CHUNK_Y_MIN, type ChunkData, type ChunkKey, packChunkKey, type WorldPos } from '@bayvox/core';

type ChunkSource = { getChunk(key: ChunkKey): ChunkData | undefined };

const N = CHUNK_SIZE;
const AREA = N * N;
const pack = packChunkKey;

/** Largest wall texture: columns along the wall and rows of height. */
export const WALL_MAX_COLUMNS = 4096;
export const WALL_MAX_ROWS = 512;

/**
 * Samples one vertical column of voxels per entry of `xs` / `zs` (world metres), from layer `y0` upwards for
 * `rows` layers, into `out` as 2 bytes per texel (id low, id high): texel (column, row) is at
 * (row * columns + column) * 2. Chunks the store does not know read as AIR (0).
 */
export function fillWallColumns(
  world: ChunkSource,
  xs: ArrayLike<number>,
  zs: ArrayLike<number>,
  y0: number,
  rows: number,
  out: Uint8Array,
): void {
  const cols = xs.length;
  if (zs.length !== cols) throw new RangeError(`fillWallColumns: ${cols} x values but ${zs.length} z values`);
  if (!Number.isInteger(y0) || !Number.isInteger(rows) || rows < 1)
    throw new RangeError(`fillWallColumns: bad rows ${rows} from layer ${y0}`);
  if (out.length !== cols * rows * 2) {
    throw new RangeError(`fillWallColumns: out must have ${cols * rows * 2} bytes for ${cols} x ${rows} texels, got ${out.length}`);
  }
  out.fill(0);
  const cy0 = y0 >> 5;
  const cy1 = (y0 + rows - 1) >> 5;
  const stride = cols * 2;
  for (let i = 0; i < cols; i++) {
    const x = Math.floor(xs[i] as number);
    const z = Math.floor(zs[i] as number);
    if (!Number.isFinite(x) || !Number.isFinite(z))
      throw new RangeError(`fillWallColumns: column ${i} is not finite: (${xs[i]}, ${zs[i]})`);
    const cx = x >> 5;
    const cz = z >> 5;
    const column = (x & 31) + (z & 31) * N;
    for (let cy = Math.max(cy0, CHUNK_Y_MIN); cy <= Math.min(cy1, CHUNK_Y_MAX); cy++) {
      const chunk = world.getChunk(pack(cx, cy, cz));
      if (chunk === undefined) continue;
      const { palette, indices } = chunk;
      if (indices === null && palette[0] === 0) continue;
      const from = Math.max(y0, cy * N);
      const to = Math.min(y0 + rows, (cy + 1) * N);
      let o = (from - y0) * stride + i * 2;
      for (let y = from; y < to; y++, o += stride) {
        const m = palette[indices === null ? 0 : (indices[column + (y & 31) * AREA] as number)] as number;
        out[o] = m & 255;
        out[o + 1] = m >> 8;
      }
    }
  }
}

/**
 * Writes the material ids of voxel layer `y` over the rectangle of `w` x `d` voxels whose minimum corner is
 * (x0, z0) into `out`, 2 bytes per texel, row-major with x along a row: texel (x - x0, z - z0).
 */
export function fillLayerRect(world: ChunkSource, x0: number, z0: number, w: number, d: number, y: number, out: Uint8Array): void {
  if (![x0, z0, w, d, y].every(Number.isInteger) || w < 1 || d < 1) {
    throw new RangeError(`fillLayerRect: bad rectangle ${w} x ${d} at (${x0}, ${z0}) layer ${y}`);
  }
  if (out.length !== w * d * 2)
    throw new RangeError(`fillLayerRect: out must have ${w * d * 2} bytes for ${w} x ${d} texels, got ${out.length}`);
  out.fill(0);
  const cy = y >> 5;
  if (cy < CHUNK_Y_MIN || cy > CHUNK_Y_MAX) return;
  const layer = (y & 31) * AREA;
  for (let cz = z0 >> 5; cz <= (z0 + d - 1) >> 5; cz++) {
    for (let cx = x0 >> 5; cx <= (x0 + w - 1) >> 5; cx++) {
      const chunk = world.getChunk(pack(cx, cy, cz));
      if (chunk === undefined) continue;
      const { palette, indices } = chunk;
      if (indices === null && palette[0] === 0) continue;
      const xa = Math.max(x0, cx * N);
      const xb = Math.min(x0 + w, (cx + 1) * N);
      const za = Math.max(z0, cz * N);
      const zb = Math.min(z0 + d, (cz + 1) * N);
      for (let z = za; z < zb; z++) {
        let o = ((z - z0) * w + (xa - x0)) * 2;
        const row = layer + (z & 31) * N;
        for (let x = xa; x < xb; x++, o += 2) {
          const m = palette[indices === null ? 0 : (indices[row + (x & 31)] as number)] as number;
          out[o] = m & 255;
          out[o + 1] = m >> 8;
        }
      }
    }
  }
}

/** A vertical strip of wall quads: where its texture columns are sampled and the mesh that shows them. */
export interface WallStrip {
  /** Sample position of each texture column, world metres. */
  xs: Float64Array;
  zs: Float64Array;
  /** Vertices relative to `anchor` at height 0: x, z per vertex, and the texture column coordinate there. */
  vertexXZ: Float32Array;
  vertexU: Float32Array;
  /** Two vertices (start, end) per quad, `quads` quads. The mesh extrudes them from row 0 to the row count. */
  quads: number;
  anchor: { x: number; z: number };
  /** Metres of wall per texture column, for the grid lines. */
  metresPerColumn: number;
}

/**
 * The ring wall of the cut plane: a cylinder of `radius` around the focus. One texture column per metre of
 * arc (fewer when the circumference exceeds the texture limit), sampled half a metre outside the cut.
 */
export function cylinderStrip(focusX: number, focusZ: number, radius: number): WallStrip {
  if (!(radius > 0) || !Number.isFinite(focusX + focusZ + radius))
    throw new RangeError(`cylinderStrip: bad cylinder radius ${radius} at (${focusX}, ${focusZ})`);
  const n = Math.max(16, Math.min(WALL_MAX_COLUMNS, Math.ceil(2 * Math.PI * radius)));
  const xs = new Float64Array(n);
  const zs = new Float64Array(n);
  const vertexXZ = new Float32Array(n * 4);
  const vertexU = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const a = ((i + 0.5) / n) * 2 * Math.PI;
    xs[i] = focusX + (radius + 0.5) * Math.cos(a);
    zs[i] = focusZ + (radius + 0.5) * Math.sin(a);
    const a0 = (i / n) * 2 * Math.PI;
    const a1 = ((i + 1) / n) * 2 * Math.PI;
    vertexXZ[i * 4] = radius * Math.cos(a0);
    vertexXZ[i * 4 + 1] = radius * Math.sin(a0);
    vertexXZ[i * 4 + 2] = radius * Math.cos(a1);
    vertexXZ[i * 4 + 3] = radius * Math.sin(a1);
    vertexU[i * 2] = i;
    vertexU[i * 2 + 1] = i + 1;
  }
  return { xs, zs, vertexXZ, vertexU, quads: n, anchor: { x: focusX, z: focusZ }, metresPerColumn: (2 * Math.PI * radius) / n };
}

/** The follow cutaway: a trench that travels with a machine. */
export interface Cutaway {
  /** Reference point on the heading axis (the cutterhead face), world metres. Only x and z are used. */
  position: WorldPos;
  /** Direction of travel, radians (core entities.ts yaw). */
  yaw: number;
  /** Ground removed this far ahead of the reference point, behind it and to each side, metres. */
  aheadM: number;
  behindM: number;
  halfWidthM: number;
  /** Everything above this world height is removed inside the trench. Whole metres. */
  floorY: number;
}

export function validateCutaway(c: Cutaway): void {
  const ok =
    Number.isFinite(c.position.x + c.position.z + c.yaw) &&
    c.aheadM + c.behindM > 1 &&
    c.aheadM + c.behindM <= 400 &&
    c.halfWidthM > 0.5 &&
    c.halfWidthM <= 100 &&
    Number.isInteger(c.floorY);
  if (!ok) {
    throw new RangeError(
      `cutaway: bad trench at (${c.position.x}, ${c.position.z}) yaw ${c.yaw}: ahead ${c.aheadM} m, behind ${c.behindM} m, half width ${c.halfWidthM} m, floor ${c.floorY}`,
    );
  }
}

/** Texture columns per metre of cutaway wall: finer than a voxel so a wall that crosses the grid at an angle stays crisp. */
const BOX_COLUMNS_PER_M = 2;

/** The four walls of a cutaway, sampled half a metre outside the trench. Wall order: left, front, right, back. */
export function cutawayStrip(c: Cutaway): WallStrip {
  validateCutaway(c);
  const sin = Math.sin(c.yaw);
  const cos = Math.cos(c.yaw);
  // Local (side, along) to world offsets: along is (sin, cos), left is (cos, -sin).
  const wx = (side: number, along: number): number => side * cos + along * sin;
  const wz = (side: number, along: number): number => -side * sin + along * cos;
  const hw = c.halfWidthM;
  const corners: [number, number][] = [
    [hw, -c.behindM],
    [hw, c.aheadM],
    [-hw, c.aheadM],
    [-hw, -c.behindM],
  ];
  const xs: number[] = [];
  const zs: number[] = [];
  const vertexXZ = new Float32Array(16);
  const vertexU = new Float32Array(8);
  for (let w = 0; w < 4; w++) {
    const a = corners[w] as [number, number];
    const b = corners[(w + 1) % 4] as [number, number];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const dx = (b[0] - a[0]) / len;
    const dz = (b[1] - a[1]) / len;
    // Outward normal of a wall walked counter-clockwise in (side, along) with the trench on the left hand: (dz, -dx).
    const nx = dz;
    const nz = -dx;
    const cols = Math.max(1, Math.ceil(len * BOX_COLUMNS_PER_M));
    const start = xs.length;
    for (let j = 0; j < cols; j++) {
      const t = Math.min(len, (j + 0.5) / BOX_COLUMNS_PER_M);
      const side = a[0] + dx * t + nx * 0.5;
      const along = a[1] + dz * t + nz * 0.5;
      xs.push(c.position.x + wx(side, along));
      zs.push(c.position.z + wz(side, along));
    }
    vertexXZ[w * 4] = wx(a[0], a[1]);
    vertexXZ[w * 4 + 1] = wz(a[0], a[1]);
    vertexXZ[w * 4 + 2] = wx(b[0], b[1]);
    vertexXZ[w * 4 + 3] = wz(b[0], b[1]);
    vertexU[w * 2] = start;
    vertexU[w * 2 + 1] = start + len * BOX_COLUMNS_PER_M;
  }
  return {
    xs: Float64Array.from(xs),
    zs: Float64Array.from(zs),
    vertexXZ,
    vertexU,
    quads: 4,
    anchor: { x: c.position.x, z: c.position.z },
    metresPerColumn: 1 / BOX_COLUMNS_PER_M,
  };
}

/** Whole-voxel rectangle covering the footprint of a cutaway: minimum corner and size. */
export function cutawayFootprint(c: Cutaway): { x0: number; z0: number; w: number; d: number } {
  const sin = Math.sin(c.yaw);
  const cos = Math.cos(c.yaw);
  let minX = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (const side of [-c.halfWidthM, c.halfWidthM]) {
    for (const along of [-c.behindM, c.aheadM]) {
      const x = c.position.x + side * cos + along * sin;
      const z = c.position.z - side * sin + along * cos;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }
  }
  const x0 = Math.floor(minX);
  const z0 = Math.floor(minZ);
  return { x0, z0, w: Math.floor(maxX) - x0 + 1, d: Math.floor(maxZ) - z0 + 1 };
}

/** True when a world point is inside the removed volume of a cutaway (the test the shaders run per fragment). */
export function insideCutaway(c: Cutaway, p: WorldPos): boolean {
  const dx = p.x - c.position.x;
  const dz = p.z - c.position.z;
  const along = dx * Math.sin(c.yaw) + dz * Math.cos(c.yaw);
  const side = dx * Math.cos(c.yaw) - dz * Math.sin(c.yaw);
  return p.y > c.floorY && along < c.aheadM && along > -c.behindM && Math.abs(side) < c.halfWidthM;
}
