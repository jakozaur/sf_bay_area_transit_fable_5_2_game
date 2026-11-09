/**
 * Scene graph for chunk meshes: one instanced draw per chunk for opaque quads and one for water.
 * No GL calls here (three uploads lazily on first draw), so this part runs under Node in unit tests.
 */
import { CHUNK_SIZE, type ChunkKey, type MeshOutput, QUAD_BYTES, QUAD_WORDS, unpackChunkKey } from '@bayvox/core';
import { BufferAttribute, Group, InstancedBufferAttribute, InstancedBufferGeometry, type Material, Mesh, Sphere, Vector3 } from 'three';

/** three layer ids: passes select what they draw by camera layer mask. */
export const LAYER_SKY = 0;
export const LAYER_TERRAIN = 1;
export const LAYER_WATER = 2;
export const LAYER_OVERLAY = 3;

/** Unit quad shared by every chunk geometry: corners (0,0) (1,0) (1,1) (0,1), two triangles. */
const QUAD_POSITIONS = new BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]), 3);
const QUAD_INDEX = new BufferAttribute(new Uint16Array([0, 1, 2, 0, 2, 3]), 1);
/** Bounding sphere of a whole chunk in chunk-local units; three culls each chunk mesh against the frustum with it. */
const CHUNK_SPHERE = new Sphere(new Vector3(CHUNK_SIZE / 2, CHUNK_SIZE / 2, CHUNK_SIZE / 2), (CHUNK_SIZE / 2) * Math.sqrt(3));

interface Entry {
  cx: number;
  cy: number;
  cz: number;
  opaque: Mesh | null;
  water: Mesh | null;
  quads: number;
}

function quadGeometry(words: Uint32Array): InstancedBufferGeometry {
  const g = new InstancedBufferGeometry();
  g.setIndex(QUAD_INDEX);
  g.setAttribute('position', QUAD_POSITIONS);
  // Uint32Array attributes are bound with vertexAttribIPointer, so the shader reads the packed words as uvec2.
  g.setAttribute('aQuad', new InstancedBufferAttribute(words, QUAD_WORDS));
  g.instanceCount = words.length / QUAD_WORDS;
  g.boundingSphere = CHUNK_SPHERE;
  return g;
}

export class ChunkScene {
  /** Opaque chunk meshes (LAYER_TERRAIN). */
  readonly terrain = new Group();
  /** Water chunk meshes (LAYER_WATER). */
  readonly water = new Group();
  private readonly entries = new Map<ChunkKey, Entry>();
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
    const e: Entry = { cx, cy, cz, opaque: null, water: null, quads: total };
    if (mesh.opaqueCount > 0) {
      e.opaque = this.makeMesh(mesh.quads.subarray(0, mesh.opaqueCount * QUAD_WORDS), this.opaqueMaterial, LAYER_TERRAIN, this.terrain);
    }
    if (total > mesh.opaqueCount) {
      e.water = this.makeMesh(mesh.quads.subarray(mesh.opaqueCount * QUAD_WORDS), this.waterMaterial, LAYER_WATER, this.water);
    }
    this.place(e);
    this.entries.set(mesh.key, e);
    this.totalQuads += total;
    if (total > 0) this.meshed++;
  }

  remove(key: ChunkKey): void {
    const e = this.entries.get(key);
    if (e === undefined) return;
    for (const m of [e.opaque, e.water]) {
      if (m === null) continue;
      m.removeFromParent();
      m.geometry.dispose();
    }
    this.entries.delete(key);
    this.totalQuads -= e.quads;
    if (e.quads > 0) this.meshed--;
  }

  /** Floating origin as a chunk coordinate. Every chunk mesh is repositioned relative to it. */
  setOrigin(cx: number, cy: number, cz: number): void {
    if (!Number.isInteger(cx) || !Number.isInteger(cy) || !Number.isInteger(cz)) {
      throw new RangeError(`ChunkScene.setOrigin: origin must be an integer chunk coordinate, got (${cx}, ${cy}, ${cz})`);
    }
    if (cx === this.origin.x && cy === this.origin.y && cz === this.origin.z) return;
    this.origin = { x: cx, y: cy, z: cz };
    for (const e of this.entries.values()) this.place(e);
  }

  dispose(): void {
    for (const key of [...this.entries.keys()]) this.remove(key);
  }

  private makeMesh(words: Uint32Array, material: Material, layer: number, parent: Group): Mesh {
    const m = new Mesh(quadGeometry(words), material);
    m.layers.set(layer);
    m.matrixAutoUpdate = false;
    parent.add(m);
    return m;
  }

  private place(e: Entry): void {
    // Small integers: exact in float32 for any chunk within 2^24 / 32 chunks of the origin.
    const x = (e.cx - this.origin.x) * CHUNK_SIZE;
    const y = (e.cy - this.origin.y) * CHUNK_SIZE;
    const z = (e.cz - this.origin.z) * CHUNK_SIZE;
    for (const m of [e.opaque, e.water]) {
      if (m === null) continue;
      m.position.set(x, y, z);
      m.updateMatrix();
      m.matrixWorldNeedsUpdate = true;
    }
  }
}
