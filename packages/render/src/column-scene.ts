/**
 * Scene graph for the column LOD tiers (doc 04 section 9.1: far 64 m, city 4 m): column patch meshes from
 * packages/mesher meshColumnPatch, merged into a few large instanced draws. A batch is a square block of up
 * to 32 x 32 patches and 16 vertical slabs; each quad carries its patch and slab in the reserved flag bits of
 * its second word, and bit 31 of its first word marks it as an LOD quad (see CHUNK_VERT), so one draw call
 * covers the whole batch with the same 8 bytes per quad as chunk meshes.
 * No GL calls here, so this part runs under Node in unit tests.
 */
import { CHUNK_SIZE, type MeshOutput, QUAD_BYTES, QUAD_WORDS } from '@bayvox/core';
import { BufferAttribute, Group, InstancedBufferAttribute, InstancedBufferGeometry, type Material, Mesh, Sphere, Vector3 } from 'three';
import { LAYER_TERRAIN, LAYER_WATER } from './chunk-scene.ts';

/** Patches per batch edge the flag bits can address. */
export const BATCH_MAX_PATCHES = 32;
/** Vertical slabs per batch the flag bits can address. */
export const BATCH_MAX_SLABS = 16;

const QUAD_POSITIONS = new BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]), 3);
const QUAD_INDEX = new BufferAttribute(new Uint16Array([0, 1, 2, 0, 2, 3]), 1);
const N = CHUNK_SIZE;
/** Word 1 bits below the flags: material and AO. */
const WORD1_KEEP = (1 << 18) - 1;
const LOD_BIT = 0x80000000;

/** One slab mesh of one patch, placed inside its batch. */
export interface ColumnBatchPart {
  /** Patch index inside the batch, 0 .. BATCH_MAX_PATCHES - 1: px east, pz south. */
  px: number;
  pz: number;
  /** Vertical slab of the mesh (ColumnSlabMesh.slab); any integer, a batch may span BATCH_MAX_SLABS of them. */
  slab: number;
  mesh: MeshOutput;
}

/** Where a batch sits in the world and how large its cells are. */
export interface ColumnBatchPlacement {
  /** World metres of the batch's north-west corner at height step 0. */
  originXM: number;
  originYM: number;
  originZM: number;
  /** Metres per cell and per vertical step. */
  cellM: number;
  stepM: number;
}

interface Batch {
  placement: ColumnBatchPlacement;
  /** World y of the lowest slab of the batch. */
  baseYM: number;
  opaque: Mesh | null;
  water: Mesh | null;
  quads: number;
  visible: boolean;
}

function geometry(words: Uint32Array, sphere: Sphere): InstancedBufferGeometry {
  const g = new InstancedBufferGeometry();
  g.setIndex(QUAD_INDEX);
  g.setAttribute('position', QUAD_POSITIONS);
  g.setAttribute('aQuad', new InstancedBufferAttribute(words, QUAD_WORDS));
  g.instanceCount = words.length / QUAD_WORDS;
  g.boundingSphere = sphere;
  return g;
}

export class ColumnScene {
  /** Opaque batch meshes (LAYER_TERRAIN). */
  readonly terrain = new Group();
  /** Water batch meshes (LAYER_WATER). */
  readonly water = new Group();
  private readonly batches = new Map<string, Batch>();
  private originX = 0;
  private originY = 0;
  private originZ = 0;
  private totalQuads = 0;
  private readonly opaqueMaterial: Material;
  private readonly waterMaterial: Material;

  constructor(opaqueMaterial: Material, waterMaterial: Material) {
    this.opaqueMaterial = opaqueMaterial;
    this.waterMaterial = waterMaterial;
    this.terrain.matrixAutoUpdate = false;
    this.water.matrixAutoUpdate = false;
  }

  get batchCount(): number {
    return this.batches.size;
  }

  /** Quads held in all batches, visible or not. */
  get quadCount(): number {
    return this.totalQuads;
  }

  get quadBytes(): number {
    return this.totalQuads * QUAD_BYTES;
  }

  has(id: string): boolean {
    return this.batches.has(id);
  }

  /** Adds or replaces a batch. A batch whose parts hold no quads is stored empty (no draw). */
  setBatch(id: string, parts: readonly ColumnBatchPart[], placement: ColumnBatchPlacement): void {
    if (id === '') throw new RangeError('ColumnScene.setBatch: batch id must not be empty');
    for (const [name, v] of Object.entries(placement)) {
      if (!Number.isFinite(v)) throw new RangeError(`ColumnScene.setBatch: "${id}" placement ${name} is not finite: ${v}`);
    }
    if (!(placement.cellM > 0) || !(placement.stepM > 0)) {
      throw new RangeError(`ColumnScene.setBatch: "${id}" cellM and stepM must be > 0, got ${placement.cellM} and ${placement.stepM}`);
    }
    let minSlab = Number.POSITIVE_INFINITY;
    let maxSlab = Number.NEGATIVE_INFINITY;
    let maxPx = 0;
    let maxPz = 0;
    let opaqueQuads = 0;
    let waterQuads = 0;
    for (const part of parts) {
      const { px, pz, slab, mesh } = part;
      if (!Number.isInteger(px) || !Number.isInteger(pz) || px < 0 || pz < 0 || px >= BATCH_MAX_PATCHES || pz >= BATCH_MAX_PATCHES) {
        throw new RangeError(`ColumnScene.setBatch: "${id}" patch (${px}, ${pz}) is outside 0..${BATCH_MAX_PATCHES - 1}`);
      }
      if (!Number.isInteger(slab)) throw new RangeError(`ColumnScene.setBatch: "${id}" slab must be an integer, got ${slab}`);
      const total = mesh.quads.length / QUAD_WORDS;
      if (!Number.isInteger(total) || mesh.opaqueCount < 0 || mesh.opaqueCount > total) {
        throw new RangeError(
          `ColumnScene.setBatch: "${id}" patch (${px}, ${pz}) has ${mesh.quads.length} words but opaqueCount ${mesh.opaqueCount}`,
        );
      }
      if (total === 0) continue;
      opaqueQuads += mesh.opaqueCount;
      waterQuads += total - mesh.opaqueCount;
      minSlab = Math.min(minSlab, slab);
      maxSlab = Math.max(maxSlab, slab);
      maxPx = Math.max(maxPx, px);
      maxPz = Math.max(maxPz, pz);
    }
    if (maxSlab - minSlab >= BATCH_MAX_SLABS) {
      throw new RangeError(`ColumnScene.setBatch: "${id}" spans slabs ${minSlab}..${maxSlab}, more than ${BATCH_MAX_SLABS}`);
    }
    this.removeBatch(id);
    const batch: Batch = {
      placement: { ...placement },
      baseYM: placement.originYM,
      opaque: null,
      water: null,
      quads: opaqueQuads + waterQuads,
      visible: true,
    };
    if (batch.quads > 0) {
      const opaque = new Uint32Array(opaqueQuads * QUAD_WORDS);
      const water = new Uint32Array(waterQuads * QUAD_WORDS);
      let o = 0;
      let w = 0;
      for (const { px, pz, slab, mesh } of parts) {
        const flags = ((px | (pz << 5) | ((slab - minSlab) << 10)) << 18) >>> 0;
        const q = mesh.quads;
        const split = mesh.opaqueCount * QUAD_WORDS;
        for (let i = 0; i < q.length; i += QUAD_WORDS) {
          const a = ((q[i] as number) | LOD_BIT) >>> 0;
          const b = (((q[i + 1] as number) & WORD1_KEEP) | flags) >>> 0;
          if (i < split) {
            opaque[o++] = a;
            opaque[o++] = b;
          } else {
            water[w++] = a;
            water[w++] = b;
          }
        }
      }
      // One sphere around everything the batch can hold, in cell and step units; three scales it with the mesh.
      const sx = (maxPx + 1) * N;
      const sy = (maxSlab - minSlab + 1) * N;
      const sz = (maxPz + 1) * N;
      // The mesh is scaled by (cellM, stepM, cellM) and three grows the radius by the largest of those,
      // so the local radius is the world half-diagonal divided by it.
      const radius =
        Math.hypot(sx * placement.cellM, sz * placement.cellM, sy * placement.stepM) / 2 / Math.max(placement.cellM, placement.stepM);
      const sphere = new Sphere(new Vector3(sx / 2, sy / 2, sz / 2), radius);
      batch.baseYM = placement.originYM + minSlab * N * placement.stepM;
      if (opaqueQuads > 0) batch.opaque = this.makeMesh(opaque, sphere, this.opaqueMaterial, LAYER_TERRAIN, this.terrain, placement);
      if (waterQuads > 0) batch.water = this.makeMesh(water, sphere, this.waterMaterial, LAYER_WATER, this.water, placement);
    }
    this.batches.set(id, batch);
    this.totalQuads += batch.quads;
    this.place(batch);
  }

  /** Returns true if the batch existed. */
  removeBatch(id: string): boolean {
    const batch = this.batches.get(id);
    if (batch === undefined) return false;
    for (const m of [batch.opaque, batch.water]) {
      if (m === null) continue;
      m.removeFromParent();
      m.geometry.dispose();
    }
    this.batches.delete(id);
    this.totalQuads -= batch.quads;
    return true;
  }

  /** Shows or hides a batch without freeing it. Returns true if the visibility changed. */
  setVisible(id: string, visible: boolean): boolean {
    const batch = this.batches.get(id);
    if (batch === undefined) throw new RangeError(`ColumnScene.setVisible: no batch "${id}"`);
    if (batch.visible === visible) return false;
    batch.visible = visible;
    for (const m of [batch.opaque, batch.water]) if (m !== null) m.visible = visible;
    return true;
  }

  isVisible(id: string): boolean {
    const batch = this.batches.get(id);
    if (batch === undefined) throw new RangeError(`ColumnScene.isVisible: no batch "${id}"`);
    return batch.visible;
  }

  /** Floating origin as a chunk coordinate, the same value the chunk scene uses. */
  setOrigin(cx: number, cy: number, cz: number): void {
    if (!Number.isInteger(cx) || !Number.isInteger(cy) || !Number.isInteger(cz)) {
      throw new RangeError(`ColumnScene.setOrigin: origin must be an integer chunk coordinate, got (${cx}, ${cy}, ${cz})`);
    }
    this.originX = cx * N;
    this.originY = cy * N;
    this.originZ = cz * N;
    for (const batch of this.batches.values()) this.place(batch);
  }

  dispose(): void {
    for (const id of [...this.batches.keys()]) this.removeBatch(id);
  }

  private makeMesh(words: Uint32Array, sphere: Sphere, material: Material, layer: number, parent: Group, p: ColumnBatchPlacement): Mesh {
    const m = new Mesh(geometry(words, sphere), material);
    m.layers.set(layer);
    m.matrixAutoUpdate = false;
    m.scale.set(p.cellM, p.stepM, p.cellM);
    parent.add(m);
    return m;
  }

  private place(batch: Batch): void {
    const p = batch.placement;
    for (const m of [batch.opaque, batch.water]) {
      if (m === null) continue;
      m.position.set(p.originXM - this.originX, batch.baseYM - this.originY, p.originZM - this.originZ);
      m.updateMatrix();
      m.matrixWorldNeedsUpdate = true;
    }
  }
}
