import { expect, test } from 'vitest';
import { discRows, hexToLinear, MeshBuilder } from './mesh-builder.ts';
import {
  buildBoxFrame,
  buildMachine,
  buildPit,
  buildRing,
  buildStation,
  buildSurfaceRig,
  buildTbm,
  buildTrackPanel,
  buildTrainCar,
  deckDropM,
  MACHINE_DIAMETER_M,
  MACHINE_KINDS,
  RAIL_DROP_M,
  RING_LOWER_SEGMENTS,
  RING_SEGMENTS,
  type StationModelSpec,
  stationLevels,
  TBM_LENGTH_M,
  TRACK_PANEL_M,
  TRENCH_FLOOR_M,
  trackOffsets,
} from './models.ts';

test('MeshBuilder: 24 vertices and 12 triangles per box, outward normals, bounds, linear colours', () => {
  const m = new MeshBuilder().box(1, 2, 3, 2, 4, 6, 0xff0000).build();
  expect(m.positions.length).toBe(24 * 3);
  expect(m.indices.length).toBe(36);
  expect(m.min).toEqual([0, 0, 0]);
  expect(m.max).toEqual([2, 4, 6]);
  expect([...m.colors.slice(0, 3)]).toEqual([1, 0, 0]);
  expect(hexToLinear(0x808080)[0]).toBeCloseTo(0.2159, 3);
  // Every triangle faces away from the box centre.
  for (let t = 0; t < m.indices.length; t += 3) {
    const v = [0, 1, 2].map((k) => {
      const i = (m.indices[t + k] as number) * 3;
      return [m.positions[i] as number, m.positions[i + 1] as number, m.positions[i + 2] as number];
    }) as [number[], number[], number[]];
    const e1 = v[1].map((x, i) => x - (v[0][i] as number));
    const e2 = v[2].map((x, i) => x - (v[0][i] as number));
    const n = [
      (e1[1] as number) * (e2[2] as number) - (e1[2] as number) * (e2[1] as number),
      (e1[2] as number) * (e2[0] as number) - (e1[0] as number) * (e2[2] as number),
      (e1[0] as number) * (e2[1] as number) - (e1[1] as number) * (e2[0] as number),
    ];
    const out = [(v[0][0] as number) - 1, (v[0][1] as number) - 2, (v[0][2] as number) - 3];
    expect(
      (n[0] as number) * (out[0] as number) + (n[1] as number) * (out[1] as number) + (n[2] as number) * (out[2] as number),
    ).toBeGreaterThan(0);
    const i0 = (m.indices[t] as number) * 3;
    expect(
      (n[0] as number) * (m.normals[i0] as number) +
        (n[1] as number) * (m.normals[i0 + 1] as number) +
        (n[2] as number) * (m.normals[i0 + 2] as number),
    ).toBeGreaterThan(0);
  }
  expect(() => new MeshBuilder().box(0, 0, 0, 0, 1, 1, 0)).toThrow(/bad box/);
  expect(() => new MeshBuilder().build()).toThrow(/no boxes/);
});

test('discRows voxelises a disc: symmetric rows, widest in the middle, area close to the circle', () => {
  const rows = discRows(3.3, 0.66);
  expect(rows.length).toBe(10);
  let area = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] as { y: number; halfWidth: number; height: number };
    const mirror = rows[rows.length - 1 - i] as { y: number; halfWidth: number; height: number };
    expect(r.halfWidth).toBeCloseTo(mirror.halfWidth, 9);
    expect(r.halfWidth).toBeLessThanOrEqual(3.3 + 0.34);
    area += 2 * r.halfWidth * r.height;
  }
  expect(area / (Math.PI * 3.3 * 3.3)).toBeGreaterThan(0.9);
  expect(area / (Math.PI * 3.3 * 3.3)).toBeLessThan(1.1);
});

test('a lining ring is ten segments on the bore, split into an invert part and a crown part', () => {
  const { lower, upper } = buildRing(3.3, 1.5, 'ring');
  expect(lower.boxes).toBe(RING_LOWER_SEGMENTS);
  expect(lower.boxes + upper.boxes).toBe(RING_SEGMENTS);
  // The invert part stays below the axis; the crown reaches the top of the bore; nothing leaves the bore by more than a corner.
  expect(lower.max[1]).toBeLessThan(0);
  expect(lower.min[1]).toBeCloseTo(-3.3, 1);
  expect(upper.max[1]).toBeCloseTo(3.3, 1);
  for (const m of [lower, upper]) {
    for (let i = 0; i < m.positions.length; i += 3) {
      const r = Math.hypot(m.positions[i] as number, m.positions[i + 1] as number);
      expect(r).toBeGreaterThan(2.7);
      expect(r).toBeLessThanOrEqual(3.3 + 1e-5);
    }
    expect(m.min[2]).toBeGreaterThanOrEqual(0);
    expect(m.max[2]).toBeLessThanOrEqual(1.5);
  }
  expect(() => buildRing(0.2, 1.5, 'ring')).toThrow(/bad radius/);
  const frame = buildBoxFrame(6, 3);
  expect(frame.lower.min[0]).toBe(-6);
  expect(frame.upper.max[0]).toBe(6);
});

test('track: rails RAIL_DROP_M below the axis in a bore, on the axis at grade, two tracks in a wide bore', () => {
  const tube = buildTrackPanel(3.3, 'ring');
  expect(tube.max[1]).toBeCloseTo(-RAIL_DROP_M, 9);
  expect(tube.max[2]).toBe(TRACK_PANEL_M);
  // The invert fill stays inside the bore.
  for (let i = 0; i < tube.positions.length; i += 3) {
    expect(Math.hypot(tube.positions[i] as number, tube.positions[i + 1] as number)).toBeLessThan(3.3);
  }
  expect(buildTrackPanel(0, 'none').max[1]).toBe(0);
  expect(trackOffsets(3.3)).toEqual([0]);
  expect(trackOffsets(6.5)).toEqual([-2.2, 2.2]);
  expect(buildTrackPanel(6.5, 'ring').boxes).toBeGreaterThan(tube.boxes);
  // The 3.7 m small bore has no room for rails 2 m under its axis: a paved deck for pods, inside the tube.
  const pod = buildTrackPanel(1.85, 'ring');
  expect(pod.boxes).toBe(3);
  expect(pod.min[1]).toBeGreaterThan(-1.85);
  expect(pod.max[1]).toBeLessThan(0);
  expect(Math.max(-pod.min[0], pod.max[0])).toBeLessThan(1.85);
  expect(deckDropM(1.85, 'ring')).toBeCloseTo(0.925, 9);
  expect(deckDropM(3.3, 'ring')).toBe(RAIL_DROP_M);
  expect(deckDropM(3.3, 'none')).toBe(0);
  expect(() => buildTrackPanel(0.5, 'ring')).toThrow(/too small for a deck/);
});

test('the machine fits its bore: cutterhead at the origin facing +z, shield and gantry behind', () => {
  const { head, body } = buildTbm(3.3);
  expect(head.max[2]).toBeLessThanOrEqual(0.1);
  expect(head.min[2]).toBeGreaterThan(-1);
  expect(body.max[2]).toBeLessThan(head.min[2] + 0.1);
  expect(body.min[2]).toBeCloseTo(-TBM_LENGTH_M + 1, 5);
  for (const m of [head, body]) {
    for (let i = 0; i < m.positions.length; i += 3) {
      expect(Math.hypot(m.positions[i] as number, m.positions[i + 1] as number)).toBeLessThan(3.3 * 1.05);
    }
  }
  // The gantry rides above the rails.
  expect(buildTbm(6).head.max[0]).toBeGreaterThan(5);
  expect(() => buildTbm(0.5)).toThrow(/radius/);
  expect(buildSurfaceRig().min[1]).toBe(0);
});

test('every machine kind builds behind its face, and the five are different models', () => {
  const sizes = new Set<string>();
  for (const kind of MACHINE_KINDS) {
    const m = buildMachine(kind, MACHINE_DIAMETER_M[kind]);
    const front = Math.max(m.body.max[2], m.tool.max[2] + m.toolAt[2]);
    const back = Math.min(m.body.min[2], m.tool.min[2] + m.toolAt[2]);
    expect(front, kind).toBeLessThanOrEqual(0.1);
    expect(front, kind).toBeGreaterThan(-0.5);
    expect(back, kind).toBeGreaterThanOrEqual(-m.lengthM - 0.01);
    expect(back, kind).toBeLessThan(-m.lengthM + 1.5);
    sizes.add(`${m.body.boxes}|${m.tool.boxes}|${m.lengthM.toFixed(1)}`);
  }
  expect(sizes.size).toBe(MACHINE_KINDS.length);
  // The twin bore is the machine drawn before kinds existed, one per tube.
  expect(buildMachine('twinBore', 6.6).body.positions).toEqual(buildTbm(3.3).body.positions);
  // The small bore has no gantry; the large one is longer than the standard machine.
  expect(buildMachine('smallBore', 3.7).lengthM).toBeLessThan(TBM_LENGTH_M / 3);
  expect(buildMachine('singleBore', 12).lengthM).toBeGreaterThan(TBM_LENGTH_M);
  // Shield and wheel colours tell the three shields apart.
  const tint = (kind: 'twinBore' | 'singleBore' | 'smallBore'): string => {
    const d = MACHINE_DIAMETER_M[kind];
    const m = buildMachine(kind, d);
    return `${[...m.body.colors.slice(0, 3)]}|${[...m.tool.colors.slice(m.tool.colors.length - 3)]}`;
  };
  expect(new Set([tint('twinBore'), tint('singleBore'), tint('smallBore')]).size).toBe(3);
  expect(buildMachine('roadheader', 6.6).motion).toBe('spin');
  expect(buildMachine('excavator', 6.6).motion).toBe('dig');
  expect(() => buildMachine('singleBore', 1)).toThrow(/diameter must be > 2 m/);
  expect(() => buildMachine('roadheader', Number.NaN)).toThrow(/diameter/);
});

test('shields and the roadheader are sized from the diameter and stay inside their bore', () => {
  for (const kind of ['twinBore', 'singleBore', 'smallBore', 'roadheader'] as const) {
    for (const d of [MACHINE_DIAMETER_M[kind], MACHINE_DIAMETER_M[kind] * 1.5]) {
      const m = buildMachine(kind, d);
      let reach = 0;
      for (const [part, at] of [
        [m.body, [0, 0, 0]],
        [m.tool, m.toolAt],
      ] as const) {
        for (let i = 0; i < part.positions.length; i += 3) {
          reach = Math.max(reach, Math.hypot((part.positions[i] as number) + at[0], (part.positions[i + 1] as number) + at[1]));
        }
      }
      expect(reach, `${kind} ${d}`).toBeLessThan((d / 2) * 1.05);
      // The shields fill the bore; the roadheader works in a cavern wider than itself.
      expect(reach, `${kind} ${d}`).toBeGreaterThan((d / 2) * (kind === 'roadheader' ? 0.85 : 0.97));
      if (kind !== 'roadheader') expect(m.tool.max[0] - m.tool.min[0], `${kind} ${d}`).toBeCloseTo(d, 0);
    }
  }
  expect(buildMachine('roadheader', 9.9).lengthM).toBeCloseTo(buildMachine('roadheader', 6.6).lengthM * 1.5, 6);
});

test('the excavator stands on the trench floor with its bucket at the face, whatever the diameter', () => {
  const m = buildMachine('excavator', 14);
  expect(m.body.min[1]).toBeCloseTo(-TRENCH_FLOOR_M, 6);
  expect(m.body.positions).toEqual(buildMachine('excavator', 0).body.positions);
  // The arm is in the frame of its foot pin: the bucket reaches the floor just behind the face.
  expect(m.tool.min[1] + m.toolAt[1]).toBeGreaterThanOrEqual(-TRENCH_FLOOR_M);
  expect(m.tool.min[1] + m.toolAt[1]).toBeLessThan(-TRENCH_FLOOR_M + 0.5);
  expect(m.tool.max[2] + m.toolAt[2]).toBeGreaterThan(-0.5);
  // Boom well above the cab.
  expect(m.tool.max[1] + m.toolAt[1]).toBeGreaterThan(m.body.max[1] + 1.5);
});

test('a train car stands on the rails, is as long as asked, and a cab car has a nose', () => {
  const mid = buildTrainCar(22, false);
  const cab = buildTrainCar(22, true);
  expect(mid.min[1]).toBe(0);
  expect(mid.max[2] - mid.min[2]).toBeCloseTo(21.5, 5);
  // The lamps stand a few centimetres proud of the nose.
  expect(cab.max[2] - mid.max[2]).toBeGreaterThan(0);
  expect(cab.max[2] - mid.max[2]).toBeLessThan(0.1);
  expect(cab.boxes).toBeGreaterThan(mid.boxes);
  // Clears a 3.3 m bore when the rails are RAIL_DROP_M below the axis (pantograph excluded: body roof at 3.75 m).
  expect(Math.hypot(1.49, 3.75 - RAIL_DROP_M)).toBeLessThan(3.3 - 0.3);
  expect(() => buildTrainCar(4, false)).toThrow(/car length/);
});

const BOX: StationModelSpec = {
  style: 'compactBox',
  lengthM: 120,
  widthM: 20,
  heightM: 8,
  progress: 1,
  fitOut: 1,
  open: true,
  surfaceAboveM: 22,
};

test('station boxes match their dimensions; the mezzanine box has more of everything', () => {
  const compact = buildStation(BOX);
  const lv = stationLevels(BOX);
  expect(lv).toEqual({ rail: -2, platform: -1, floor: -2.6, roof: 7 });
  expect(compact.min[0]).toBeCloseTo(-10, 5);
  expect(compact.max[0]).toBeCloseTo(10, 5);
  expect(compact.min[2]).toBeCloseTo(-60, 5);
  expect(compact.max[2]).toBeCloseTo(60, 5);
  // The entrance rises past the street.
  expect(compact.max[1]).toBeGreaterThan(22);
  const mezz = buildStation({ ...BOX, style: 'mezzanineBox', lengthM: 150, widthM: 26, heightM: 14 });
  expect(mezz.boxes).toBeGreaterThan(compact.boxes * 1.5);
  // The box is 26 m wide; only the sign post of an entrance stands outside it, at the street.
  expect(mezz.min[0]).toBeCloseTo(-13, 5);
  expect(mezz.max[0]).toBeGreaterThanOrEqual(13);
  expect(mezz.max[0]).toBeLessThan(14);
  // Same dimensions, still a different model: concourse, second entrance, vents.
  expect(buildStation({ ...BOX, style: 'mezzanineBox', heightM: 12 }).boxes).toBeGreaterThan(
    buildStation({ ...BOX, heightM: 12 }).boxes + 20,
  );
});

test('a mezzanine box whose roof reaches the street builds at every stage (no zero-height vent shaft)', () => {
  // Mountain View: a shallow box, the street 3 m above the platform level, the roof slab above it.
  for (const fitOut of [0, 0.3, 0.6, 1]) {
    const m = buildStation({ ...BOX, style: 'mezzanineBox', lengthM: 200, widthM: 26, heightM: 14, surfaceAboveM: 3, progress: 1, fitOut });
    expect(m.boxes).toBeGreaterThan(10);
  }
});

test('station structure appears with progress and the interior with fit-out', () => {
  const count = (progress: number, fitOut: number): number => buildStation({ ...BOX, progress, fitOut, open: false }).boxes;
  expect(count(0, 0)).toBe(1);
  expect(count(0.5, 0)).toBeGreaterThan(count(0.05, 0));
  expect(count(1, 0)).toBeGreaterThan(count(0.5, 0));
  expect(count(1, 0.5)).toBeGreaterThan(count(1, 0));
  expect(count(1, 1)).toBeGreaterThan(count(1, 0.5));
  // Half-built walls stop short of the roof.
  expect(buildStation({ ...BOX, progress: 0.5, fitOut: 0 }).max[1]).toBeLessThan(stationLevels(BOX).roof);
  for (const style of ['minedCavern', 'terminal', 'inBore', 'surface', 'elevated'] as const) {
    expect(buildStation({ ...BOX, style }).boxes).toBeGreaterThan(10);
  }
  expect(stationLevels({ style: 'surface', heightM: 5 }).rail).toBe(0);
  expect(() => buildStation({ ...BOX, widthM: 1 })).toThrow(/bad box/);
});

test('a launch pit has walls to the street, a tunnel eye and a crane above', () => {
  const pit = buildPit(30, 20, 18, 'ready');
  expect(pit.min[1]).toBeCloseTo(-0.6, 5);
  expect(pit.max[1]).toBeCloseTo(18 + 8, 5);
  expect(pit.min[2]).toBeCloseTo(-15.8, 5);
  expect(buildPit(30, 20, 18, 'launched').boxes).not.toBe(pit.boxes);
  expect(() => buildPit(30, 20, 0, 'ready')).toThrow(/bad pit/);
});
