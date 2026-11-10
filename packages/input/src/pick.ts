/** Screen ray construction and voxel ray casting (doc 03 section 7: CPU DDA against chunk data). */
import {
  type CameraState,
  FACE_NEG_X,
  FACE_NEG_Y,
  FACE_NEG_Z,
  FACE_POS_X,
  FACE_POS_Y,
  FACE_POS_Z,
  type GroundPick,
  MATERIALS,
  type VoxelCoord,
  type WorldPos,
  type WorldStore,
} from '@bayvox/core';

export interface Ray {
  origin: WorldPos;
  /** Unit length. */
  dir: WorldPos;
}

/**
 * Ray through a point of the viewport. ndcX and ndcY are in [-1, 1], +x right, +y up.
 * World up is +y; a camera looking exactly along y has no defined right vector and throws.
 */
export function screenRay(cam: CameraState, ndcX: number, ndcY: number): Ray {
  let fx = cam.target.x - cam.position.x;
  let fy = cam.target.y - cam.position.y;
  let fz = cam.target.z - cam.position.z;
  const fl = Math.hypot(fx, fy, fz);
  if (!(fl > 0)) throw new RangeError('screenRay: camera position equals target');
  fx /= fl;
  fy /= fl;
  fz /= fl;
  // right = forward x up(0, 1, 0)
  let rx = -fz;
  let rz = fx;
  const rl = Math.hypot(rx, rz);
  if (rl < 1e-9) throw new RangeError('screenRay: camera looks straight along the y axis');
  rx /= rl;
  rz /= rl;
  // up' = right x forward
  const ux = -rz * fy;
  const uy = rz * fx - rx * fz;
  const uz = rx * fy;
  const t = Math.tan((cam.fovYDeg * Math.PI) / 360);
  const sx = ndcX * t * cam.aspect;
  const sy = ndcY * t;
  const dx = fx + rx * sx + ux * sy;
  const dy = fy + uy * sy;
  const dz = fz + rz * sx + uz * sy;
  const dl = Math.hypot(dx, dy, dz);
  return { origin: { ...cam.position }, dir: { x: dx / dl, y: dy / dl, z: dz / dl } };
}

export interface PickHit {
  voxel: VoxelCoord;
  /** Face of the voxel the ray entered through (core face ids). */
  face: number;
  material: number;
  /** Metres from the ray origin to the entry point. */
  distance: number;
}

export interface PickOptions {
  /** Ray length limit in metres. Required: an unbounded ray over empty space never ends. */
  maxDistance: number;
  /** Mirrors the renderer's cut: voxels at or above `y` within `radius` of (x, z) are treated as empty. */
  cut?: { y: number; x: number; z: number; radius: number };
  /** Which materials stop the ray. Default: solid materials (not AIR, not WATER). */
  pickable?: (material: number) => boolean;
  /**
   * Vertical extent of the voxel data: every voxel with y >= maxY, or y < minY, is known to be empty.
   * The ray then starts where it enters that slab and stops where it leaves it, so a pick from the regional
   * view (camera 100 km away) walks a few thousand voxels instead of a hundred thousand. The result is the same.
   */
  maxY?: number;
  minY?: number;
}

/** Pick range that covers the whole-Bay view: the rig's farthest zoom (150 km) at its flattest pitch, with margin. */
export const REGIONAL_PICK_RANGE_M = 400_000;

const SOLID = Uint8Array.from(MATERIALS, (m) => (m.solid ? 1 : 0));
function defaultPickable(material: number): boolean {
  return SOLID[material] === 1;
}

/**
 * Walks the voxel grid along the ray (Amanatides and Woo) and returns the first pickable voxel.
 * Voxel (x, y, z) covers [x, x+1) on each axis, one unit is one metre.
 */
export function pickVoxel(world: Pick<WorldStore, 'getVoxel'>, ray: Ray, opts: PickOptions): PickHit | null {
  const { origin: o, dir: d } = ray;
  if (!(opts.maxDistance > 0) || !Number.isFinite(opts.maxDistance)) {
    throw new RangeError(`pickVoxel: maxDistance must be a positive finite number, got ${opts.maxDistance}`);
  }
  const { minY, maxY } = opts;
  if (minY !== undefined && maxY !== undefined && !(maxY > minY)) {
    throw new RangeError(`pickVoxel: need minY < maxY, got ${minY} and ${maxY}`);
  }
  // Skip the empty space above (or below) the data slab analytically.
  let skip = 0;
  if (maxY !== undefined && o.y > maxY) {
    if (!(d.y < 0)) return null;
    skip = (maxY - o.y) / d.y;
  } else if (minY !== undefined && o.y < minY) {
    if (!(d.y > 0)) return null;
    skip = (minY - o.y) / d.y;
  }
  if (skip > 0) {
    if (skip > opts.maxDistance) return null;
    // Land a hair inside the slab so the start voxel is the first data voxel, whatever the rounding.
    const inside = skip + 1e-6;
    const start: Ray = { origin: { x: o.x + d.x * inside, y: o.y + d.y * inside, z: o.z + d.z * inside }, dir: d };
    const hit = pickVoxel(world, start, { ...opts, maxDistance: Math.max(1e-6, opts.maxDistance - inside) });
    if (hit === null) return null;
    // A voxel hit at distance 0 of the clipped ray was entered through the slab face, not along the dominant axis.
    if (hit.distance === 0) hit.face = d.y < 0 ? FACE_POS_Y : FACE_NEG_Y;
    hit.distance += inside;
    return hit;
  }
  const pickable = opts.pickable ?? defaultPickable;
  const cut = opts.cut;
  const cutR2 = cut ? cut.radius * cut.radius : 0;
  const v: VoxelCoord = { x: Math.floor(o.x), y: Math.floor(o.y), z: Math.floor(o.z) };
  const stepX = d.x > 0 ? 1 : -1;
  const stepY = d.y > 0 ? 1 : -1;
  const stepZ = d.z > 0 ? 1 : -1;
  const invX = d.x !== 0 ? Math.abs(1 / d.x) : Infinity;
  const invY = d.y !== 0 ? Math.abs(1 / d.y) : Infinity;
  const invZ = d.z !== 0 ? Math.abs(1 / d.z) : Infinity;
  let tMaxX = d.x !== 0 ? (d.x > 0 ? v.x + 1 - o.x : o.x - v.x) * invX : Infinity;
  let tMaxY = d.y !== 0 ? (d.y > 0 ? v.y + 1 - o.y : o.y - v.y) * invY : Infinity;
  let tMaxZ = d.z !== 0 ? (d.z > 0 ? v.z + 1 - o.z : o.z - v.z) * invZ : Infinity;
  // Entry face of the start voxel: the one facing back along the dominant ray axis.
  const ax = Math.abs(d.x);
  const ay = Math.abs(d.y);
  const az = Math.abs(d.z);
  let face =
    ax >= ay && ax >= az
      ? d.x > 0
        ? FACE_NEG_X
        : FACE_POS_X
      : ay >= az
        ? d.y > 0
          ? FACE_NEG_Y
          : FACE_POS_Y
        : d.z > 0
          ? FACE_NEG_Z
          : FACE_POS_Z;
  let t = 0;
  while (t <= opts.maxDistance) {
    if ((maxY !== undefined && v.y >= maxY && stepY > 0) || (minY !== undefined && v.y < minY && stepY < 0)) return null;
    const m = world.getVoxel(v);
    if (pickable(m)) {
      let hidden = false;
      if (cut !== undefined && v.y >= cut.y) {
        const cx = v.x + 0.5 - cut.x;
        const cz = v.z + 0.5 - cut.z;
        hidden = cx * cx + cz * cz < cutR2;
      }
      if (!hidden) return { voxel: { x: v.x, y: v.y, z: v.z }, face, material: m, distance: t };
    }
    if (tMaxX <= tMaxY && tMaxX <= tMaxZ) {
      v.x += stepX;
      t = tMaxX;
      tMaxX += invX;
      face = stepX > 0 ? FACE_NEG_X : FACE_POS_X;
    } else if (tMaxY <= tMaxZ) {
      v.y += stepY;
      t = tMaxY;
      tMaxY += invY;
      face = stepY > 0 ? FACE_NEG_Y : FACE_POS_Y;
    } else {
      v.z += stepZ;
      t = tMaxZ;
      tMaxZ += invZ;
      face = stepZ > 0 ? FACE_NEG_Z : FACE_POS_Z;
    }
  }
  return null;
}

export interface GroundPickOptions extends Omit<PickOptions, 'maxDistance'> {
  /** Default REGIONAL_PICK_RANGE_M, so the cursor finds the ground from the whole-Bay view too. */
  maxDistance?: number;
  /** Surface elevation of a column, for GroundPick.groundY. Default: the top of the hit voxel. */
  groundAt?: (x: number, z: number) => number;
}

/**
 * The pick behind WorldPort.pick: first solid voxel under a canvas position, with the entry point in world metres.
 * `x` and `y` are CSS pixels relative to a canvas of `width` by `height`.
 */
export function pickGround(
  world: Pick<WorldStore, 'getVoxel'>,
  cam: CameraState,
  x: number,
  y: number,
  width: number,
  height: number,
  opts: GroundPickOptions = {},
): GroundPick | null {
  if (!(width > 0) || !(height > 0)) throw new RangeError(`pickGround: canvas size must be positive, got ${width} x ${height}`);
  const ray = screenRay(cam, (x / width) * 2 - 1, 1 - (y / height) * 2);
  const hit = pickVoxel(world, ray, { ...opts, maxDistance: opts.maxDistance ?? REGIONAL_PICK_RANGE_M });
  if (hit === null) return null;
  const point = {
    x: ray.origin.x + ray.dir.x * hit.distance,
    y: ray.origin.y + ray.dir.y * hit.distance,
    z: ray.origin.z + ray.dir.z * hit.distance,
  };
  const groundY = opts.groundAt === undefined ? hit.voxel.y + 1 : opts.groundAt(point.x, point.z);
  return { voxel: hit.voxel, face: hit.face, material: hit.material, point, groundY };
}
