/**
 * Deterministic synthetic ColumnSource for tests and benches: value-noise hills, a sea plane and
 * box buildings on a lattice. Integer hashing plus exact float arithmetic only, so the output is
 * identical on every engine.
 */
import { ColumnUnit, hashCoords as coreHashCoords, Material, packColumnClass, SEA_LEVEL_M } from '@bayvox/core';
import type { ColumnSample, ColumnSource } from './column-source.ts';

// Module-level aliases keep the Vitest module runner's export getters out of hot loops.
const hashCoords = coreHashCoords;
const GRASS = Material.GRASS;
const BEACH_SAND = Material.BEACH_SAND;
const BUILDING_FIRST = Material.BUILDING_RESIDENTIAL;
const BUILDING_KINDS = Material.BUILDING_TRANSIT - Material.BUILDING_RESIDENTIAL + 1;
const U32 = 0x100000000;
// Geology by height band, so the default subsurface function yields several strata.
const CLASS_WATER = packColumnClass(ColumnUnit.WATER, 12);
const CLASS_MADE_LAND = packColumnClass(ColumnUnit.FILL_OVER_SAND, 15);
const CLASS_LOWLAND = packColumnClass(ColumnUnit.SAND, 10);
const CLASS_SLOPE = packColumnClass(ColumnUnit.ALLUVIUM, 4);
const CLASS_UPLAND = packColumnClass(ColumnUnit.ROCK, 0);

export interface SyntheticSourceOptions {
  seed: number;
  /** Lowest and highest ground height in metres. Defaults -12 and 48: about a fifth of the area is under water. */
  minHeightM?: number;
  maxHeightM?: number;
  /** Water plane height. Default SEA_LEVEL_M. */
  waterLevelM?: number;
  /** Edge of the square building lots in metres. Default 48. */
  lotSizeM?: number;
  /** Set false for bare terrain. Default true. */
  buildings?: boolean;
}

export class SyntheticColumnSource implements ColumnSource {
  readonly seed: number;
  private readonly minH: number;
  private readonly spanH: number;
  private readonly water: number;
  private readonly lot: number;
  private readonly withBuildings: boolean;

  constructor(options: SyntheticSourceOptions) {
    if (!Number.isSafeInteger(options.seed))
      throw new RangeError(`SyntheticColumnSource: seed must be a safe integer, got ${options.seed}`);
    const minH = options.minHeightM ?? -12;
    const maxH = options.maxHeightM ?? 48;
    if (!(maxH > minH) || !Number.isFinite(minH) || !Number.isFinite(maxH)) {
      throw new RangeError(`SyntheticColumnSource: need finite minHeightM < maxHeightM, got ${minH} and ${maxH}`);
    }
    const lot = options.lotSizeM ?? 48;
    if (!(lot >= 8) || !Number.isFinite(lot)) throw new RangeError(`SyntheticColumnSource: lotSizeM must be finite and >= 8, got ${lot}`);
    this.seed = options.seed | 0;
    this.minH = minH;
    this.spanH = maxH - minH;
    this.water = options.waterLevelM ?? SEA_LEVEL_M;
    this.lot = lot;
    this.withBuildings = options.buildings ?? true;
  }

  /** Ground height in metres at a world-metre position. */
  heightAt(xM: number, zM: number): number {
    // Two octaves of smooth value noise: 192 m hills plus 48 m bumps at a quarter of the amplitude.
    const n = 0.8 * valueNoise(xM / 192, zM / 192, this.seed) + 0.2 * valueNoise(xM / 48, zM / 48, this.seed ^ 0x5bd1e995);
    return this.minH + n * this.spanH;
  }

  sampleColumn(xM: number, zM: number, out: ColumnSample): void {
    const h = this.heightAt(xM, zM);
    const water = this.water;
    out.surfaceM = h;
    out.waterLevelM = water;
    out.surfaceMaterial = h < water ? 0 : h < water + 2 ? BEACH_SAND : GRASS;
    const above = h - water;
    out.columnClass =
      above < 0 ? CLASS_WATER : above < 6 ? CLASS_MADE_LAND : above < 20 ? CLASS_LOWLAND : above < 32 ? CLASS_SLOPE : CLASS_UPLAND;
    out.buildingMaterial = 0;
    out.buildingBaseM = 0;
    out.buildingTopM = 0;
    if (!this.withBuildings) return;

    const lot = this.lot;
    const lx = Math.floor(xM / lot);
    const lz = Math.floor(zM / lot);
    const h0 = hashCoords(lx, 1, lz, this.seed);
    if ((h0 & 3) === 0) return; // one lot in four stays empty
    const h1 = hashCoords(lx, 2, lz, this.seed);
    // Footprint: inset 3 m to (3 + lot / 4) m from each lot edge, so buildings never touch.
    const inset = lot / 4;
    const x0 = lx * lot + 3 + ((h0 >>> 2) & 0xff) * (inset / 256);
    const x1 = (lx + 1) * lot - 3 - ((h0 >>> 10) & 0xff) * (inset / 256);
    const z0 = lz * lot + 3 + ((h0 >>> 18) & 0xff) * (inset / 256);
    const z1 = (lz + 1) * lot - 3 - ((h1 >>> 2) & 0xff) * (inset / 256);
    if (xM < x0 || xM >= x1 || zM < z0 || zM >= z1) return;
    const centreH = this.heightAt((lx + 0.5) * lot, (lz + 0.5) * lot);
    if (centreH < water + 1) return; // no buildings in the water
    const heightM = 6 + ((h1 >>> 10) & 0x3f); // 6 to 69 m
    out.buildingMaterial = BUILDING_FIRST + ((h1 >>> 16) % BUILDING_KINDS);
    out.buildingBaseM = h;
    out.buildingTopM = centreH + heightM;
    out.surfaceMaterial = 0;
  }
}

/** Smooth value noise in [0, 1): bilinear blend of lattice hashes with a smoothstep fade. */
function valueNoise(x: number, z: number, seed: number): number {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const fx = x - xi;
  const fz = z - zi;
  const u = fx * fx * (3 - 2 * fx);
  const v = fz * fz * (3 - 2 * fz);
  const a = hashCoords(xi, 0, zi, seed) / U32;
  const b = hashCoords(xi + 1, 0, zi, seed) / U32;
  const c = hashCoords(xi, 0, zi + 1, seed) / U32;
  const d = hashCoords(xi + 1, 0, zi + 1, seed) / U32;
  const top = a + (b - a) * u;
  const bottom = c + (d - c) * u;
  return top + (bottom - top) * v;
}
