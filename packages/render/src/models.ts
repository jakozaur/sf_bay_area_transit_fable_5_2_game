/**
 * Entity models as box meshes (mesh-builder.ts). Local frame of every model: z along the direction of travel
 * or the track, x to the left of travel, y up. Pure functions of their parameters, no three.
 *
 * Vertical convention (the scene's "track axis" is the bore centre, see core entities.ts): top of rail is
 * RAIL_DROP_M below the axis in every lined tunnel and underground station, so a train centred on the axis
 * fits a 6.6 m bore. At grade (lining 'none', surface and elevated stations) the axis is the top of rail.
 */
import { ENTITY_COLORS, type StationStyle } from '@bayvox/core';
import { MeshBuilder, type MeshData, shade } from './mesh-builder.ts';

/** Top of rail below the bore centre, metres. */
export const RAIL_DROP_M = 2;
/** Platform surface above top of rail, metres. */
export const PLATFORM_ABOVE_RAIL_M = 1;
/** A bore at least this wide carries two tracks side by side. */
export const TWO_TRACK_MIN_RADIUS_M = 5.2;
/** Half the distance between the two tracks of a wide bore or a station, metres. */
export const TRACK_HALF_SPACING_M = 2.2;
/** Length of one track panel (instanced along the tunnel), metres. */
export const TRACK_PANEL_M = 3;
/** Length of the shield and of the whole machine in tunnel radii and metres: what the follow cutaway must uncover. */
export const TBM_SHIELD_LENGTH_M = 11.5;
export const TBM_LENGTH_M = 60;

const C = {
  concrete: ENTITY_COLORS.lining,
  concreteDark: shade(ENTITY_COLORS.lining, 0.82),
  shotcrete: 0x8f8c84,
  rail: 0x8a8f96,
  sleeper: 0x6e675d,
  slab: 0x9a9892,
  ballast: ENTITY_COLORS.track,
  steel: 0x5a5f66,
  steelDark: 0x3a3e44,
  tbm: ENTITY_COLORS.tbm,
  white: 0xf2f2ee,
  cutter: 0xf08a24,
  bit: 0xe9e9e4,
  hub: 0xb5332b,
  gantryA: 0x4f6d8f,
  gantryB: 0x6f8296,
  green: 0x3f8f5f,
  belt: 0x2c2c2e,
  train: ENTITY_COLORS.train,
  glass: 0x1f2a36,
  lamp: 0xfff3c4,
  platform: 0xd2d1c8,
  warning: 0xf2c230,
  sign: ENTITY_COLORS.station,
  pit: ENTITY_COLORS.pit,
  pile: shade(ENTITY_COLORS.pit, 0.78),
  crane: 0xf2b01e,
} as const;

// ---------------------------------------------------------------- lining and track

/** Segments per lining ring. The lower `RING_LOWER_SEGMENTS` (the invert and haunches) stay visible in the cutaway. */
export const RING_SEGMENTS = 10;
export const RING_LOWER_SEGMENTS = 4;

/**
 * One lining ring, split so the upper part can be hidden while a machine is followed: `lower` is the invert
 * up to about a third of the bore height, `upper` the crown. The ring occupies z in [0, lengthM].
 * 'ring' is a segmental ring with a key segment; 'arch' the same shape in sprayed concrete, without joints.
 */
export function buildRing(radiusM: number, lengthM: number, lining: 'ring' | 'arch'): { lower: MeshData; upper: MeshData } {
  if (!(radiusM > 0.5) || !(lengthM > 0)) throw new RangeError(`buildRing: bad radius ${radiusM} m or length ${lengthM} m`);
  const t = Math.min(0.6, Math.max(0.3, radiusM * 0.1));
  // Inscribed in the bore: the outer corners of every segment touch the excavated radius, nothing pokes into the ground.
  const mid = radiusM * Math.cos(Math.PI / RING_SEGMENTS) - t / 2;
  const w = 2 * radiusM * Math.sin(Math.PI / RING_SEGMENTS);
  const depth = lining === 'ring' ? lengthM * 0.92 : lengthM;
  const lower = new MeshBuilder();
  const upper = new MeshBuilder();
  const step = (2 * Math.PI) / RING_SEGMENTS;
  for (let k = 0; k < RING_SEGMENTS; k++) {
    // Angle 0 is the invert; the box starts below the axis and is rotated into place.
    const a = (k + 0.5) * step;
    const isLower = Math.cos(a) > 0.2;
    const base = lining === 'ring' ? C.concrete : C.shotcrete;
    // The key segment sits near the crown, a shade darker, so rings read as built from pieces.
    const color = lining === 'ring' && k === RING_SEGMENTS / 2 ? C.concreteDark : k % 2 === 0 ? base : shade(base, 0.94);
    (isLower ? lower : upper).box(0, -mid, lengthM / 2, w, t, depth, color, a);
  }
  return { lower: lower.build(), upper: upper.build() };
}

/** One frame of a cut-and-cover box tunnel: floor, walls (lower) and roof (upper). `radiusM` is half the box width. */
export function buildBoxFrame(radiusM: number, lengthM: number): { lower: MeshData; upper: MeshData } {
  if (!(radiusM > 1) || !(lengthM > 0)) throw new RangeError(`buildBoxFrame: bad half width ${radiusM} m or length ${lengthM} m`);
  const t = 0.6;
  const floor = -RAIL_DROP_M - 0.6;
  const roof = floor + 6.4;
  const lower = new MeshBuilder();
  lower.span(-radiusM, floor - t, 0, radiusM, floor, lengthM, C.slab);
  lower.span(-radiusM, floor, 0, -radiusM + t, floor + 2.2, lengthM * 0.96, C.concrete);
  lower.span(radiusM - t, floor, 0, radiusM, floor + 2.2, lengthM * 0.96, C.concrete);
  const upper = new MeshBuilder();
  upper.span(-radiusM, floor + 2.2, 0, -radiusM + t, roof, lengthM * 0.96, C.concrete);
  upper.span(radiusM - t, floor + 2.2, 0, radiusM, roof, lengthM * 0.96, C.concrete);
  upper.span(-radiusM, roof, 0, radiusM, roof + t, lengthM * 0.96, C.concreteDark);
  return { lower: lower.build(), upper: upper.build() };
}

/** Lateral positions of the tracks inside one tube, metres to the left of the tube axis. */
export function trackOffsets(radiusM: number): number[] {
  return radiusM >= TWO_TRACK_MIN_RADIUS_M ? [-TRACK_HALF_SPACING_M, TRACK_HALF_SPACING_M] : [0];
}

function addTrack(b: MeshBuilder, x: number, railY: number, z0: number, z1: number, sleeperEveryM: number): void {
  for (const side of [-0.7175, 0.7175]) b.span(x + side - 0.07, railY - 0.16, z0, x + side + 0.07, railY, z1, C.rail);
  const n = Math.max(1, Math.round((z1 - z0) / sleeperEveryM));
  const pitch = (z1 - z0) / n;
  for (let i = 0; i < n; i++) {
    const z = z0 + (i + 0.5) * pitch;
    b.span(x - 1.25, railY - 0.3, z - 0.14, x + 1.25, railY - 0.16, z + 0.14, C.sleeper);
  }
}

/**
 * One panel of track for a tube: invert fill, sleepers and rails, occupying z in [0, TRACK_PANEL_M].
 * In a lined tube the rails sit RAIL_DROP_M below the axis on a concrete invert; at grade ('none') they sit
 * on the axis on a ballast bed.
 */
export function buildTrackPanel(radiusM: number, lining: 'ring' | 'arch' | 'box' | 'none'): MeshData {
  const b = new MeshBuilder();
  const len = TRACK_PANEL_M;
  if (lining === 'none') {
    b.span(-1.7, -0.55, 0, 1.7, -0.3, len, C.ballast);
    addTrack(b, 0, 0, 0, len, 0.75);
    return b.build();
  }
  const railY = -RAIL_DROP_M;
  const top = railY - 0.3;
  if (lining === 'box') {
    for (const x of trackOffsets(radiusM)) addTrack(b, x, railY, 0, len, 0.75);
    return b.build();
  }
  if (!(radiusM > RAIL_DROP_M + 0.6)) throw new RangeError(`buildTrackPanel: a ${radiusM} m radius bore is too small for track`);
  // Invert fill in two steps so it follows the bore: the chord at the slab top and a narrower one near the bottom.
  const inner = radiusM - Math.min(0.6, Math.max(0.3, radiusM * 0.1));
  const halfTop = Math.sqrt(Math.max(0.25, inner * inner - top * top));
  const lowY = (top - inner) / 2;
  const halfLow = Math.sqrt(Math.max(0.16, inner * inner - lowY * lowY));
  b.span(-halfTop, lowY, 0, halfTop, top, len, C.slab);
  if (-inner + 0.05 < lowY) b.span(-halfLow, -inner + 0.05, 0, halfLow, lowY, len, shade(C.slab, 0.9));
  for (const x of trackOffsets(radiusM)) addTrack(b, x, railY, 0, len, 0.75);
  return b.build();
}

// ---------------------------------------------------------------- tunnelling machine

/**
 * A tunnel boring machine for one tube. `head` is the cutterhead (spun about z by the layer), `body` the shield,
 * tail skin and trailing gantry. Origin: centre of the cutterhead face; everything extends towards -z.
 */
export function buildTbm(radiusM: number): { head: MeshData; body: MeshData } {
  if (!(radiusM > 1)) throw new RangeError(`buildTbm: radius must be > 1 m, got ${radiusM}`);
  const r = radiusM;
  const cell = r / 5;

  const head = new MeshBuilder();
  // Back plate of the wheel.
  head.discZ(r * 0.99, cell, -0.75, -0.3, () => C.steel);
  // Four main spokes and four short ones, with cutter bits standing proud: this is what makes the spin readable.
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    const main = k % 2 === 0;
    const len = main ? r * 0.92 : r * 0.55;
    const start = main ? r * 0.06 : r * 0.38;
    head.box(0, -(start + len / 2), -0.2, r * (main ? 0.2 : 0.14), len, 0.3, main ? C.cutter : shade(C.cutter, 0.8), a);
    const bits = main ? 5 : 3;
    for (let i = 0; i < bits; i++) {
      head.box(0, -(start + ((i + 0.6) * len) / bits), -0.04, r * 0.11, r * 0.09, 0.14, C.bit, a);
    }
  }
  // Gauge ring and hub.
  for (let k = 0; k < 16; k++) head.box(0, -r * 0.95, -0.25, r * 0.4, r * 0.1, 0.4, C.steelDark, (k * Math.PI) / 8);
  head.box(0, 0, -0.08, r * 0.3, r * 0.3, 0.3, C.hub);

  const body = new MeshBuilder();
  const tail = -TBM_SHIELD_LENGTH_M;
  // Shield: yellow front, dark articulation joint, white tail skin.
  body.discZ(r * 0.97, cell, -0.8, -4.6, (y) => (y > r * 0.55 ? shade(C.tbm, 1.06) : C.tbm));
  body.discZ(r * 0.9, cell, -4.6, -5.2, () => C.steelDark);
  body.discZ(r * 0.97, cell, -5.2, -8.6, (y) => (Math.abs(y) < cell * 0.6 ? C.steelDark : C.white));
  body.discZ(r * 0.93, cell, -8.6, tail, () => shade(C.white, 0.86));
  // Trailing gantry: decks on wheels above the rails, equipment on top, a conveyor running the whole length.
  const deckY = -RAIL_DROP_M + 0.55;
  const cars = 5;
  const carLen = (TBM_LENGTH_M - TBM_SHIELD_LENGTH_M - 1.5) / cars - 1;
  const hw = Math.min(r * 0.52, 2.1);
  const top = Math.min(r * 0.55, 2.4);
  for (let i = 0; i < cars; i++) {
    const z1 = tail - 1.5 - i * (carLen + 1);
    const z0 = z1 - carLen;
    const frame = i % 2 === 0 ? C.gantryA : C.gantryB;
    body.span(-hw, deckY, z0, hw, deckY + 0.25, z1, C.steelDark);
    for (const z of [z0 + 1.2, z1 - 1.2]) {
      body.span(-hw, deckY - 0.55, z - 0.45, -hw + 0.35, deckY, z + 0.45, C.steelDark);
      body.span(hw - 0.35, deckY - 0.55, z - 0.45, hw, deckY, z + 0.45, C.steelDark);
    }
    // Portal frames at both ends of the car, side rails between them.
    for (const z of [z0 + 0.2, z1 - 0.2]) {
      body.span(-hw, deckY + 0.25, z - 0.2, -hw + 0.3, top, z + 0.2, frame);
      body.span(hw - 0.3, deckY + 0.25, z - 0.2, hw, top, z + 0.2, frame);
      body.span(-hw, top - 0.3, z - 0.2, hw, top, z + 0.2, frame);
    }
    body.span(-hw, top - 0.2, z0, -hw + 0.2, top, z1, C.tbm);
    body.span(hw - 0.2, top - 0.2, z0, hw, top, z1, C.tbm);
    // Equipment: a different load on every car (control cabin, transformer, grout tanks, cable reel, ventilation).
    const mid = (z0 + z1) / 2;
    const base = deckY + 0.25;
    if (i === 0) {
      body.span(-hw + 0.4, base, mid - 2.4, 0, base + 1.9, mid + 2.4, C.white);
      body.span(-hw + 0.38, base + 0.9, mid - 2.0, -hw + 0.42, base + 1.6, mid + 2.0, C.glass);
      body.span(0.4, base, mid - 1.5, hw - 0.4, base + 1.2, mid + 1.5, C.green);
    } else if (i === 1) {
      body.span(-hw + 0.4, base, mid - 2.6, hw - 0.4, base + 1.5, mid - 0.4, C.green);
      body.span(-hw + 0.5, base, mid + 0.4, hw - 0.5, base + 1.1, mid + 2.8, C.steel);
    } else if (i === 2) {
      for (const z of [mid - 2.2, mid, mid + 2.2]) body.span(-0.9, base, z - 0.8, 0.9, base + 1.6, z + 0.8, C.white);
    } else if (i === 3) {
      body.span(-hw + 0.5, base, mid - 1.6, hw - 0.5, base + 1.8, mid + 1.6, C.cutter);
      body.span(-hw + 0.3, base + 0.6, mid - 0.4, hw - 0.3, base + 1.2, mid + 0.4, C.steelDark);
    } else {
      body.span(-0.8, base, mid - 2.5, 0.8, base + 1.3, mid + 2.5, C.gantryB);
      body.span(-0.5, base + 1.3, z0 + 0.5, 0.5, base + 1.9, z0 + 1.6, C.steel);
    }
  }
  // Conveyor from the shield to the last car.
  body.span(-0.45, top, -TBM_LENGTH_M + 1, 0.45, top + 0.3, -7.5, C.belt);
  // Work lamps on the tail skin.
  for (const x of [-r * 0.5, r * 0.5]) body.span(x - 0.3, r * 0.45, tail - 0.3, x + 0.3, r * 0.45 + 0.4, tail, C.lamp);
  return { head: head.build(), body: body.build() };
}

/** A surface heading (track gang, viaduct crew): a track machine standing on the rails. Origin on the rails at its front. */
export function buildSurfaceRig(): MeshData {
  const b = new MeshBuilder();
  b.span(-1.4, 0.5, -11, 1.4, 1.1, 0, C.steelDark);
  b.span(-1.35, 1.1, -10.5, 1.35, 3.3, -6.5, C.tbm);
  b.span(-1.37, 2.1, -10.2, 1.37, 2.9, -6.8, C.glass);
  b.span(-1.1, 1.1, -6, 1.1, 2.2, -0.6, C.cutter);
  b.span(-0.3, 2.2, -5, 0.3, 4.4, -4.4, C.steel);
  b.span(-0.3, 4.1, -5, 0.3, 4.4, 1.5, C.steel);
  for (const z of [-9, -2]) {
    b.span(-1.3, 0, z - 0.9, -0.9, 0.5, z + 0.9, C.steelDark);
    b.span(0.9, 0, z - 0.9, 1.3, 0.5, z + 0.9, C.steelDark);
  }
  return b.build();
}

// ---------------------------------------------------------------- train

/**
 * One EMU car. Origin: centre of the car at top of rail. A cab car has its nose towards +z; the layer turns
 * the last car round. Width 2.9 m, roof at 3.75 m.
 */
export function buildTrainCar(lengthM: number, cab: boolean): MeshData {
  if (!(lengthM >= 8)) throw new RangeError(`buildTrainCar: car length must be >= 8 m, got ${lengthM}`);
  const b = new MeshBuilder();
  const hl = lengthM / 2 - 0.25;
  const hw = 1.45;
  const nose = cab ? 2.4 : 0;
  const z1 = hl - nose;
  // Underframe, bogies.
  b.span(-1.2, 0.35, -hl, 1.2, 0.6, hl, C.steelDark);
  for (const z of [-hl * 0.62, hl * 0.62]) {
    b.span(-1.25, 0.05, z - 1.3, 1.25, 0.5, z + 1.3, C.steelDark);
    for (const w of [-0.9, 0.9]) {
      b.span(-1.3, 0, z + w - 0.42, -1.05, 0.84, z + w + 0.42, C.steel);
      b.span(1.05, 0, z + w - 0.42, 1.3, 0.84, z + w + 0.42, C.steel);
    }
  }
  // Body: red below the windows, white band above, grey roof.
  b.span(-hw, 0.6, -hl, hw, 1.55, z1, C.train);
  b.span(-hw, 1.55, -hl, hw, 2.65, z1, C.white);
  b.span(-hw, 2.65, -hl, hw, 3.45, z1, C.train);
  // Dark red roof with pale equipment boxes: seen from above (the usual view) a train must not read as concrete.
  b.span(-hw + 0.15, 3.45, -hl + 0.2, hw - 0.15, 3.75, z1 - 0.2, shade(C.train, 0.72));
  for (const z of [-hl * 0.45, hl * 0.3]) b.span(-0.8, 3.75, z - 1.6, 0.8, 4.0, z + 1.6, 0xd9dde1);
  // Window band with doors, both sides.
  const doors = [-hl * 0.72, -hl * 0.2, cab ? hl * 0.28 : hl * 0.2, cab ? Number.NaN : hl * 0.72].filter(Number.isFinite);
  for (const side of [-1, 1]) {
    const x0 = side * hw;
    const x1 = side * (hw + 0.04);
    b.span(Math.min(x0, x1), 1.7, -hl + 0.6, Math.max(x0, x1), 2.55, z1 - 0.6, C.glass);
    for (const z of doors) {
      b.span(Math.min(x0, side * (hw + 0.07)), 0.7, z - 0.7, Math.max(x0, side * (hw + 0.07)), 2.75, z + 0.7, 0xc9ccd0);
      b.span(Math.min(x0, side * (hw + 0.09)), 1.75, z - 0.5, Math.max(x0, side * (hw + 0.09)), 2.5, z + 0.5, C.glass);
    }
  }
  if (cab) {
    // Stepped nose: three slices, each lower and narrower, with the windscreen and the lamps on the front.
    b.span(-hw, 0.6, z1, hw, 3.3, z1 + 0.9, C.train);
    b.span(-hw + 0.1, 0.6, z1 + 0.9, hw - 0.1, 2.75, z1 + 1.7, C.train);
    b.span(-hw + 0.25, 0.6, z1 + 1.7, hw - 0.25, 1.9, z1 + 2.4, C.white);
    b.span(-hw + 0.3, 1.95, z1 + 0.9, hw - 0.3, 3.05, z1 + 0.96, C.glass);
    b.span(-hw + 0.3, 1.9, z1 + 1.7, hw - 0.3, 2.6, z1 + 1.76, C.glass);
    for (const x of [-0.9, 0.9]) b.span(x - 0.22, 1.0, z1 + 2.4, x + 0.22, 1.35, z1 + 2.46, C.lamp);
    // Pantograph on the cab car.
    b.span(-0.5, 4.0, -hl * 0.45 - 0.9, 0.5, 4.12, -hl * 0.45 + 0.9, C.steelDark);
    b.span(-0.9, 4.45, -hl * 0.45 - 0.1, 0.9, 4.55, -hl * 0.45 + 0.1, C.steelDark);
    b.span(-0.06, 4.1, -hl * 0.45 - 0.06, 0.06, 4.5, -hl * 0.45 + 0.06, C.steelDark);
  }
  return b.build();
}

// ---------------------------------------------------------------- stations

export interface StationModelSpec {
  style: StationStyle;
  lengthM: number;
  widthM: number;
  heightM: number;
  /** 0..1 excavation and structure. */
  progress: number;
  /** 0..1 platforms, finishes, systems. */
  fitOut: number;
  open: boolean;
  /** Height of the street above the station's reference point, metres. Entrances rise to it. */
  surfaceAboveM: number;
}

/** True for the styles that are a box in the ground with the rails RAIL_DROP_M below the reference point. */
export function isUnderground(style: StationStyle): boolean {
  return style !== 'surface' && style !== 'elevated';
}

/** Vertical layout of a station model, metres relative to its reference point. */
export function stationLevels(spec: Pick<StationModelSpec, 'style' | 'heightM'>): {
  rail: number;
  platform: number;
  floor: number;
  roof: number;
} {
  const rail = isUnderground(spec.style) ? -RAIL_DROP_M : 0;
  const platform = rail + PLATFORM_ABOVE_RAIL_M;
  return { rail, platform, floor: rail - 0.6, roof: platform + spec.heightM };
}

function clamp01(v: number): number {
  return v < 0 ? 0 : Math.min(v, 1);
}

function stair(b: MeshBuilder, x: number, z0: number, y0: number, y1: number, dir: 1 | -1, width: number): void {
  const steps = Math.max(4, Math.round((y1 - y0) / 0.7));
  const rise = (y1 - y0) / steps;
  for (let i = 0; i < steps; i++) {
    const za = z0 + dir * i * 1.1;
    const zb = za + dir * 1.1;
    b.span(
      x - width / 2,
      y0,
      Math.min(za, zb),
      x + width / 2,
      y0 + (i + 1) * rise,
      Math.max(za, zb),
      i % 2 === 0 ? C.concrete : C.concreteDark,
    );
  }
}

function entrance(b: MeshBuilder, x: number, z: number, from: number, to: number, finished: boolean, open: boolean, big: boolean): void {
  const half = big ? 3.2 : 2.2;
  // Shaft from the roof slab to the street, then the head house.
  if (to > from + 0.5) b.span(x - half, from, z - half, x + half, to, z + half, C.concreteDark);
  if (!finished) return;
  const h = big ? 4.6 : 3.4;
  b.span(x - half - 0.4, to, z - half - 1.2, x + half + 0.4, to + 0.3, z + half + 1.2, C.concrete);
  b.span(x - half, to + 0.3, z - half, x + half, to + h, z + half, big ? 0x9fc3d6 : C.white);
  b.span(x - half - 0.6, to + h, z - half - 1.4, x + half + 0.6, to + h + 0.35, z + half + 1.4, C.sign);
  // Sign cube on a post: the thing you look for from the street.
  b.span(x + half + 0.9, to, z - 0.15, x + half + 1.2, to + h + 2, z + 0.15, C.steelDark);
  b.span(x + half + 0.45, to + h + 2, z - 0.6, x + half + 1.65, to + h + 3.2, z + 0.6, open ? C.sign : shade(C.sign, 0.55));
  b.span(x + half + 0.75, to + h + 2.3, z - 0.62, x + half + 1.35, to + h + 2.9, z + 0.62, C.white);
}

/**
 * A station. Reference point: centre of the platform level on the track axis (the bore centre underground).
 * The compact box is an island platform between two tracks with one entrance; the mezzanine box adds a full
 * concourse level, two rows of columns, two stair banks, two large entrances and vent shafts, so the two
 * read differently even at equal size. Structure appears with `progress`, the interior with `fitOut`.
 */
export function buildStation(spec: StationModelSpec): MeshData {
  const { style, lengthM: L, widthM: W, heightM: H } = spec;
  if (!(L > 4) || !(W > 4) || !(H > 2)) throw new RangeError(`buildStation: bad box ${L} x ${W} x ${H} m for style ${style}`);
  const p = clamp01(spec.progress);
  const f = clamp01(spec.fitOut);
  const b = new MeshBuilder();
  const lv = stationLevels(spec);
  const hl = L / 2;
  const hw = W / 2;
  const tw = 0.8;

  if (style === 'surface' || style === 'elevated') {
    if (style === 'elevated') {
      b.span(-hw, -1.2, -hl, hw, -0.4, hl, C.concrete);
      const piers = Math.max(2, Math.round(L / 18));
      for (let i = 0; i < piers; i++) {
        const z = -hl + ((i + 0.5) * L) / piers;
        b.span(-1.1, -1.2 - 9 * Math.max(0.15, p), z - 1.1, 1.1, -1.2, z + 1.1, C.concreteDark);
      }
    }
    addTrack(b, 0, 0, -hl, hl, 1.5);
    b.span(-1.7, -0.4, -hl, 1.7, -0.3, hl, C.ballast);
    const px = Math.min(hw - 1.6, 3.4);
    if (p > 0.3) {
      for (const side of [-1, 1]) {
        const x0 = side * (px - 1.6);
        const x1 = side * (px + 1.6);
        b.span(Math.min(x0, x1), -0.3, -hl + 1, Math.max(x0, x1), lv.platform, hl - 1, C.platform);
        if (f > 0.7)
          b.span(
            Math.min(x0, side * (px - 1.2)),
            lv.platform,
            -hl + 1,
            Math.max(x0, side * (px - 1.2)),
            lv.platform + 0.04,
            hl - 1,
            C.warning,
          );
        if (f > 0.4) {
          const posts = Math.max(2, Math.round(L / 12));
          for (let i = 0; i < posts; i++) {
            const z = -hl + ((i + 0.5) * L) / posts;
            b.span(side * px - 0.15, lv.platform, z - 0.15, side * px + 0.15, lv.platform + 3.2, z + 0.15, C.steelDark);
          }
          b.span(
            Math.min(x0, x1),
            lv.platform + 3.2,
            -hl * 0.7,
            Math.max(x0, x1),
            lv.platform + 3.45,
            hl * 0.7,
            spec.open ? C.sign : shade(C.sign, 0.6),
          );
        }
      }
    }
    return b.build();
  }

  const mezz = style === 'mezzanineBox';
  const cavern = style === 'minedCavern';
  const boxed = style === 'compactBox' || mezz;
  // Island platform between two tracks; the terminal has as many islands as fit.
  const islands = style === 'terminal' ? Math.max(1, Math.floor((W - 6) / 13)) : 1;
  const pitch = style === 'terminal' ? (W - 6) / islands : 0;
  const pw = style === 'terminal' ? 7 : Math.max(3, Math.min(mezz ? 11 : 9, W - 2 * (tw + 4.2)));
  const islandX: number[] = [];
  for (let i = 0; i < islands; i++) islandX.push((i - (islands - 1) / 2) * pitch);
  const tracks: number[] = [];
  for (const x of islandX) tracks.push(x - pw / 2 - 1.75, x + pw / 2 + 1.75);

  // Structure.
  if (p > 0.1) b.span(-hw, lv.floor - 0.8, -hl, hw, lv.floor, hl, C.slab);
  const wallTop = lv.floor + (lv.roof - lv.floor) * clamp01((p - 0.1) / 0.75);
  if (boxed && wallTop > lv.floor + 0.3) {
    for (const side of [-1, 1]) {
      // Diaphragm wall in panels, alternating shade.
      const panels = Math.max(2, Math.round(L / 6));
      for (let i = 0; i < panels; i++) {
        const z0 = -hl + (i * L) / panels;
        const xa = side * hw;
        const xb = side * (hw - tw);
        b.span(Math.min(xa, xb), lv.floor, z0, Math.max(xa, xb), wallTop, z0 + L / panels, i % 2 === 0 ? C.concrete : C.concreteDark);
      }
    }
    // End walls with an opening per track (the tunnel eyes), a lintel above.
    const eyeTop = lv.rail + 5.2;
    for (const end of [-1, 1]) {
      const za = end * hl;
      const zb = end * (hl - tw);
      const z0 = Math.min(za, zb);
      const z1 = Math.max(za, zb);
      let x = -hw;
      const sorted = [...tracks].sort((a, c) => a - c);
      for (const t of sorted) {
        const o0 = Math.max(x, t - 2.3);
        if (o0 > x + 0.05) b.span(x, lv.floor, z0, o0, Math.min(wallTop, eyeTop), z1, C.concreteDark);
        x = Math.max(x, t + 2.3);
      }
      if (hw > x + 0.05) b.span(x, lv.floor, z0, hw, Math.min(wallTop, eyeTop), z1, C.concreteDark);
      if (wallTop > eyeTop + 0.1) b.span(-hw, eyeTop, z0, hw, wallTop, z1, C.concreteDark);
    }
  }
  if (cavern && p > 0.2) {
    // Sprayed-concrete ribs of the vault, one every 8 m: an arch of rotated boxes over the platform.
    const ribs = Math.max(2, Math.round(L / 8));
    const done = Math.round(ribs * clamp01((p - 0.2) / 0.7));
    const ar = hw;
    const segs = 9;
    for (let i = 0; i < done; i++) {
      const z = -hl + ((i + 0.5) * L) / ribs;
      for (let k = 0; k < segs; k++) archSegment(b, lv.platform, z, ar, Math.PI / 2 + ((k + 0.5) * Math.PI) / segs, segs);
    }
  }
  if (boxed && p > 0.9) {
    // Roof as a grid of beams, so the interior stays visible from above.
    for (const side of [-1, 1]) {
      const xa = side * hw;
      const xb = side * (hw - 1.2);
      b.span(Math.min(xa, xb), lv.roof, -hl, Math.max(xa, xb), lv.roof + 0.8, hl, C.concreteDark);
      const za = side * hl;
      const zb = side * (hl - 1.2);
      b.span(-hw, lv.roof, Math.min(za, zb), hw, lv.roof + 0.8, Math.max(za, zb), C.concreteDark);
    }
    const beams = Math.max(1, Math.round(L / (mezz ? 9 : 12)) - 1);
    for (let i = 1; i <= beams; i++) {
      const z = -hl + (i * L) / (beams + 1);
      b.span(-hw, lv.roof, z - 0.4, hw, lv.roof + 0.8, z + 0.4, C.concrete);
    }
  }

  // Track, as soon as there is a floor to put it on.
  if (p >= 1) for (const t of tracks) addTrack(b, t, lv.rail, -hl, hl, 1.5);

  // Interior.
  const platformEnd = hl - (boxed ? 3 : 1);
  const mezzY = lv.platform + 4.6;
  const ceiling = mezz ? mezzY : lv.roof;
  if (f > 0.15) {
    for (const x of islandX) {
      b.span(x - pw / 2, lv.floor, -platformEnd, x + pw / 2, lv.platform, platformEnd, C.platform);
      if (f > 0.7) {
        for (const side of [-1, 1]) {
          const xa = x + side * (pw / 2);
          const xb = x + side * (pw / 2 - 0.45);
          b.span(Math.min(xa, xb), lv.platform, -platformEnd, Math.max(xa, xb), lv.platform + 0.04, platformEnd, C.warning);
        }
      }
    }
  }
  if (f > 0.35 && style !== 'inBore') {
    const rows = mezz ? [-pw / 4, pw / 4] : [0];
    const n = Math.max(2, Math.round((2 * platformEnd) / (mezz ? 7 : 10)));
    for (const x of islandX) {
      for (const dx of rows) {
        for (let i = 0; i < n; i++) {
          const z = -platformEnd + ((i + 0.5) * 2 * platformEnd) / n;
          b.span(x + dx - 0.35, lv.platform, z - 0.35, x + dx + 0.35, ceiling, z + 0.35, C.white);
        }
      }
    }
  }
  if (mezz && p >= 1 && f > 0.25) {
    // Concourse: galleries along both walls and bridges across at the stair banks; the middle stays open.
    const gw = Math.max(2.5, W * 0.24);
    for (const side of [-1, 1]) {
      const xa = side * (hw - tw);
      const xb = side * (hw - tw - gw);
      b.span(Math.min(xa, xb), mezzY, -hl + tw, Math.max(xa, xb), mezzY + 0.5, hl - tw, C.concrete);
      const xr = side * (hw - tw - gw);
      b.span(Math.min(xr, xr + side * 0.12), mezzY + 0.5, -hl + tw, Math.max(xr, xr + side * 0.12), mezzY + 1.5, hl - tw, C.glass);
    }
    for (const z of [-L / 4, L / 4]) b.span(-hw + tw, mezzY, z - 3, hw - tw, mezzY + 0.5, z + 3, C.concrete);
  }
  if (f > 0.5) {
    const banks = mezz ? [-L / 4, L / 4] : [L / 4];
    for (const z of banks) {
      if (mezz) {
        // Platform to concourse on both sides of the bridge, then concourse to roof by the wall.
        stair(b, -1.3, z - 3.2, lv.platform, mezzY, -1, 2);
        stair(b, 1.3, z + 3.2, lv.platform, mezzY, 1, 2);
        stair(b, -(hw - tw - 1.6), z + 3, mezzY + 0.5, lv.roof, 1, 2.4);
        stair(b, hw - tw - 1.6, z - 3, mezzY + 0.5, lv.roof, -1, 2.4);
      } else {
        stair(b, 0, z - (lv.roof - lv.platform) * 0.8, lv.platform, lv.roof, 1, 2.4);
      }
    }
  }
  if (f > 0.8) {
    const n = Math.max(2, Math.round(L / 8));
    for (let i = 0; i < n; i++) {
      const z = -platformEnd + ((i + 0.5) * 2 * platformEnd) / n;
      for (const x of islandX) b.span(x - 0.25, ceiling - 0.45, z - 1.2, x + 0.25, ceiling - 0.3, z + 1.2, C.lamp);
    }
    for (const x of islandX) {
      for (const z of [-platformEnd * 0.5, platformEnd * 0.5]) {
        b.span(x - 1.4, lv.platform + 2.5, z - 0.08, x + 1.4, lv.platform + 3.1, z + 0.08, spec.open ? C.sign : shade(C.sign, 0.6));
      }
    }
  }

  // Entrances and vents rise from the roof to the street.
  if (p >= 1 && style !== 'terminal') {
    const street = Math.max(lv.roof + 0.8, spec.surfaceAboveM);
    const finished = f > 0.5;
    if (mezz) {
      entrance(b, -(hw - 4), -L / 4 + 9, lv.roof + 0.8, street, finished, spec.open, true);
      entrance(b, hw - 4, L / 4 - 9, lv.roof + 0.8, street, finished, spec.open, true);
      for (const end of [-1, 1]) {
        const z = end * (hl - 4);
        // A box whose roof is at street level has no shaft until the vent head goes up with the fit-out.
        const top = street + (finished ? 5 : 0);
        if (top > lv.roof + 0.8 + 0.5) b.span(-2.5, lv.roof + 0.8, z - 2.5, 2.5, top, z + 2.5, C.concreteDark);
        if (finished) b.span(-2.7, street + 3.6, z - 2.7, 2.7, street + 4.4, z + 2.7, C.steelDark);
      }
    } else {
      const ez = boxed ? L / 4 + 3 : 0;
      entrance(b, boxed ? 0 : hw * 0.5, ez, lv.roof + (boxed ? 0.8 : -H * 0.4), street, finished, spec.open, false);
    }
  }
  if (b.boxes === 0) {
    // Nothing built yet: a survey stake so the mesh is never empty.
    b.span(-0.3, lv.floor, -0.3, 0.3, lv.floor + 1.2, 0.3, C.warning);
  }
  return b.build();
}

/**
 * Adds one segment of a cavern vault rib centred on (0, y, z). `a` is measured from the invert, so pi is the crown.
 * Segments stay axis-aligned (flat near the crown, upright at the haunches): the facets read as a blocky arch.
 */
function archSegment(b: MeshBuilder, y: number, z: number, radius: number, a: number, segs: number): void {
  const cx = (radius - 0.4) * Math.sin(a);
  const cy = y - (radius - 0.4) * Math.cos(a);
  const w = (Math.PI * radius) / segs + 0.3;
  const steep = Math.abs(Math.cos(a)) < 0.5;
  b.box(cx, cy, z, steep ? 0.8 : w, steep ? w : 0.8, 1.2, C.shotcrete);
}

// ---------------------------------------------------------------- launch pit

/**
 * A launch pit: floor, pile walls up to the street, a gantry crane across the top. Origin: floor centre on the
 * heading axis; the machine leaves towards +z, where the wall has the tunnel eye. 'ready' adds the thrust frame
 * the machine pushes off, 'launched' a muck skip under the crane.
 */
export function buildPit(lengthM: number, widthM: number, depthM: number, state: 'ready' | 'launched'): MeshData {
  if (!(lengthM > 2) || !(widthM > 2) || !(depthM > 0)) throw new RangeError(`buildPit: bad pit ${lengthM} x ${widthM} x ${depthM} m`);
  const b = new MeshBuilder();
  const hl = lengthM / 2;
  const hw = widthM / 2;
  const t = 0.8;
  b.span(-hw, -0.6, -hl, hw, 0, hl, C.slab);
  const piles = (from: number, to: number, place: (a: number, c: number, color: number) => void): void => {
    const n = Math.max(2, Math.round((to - from) / 2));
    for (let i = 0; i < n; i++) place(from + (i * (to - from)) / n, from + ((i + 1) * (to - from)) / n, i % 2 === 0 ? C.pit : C.pile);
  };
  piles(-hl, hl, (a, c, color) => {
    b.span(-hw - t, 0, a, -hw, depthM, c, color);
    b.span(hw, 0, a, hw + t, depthM, c, color);
  });
  const eye = Math.min(hw - 0.5, Math.max(3.5, hw * 0.75));
  const eyeTop = Math.min(depthM, 8.5);
  piles(-hw - t, hw + t, (a, c, color) => {
    b.span(a, 0, -hl - t, c, depthM, -hl, color);
    // The tunnel eye in the front wall.
    if (c <= -eye || a >= eye) b.span(a, 0, hl, c, depthM, hl + t, color);
    else if (depthM > eyeTop + 0.1) b.span(a, eyeTop, hl, c, depthM, hl + t, color);
  });
  // Walers.
  for (const y of [depthM * 0.35, depthM * 0.7]) {
    b.span(-hw, y - 0.25, -hl, -hw + 0.4, y + 0.25, hl, C.steelDark);
    b.span(hw - 0.4, y - 0.25, -hl, hw, y + 0.25, hl, C.steelDark);
  }
  // Gantry crane across the top.
  const top = depthM;
  for (const side of [-1, 1]) {
    const x = side * (hw + t + 1.2);
    for (const z of [-hl * 0.5, hl * 0.5]) b.span(x - 0.3, top, z - 0.3, x + 0.3, top + 7, z + 0.3, C.crane);
    b.span(x - 0.3, top + 6.4, -hl * 0.5, x + 0.3, top + 7, hl * 0.5, C.crane);
  }
  b.span(-hw - t - 1.5, top + 7, -0.6, hw + t + 1.5, top + 8, 0.6, C.crane);
  b.span(-0.8, top + 6.2, -0.8, 0.8, top + 7, 0.8, C.steelDark);
  if (state === 'ready') {
    // Thrust frame at the back wall.
    for (const x of [-hw * 0.5, hw * 0.5]) {
      b.span(x - 0.3, 0, -hl, x + 0.3, Math.min(depthM, 6), -hl + 0.6, C.cutter);
      b.span(x - 0.3, 0, -hl + 0.6, x + 0.3, 0.6, -hl + 4, C.cutter);
    }
    b.span(-hw * 0.5, Math.min(depthM, 6) - 0.6, -hl, hw * 0.5, Math.min(depthM, 6), -hl + 0.6, C.cutter);
  } else {
    b.span(-1.2, top + 3.2, -1.2, 1.2, top + 5, 1.2, C.steel);
    b.span(-0.08, top + 5, -0.08, 0.08, top + 6.2, 0.08, C.steelDark);
  }
  return b.build();
}
