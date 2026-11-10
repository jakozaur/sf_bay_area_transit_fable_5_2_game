/**
 * Scene graph for chunk meshes. Chunks are drawn in batches: every 4 x 16 x 4 block of chunks (128 m square, the
 * whole height) is one instanced draw for its opaque quads and one for its water, so a near field of 900 meshed
 * chunks is a few dozen draw calls, not 900 (more under x-ray, which draws the terrain in three passes and a
 * fourth when its height map moves: 2,573 draws were measured at the Transit Center before, against a budget
 * of 500). The footprint is a trade: three culls a batch as a whole, so a larger one draws more triangles that
 * are off screen, a smaller one more draws. Measured on the camera path of e2e/tests/mechanics.spec.ts:
 * 140,275 triangles at 4 x 4 chunks and 127,961 at 2 x 2, against the 116,000 budgeted for per-chunk culling;
 * in the game, where the column tiers are most of the triangles, the difference is a few percent. 2 x 2 peaked
 * at 463 draws in an x-ray orbit of the mission site before any tunnel or train was drawn; 4 x 4 peaked at
 * 287 there, and that margin is what the size was chosen for. A quad carries its
 * chunk inside the batch in the flag bits of its second word, the same bits the column batches use for their
 * patch and slab (shaders.ts CHUNK_VERT).
 * A batch is rebuilt when one of its chunks changes, at most once per frame: `flush` does it and the renderer
 * calls it before drawing.
 * No GL calls here (three uploads lazily on first draw), so this part runs under Node in unit tests.
 */
import { CHUNK_SIZE, type ChunkKey, type MeshOutput, QUAD_BYTES, QUAD_WORDS, unpackChunkKey } from '@bayvox/core';
import { BufferAttribute, Group, InstancedBufferAttribute, InstancedBufferGeometry, type Material, Mesh, Sphere, Vector3 } from 'three';

/** three layer ids: passes select what they draw by camera layer mask. */
export const LAYER_SKY = 0;
export const LAYER_TERRAIN = 1;
export const LAYER_WATER = 2;
export const LAYER_OVERLAY = 3;

/** Chunks per batch along x and z (a power of two: the chunk's place in the batch is its low bits). */
export const BATCH_CHUNKS_XZ = 4;
/** Chunks per batch along y: the 4 bits the shader has for the vertical place. */
export const BATCH_CHUNKS_Y = 16;
const XZ_SHIFT = 2;
const XZ_MASK = BATCH_CHUNKS_XZ - 1;
const Y_SHIFT = 4;
const Y_MASK = BATCH_CHUNKS_Y - 1;
/** Bits of quad word 1 that hold the chunk's place in its batch: x at 18, z at 23, y at 28 (shaders.ts). */
const PLACE_X_SHIFT = 18;
const PLACE_Z_SHIFT = 23;
const PLACE_Y_SHIFT = 28;

/** Unit quad shared by every chunk geometry: corners (0,0) (1,0) (1,1) (0,1), two triangles. */
const QUAD_POSITIONS = new BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]), 3);
const QUAD_INDEX = new BufferAttribute(new Uint16Array([0, 1, 2, 0, 2, 3]), 1);

interface Entry {
  cx: number;
  cy: number;
  cz: number;
  /** The chunk's packed quads as the mesher gave them: opaque first, then water. */
  words: Uint32Array;
  opaqueCount: number;
  quads: number;
  batch: Batch;
}

interface Batch {
  key: string;
  /** Batch coordinate: chunk coordinate shifted down. */
  bx: number;
  by: number;
  bz: number;
  chunks: Map<ChunkKey, Entry>;
  opaque: Mesh | null;
  water: Mesh | null;
  dirty: boolean;
}

function quadGeometry(words: Uint32Array, sphere: Sphere): InstancedBufferGeometry {
  const g = new InstancedBufferGeometry();
  g.setIndex(QUAD_INDEX);
  g.setAttribute('position', QUAD_POSITIONS);
  // Uint32Array attributes are bound with vertexAttribIPointer, so the shader reads the packed words as uvec2.
  g.setAttribute('aQuad', new InstancedBufferAttribute(words, QUAD_WORDS));
  g.instanceCount = words.length / QUAD_WORDS;
  g.boundingSphere = sphere;
  return g;
}

export class ChunkScene {
  /** Opaque batch meshes (LAYER_TERRAIN). */
  readonly terrain = new Group();
  /** Water batch meshes (LAYER_WATER). */
  readonly water = new Group();
  private readonly entries = new Map<ChunkKey, Entry>();
  private readonly batches = new Map<string, Batch>();
  private readonly dirty = new Set<Batch>();
  private origin = { x: 0, y: 0, z: 0 };
  private totalQuads = 0;
  private meshed = 0;

  private readonly opaqueMaterial: Material;
  private readonly waterMaterial: Material;

  constructor(opaqueMaterial: Material, waterMaterial: Material) {
    this.opaqueMaterial = opaqueMaterial;
    this.waterMaterial = waterMaterial;
    this.terrain.matrixAutoUpdate = false;
    this.water.matrixAutoUpdate = false;
  }

  /** Chunks that have been uploaded, including ones whose mesh is empty. */
  get chunkCount(): number {
    return this.entries.size;
  }

  /** Chunks with at least one quad. */
  get meshedCount(): number {
    return this.meshed;
  }

  get quadCount(): number {
    return this.totalQuads;
  }

  /** Bytes of quad data held for the GPU. */
  get quadBytes(): number {
    return this.totalQuads * QUAD_BYTES;
  }

  /** Batches that hold at least one chunk. Each draws at most one opaque and one water mesh. */
  get batchCount(): number {
    return this.batches.size;
  }

  has(key: ChunkKey): boolean {
    return this.entries.has(key);
  }

  upload(mesh: MeshOutput): void {
    const total = mesh.quads.length / QUAD_WORDS;
    if (!Number.isInteger(total) || mesh.opaqueCount < 0 || mesh.opaqueCount > total) {
      throw new RangeError(`ChunkScene.upload: chunk ${mesh.key} has ${mesh.quads.length} words but opaqueCount ${mesh.opaqueCount}`);
    }
    this.remove(mesh.key);
    const { cx, cy, cz } = unpackChunkKey(mesh.key);
    const bx = cx >> XZ_SHIFT;
    const by = cy >> Y_SHIFT;
    const bz = cz >> XZ_SHIFT;
    const key = `${bx},${by},${bz}`;
    let batch = this.batches.get(key);
    if (batch === undefined) {
      batch = { key, bx, by, bz, chunks: new Map(), opaque: null, water: null, dirty: false };
      this.batches.set(key, batch);
    }
    const e: Entry = { cx, cy, cz, words: mesh.quads, opaqueCount: mesh.opaqueCount, quads: total, batch };
    batch.chunks.set(mesh.key, e);
    this.entries.set(mesh.key, e);
    this.totalQuads += total;
    if (total > 0) this.meshed++;
    this.touch(batch);
  }

  remove(key: ChunkKey): void {
    const e = this.entries.get(key);
    if (e === undefined) return;
    this.entries.delete(key);
    e.batch.chunks.delete(key);
    this.totalQuads -= e.quads;
    if (e.quads > 0) this.meshed--;
    this.touch(e.batch);
  }

  /** Floating origin as a chunk coordinate. Every batch mesh is repositioned relative to it. */
  setOrigin(cx: number, cy: number, cz: number): void {
    if (!Number.isInteger(cx) || !Number.isInteger(cy) || !Number.isInteger(cz)) {
      throw new RangeError(`ChunkScene.setOrigin: origin must be an integer chunk coordinate, got (${cx}, ${cy}, ${cz})`);
    }
    if (cx === this.origin.x && cy === this.origin.y && cz === this.origin.z) return;
    this.origin = { x: cx, y: cy, z: cz };
    for (const b of this.batches.values()) this.place(b);
  }

  /**
   * Rebuilds the batches whose chunks changed since the last call. Call once per frame before drawing; cheap
   * when nothing changed. Returns the number of batches rebuilt.
   */
  flush(): number {
    const n = this.dirty.size;
    if (n === 0) return 0;
    for (const b of this.dirty) this.rebuild(b);
    this.dirty.clear();
    return n;
  }

  dispose(): void {
    for (const key of [...this.entries.keys()]) this.remove(key);
    this.flush();
  }

  private touch(batch: Batch): void {
    if (batch.dirty) return;
    batch.dirty = true;
    this.dirty.add(batch);
  }

  private rebuild(b: Batch): void {
    b.dirty = false;
    for (const m of [b.opaque, b.water]) {
      if (m === null) continue;
      m.removeFromParent();
      m.geometry.dispose();
    }
    b.opaque = null;
    b.water = null;
    if (b.chunks.size === 0) {
      this.batches.delete(b.key);
      return;
    }
    let opaqueQuads = 0;
    let waterQuads = 0;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const e of b.chunks.values()) {
      opaqueQuads += e.opaqueCount;
      waterQuads += e.quads - e.opaqueCount;
      if (e.quads > 0) {
        const dy = e.cy & Y_MASK;
        if (dy < minY) minY = dy;
        if (dy > maxY) maxY = dy;
      }
    }
    if (opaqueQuads + waterQuads === 0) return;
    // One sphere for the batch: its footprint, and the vertical span of the chunks that have quads.
    const span = BATCH_CHUNKS_XZ * CHUNK_SIZE;
    const y0 = minY * CHUNK_SIZE;
    const y1 = (maxY + 1) * CHUNK_SIZE;
    const sphere = new Sphere(new Vector3(span / 2, (y0 + y1) / 2, span / 2), Math.hypot(span / 2, (y1 - y0) / 2, span / 2));
    const opaque = new Uint32Array(opaqueQuads * QUAD_WORDS);
    const water = new Uint32Array(waterQuads * QUAD_WORDS);
    let o = 0;
    let w = 0;
    for (const e of b.chunks.values()) {
      const place = ((e.cx & XZ_MASK) << PLACE_X_SHIFT) | ((e.cz & XZ_MASK) << PLACE_Z_SHIFT) | (((e.cy & Y_MASK) << PLACE_Y_SHIFT) >>> 0);
      const split = e.opaqueCount * QUAD_WORDS;
      const words = e.words;
      for (let i = 0; i < split; i += QUAD_WORDS) {
        opaque[o] = words[i] as number;
        opaque[o + 1] = (words[i + 1] as number) | place;
        o += QUAD_WORDS;
      }
      for (let i = split; i < words.length; i += QUAD_WORDS) {
        water[w] = words[i] as number;
        water[w + 1] = (words[i + 1] as number) | place;
        w += QUAD_WORDS;
      }
    }
    if (opaqueQuads > 0) b.opaque = this.makeMesh(opaque, sphere, this.opaqueMaterial, LAYER_TERRAIN, this.terrain);
    if (waterQuads > 0) b.water = this.makeMesh(water, sphere, this.waterMaterial, LAYER_WATER, this.water);
    this.place(b);
  }

  private makeMesh(words: Uint32Array, sphere: Sphere, material: Material, layer: number, parent: Group): Mesh {
    const m = new Mesh(quadGeometry(words, sphere), material);
    m.layers.set(layer);
    m.matrixAutoUpdate = false;
    parent.add(m);
    return m;
  }

  private place(b: Batch): void {
    // Small integers: exact in float32 for any chunk within 2^24 / 32 chunks of the origin.
    const x = (b.bx * BATCH_CHUNKS_XZ - this.origin.x) * CHUNK_SIZE;
    const y = (b.by * BATCH_CHUNKS_Y - this.origin.y) * CHUNK_SIZE;
    const z = (b.bz * BATCH_CHUNKS_XZ - this.origin.z) * CHUNK_SIZE;
    for (const m of [b.opaque, b.water]) {
      if (m === null) continue;
      m.position.set(x, y, z);
      m.updateMatrix();
      m.matrixWorldNeedsUpdate = true;
    }
  }
}
