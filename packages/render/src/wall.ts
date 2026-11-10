/**
 * One strip of cut-face wall quads with its material slice texture (slice.ts). The mesh sits at the strip's
 * anchor; its local y is the texture row, so row 0 is the lowest sampled voxel layer.
 */
import type { ChunkData, ChunkKey } from '@bayvox/core';
import {
  BufferAttribute,
  BufferGeometry,
  DataTexture,
  DoubleSide,
  type IUniform,
  Mesh,
  NearestFilter,
  RGFormat,
  ShaderMaterial,
  UnsignedByteType,
  Vector2,
} from 'three';
import { LAYER_OVERLAY } from './chunk-scene.ts';
import { WALL_FRAG, WALL_VERT } from './shaders.ts';
import { fillWallColumns, WALL_MAX_ROWS, type WallStrip } from './slice.ts';

/** Positions (x, row, z), column coordinates and indices of the quads of a strip extruded to `rows`. */
export function wallGeometryData(strip: WallStrip, rows: number): { positions: Float32Array; u: Float32Array; indices: Uint32Array } {
  const positions = new Float32Array(strip.quads * 12);
  const u = new Float32Array(strip.quads * 4);
  const indices = new Uint32Array(strip.quads * 6);
  for (let q = 0; q < strip.quads; q++) {
    const x0 = strip.vertexXZ[q * 4] as number;
    const z0 = strip.vertexXZ[q * 4 + 1] as number;
    const x1 = strip.vertexXZ[q * 4 + 2] as number;
    const z1 = strip.vertexXZ[q * 4 + 3] as number;
    positions.set([x0, 0, z0, x1, 0, z1, x1, rows, z1, x0, rows, z0], q * 12);
    const u0 = strip.vertexU[q * 2] as number;
    const u1 = strip.vertexU[q * 2 + 1] as number;
    u.set([u0, u1, u1, u0], q * 4);
    indices.set([q * 4, q * 4 + 1, q * 4 + 2, q * 4, q * 4 + 2, q * 4 + 3], q * 6);
  }
  return { positions, u, indices };
}

export class WallMesh {
  readonly mesh: Mesh;
  private readonly uniforms: Record<string, IUniform>;
  private texture: DataTexture | null = null;
  private data = new Uint8Array(0);
  private shapeKey = '';

  /** `shared` are the renderer's common uniforms (by reference); `forBox` selects which other cut region clips the wall. */
  constructor(shared: Record<string, IUniform>, forBox: boolean) {
    this.uniforms = { ...shared, uWallTex: { value: null }, uWallSize: { value: new Vector2(1, 1) }, uWallMetres: { value: 1 } };
    const material = new ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: WALL_VERT,
      fragmentShader: WALL_FRAG,
      side: DoubleSide,
      defines: forBox ? { FOR_BOX: '' } : {},
    });
    this.mesh = new Mesh(new BufferGeometry(), material);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.layers.set(LAYER_OVERLAY);
  }

  get bytes(): number {
    return this.data.byteLength;
  }

  /**
   * Resamples the strip from layer `y0` for `rows` layers and rebuilds the quads if their shape changed.
   * `shapeKey` names everything that defines the quads apart from the anchor (so a wall that only moves keeps its buffers).
   */
  update(world: { getChunk(key: ChunkKey): ChunkData | undefined }, strip: WallStrip, y0: number, rows: number, shapeKey: string): void {
    if (!Number.isInteger(rows) || rows < 1 || rows > WALL_MAX_ROWS)
      throw new RangeError(`WallMesh.update: rows must be in [1, ${WALL_MAX_ROWS}], got ${rows}`);
    const cols = strip.xs.length;
    if (this.texture === null || this.texture.image.width !== cols || this.texture.image.height !== rows) {
      this.texture?.dispose();
      this.data = new Uint8Array(cols * rows * 2);
      this.texture = new DataTexture(this.data, cols, rows, RGFormat, UnsignedByteType);
      this.texture.minFilter = NearestFilter;
      this.texture.magFilter = NearestFilter;
      this.texture.unpackAlignment = 1;
      this.uniforms.uWallTex.value = this.texture;
      (this.uniforms.uWallSize as IUniform<Vector2>).value.set(cols, rows);
    }
    fillWallColumns(world, strip.xs, strip.zs, y0, rows, this.data);
    this.texture.needsUpdate = true;
    this.uniforms.uWallMetres.value = strip.metresPerColumn;
    const key = `${shapeKey}|${rows}`;
    if (key !== this.shapeKey) {
      this.shapeKey = key;
      const g = wallGeometryData(strip, rows);
      this.mesh.geometry.dispose();
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new BufferAttribute(g.positions, 3));
      geometry.setAttribute('aU', new BufferAttribute(g.u, 1));
      geometry.setIndex(new BufferAttribute(g.indices, 1));
      this.mesh.geometry = geometry;
    }
  }

  dispose(): void {
    this.texture?.dispose();
    this.mesh.geometry.dispose();
    (this.mesh.material as ShaderMaterial).dispose();
  }
}
