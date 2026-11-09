/** URL parameters of the app shell (doc 10 section 8.3). Unknown or malformed values fail loudly. */

export interface GameParams {
  /** Stops the wall clock: animation time is fixed and camera moves are instant. For stable screenshots. */
  freeze: boolean;
  seed: number;
  /** Synthetic world edge in chunks. */
  size: number;
  /** Streaming radius in chunks: the near field is (2 * radius)^2 chunk columns around the camera focus. */
  radius: number;
  /** Mesher workers. 0 runs the mesher on the main thread; undefined picks from hardwareConcurrency. */
  workers: number | undefined;
  hud: boolean;
  /** MSAA on the canvas. Off is much cheaper on software GL. */
  aa: boolean;
  /** Which world factory to use (see seam.ts): the real map data, or seeded synthetic terrain. */
  world: 'site' | 'synthetic';
  /** Cell size of the city LOD tier in metres (site world only). Coarser is cheaper. */
  detail: 4 | 8 | 16 | 32;
  /** Cell size of the far LOD tier in metres (site world only): the 64 m raster, or a coarsened copy. */
  far: 64 | 128 | 256 | 512;
  /** Index of the start bookmark. */
  cam: number;
}

function int(q: URLSearchParams, name: string, fallback: number, min: number, max: number): number {
  const raw = q.get(name);
  if (raw === null) return fallback;
  const v = Number(raw);
  if (raw.trim() === '' || !Number.isInteger(v) || v < min || v > max) {
    throw new RangeError(`URL parameter ${name}=${raw} must be an integer in [${min}, ${max}]`);
  }
  return v;
}

function flag(q: URLSearchParams, name: string, fallback: boolean): boolean {
  const raw = q.get(name);
  if (raw === null) return fallback;
  if (raw === '1' || raw === 'true') return true;
  if (raw === '0' || raw === 'false') return false;
  throw new RangeError(`URL parameter ${name}=${raw} must be 0 or 1`);
}

export function parseParams(search: string): GameParams {
  const q = new URLSearchParams(search);
  const world = q.get('world') ?? 'site';
  if (world !== 'site' && world !== 'synthetic') throw new RangeError(`URL parameter world=${world} must be site or synthetic`);
  const detail = int(q, 'detail', 4, 4, 32);
  if (detail !== 4 && detail !== 8 && detail !== 16 && detail !== 32) {
    throw new RangeError(`URL parameter detail=${detail} must be 4, 8, 16 or 32`);
  }
  const far = int(q, 'far', 64, 64, 512);
  if (far !== 64 && far !== 128 && far !== 256 && far !== 512) throw new RangeError(`URL parameter far=${far} must be 64, 128, 256 or 512`);
  return {
    freeze: flag(q, 'freeze', false),
    seed: int(q, 'seed', 1, 0, 0x7fffffff),
    size: int(q, 'size', 16, 2, 48),
    radius: int(q, 'radius', 8, 1, 24),
    workers: q.has('workers') ? int(q, 'workers', 0, 0, 6) : undefined,
    hud: flag(q, 'hud', true),
    aa: flag(q, 'aa', true),
    world,
    detail,
    far,
    cam: int(q, 'cam', 0, 0, 3),
  };
}
