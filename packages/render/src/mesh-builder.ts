/**
 * Box-built meshes: every entity model (machine, train, station, pit, ring, track) is a pile of axis-aligned
 * or z-rotated boxes with flat colours, which is what keeps them in the voxel look. Pure typed arrays here;
 * models.ts composes them and entities.ts turns them into three geometries.
 */

export interface MeshData {
  positions: Float32Array;
  normals: Float32Array;
  /** Linear RGB per vertex (three's working colour space). */
  colors: Float32Array;
  indices: Uint32Array;
  /** Boxes that went in. */
  boxes: number;
  min: [number, number, number];
  max: [number, number, number];
}

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** 0xRRGGBB (sRGB) to linear RGB in 0..1. */
export function hexToLinear(hex: number): [number, number, number] {
  return [srgbToLinear(((hex >> 16) & 255) / 255), srgbToLinear(((hex >> 8) & 255) / 255), srgbToLinear((hex & 255) / 255)];
}

/** Multiplies the channels of a 0xRRGGBB colour, clamped. */
export function shade(hex: number, factor: number): number {
  const ch = (v: number): number => Math.max(0, Math.min(255, Math.round(v * factor)));
  return (ch((hex >> 16) & 255) << 16) | (ch((hex >> 8) & 255) << 8) | ch(hex & 255);
}

// Corner signs of the 6 faces, counter-clockwise seen from outside: +x, -x, +y, -y, +z, -z.
const FACES: readonly { n: readonly [number, number, number]; c: readonly (readonly [number, number, number])[] }[] = [
  {
    n: [1, 0, 0],
    c: [
      [1, -1, 1],
      [1, -1, -1],
      [1, 1, -1],
      [1, 1, 1],
    ],
  },
  {
    n: [-1, 0, 0],
    c: [
      [-1, -1, -1],
      [-1, -1, 1],
      [-1, 1, 1],
      [-1, 1, -1],
    ],
  },
  {
    n: [0, 1, 0],
    c: [
      [-1, 1, 1],
      [1, 1, 1],
      [1, 1, -1],
      [-1, 1, -1],
    ],
  },
  {
    n: [0, -1, 0],
    c: [
      [-1, -1, -1],
      [1, -1, -1],
      [1, -1, 1],
      [-1, -1, 1],
    ],
  },
  {
    n: [0, 0, 1],
    c: [
      [-1, -1, 1],
      [1, -1, 1],
      [1, 1, 1],
      [-1, 1, 1],
    ],
  },
  {
    n: [0, 0, -1],
    c: [
      [1, -1, -1],
      [-1, -1, -1],
      [-1, 1, -1],
      [1, 1, -1],
    ],
  },
];

export class MeshBuilder {
  private readonly pos: number[] = [];
  private readonly nor: number[] = [];
  private readonly col: number[] = [];
  private readonly idx: number[] = [];
  private count = 0;

  get boxes(): number {
    return this.count;
  }

  /**
   * Adds a box by centre and full size. `rotZ` (radians) rotates the finished box about the z axis through the
   * origin, which is how ring segments and cutterhead spokes are placed around a tunnel axis.
   */
  box(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, color: number, rotZ = 0): this {
    if (!(sx > 0) || !(sy > 0) || !(sz > 0) || !Number.isFinite(cx + cy + cz + sx + sy + sz + rotZ)) {
      throw new RangeError(`MeshBuilder.box: bad box centre (${cx}, ${cy}, ${cz}) size (${sx}, ${sy}, ${sz}) rotZ ${rotZ}`);
    }
    const [r, g, b] = hexToLinear(color);
    const c = Math.cos(rotZ);
    const s = Math.sin(rotZ);
    for (const face of FACES) {
      const base = this.pos.length / 3;
      for (const k of face.c) {
        const x = cx + (k[0] * sx) / 2;
        const y = cy + (k[1] * sy) / 2;
        this.pos.push(x * c - y * s, x * s + y * c, cz + (k[2] * sz) / 2);
        this.nor.push(face.n[0] * c - face.n[1] * s, face.n[0] * s + face.n[1] * c, face.n[2]);
        this.col.push(r, g, b);
      }
      this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    this.count++;
    return this;
  }

  /** Box by its minimum and maximum corner. */
  span(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: number): this {
    return this.box((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0, color);
  }

  /**
   * A cylinder along z built from rows of boxes (a voxelised disc extruded from z0 to z1). `colorAt` picks the
   * colour of each row from its height.
   */
  discZ(radius: number, cell: number, z0: number, z1: number, colorAt: (y: number) => number, cy = 0): this {
    for (const row of discRows(radius, cell)) {
      this.box(0, cy + row.y, (z0 + z1) / 2, row.halfWidth * 2, row.height, Math.abs(z1 - z0), colorAt(row.y));
    }
    return this;
  }

  build(): MeshData {
    if (this.count === 0) throw new RangeError('MeshBuilder.build: no boxes');
    const positions = new Float32Array(this.pos);
    const min: [number, number, number] = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
    const max: [number, number, number] = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
    for (let i = 0; i < positions.length; i += 3) {
      for (let a = 0; a < 3; a++) {
        const v = positions[i + a] as number;
        if (v < (min[a] as number)) min[a] = v;
        if (v > (max[a] as number)) max[a] = v;
      }
    }
    return {
      positions,
      normals: new Float32Array(this.nor),
      colors: new Float32Array(this.col),
      indices: new Uint32Array(this.idx),
      boxes: this.count,
      min,
      max,
    };
  }
}

/** Rows of a voxelised disc: about one per `cell` of height, each nearly as wide as the circle there (at least one cell). */
export function discRows(radius: number, cell: number): { y: number; halfWidth: number; height: number }[] {
  if (!(radius > 0) || !(cell > 0)) throw new RangeError(`discRows: radius and cell must be > 0, got ${radius} and ${cell}`);
  const n = Math.max(1, Math.round((2 * radius) / cell));
  const h = (2 * radius) / n;
  const rows: { y: number; halfWidth: number; height: number }[] = [];
  for (let j = 0; j < n; j++) {
    const y = -radius + (j + 0.5) * h;
    // Width of the circle a quarter of a row out from the row's centre: corners stay within a few percent of the radius.
    const edge = Math.abs(y) + h / 4;
    const half = Math.sqrt(Math.max(0, radius * radius - edge * edge));
    rows.push({ y, halfWidth: Math.max(h / 2, half), height: h });
  }
  return rows;
}
